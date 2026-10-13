import googleapis from "googleapis";
import { ApiError, env } from "./security.js";

const { google } = googleapis;
const SHEETS = new Map([
  ["PS(CAASV)", { columns: 15, read: "'PS(CAASV)'!A1:O1000", write: "'PS(CAASV)'!A:O", numbers: [2, 13, 14] }],
  ["MS(CAASV)", { columns: 36, read: "'MS(CAASV)'!A1:AJ1000", write: "'MS(CAASV)'!A:AJ", numbers: [2, 4, 5, 6, 7, 12, 13, 15, 16, 18, 19, 21, 22, 32, 33] }],
  ["Rankings", { read: "'Rankings'!A1:Z1000" }]
]);

export function sheetFor(body, write = false) {
  const sheet = typeof body.sheetName === "string" ? SHEETS.get(body.sheetName) : undefined;
  if (!sheet || (write && !sheet.write) || Object.hasOwn(body, "range")) {
    throw new ApiError(400, "Unsupported sheet or range");
  }
  return sheet;
}

export function reportRow(body, sheet) {
  if (!Array.isArray(body.row) || body.row.length !== sheet.columns) {
    throw new ApiError(400, `Report must contain ${sheet.columns} cells`);
  }
  const row = body.row.map((cell) => {
    if ((typeof cell !== "string" && typeof cell !== "number" && typeof cell !== "boolean") ||
        (typeof cell === "number" && !Number.isFinite(cell)) ||
        (typeof cell === "string" && cell.length > 2000)) {
      throw new ApiError(400, "Report cells must be short text, finite numbers, or booleans");
    }
    return cell;
  });
  for (const index of sheet.numbers) {
    if (row[index] === "") continue;
    const value = row[index];
    if ((typeof value !== "number" && typeof value !== "string") ||
        (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value)) ||
        !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100000) {
      throw new ApiError(400, "Report contains an invalid numeric value");
    }
    row[index] = Number(value);
  }
  if (typeof row[1] !== "string" || !row[1].trim()) throw new ApiError(400, "Scout name is required");
  row[0] = new Date().toISOString();
  return row;
}

export function sheetsClient(write = false) {
  const spreadsheetId = env("GOOGLE_SHEETS_ID");
  const email = env("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const key = (env("GOOGLE_PRIVATE_KEY") || "").replace(/\\n/g, "\n");
  if (!spreadsheetId || !email || !key) throw new ApiError(503, "Scouting storage is not configured. Contact your team lead.");
  const auth = new google.auth.JWT({ email, key, scopes: [
    `https://www.googleapis.com/auth/spreadsheets${write ? "" : ".readonly"}`
  ] });
  return { spreadsheetId, sheets: google.sheets({ version: "v4", auth }) };
}
