import { useMemo, useState } from "react";
import { loadMatchScoutingRows } from "../lib/api";

const IDX = {
  team: 4,
  autoFuel: 6,
  autoTowerLevel1: 9,
  teleFuel: 12,
  teleTowerLevel: 14,
  fieldAwareness: 18,
  playedDefense: 20,
  defenseEffectiveness: 22,
  reliabilityScore: 33
};

function num(cell) {
  const value = Number(cell);
  return Number.isFinite(value) ? value : 0;
}

function computeAutoPoints(row) {
  const fuelPoints = num(row[IDX.autoFuel]); // 1 pt per FUEL
  const towerPoints = String(row[IDX.autoTowerLevel1] || "").toLowerCase() === "yes" ? 15 : 0;
  return fuelPoints + towerPoints;
}

function computeTelePoints(row) {
  const fuelPoints = num(row[IDX.teleFuel]); // 1 pt per FUEL
  const towerLevel = String(row[IDX.teleTowerLevel] || "").toLowerCase();
  let towerPoints = 0;
  if (towerLevel === "level 1") towerPoints = 10;
  else if (towerLevel === "level 2") towerPoints = 20;
  else if (towerLevel === "level 3") towerPoints = 30;
  return fuelPoints + towerPoints;
}

function aggregate(rows) {
  const bucket = new Map();

  rows.forEach((row) => {
    const team = String(row[IDX.team] || "").trim();
    if (!team || !/^\d+$/.test(team)) return;

    if (!bucket.has(team)) {
      bucket.set(team, {
        matches: 0,
        autoTotal: 0,
        teleTotal: 0,
        climbLevels: [], // To track climb consistency
        reliabilityTotal: 0,
        fieldAwarenessTotal: 0,
        defenseTotal: 0,
        lastFiveTotals: []
      });
    }

    const item = bucket.get(team);
    const auto = computeAutoPoints(row);
    const tele = computeTelePoints(row);
    const total = auto + tele;

    item.matches += 1;
    item.autoTotal += auto;
    item.teleTotal += tele;
    item.climbLevels.push(row[IDX.teleTowerLevel] || "None");
    item.reliabilityTotal += num(row[IDX.reliabilityScore]);
    item.fieldAwarenessTotal += num(row[IDX.fieldAwareness]);

    const defenseEff = num(row[IDX.defenseEffectiveness]);
    const playedDefense = String(row[IDX.playedDefense] || "").toLowerCase() === "yes";
    item.defenseTotal += playedDefense ? defenseEff : 0;

    item.lastFiveTotals.push(total);
    if (item.lastFiveTotals.length > 5) {
      item.lastFiveTotals = item.lastFiveTotals.slice(-5);
    }
  });

  return Array.from(bucket.entries())
    .map(([team, item]) => {
      const avgAuto = item.autoTotal / item.matches;
      const avgTele = item.teleTotal / item.matches;
      const climbCount = item.climbLevels.filter(l => l !== "None" && l !== "").length;
      const endgamePct = (climbCount / item.matches) * 100;
      const reliability = item.reliabilityTotal / item.matches;
      const awareness = item.fieldAwarenessTotal / item.matches;
      const defense = item.defenseTotal / item.matches;
      const last5 = item.lastFiveTotals.reduce((sum, v) => sum + v, 0) / item.lastFiveTotals.length;
      
      // Weights adjusted for REBUILT
      const pickScore = avgAuto * 2.0 + avgTele * 1.5 + reliability * 2.5 + awareness * 1.0 + defense * 0.8 + (endgamePct / 100) * 3.0;

      return {
        team,
        matches: item.matches,
        avgAuto,
        avgTele,
        endgamePct,
        reliability,
        awareness,
        defense,
        last5,
        pickScore
      };
    })
    .sort((a, b) => b.pickScore - a.pickScore);
}

function fmt(value, digits = 1) {
  return Number(value).toFixed(digits);
}

function RankingsPage() {
  const [rawRows, setRawRows] = useState([]);
  const [status, setStatus] = useState("");

  const rows = useMemo(() => aggregate(rawRows), [rawRows]);

  async function onRefresh() {
    setStatus("Loading match scouting data...");

    try {
      const data = await loadMatchScoutingRows();
      setRawRows(data.rows || []);
      setStatus("Computed team profiles and pick scores.");
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  }

  return (
    <section className="form">
      <h2>Rankings + Team Profiles</h2>
      <p>Live aggregation from <code>MS(CAASV)</code> tab.</p>
      <button className="primary-button" type="button" onClick={onRefresh}>Refresh Analytics</button>
      {status && <p className="status">{status}</p>}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <td>Rank</td>
                <td>Team</td>
                <td>Matches</td>
                <td>Avg Auto Pts</td>
                <td>Avg Tele Pts</td>
                <td>Endgame %</td>
                <td>Reliability</td>
                <td>Awareness</td>
                <td>Defense</td>
                <td>Last 5</td>
                <td>Pick Score</td>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.team}>
                  <td>{index + 1}</td>
                  <td>#{row.team}</td>
                  <td>{row.matches}</td>
                  <td>{fmt(row.avgAuto)}</td>
                  <td>{fmt(row.avgTele)}</td>
                  <td>{fmt(row.endgamePct, 0)}%</td>
                  <td>{fmt(row.reliability)}</td>
                  <td>{fmt(row.awareness)}</td>
                  <td>{fmt(row.defense)}</td>
                  <td>{fmt(row.last5)}</td>
                  <td>{fmt(row.pickScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default RankingsPage;
