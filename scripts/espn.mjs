// Delad ESPN-hämtare: hämtar VM-matcher (resultat, status, minut, målskyttar) från
// ESPN:s öppna scoreboard-API. Används av både fetch-scores.mjs (live) och
// backfill-goals.mjs (historik). Ingen API-nyckel krävs.
import { codeFromSv } from "../js/config.js";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

// Date -> "YYYYMMDD" (UTC).
export function ymd(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

// Hämtar och normaliserar alla matcher för ett datum. Kastar vid nätverks-/HTTP-fel.
export async function fetchEspnDay(date) {
  return fetchEspn(ymd(date));
}

// Hämtar ett helt datumintervall i ETT anrop (t.ex. hela slutspelet).
export async function fetchEspnRange(fromDate, toDate) {
  return fetchEspn(`${ymd(fromDate)}-${ymd(toDate)}`);
}

async function fetchEspn(dates) {
  const res = await fetch(`${BASE}?dates=${dates}`);
  if (!res.ok) throw new Error(`ESPN svarade ${res.status}`);
  const json = await res.json();
  return (json.events ?? []).map(normalizeEvent).filter(Boolean);
}

// ESPN-event -> { home, away, homeCode, awayCode, homeScore, awayScore,
//                 status, minute, utcDate, goals:[{code,scorer,minute,type}], pair }
function normalizeEvent(ev) {
  const comp = (ev.competitions ?? [])[0];
  if (!comp) return null;
  const home = (comp.competitors ?? []).find((c) => c.homeAway === "home");
  const away = (comp.competitors ?? []).find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const homeCode = codeFromSv(home.team?.displayName || home.team?.name);
  const awayCode = codeFromSv(away.team?.displayName || away.team?.name);
  const idToCode = {};
  if (homeCode) idToCode[home.id] = homeCode;
  if (awayCode) idToCode[away.id] = awayCode;

  const goals = [];
  for (const det of comp.details ?? []) {
    if (!det.scoringPlay) continue;
    const code = idToCode[det.team?.id];
    const scorer = (det.athletesInvolved ?? [])[0]?.displayName;
    if (!code || !scorer) continue;
    goals.push({
      code,
      scorer,
      minute: stripMinute(det.clock?.displayValue),
      type: det.type?.text ?? "Goal",
    });
  }

  const status = mapStatus(ev.status?.type ?? {});
  const live = status === "LIVE" || status === "PAUSED";
  const finished = status === "FINISHED";

  return {
    home: home.team?.displayName ?? "",
    away: away.team?.displayName ?? "",
    homeCode,
    awayCode,
    homeScore: live || finished ? numOrNull(home.score) : null,
    awayScore: live || finished ? numOrNull(away.score) : null,
    status,
    minute: status === "LIVE" ? stripMinute(ev.status?.displayClock) : null,
    utcDate: ev.date ?? null,
    stage: roundLabel(comp),
    goals,
    pair: homeCode && awayCode ? [homeCode, awayCode].sort().join("|") : null,
  };
}

// Slutspelsrond (svensk) ur ESPN:s altGameNote ("FIFA World Cup, Round of 32" …).
// null för gruppspel.
function roundLabel(comp) {
  const n = comp.altGameNote || "";
  if (/round of 32/i.test(n)) return "Sextondelsfinal";
  if (/round of 16/i.test(n)) return "Åttondelsfinal";
  if (/quarter/i.test(n)) return "Kvartsfinal";
  if (/semi/i.test(n)) return "Semifinal";
  if (/3rd|third/i.test(n)) return "Bronsmatch";
  if (/final/i.test(n)) return "Final";
  return null;
}

// ESPN-status (state pre/in/post) -> vårt vokabulär.
function mapStatus(st) {
  if (st.state === "pre") return "TIMED";
  if (st.state === "post") return "FINISHED";
  if (st.name === "STATUS_HALFTIME" || /halftime/i.test(st.description || "")) return "PAUSED";
  return "LIVE";
}

// "40'" -> "40", "90'+8'" -> "90+8", "" -> null
function stripMinute(s) {
  const v = (s || "").replace(/'/g, "").trim();
  return v || null;
}

function numOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
