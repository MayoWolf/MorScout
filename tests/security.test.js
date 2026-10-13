import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { createHmac } from "node:crypto";
import googleapis from "googleapis";
import read from "../netlify/functions/sheets-read.js";
import write from "../netlify/functions/sheets-write.js";
import tba from "../netlify/functions/tba-proxy.js";
import session from "../netlify/functions/session.js";
import { createSession } from "../netlify/lib/security.js";
import { submitPitScout, submitMatchScout } from "../src/lib/api.js";

const code = "test-only-access-code-00000000";
const secret = "test-only-signing-key-000000000000000000000000";
const base = "https://morscout.example";
const originalSheets = googleapis.google.sheets;
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
let calls = [];

beforeEach(() => {
  calls = [];
  process.env.SCOUT_ACCESS_CODE = code;
  process.env.SCOUT_SESSION_SECRET = secret;
  process.env.GOOGLE_SHEETS_ID = "test-only-sheet";
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "test-only@example.invalid";
  process.env.GOOGLE_PRIVATE_KEY = "test-only-not-a-real-private-key";
  process.env.TBA_API_KEY = "test-only-tba-key";
  delete process.env.SCOUT_ALLOW_LOCAL_HTTP;
  delete process.env.CONTEXT;
  googleapis.google.sheets = () => ({ spreadsheets: { values: {
    get: async (params) => { calls.push(params); return { data: { values: [["Scout", "Team"]] } }; },
    append: async (params) => { calls.push(params); return { data: {} }; }
  } } });
  globalThis.fetch = async (...args) => { throw new Error(`Unexpected network request: ${args[0]}`); };
});

after(() => {
  googleapis.google.sheets = originalSheets;
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!Object.hasOwn(originalEnv, key)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

function cookie(url = `${base}/api/session`) {
  return createSession(new Request(url), code).split(";")[0];
}

function request(path, body, options = {}) {
  const method = options.method || "POST";
  return new Request(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: base,
      ...(options.auth === false ? {} : { Cookie: options.headers?.Cookie ?? cookie() }), ...options.headers },
    ...(method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) })
  });
}

const pit = () => ["untrusted time", "Scout", "1515", "Swerve", "Yes", "No", "Ground", "1 shooter", "Level 1", "auto", "teleop", "No issues", "notes", "30", "1.2"];
const match = () => ["untrusted time", "Scout", 1, "Red", "1515", "1", 10, 0, "Yes", "No", "Center", "Fuel", 30, 1, "None", 2, 0, "Mixed", "3", "3", "No", 0, "1", "Yes", "No", "No", "Fast", "No", "No", "No", "No", "No", 0, "5", "No issues", "notes"];

test("anonymous callers cannot borrow Google or TBA authority on either URL form", async () => {
  for (const prefix of ["/api/", "/.netlify/functions/"]) {
    for (const [name, handler] of [["sheets-read", read], ["sheets-write", write]]) {
      assert.equal((await handler(request(`${prefix}${name}`, { sheetName: "MS(CAASV)", row: match() }, { auth: false }))).status, 401);
    }
    assert.equal((await tba(request(`${prefix}tba-proxy?path=/events/2026/simple`, undefined, { method: "GET", auth: false }))).status, 401);
  }
  assert.equal(calls.length, 0);
});

test("login sets an eight-hour protected cookie; bad codes and unsafe origins fail", async () => {
  const success = await session(request("/api/session", { accessCode: code }, { auth: false }));
  assert.equal(success.status, 200);
  const setCookie = success.headers.get("Set-Cookie");
  assert.match(setCookie, /^__Host-morscout-session=/);
  for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=28800"]) assert.ok(setCookie.includes(flag));
  const loginCookie = setCookie.split(";")[0];
  assert.equal((await session(request("/api/session", undefined, { method: "GET", headers: { Cookie: loginCookie } }))).status, 200);
  assert.equal((await session(request("/api/session", { accessCode: "wrong" }, { auth: false }))).status, 401);
  assert.equal((await session(request("/api/session", { accessCode: code }, { auth: false, headers: { Origin: "https://sibling.example" } }))).status, 403);
  assert.equal((await session(request("/api/session", { accessCode: code }, { auth: false, headers: { "Content-Type": "text/plain" } }))).status, 415);
  const logout = await session(request("/api/session", undefined, { method: "DELETE" }));
  assert.match(logout.headers.get("Set-Cookie"), /Max-Age=0/);
});

