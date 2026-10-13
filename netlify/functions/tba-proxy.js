import { ApiError, api, env, json, requireMethod, requireSession } from "../lib/security.js";

export default api(async (request) => {
  requireMethod(request, "GET");
  requireSession(request);
  const path = new URL(request.url).searchParams.get("path");
  if (!path || !path.endsWith("/simple") || !/^\/(?:events\/\d{4}\/simple|event\/\d{4}[a-z0-9]{1,24}\/matches\/simple)$/.test(path)) {
    throw new ApiError(400, "Unsupported event request");
  }
  const key = env("TBA_API_KEY");
  if (!key) throw new ApiError(503, "Event schedules are not configured. Contact your team lead.");
  const response = await fetch(`https://www.thebluealliance.com/api/v3${path}`, {
    headers: { "X-TBA-Auth-Key": key },
    redirect: "error",
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new ApiError(502, "Unable to load the event schedule. Please try again.");
  return json(await response.json());
});

export const config = {
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 120 }
};
