// Simulerar utfallet av tippet när endast finalen + bronsmatchen (och skytteligan)
// återstår. Poängformeln kommer från arkets "Regler"-flik:
//   Rätt resultat 3p · Rätt tecken 1p (ömsesidigt uteslutande)
//   Lag vidare från grupp (per lag) 2p · Bästa 3:a vidare (per lag) 2p
//   Guld/Silver/Brons: 7p vid exakt rätt placering, annars 1/2/3p beroende på hur
//     långt laget faktiskt nådde (Kvartsfinal/Semifinal/Final) – bedöms separat per pick
//   Skyttekung 6p (alla som tippat en delad ledare får poängen, inte delat)
import { codeFromSv } from "./config.js";

const KO_ORDER = ["Sextondelsfinal", "Åttondelsfinal", "Kvartsfinal", "Semifinal", "Final"];
const TIER_POINTS = [0, 0, 1, 2, 3]; // index = KO_ORDER

function normName(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function outcome(score) {
  if (!score) return null;
  const [a, b] = score.split("-").map(Number);
  return a > b ? "1" : a < b ? "2" : "X";
}

// Ordbaserad skyttekung-matchning (samma regel som Skytteliga-fliken).
function tipMatchesScorer(scorerName, tip) {
  const sn = normName(scorerName);
  const t = normName(tip);
  if (!t || t.length < 3) return false;
  if (sn === t) return true;
  const sWords = sn.split(/\s+/);
  const tWords = t.split(/\s+/).filter(Boolean);
  return tWords.length > 0 && tWords.every((w) => sWords.some((sw) => sw === w));
}

// Union av alla lag som gått vidare (oavsett grupp) – samma lenienta regel som
// Slutspel-fliken använder för Vidare-poäng.
function advancementPredicate(advanceGroups) {
  const codes = new Set();
  const names = new Set();
  for (const g of advanceGroups || []) {
    for (const c of g.correct) {
      const code = codeFromSv(c);
      if (code) codes.add(code); else names.add(normName(c));
    }
  }
  return (pick) => {
    const pc = codeFromSv(pick);
    return pc ? codes.has(pc) : names.has(normName(pick));
  };
}

// Varje lags längsta resa i slutspelet. Bronsmatchen räknas inte som "längre" än
// semifinalen den redan spelat (den är en placeringsmatch, inte huvudträdet).
function teamFurthestStage(bracket) {
  const idx = new Map();
  for (const m of bracket ?? []) {
    const stageIdx = KO_ORDER.indexOf(m.stage);
    if (stageIdx < 0) continue;
    for (const code of [m.homeCode, m.awayCode]) {
      if (!code) continue;
      if ((idx.get(code) ?? -1) < stageIdx) idx.set(code, stageIdx);
    }
  }
  return idx;
}

function tierPointsFor(code, stageMap) {
  const i = stageMap.get(code);
  return i == null ? 0 : TIER_POINTS[i];
}

// Målskyttar just nu (exkl. självmål): [{ name, code, goals }], flest mål först.
function scorerCounts(goalsMap) {
  const counts = new Map();
  for (const list of goalsMap.values()) {
    for (const g of list) {
      if (/own/i.test(g.type)) continue;
      const cur = counts.get(g.scorer) ?? { name: g.scorer, code: g.code, goals: 0 };
      cur.goals++;
      counts.set(g.scorer, cur);
    }
  }
  return [...counts.values()].sort((a, b) => b.goals - a.goals);
}

// Hur många mål under nuvarande max en spelare i ett kvarvarande lag ändå räknas som
// realistisk "kan gå om ensam"-kandidat (en stark insats i sista matchen).
const OVERTAKE_RANGE = 3;

// Skyttekung-scenarier: nuläget (delade ledare) + en kandidat per realistisk "ensam
// ledare"-spelare i ett kvarvarande lag – OAVSETT om någon faktiskt tippat spelaren.
// Scenarier som ger EXAKT samma mottagarkrets av tippare slås ihop (t.ex. "Mbappé &
// Messi delar" == "Mbappé ensam" så länge ingen tippat Messi). Kandidater som ingen
// alls tippat på slås ihop till ett enda "annan vinnare"-alternativ i stället för att
// upprepas en gång per namn.
function skyttekungScenarios(people, goalsMap, remainingCodes) {
  const all = scorerCounts(goalsMap);
  const maxGoals = all.length ? all[0].goals : 0;
  const leaders = all.filter((p) => p.goals === maxGoals);

  const raw = [
    { players: leaders.map((l) => l.name),
      matches: (tip) => leaders.some((l) => tipMatchesScorer(l.name, tip)) },
  ];
  const candidates = all.filter((p) => remainingCodes.has(p.code) && p.goals >= maxGoals - OVERTAKE_RANGE);
  for (const player of candidates) {
    raw.push({ players: [player.name], matches: (t) => tipMatchesScorer(player.name, t) });
  }

  const tips = people
    .map((p) => (p.bonus.find((x) => /Skyttekung/i.test(x.label))?.value || "").trim())
    .filter(Boolean);

  const byKey = new Map(); // mottagarkrets (sorterad) -> { players, matches }
  const noneGroups = [];
  for (const s of raw) {
    const beneficiaries = [...new Set(tips.filter((t) => s.matches(t)))].sort();
    if (!beneficiaries.length) { noneGroups.push(s); continue; }
    const key = beneficiaries.join("|");
    if (byKey.has(key)) {
      const merged = byKey.get(key);
      merged.players = [...new Set([...merged.players, ...s.players])];
    } else {
      byKey.set(key, { players: [...s.players], matches: s.matches });
    }
  }

  const scenarios = [...byKey.values()].map((s) => ({
    label: `${s.players.join(" eller ")} blir skyttekung`,
    matches: s.matches,
  }));
  if (noneGroups.length) {
    scenarios.push({
      label: "Annan skytteligavinnare än vad någon tippat på",
      matches: () => false,
    });
  }
  return scenarios;
}

function matchPoints(person, matches) {
  let pts = 0;
  for (const m of matches) {
    const tip = person.tips[m.col];
    if (!tip || !m.result) continue;
    if (tip === m.result) pts += 3;
    else if (outcome(tip) === outcome(m.result)) pts += 1;
  }
  return pts;
}

function advancePoints(person, advanced) {
  let pts = 0;
  for (const b of person.bonus) {
    if (b.label !== "Vidare" || !b.value) continue;
    if (advanced(b.value)) pts += 2;
  }
  return pts;
}

function medalPoints(person, stageMap, standing) {
  let pts = 0;
  for (const slot of ["Guld", "Silver", "Brons"]) {
    const b = person.bonus.find((x) => x.label === slot);
    const val = (b?.value || "").trim();
    if (!val) continue;
    const code = codeFromSv(val);
    if (!code) continue;
    pts += code === standing[slot] ? 7 : tierPointsFor(code, stageMap);
  }
  return pts;
}

function skyttekungPoints(person, scenario) {
  const b = person.bonus.find((x) => /Skyttekung/i.test(x.label));
  const val = (b?.value || "").trim();
  return val && scenario.matches(val) ? 6 : 0;
}

// Facit-tiebreak (Regler-fliken): flest rätt tecken, sedan flest rätt resultat.
function tieStats(person, matches) {
  let exact = 0, out = 0;
  for (const m of matches) {
    const tip = person.tips[m.col];
    if (!tip || !m.result) continue;
    if (tip === m.result) exact++;
    if (outcome(tip) === outcome(m.result)) out++;
  }
  return { exact, out };
}

// Bygger hela simuleringen. Returnerar null om final/bronsmatch ännu inte har
// kända lag (dvs. semifinalerna är inte klara).
export function buildSimulation(data, bracket, goalsMap) {
  const { matches, people, advanceGroups } = data;
  const final = (bracket ?? []).find((m) => m.stage === "Final");
  const bronze = (bracket ?? []).find((m) => m.stage === "Bronsmatch");
  if (!final?.homeCode || !final?.awayCode || !bronze?.homeCode || !bronze?.awayCode) return null;

  const stageMap = teamFurthestStage(bracket);
  const advanced = advancementPredicate(advanceGroups);
  const remainingCodes = new Set([final.homeCode, final.awayCode, bronze.homeCode, bronze.awayCode]);
  const skScenarios = skyttekungScenarios(people, goalsMap, remainingCodes);

  const info = people.map((p) => ({
    person: p,
    basePts: matchPoints(p, matches) + advancePoints(p, advanced),
    tie: tieStats(p, matches),
  }));

  const outcomes = [];
  for (const finalWinner of [final.homeCode, final.awayCode]) {
    const finalLoser = finalWinner === final.homeCode ? final.awayCode : final.homeCode;
    for (const bronzeWinner of [bronze.homeCode, bronze.awayCode]) {
      const bronzeLoser = bronzeWinner === bronze.homeCode ? bronze.awayCode : bronze.homeCode;
      const standing = { Guld: finalWinner, Silver: finalLoser, Brons: bronzeWinner };
      for (const sk of skScenarios) {
        const rows = info
          .map(({ person, basePts, tie }) => ({
            name: person.name,
            points: basePts + medalPoints(person, stageMap, standing) + skyttekungPoints(person, sk),
            tie,
          }))
          .sort((a, b) => b.points - a.points || b.tie.out - a.tie.out || b.tie.exact - a.tie.exact);
        const first = rows[0];
        const winners = rows
          .filter((r) => r.points === first.points && r.tie.out === first.tie.out && r.tie.exact === first.tie.exact)
          .map((r) => r.name);
        outcomes.push({
          finalWinner, finalLoser, bronzeWinner, bronzeLoser,
          skyttekung: sk.label,
          winners, winnerPoints: first.points,
          rows,
        });
      }
    }
  }
  return { final, bronze, remainingCodes, skScenarios, outcomes };
}
