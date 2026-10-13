import { api, json, readJson, requireMethod, requireSession } from "../lib/security.js";
import { sheetFor, sheetsClient } from "../lib/sheets.js";

export default api(async (request) => {
  requireMethod(request, "POST");
  requireSession(request);
  const sheet = sheetFor(await readJson(request));
  const { spreadsheetId, sheets } = sheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheet.read
  }, { timeout: 10000, retry: false });
  return json({ rows: response.data.values || [] });
});

export const config = {
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 120 }
};