test("forged, expired, duplicate, and rotated-code sessions are rejected", async () => {
  const good = cookie();
  const [name, token] = good.split("=");
  const payload = token.split(".").slice(0, 4);
  payload[1] = String(Math.floor(Date.now() / 1000) - 1);
  const expired = payload.join(".");
  const expiredCookie = `${name}=${expired}.${createHmac("sha256", secret).update(expired).digest("base64url")}`;
  for (const invalid of [`${good.slice(0, -1)}!`, expiredCookie, `${good}; ${good}`]) {
    assert.equal((await read(request("/api/sheets-read", { sheetName: "MS(CAASV)" }, { headers: { Cookie: invalid } }))).status, 401);
  }
  process.env.SCOUT_ACCESS_CODE = "test-only-rotated-access-code-000000";
  assert.equal((await read(request("/api/sheets-read", { sheetName: "MS(CAASV)" }, { headers: { Cookie: good } }))).status, 401);
  assert.equal(calls.length, 0);
});

test("missing or weak auth configuration fails closed and local HTTP is restricted to development loopback", async () => {
  const good = cookie();
  delete process.env.SCOUT_SESSION_SECRET;
  assert.equal((await read(request("/api/sheets-read", { sheetName: "MS(CAASV)" }, { headers: { Cookie: good } }))).status, 503);
  process.env.SCOUT_SESSION_SECRET = secret;
  process.env.SCOUT_ACCESS_CODE = "short";
  assert.equal((await session(request("/api/session", { accessCode: "short" }, { auth: false }))).status, 503);
  process.env.SCOUT_ACCESS_CODE = code;
  process.env.SCOUT_ALLOW_LOCAL_HTTP = "true";
  process.env.CONTEXT = "dev";
  assert.ok(!createSession(new Request("http://localhost:8888/api/session"), code).includes("; Secure"));
  assert.ok(createSession(new Request("http://remote.example/api/session"), code).includes("; Secure"));
  process.env.CONTEXT = "production";
  assert.ok(createSession(new Request("http://localhost:8888/api/session"), code).includes("; Secure"));
  assert.equal(calls.length, 0);
});

test("authorized reads use full fixed report ranges; arbitrary ranges and inherited keys never reach Google", async () => {
  assert.equal((await read(request("/api/sheets-read", { sheetName: "MS(CAASV)" }))).status, 200);
  assert.equal(calls[0].range, "'MS(CAASV)'!A1:AJ1000");
  for (const body of [{ sheetName: "private" }, { sheetName: "__proto__" }, { sheetName: "constructor" },
    { sheetName: ["MS(CAASV)"] }, { sheetName: "MS(CAASV)", range: "Private!A:Z" }, { sheetName: "MS(CAASV)", range: null }]) {
    assert.equal((await read(request("/api/sheets-read", body))).status, 400);
  }
  assert.equal(calls.length, 1);
});

test("real frontend pit and match payloads still succeed; formulas remain literal and numeric strings become numbers", async () => {
  globalThis.fetch = async (url, init) => write(request(url, init.body));
  await submitPitScout({ scout: "=1+1", team: "1515", driveTrain: "Swerve", canCrossBumps: "Yes", canUnderTrench: "No", intakeType: "Ground", shooterCount: "1", turret: "No", climbLevel: "None", autoSummary: "=A1", teleopSummary: "teleop", reliability: "No issues", comments: '=HYPERLINK("https://example.invalid")', maxBallsInHopper: "", cycleTimeSec: "1.2" });
  const report = match();
  const keys = ["timestamp", "scout", "matchNumber", "alliance", "team", "station", "autoFuelScored", "autoFuelMissed", "leftStartingZone", "autoTowerLevel1", "startingPosition", "autoPathType", "teleopFuelScored", "teleopFuelMissed", "teleopTowerLevel", "avgCycleTimeSec", "dropsFumbles", "preferredScoringLocation", "fieldAwareness", "driverStationComms", "playedDefense", "defenseTimeSec", "defenseEffectiveness", "scoredWhileDefended", "pushedEasily", "drewFouls", "robotSpeed", "breakdown", "deadRobot", "brownout", "noShow", "dq", "repairTimeMin", "reliabilityScore", "reliability", "generalComments"];
  await submitMatchScout(Object.fromEntries(keys.map((key, i) => [key, report[i]])));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].valueInputOption, "RAW");
  assert.equal(calls[0].requestBody.values[0][1], "=1+1");
  assert.equal(calls[0].requestBody.values[0][9], "=A1");
  assert.equal(calls[0].requestBody.values[0][2], 1515);
  assert.equal(calls[0].requestBody.values[0][14], 1.2);
  assert.match(calls[0].requestBody.values[0][0], /^\d{4}-\d\d-\d\dT/);
  assert.equal(calls[1].requestBody.values[0].length, 36);
  assert.equal(calls[1].requestBody.values[0][33], 5);
});

