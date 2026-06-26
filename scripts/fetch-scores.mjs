#!/usr/bin/env node
// Hämtar VM-matcher och skriver:
//   data/live.json  – aktuellt fönster (live + nyligen spelade + kommande) som sidan visar
//   data/goals.json – beständig målskytte-databas per match (lagkodspar -> mållista)
// Körs av GitHub Actions var ~2:e minut.
//
// Primär källa: ESPN:s öppna scoreboard-API (resultat + status + minut + målskyttar,
// ingen nyckel, låg fördröjning). Faller tillbaka på football-data.org om ESPN inte svarar.
//
// Miljö:
//   FOOTBALL_API_TOKEN  – API-nyckel från football-data.org (endast fallback)
//   COMPETITION         – football-data-tävlingskod (default "WC")

import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchEspnDay } from "./espn.mjs";

const TOKEN = process.env.FOOTBALL_API_TOKEN;
const COMPETITION = process.env.COMPETITION || "WC";
const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const LIVE_OUT = join(DATA, "live.json");
const GOALS_OUT = join(DATA, "goals.json");

// live.json: ta med matcher i ett tidsfönster runt nu (nyligen spelade … snart kommande).
const WINDOW_BACK_MS = 8 * 3600 * 1000;
const WINDOW_FWD_MS = 20 * 3600 * 1000;

async function main() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);

  let events = null;
  try {
    // ESPN grupperar per amerikanskt datum – hämta gårdag/idag/imorgon (UTC) och deduplicera.
    const days = await Promise.all([yesterday, now, tomorrow].map(fetchEspnDay));
    events = dedupe(days.flat());
    console.log(`ESPN gav ${events.length} matcher (gårdag/idag/imorgon).`);
  } catch (err) {
    console.error(`ESPN misslyckades (${err.message}) – försöker football-data.`);
  }

  // Bygg live-fönstret. Faller tillbaka på football-data om ESPN inte gav något.
  let matches;
  if (events && events.length) {
    matches = events
      .filter((e) => inWindow(e.utcDate, now) || e.status === "LIVE" || e.status === "PAUSED")
      .map((e) => ({
        home: e.home,
        away: e.away,
        homeScore: e.homeScore,
        awayScore: e.awayScore,
        status: e.status,
        minute: e.minute,
        utcDate: e.utcDate,
      }))
      .sort((a, b) => liveRank(b) - liveRank(a));
    for (const m of matches) {
      console.log(`  ${m.utcDate} | ${m.status} | ${m.home} vs ${m.away}`);
    }
  } else {
    matches = await fetchFootballDataFallback();
  }

  // Skriv live.json om matchdatan ändrats.
  await writeIfChanged(
    LIVE_OUT,
    { updated: now.toISOString(), matches },
    (prev, next) => JSON.stringify(prev.matches) === JSON.stringify(next.matches),
    `${matches.length} matcher`
  );

  // Uppdatera den beständiga målskytte-databasen från ESPN (om vi fick data).
  if (events && events.length) {
    const goals = await readJson(GOALS_OUT, {});
    let touched = 0;
    for (const e of events) {
      if (!e.pair) continue;
      if (e.status !== "FINISHED" && e.status !== "LIVE" && e.status !== "PAUSED") continue;
      const next = JSON.stringify(e.goals);
      if (JSON.stringify(goals[e.pair] ?? null) !== next) { goals[e.pair] = e.goals; touched++; }
    }
    if (touched) {
      await writeFile(GOALS_OUT, JSON.stringify(goals, null, 2) + "\n");
      console.log(`Uppdaterade målskyttar för ${touched} match(er) i data/goals.json.`);
    } else {
      console.log("Inga ändringar i målskyttar.");
    }
  }
}

// Behåll bara senaste posten per lagkodspar (live > finished > övrigt).
function dedupe(events) {
  const byPair = new Map();
  for (const e of events) {
    const key = e.pair ?? `${e.home}|${e.away}`;
    const prev = byPair.get(key);
    if (!prev || liveRank(e) > liveRank(prev)) byPair.set(key, e);
  }
  return [...byPair.values()];
}

function inWindow(utc, now) {
  if (!utc) return false;
  const t = new Date(utc).getTime();
  return t >= now.getTime() - WINDOW_BACK_MS && t <= now.getTime() + WINDOW_FWD_MS;
}

function liveRank(m) {
  return m.status === "LIVE" || m.status === "PAUSED" ? 2 : m.status === "FINISHED" ? 1 : 0;
}

// Fallback: football-data.org (endast resultat, inga målskyttar).
async function fetchFootballDataFallback() {
  if (!TOKEN) {
    console.error("Ingen ESPN-data och saknar FOOTBALL_API_TOKEN – tomt live-fönster.");
    return [];
  }
  const today = new Date().toISOString().slice(0, 10);
  const url = `https://api.football-data.org/v4/competitions/${COMPETITION}/matches?dateFrom=${today}&dateTo=${today}`;
  const res = await fetch(url, { headers: { "X-Auth-Token": TOKEN } });
  if (!res.ok) throw new Error(`football-data svarade ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const KEEP = new Set(["LIVE", "IN_PLAY", "PAUSED", "FINISHED", "TIMED", "SCHEDULED"]);
  console.log(`Fallback football-data: ${json.matches?.length ?? 0} matcher.`);
  return (json.matches || [])
    .filter((m) => KEEP.has(m.status))
    .map((m) => ({
      home: m.homeTeam?.name ?? m.homeTeam?.shortName ?? "",
      away: m.awayTeam?.name ?? m.awayTeam?.shortName ?? "",
      homeScore: typeof m.score?.fullTime?.home === "number" ? m.score.fullTime.home : null,
      awayScore: typeof m.score?.fullTime?.away === "number" ? m.score.fullTime.away : null,
      status: m.status === "IN_PLAY" ? "LIVE" : m.status,
      minute: m.minute ?? null,
      utcDate: m.utcDate ?? null,
    }))
    .sort((a, b) => liveRank(b) - liveRank(a));
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return fallback;
  }
}

// Skriv `payload` till `path` bara om `same(prev, payload)` är falskt.
async function writeIfChanged(path, payload, same, label) {
  const next = JSON.stringify(payload, null, 2) + "\n";
  const prev = await readJson(path, null);
  if (prev && same(prev, payload)) {
    console.log(`Inga ändringar (${path.split("/").pop()}) – skriver inte om.`);
    return;
  }
  await writeFile(path, next);
  console.log(`Skrev ${label} till ${path.split("/").pop()}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
