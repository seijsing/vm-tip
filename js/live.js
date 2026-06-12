import { CONFIG } from "./config.js";

// Hämtar data/live.json (skrivs av GitHub Actions). Saknas filen -> tom live-status.
export async function fetchLive() {
  try {
    const res = await fetch(`${CONFIG.live.file}?cb=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return { updated: null, matches: [] };
    const data = await res.json();
    return { updated: data.updated ?? null, matches: Array.isArray(data.matches) ? data.matches : [] };
  } catch {
    return { updated: null, matches: [] };
  }
}

const LIVE_STATUSES = new Set(["IN_PLAY", "PAUSED", "LIVE"]);

function normName(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // ta bort diakritiska tecken
    .trim();
}

// Bygger uppslagstabell engelska API-namn -> svensk lagkod.
function enToCode() {
  const map = new Map();
  for (const [code, t] of Object.entries(CONFIG.teamCodes)) map.set(normName(t.en), code);
  return map;
}

// Kopplar varje live-match till en match i arket (via lagkoder) och orienterar
// ställningen efter arkets hemma/borta. Returnerar berikade live-poster:
//   { match, homeScore, awayScore, scoreStr, status, minute, isLive }
export function matchLiveToSheet(liveMatches, sheetMatches) {
  const en2code = enToCode();
  const byPair = new Map(); // sorterad "HOME|AWAY"-nyckel -> match
  for (const m of sheetMatches) byPair.set([m.home, m.away].sort().join("|"), m);

  const out = [];
  for (const lm of liveMatches) {
    const hc = en2code.get(normName(lm.home));
    const ac = en2code.get(normName(lm.away));
    if (!hc || !ac) continue;
    const match = byPair.get([hc, ac].sort().join("|"));
    if (!match) continue;

    // Orientera API-ställningen efter arkets hemmalag.
    let hs = lm.homeScore, as = lm.awayScore;
    if (hc !== match.home) [hs, as] = [as, hs];
    if (hs == null || as == null) continue;

    out.push({
      match,
      homeScore: hs,
      awayScore: as,
      scoreStr: `${hs}-${as}`,
      status: lm.status || "",
      minute: lm.minute ?? null,
      isLive: LIVE_STATUSES.has(lm.status),
    });
  }
  return out;
}

// Vilka personer har tippat exakt den rådande ställningen i en (live-)match?
export function whoTipped(match, scoreStr, people) {
  return people.filter((p) => p.tips[match.col] === scoreStr).map((p) => p.name);
}