test("bad report representations, methods, origins and oversized JSON are rejected before writes", async () => {
  const badRows = [[], pit().slice(0, -1), pit().map((x, i) => i === 12 ? {} : x), pit().map((x, i) => i === 12 ? null : x),
    pit().map((x, i) => i === 2 ? "=1+1" : x), pit().map((x, i) => i === 14 ? -1 : x), pit().map((x, i) => i === 1 ? "" : x), pit().map((x, i) => i === 12 ? "a".repeat(2001) : x)];
  for (const row of badRows) assert.equal((await write(request("/api/sheets-write", { sheetName: "PS(CAASV)", row }))).status, 400);
  assert.equal((await write(request("/api/sheets-write", { sheetName: "Rankings", row: pit() }))).status, 400);
  assert.equal((await write(request("/api/sheets-write", { sheetName: "PS(CAASV)", row: pit() }, { headers: { Origin: "https://sibling.example" } }))).status, 403);
  assert.equal((await write(request("/api/sheets-write", { sheetName: "PS(CAASV)", row: pit() }, { headers: { "Sec-Fetch-Site": "same-site" } }))).status, 403);
  assert.equal((await write(request("/api/sheets-write", {}, { method: "PUT" }))).status, 405);
  assert.equal((await write(request("/api/sheets-write", "not-json"))).status, 400);
  assert.equal((await write(request("/api/sheets-write", { padding: "a".repeat(33000) }))).status, 413);
  assert.equal(calls.length, 0);
});

test("TBA accepts only intended routes and keeps the key on its fixed host without following redirects", async () => {
  let upstream = [];
  globalThis.fetch = async (url, options) => { upstream.push({ url, options }); return Response.json([]); };
  for (const path of ["/events/2026/simple", "/events/2025/simple", "/event/2026caasv/matches/simple"]) {
    assert.equal((await tba(request(`/api/tba-proxy?path=${encodeURIComponent(path)}`, undefined, { method: "GET" }))).status, 200);
  }
  assert.equal(upstream[0].url, "https://www.thebluealliance.com/api/v3/events/2026/simple");
  assert.equal(upstream[0].options.headers["X-TBA-Auth-Key"], "test-only-tba-key");
  assert.equal(upstream[0].options.redirect, "error");
  for (const path of ["https://evil.example", "/../", "/events/2026/simple?x=1", "/event/%2e%2e/matches/simple", "/event/2026caasv/matches/simple\n"]) {
    assert.equal((await tba(request(`/api/tba-proxy?path=${encodeURIComponent(path)}`, undefined, { method: "GET" }))).status, 400);
  }
  assert.equal((await tba(request("/api/tba-proxy", undefined, { method: "GET" }))).status, 400);
  assert.equal(upstream.length, 3);
});

test("upstream errors do not return internal details and successful private responses disable caching", async () => {
  googleapis.google.sheets = () => ({ spreadsheets: { values: { get: async () => { throw new Error("private-key-details"); } } } });
  const failure = await read(request("/api/sheets-read", { sheetName: "MS(CAASV)" }));
  assert.equal(failure.status, 502);
  assert.ok(!(await failure.text()).includes("private-key-details"));
  const success = await session(request("/api/session", undefined, { method: "GET" }));
  assert.equal(success.headers.get("Cache-Control"), "private, no-store");
});
