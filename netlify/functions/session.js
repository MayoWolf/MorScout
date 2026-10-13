import { api, clearSession, createSession, json, readJson, requireSameOrigin, requireSession, ApiError } from "../lib/security.js";

export default api(async (request) => {
  requireSameOrigin(request);
  if (request.method === "GET") {
    requireSession(request);
    return json({ authenticated: true });
  }
  if (request.method === "POST") {
    const body = await readJson(request, 1024);
    return json({ authenticated: true }, 200, { "Set-Cookie": createSession(request, body.accessCode) });
  }
  if (request.method === "DELETE") {
    return json({ authenticated: false }, 200, { "Set-Cookie": clearSession(request) });
  }
  throw new ApiError(405, "Method not allowed");
});

export const config = {
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 120 }
};
