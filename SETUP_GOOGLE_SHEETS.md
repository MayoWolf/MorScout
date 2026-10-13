# Google Sheets Setup (MorScout 2026)

## 1. Create spreadsheet

Create a Google Sheet and add these tabs:
- `PS(CAASV)`
- `MS(CAASV)`

Add header rows in row 1 with the exact column names specified in the README.

## 2. Create service account

1. Open Google Cloud Console.
2. Create a project (or use existing).
3. Enable **Google Sheets API**.
4. Create a **Service Account**.
5. Create a JSON key for that service account.

From the key JSON, keep:
- `client_email` -> `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` -> `GOOGLE_PRIVATE_KEY`

## 3. Share sheet with service account

In Google Sheets, click Share and add the service account email as **Editor**.

## 4. Get spreadsheet ID

From the sheet URL:

`https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`

Use `<SHEET_ID>` as `GOOGLE_SHEETS_ID`.

## 5. Configure Netlify environment variables

In Netlify site settings, add:
- `GOOGLE_SHEETS_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `TBA_API_KEY` (server-only; remove the old `VITE_TBA_API_KEY`)
- `SCOUT_ACCESS_CODE` (independent random team code, at least 16 characters)
- `SCOUT_SESSION_SECRET` (independent random signing secret, at least 32 characters)

Generate the two scout secrets separately with `openssl rand -hex 32`. Store credentials in private Netlify environment variables available to Functions; never prefix them with `VITE_`. Rebuild and redeploy after changes. Missing authentication settings deny access, and rotating either scout secret invalidates every existing session. Only share the service account with the scouting workbook; keep unrelated confidential tabs in a separate workbook.

For private key, keep line breaks escaped with `\\n` when pasting.

## 6. Optional local `.env`

Create `.env` in project root:

```env
GOOGLE_SHEETS_ID=...
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
TBA_API_KEY=...
SCOUT_ACCESS_CODE=...
SCOUT_SESSION_SECRET=...
SCOUT_ALLOW_LOCAL_HTTP=true
```

Use `netlify dev` on localhost with `CONTEXT=dev` for the local HTTP cookie. These values must be real locally generated secrets; the examples above are placeholders. Keep `.env` untracked and private. No plaintext secret belongs in README, code, fixtures, or build artifacts.

Scouting values are stored literally with `RAW`; trusted calculation formulas belong in separately managed spreadsheet cells. Before rollout, review existing rows for unexpected formulas. The change prevents new submitted formulas but does not alter existing workbook contents.
