# MorScout 2026

MorTorq FRC scouting app built with React and deployed on Netlify.

## Stack

- React + Vite frontend
- Netlify Functions (Google Sheets API)
- Google Sheets as data storage

## Local setup

1. Use Node.js 24 (`nvm use`) and install the locked dependencies:

```bash
npm ci
```

2. Create `.env` from `.env.example` and fill values. Configure the Google variables, server-only `TBA_API_KEY`, a random `SCOUT_ACCESS_CODE` (at least 16 characters), and an independent random `SCOUT_SESSION_SECRET` (at least 32 characters). Generate each secret separately with `openssl rand -hex 32`. Keep `.env` private and outside Git.

3. Create these sheet tabs in your Google Sheet:
- `PS(CAASV)`
- `MS(CAASV)`

4. Share the sheet with your Google service account email as **Editor**.

5. Run locally:

```bash
netlify dev
```

For HTTP localhost development, set `SCOUT_ALLOW_LOCAL_HTTP=true` in your local `.env`; `CONTEXT=dev` must also be present (Netlify Dev sets it). This permits a development cookie only on loopback hosts. Production cookies always require HTTPS. `npm run dev` serves only the frontend; use the [Netlify CLI](https://docs.netlify.com/cli/get-started/) for the API functions.

## Team access and deployment

Scouts sign in with the shared team code. The server issues a signed HttpOnly, SameSite=Strict cookie that expires after eight hours. The code and signing secret never enter browser storage or the frontend bundle. Reauthentication preserves an open form draft; signing out clears the app's in-memory state. Rotating either secret invalidates existing sessions. Shared access does not provide individual scout identities or individual revocation.

Set `SCOUT_ACCESS_CODE`, `SCOUT_SESSION_SECRET`, `TBA_API_KEY`, and the Google variables as private Netlify environment variables available to Functions, then build and redeploy. Remove `VITE_TBA_API_KEY` if previously configured. Deploy previews should use separate credentials and a test workbook. Missing or weak authentication configuration fails closed with HTTP 503.

Functions enforce authentication on both `/api/*` and direct function URLs, reject cross-origin browser requests, and use fixed sheet ranges. Writes accept only 15-cell pit or 36-cell match reports, with bounded scalar values and normalized numeric columns. Values are appended with `RAW`, so formula-like text stays literal. Read limits remain 1,000 rows; match reads include all columns through AJ. The optional `Rankings` read helper remains supported; writes to that tab are denied.

Netlify function rate limits are declared in each handler: 120 requests per minute per IP/domain pair, allowing scouts on shared event Wi-Fi to sign in together. Adjust limits using observed team traffic. Local tests do not emulate Netlify edge rate enforcement. See the [Netlify rate-limit configuration](https://docs.netlify.com/build/functions/api/#ratelimit) and [Google literal-value semantics](https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueInputOption).

Run `npm test`, `npm run build`, and `npm audit` before deployment. Tests use fake credentials and mocked upstream services; they do not modify the real workbook. Generated `node_modules` and `dist` directories are excluded from Git; use `npm ci` and a fresh build to recreate them from the audited lockfile.

## Google Sheets setup

Detailed instructions for setting up the Google Sheet and Service Account can be found in [SETUP_GOOGLE_SHEETS.md](./SETUP_GOOGLE_SHEETS.md).

## Data columns

Ensure your Google Sheet tabs have these exact columns in row 1:

### PS(CAASV)
1. Timestamp
2. Scout
3. Team
4. Drivetrain
5. CanCrossBumps
6. CanUnderTrench
7. IntakeType
8. ScoringMechanisms
9. ClimbLevel
10. AutoSummary
11. TeleopSummary
12. Reliability
13. Comments
14. MaxBallsInHopper
15. CycleTimeSec

### MS(CAASV)
1. Timestamp
2. Scout
3. MatchNumber
4. Alliance
5. Team
6. Station
7. AutoFuelScored
8. AutoFuelMissed
9. LeftStartingZone
10. AutoTowerLevel1
11. StartingPosition
12. AutoPathType
13. TeleopFuelScored
14. TeleopFuelMissed
15. TeleopTowerLevel
16. AvgCycleTimeSec
17. DropsFumbles
18. PreferredScoringLocation
19. FieldAwareness
20. DriverStationComms
21. PlayedDefense
22. DefenseTimeSec
23. DefenseEffectiveness
24. ScoredWhileDefended
25. PushedEasily
26. DrewFouls
27. RobotSpeed
28. Breakdown
29. DeadRobot
30. Brownout
31. NoShow
32. DQ
33. RepairTimeMin
34. ReliabilityScore
35. Reliability
36. GeneralComments
