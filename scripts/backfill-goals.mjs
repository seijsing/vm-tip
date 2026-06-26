#!/usr/bin/env node
// Engångs-/ad hoc-backfill av målskyttar för hela turneringen.
// Itererar datum från turneringsstart till idag, hämtar ESPN per dag och fyller
// data/goals.json (lagkodspar -> mållista). Säkert att köra om: skriver över per match.
//
//   node scripts/backfill-goals.mjs [startdatum] [slutdatum]   (YYYY-MM-DD)

import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchEspnDay } from "./espn.mjs";

const GOALS_OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "goals.json");
const START = process.argv[2] || "2026-06-11"; // gruppspelets första dag
const END = process.argv[3] || new Date().toISOString().slice(0, 10);

async function main() {
  const goals = await readJson(GOALS_OUT, {});
  let matches = 0, totalGoals = 0;

  for (let d = new Date(START + "T12:00:00Z"); d <= new Date(END + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    let events;
    try {
      events = await fetchEspnDay(new Date(d));
    } catch (err) {
      console.error(`${ymd(d)}: ${err.message} – hoppar över.`);
      continue;
    }
    let dayGoals = 0;
    for (const e of events) {
      if (!e.pair || e.status !== "FINISHED") continue; // bara färdigspelade i backfill
      goals[e.pair] = e.goals;
      matches++;
      dayGoals += e.goals.length;
      totalGoals += e.goals.length;
    }
    console.log(`${ymd(d)}: ${events.length} matcher, ${dayGoals} mål`);
  }

  await writeFile(GOALS_OUT, JSON.stringify(goals, null, 2) + "\n");
  console.log(`Klart: ${matches} matcher, ${totalGoals} mål skrivna till data/goals.json.`);
}

function ymd(date) { return date.toISOString().slice(0, 10); }
async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf-8")); } catch { return fallback; }
}

main().catch((err) => { console.error(err); process.exit(1); });
