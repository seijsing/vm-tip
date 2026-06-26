// Läser den beständiga målskytte-databasen (data/goals.json, skriven av
// scripts/fetch-scores.mjs) och kopplar mål till matcher via lagkodspar.

// Map("AAA|BBB" -> [{ code, scorer, minute, type }]). Tom Map om filen saknas.
export async function fetchGoalsMap() {
  try {
    const res = await fetch(`data/goals.json?cb=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return new Map();
    const obj = await res.json();
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

// Mål för en (ark-)match, orienterade efter arkets hemma/borta via lagkod.
// Returnerar [{ scorer, minute, type, side: "home"|"away"|null }].
export function orientGoals(match, goalsMap) {
  if (!goalsMap || !match) return [];
  const gs = goalsMap.get([match.home, match.away].sort().join("|"));
  if (!gs) return [];
  return gs.map((g) => ({
    scorer: g.scorer,
    minute: g.minute || "",
    type: g.type || "Goal",
    side: g.code === match.home ? "home" : g.code === match.away ? "away" : null,
  }));
}
