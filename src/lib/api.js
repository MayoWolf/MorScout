async function callTBA(path) {
  // Call our own Netlify Function proxy instead of TBA directly
  const response = await fetch(`/api/tba-proxy?path=${encodeURIComponent(path)}`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw requestError(response, data, true);
  }
  return response.json();
}

export function fetchEvents(year = 2026) {
  return callTBA(`/events/${year}/simple`);
}

export function fetchEventMatches(eventKey) {
  return callTBA(`/event/${eventKey}/matches/simple`);
}

function requestError(response, data, notifyExpiry) {
  if (response.status === 401 && notifyExpiry) {
    window.dispatchEvent(new Event("morscout-session-expired"));
  }
  const message = response.status === 429 ? "Too many requests. Wait a minute and try again." :
    data.error || "Request failed";
  return Object.assign(new Error(message), { status: response.status });
}

async function callApi(path, body, method = "POST", notifyExpiry = true) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw requestError(response, data, notifyExpiry);
  }

  return data;
}

export function checkSession() {
  return callApi("/api/session", undefined, "GET", false);
}

export function startSession(accessCode) {
  return callApi("/api/session", { accessCode }, "POST", false);
}

export function endSession() {
  return callApi("/api/session", undefined, "DELETE", false);
}

export function submitPitScout(payload) {
  const scoringMechanisms = `${payload.shooterCount || "1"} shooter${payload.shooterCount === "1" ? "" : "s"}, Turret: ${payload.turret || "No"}`;

  return callApi("/api/sheets-write", {
    sheetName: "PS(CAASV)",
    row: [
      new Date().toISOString(),
      payload.scout,
      payload.team,
      payload.driveTrain,
      payload.canCrossBumps,
      payload.canUnderTrench,
      payload.intakeType,
      scoringMechanisms,
      payload.climbLevel,
      payload.autoSummary,
      payload.teleopSummary,
      payload.reliability,
      payload.comments,
      payload.maxBallsInHopper,
      payload.cycleTimeSec
    ]
  });
}

export function submitMatchScout(payload) {
  return callApi("/api/sheets-write", {
    sheetName: "MS(CAASV)",
    row: [
      new Date().toISOString(),
      payload.scout,
      payload.matchNumber,
      payload.alliance,
      payload.team,
      payload.station,
      payload.autoFuelScored,
      payload.autoFuelMissed,
      payload.leftStartingZone,
      payload.autoTowerLevel1,
      payload.startingPosition,
      payload.autoPathType,
      payload.teleopFuelScored,
      payload.teleopFuelMissed,
      payload.teleopTowerLevel,
      payload.avgCycleTimeSec,
      payload.dropsFumbles,
      payload.preferredScoringLocation,
      payload.fieldAwareness,
      payload.driverStationComms,
      payload.playedDefense,
      payload.defenseTimeSec,
      payload.defenseEffectiveness,
      payload.scoredWhileDefended,
      payload.pushedEasily,
      payload.drewFouls,
      payload.robotSpeed,
      payload.breakdown,
      payload.deadRobot,
      payload.brownout,
      payload.noShow,
      payload.dq,
      payload.repairTimeMin,
      payload.reliabilityScore,
      payload.reliability,
      payload.generalComments
    ]
  });
}

export function loadRankings() {
  return callApi("/api/sheets-read", {
    sheetName: "Rankings"
  });
}

export function loadMatchScoutingRows() {
  return callApi("/api/sheets-read", {
    sheetName: "MS(CAASV)"
  });
}
