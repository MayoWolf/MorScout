import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SESSION_SECONDS = 8 * 60 * 60;
const MAX_BODY_BYTES = 32 * 1024;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function env(name) {
  return globalThis.Netlify?.env?.get(name) ?? process.env[name];
}

export function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...headers }
  });
}

export function api(handler) {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status);
      // Avoid logging request bodies, credentials, or upstream error objects.
      console.error("Service request failed", { name: error.name, status: error.response?.status });
      return json({ error: "The service is temporarily unavailable. Please try again." }, 502);
    }
  };
}

export function requireMethod(request, method) {
  if (request.method !== method) throw new ApiError(405, "Method not allowed");
}

export function requireSameOrigin(request) {
  const origin = request.headers.get("Origin");
  const site = request.headers.get("Sec-Fetch-Site");
  if ((origin && origin !== new URL(request.url).origin) ||
      (site && site !== "same-origin" && site !== "none")) {
    throw new ApiError(403, "Cross-origin requests are not allowed");
  }
}

export async function readJson(request, limit = MAX_BODY_BYTES) {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "Send application/json");
  }
  if (Number(request.headers.get("Content-Length")) > limit) throw new ApiError(413, "Request is too large");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "A JSON object is required");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError(413, "Request is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "Invalid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "A JSON object is required");
  return body;
}

function authSettings() {
  const accessCode = env("SCOUT_ACCESS_CODE") || "";
  const secret = env("SCOUT_SESSION_SECRET") || "";
  if (accessCode.length < 16 || accessCode.length > 256 || secret.length < 32 || secret.length > 256 || accessCode === secret) {
    throw new ApiError(503, "Scout access has not been configured. Contact your team lead.");
  }
  return { accessCode, secret };
}

function equalText(left, right) {
  const hash = (value) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(left), hash(right));
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function cookieSettings(request) {
  const url = new URL(request.url);
  // Local HTTP needs an explicit opt-in and can never be enabled for a remote host.
  const localHttp = env("SCOUT_ALLOW_LOCAL_HTTP") === "true" && env("CONTEXT") === "dev" &&
    url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return { name: localHttp ? "morscout-dev-session" : "__Host-morscout-session", secure: !localHttp };
}

function sessionCookie(request, token, age) {
  const { name, secure } = cookieSettings(request);
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? "; Secure" : ""}`;
}

export function createSession(request, suppliedCode) {
  const { accessCode, secret } = authSettings();
  if (typeof suppliedCode !== "string" || suppliedCode.length > 256 || !equalText(suppliedCode, accessCode)) {
    throw new ApiError(401, "Incorrect team access code");
  }
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const version = sign(`access:${accessCode}`, secret);
  const payload = `v1.${expires}.${randomBytes(16).toString("hex")}.${version}`;
  return sessionCookie(request, `${payload}.${sign(payload, secret)}`, SESSION_SECONDS);
}

export function clearSession(request) {
  return sessionCookie(request, "", 0);
}

export function requireSession(request) {
  const { accessCode, secret } = authSettings();
  const { name } = cookieSettings(request);
  const cookies = (request.headers.get("Cookie") || "").split(";").map((part) => part.trim());
  const matches = cookies.filter((part) => part.startsWith(`${name}=`));
  const token = matches.length === 1 ? matches[0].slice(name.length + 1) : "";
  const match = /^v1\.(\d{10})\.([a-f0-9]{32})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(token);
  const now = Math.floor(Date.now() / 1000);
  if (!match || Number(match[1]) <= now || Number(match[1]) > now + SESSION_SECONDS ||
      !equalText(match[3], sign(`access:${accessCode}`, secret)) ||
      !equalText(match[4], sign(token.slice(0, token.lastIndexOf(".")), secret))) {
    throw new ApiError(401, "Enter your team access code to continue");
  }
  requireSameOrigin(request);
}
