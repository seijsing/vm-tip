#!/usr/bin/env node
// Hämtar VM-matcher från football-data.org och skriver data/live.json i det format
// som sidan (js/live.js) förväntar sig. Körs av GitHub Actions var ~5:e minut.
//
// Miljö:
//   FOOTBALL_API_TOKEN  – API-nyckel från football-data.org (krävs)
//   COMPETITION         – tävlingskod (default "WC")
//
// Bytt API? Behåll bara utdataformatet:
//   { updated: ISO, matches: [ { home, away, homeScore, awayScore, status, minute } ] }
// så behöver sidan inte ändras.

import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const TOKEN = process.env.FOOTBALL_API_TOKEN;
const COMPETITION = process.env.COMPETITION || "WC";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "live.json");

// Statusar vi bryr oss om att visa (pågående + nyligen avslutade samma dag).
// OBS: football-data.org returnerar ibland "LIVE" (inte "IN_PLAY") för pågående matcher.
const KEEP = new Set(["LIVE", "IN_PLAY", "PAUSED", "FINISHED", "TIMED", "SCHEDULED"]);
const LIVE = new Set(["LIVE", "IN_PLAY", "PAUSED"]);

async function main() {
  if (!TOKEN) {
    console.error("Saknar FOOTBALL_API_TOKEN – hoppar över (lämnar live.json orörd).");
    process.exit(0);
  }

  const today = new Date().toISOString().slice(0, 10);
  const url = `https://api.football-data.org/v4/competitions/${COMPETITION}/matches?dateFrom=${today}&dateTo=${today}`;
  const res = await fetch(url, { headers: { "X-Auth-Token": TOKEN } });
  if (!res.ok) throw new Error(`football-data svarade ${res.status}: ${await res.text()}`);
  const json = await res.json();
  console.log(`API svarade med ${json.matches?.length ?? 0} matcher:`);
  for (const m of json.matches ?? []) {
    console.log(`  ${m.id} | ${m.utcDate} | ${m.status} | ${m.homeTeam?.name} vs ${m.awayTeam?.name}`);
  }

  // ENGÅNGS-DIAGNOSTIK: kollar om vår token returnerar målskyttar på match-detalj-endpointen.
  // Ta bort detta block när vi vet svaret.
  const finished = (json.matches ?? []).find((m) => m.status === "FINISHED");
  if (finished) {
    try {
      const dRes = await fetch(`https://api.football-data.org/v4/matches/${finished.id}`, {
        headers: { "X-Auth-Token": TOKEN },
      });
      console.log(`[DIAG] match/${finished.id} HTTP ${dRes.status}`);
      if (dRes.ok) {
        const d = await dRes.json();
        const goals = d.goals ?? d.match?.goals ?? null;
        console.log(`[DIAG] goals-fält: ${goals == null ? "saknas/null" : `array med ${goals.length} poster`}`);
        if (goals?.length) {
          const g = goals[0];
          console.log(`[DIAG] exempel: ${g.scorer?.name} ${g.minute}' (${g.type}) – ${g.team?.name}`);
        }
        console.log(`[DIAG] tillgängliga nycklar: ${Object.keys(d).join(", ")}`);
      } else {
        console.log(`[DIAG] svarstext: ${(await dRes.text()).slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`[DIAG] fel vid match-detalj: ${e.message}`);
    }
  }

  const matches = (json.matches || [])
    .filter((m) => KEEP.has(m.status))
    .map((m) => ({
      home: m.homeTeam?.name ?? m.homeTeam?.shortName ?? "",
      away: m.awayTeam?.name ?? m.awayTeam?.shortName ?? "",
      homeScore: scoreOf(m, "home"),
      awayScore: scoreOf(m, "away"),
      status: m.status,
      minute: m.minute ?? null,
      utcDate: m.utcDate ?? null,
    }))
    // Visa pågående först, sen avslutade
    .sort((a, b) => liveRank(b) - liveRank(a));

  const payload = { updated: new Date().toISOString(), matches };
  const next = JSON.stringify(payload, null, 2) + "\n";

  // Skriv bara om matcherna ändrats (ignorera tidsstämpeln) för att undvika commit-brus.
  if (await unchanged(next)) {
    console.log("Inga ändringar i matchdata – skriver inte om.");
    return;
  }
  await writeFile(OUT, next);
  console.log(`Skrev ${matches.length} matcher till data/live.json.`);
}

function scoreOf(m, side) {
  const v = m.score?.fullTime?.[side];
  return typeof v === "number" ? v : null;
}
function liveRank(m) {
  return LIVE.has(m.status) ? 2 : m.status === "FINISHED" ? 1 : 0;
}

async function unchanged(nextStr) {
  try {
    const prev = JSON.parse(await readFile(OUT, "utf-8"));
    const next = JSON.parse(nextStr);
    return JSON.stringify(prev.matches) === JSON.stringify(next.matches);
  } catch {
    return false;
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
