import { api, json, readJson, requireMethod, requireSession } from "../lib/security.js";
import { reportRow, sheetFor, sheetsClient } from "../lib/sheets.js";

export default api(async (request) => {
  requireMethod(request, "POST");
  requireSession(request);
  const body = await readJson(request);
  const sheet = sheetFor(body, true);
  const row = reportRow(body, sheet);
  const { spreadsheetId, sheets } = sheetsClient(true);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: sheet.write,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] }
  }, { timeout: 10000, retry: false });
  return json({ ok: true });
});

export const config = {
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 120 }
};
