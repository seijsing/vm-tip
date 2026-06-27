import { whoTipped } from "./live.js";
import { flagEmoji, codeFromSv, teamSv } from "./config.js";
import { fetchGoalscorers } from "./goalscorers.js";

// Liten DOM-hjälpare.
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function clear(container) { container.replaceChildren(); }

// 1-X-2-utfall ur "a-b": "1" hemmaseger, "X" oavgjort, "2" bortaseger.
function outcome(score) {
  if (!score) return null;
  const [a, b] = score.split("-").map(Number);
  return a > b ? "1" : a < b ? "2" : "X";
}

/* ---------- Hero – navigerbar: föregående ↔ aktuell ↔ nästa ---------- */
// Stabil matchnyckel: arkkolumn när den finns, annars lagkodsparet (syntetiska
// slutspelsmatcher saknar kolumn).
const matchKey = (m) => (m.col != null ? "c" + m.col : "p" + [m.home, m.away].sort().join(""));

// Vilken match heron visar (matchKey). null = följ ankaret automatiskt.
let heroFocusKey = null;
let heroPrevLive = new Set();

export function renderHero(container, liveEnriched, data, bracket) {
  // Slå ihop arkets matcher med slutspelsmatcher (ej i arket): live-synteter först
  // (de bär målskyttar), sedan kommande/spelade ur bracket-datan där lagen är klara.
  const seen = new Set(data.matches.map(matchKey));
  const ko = [];
  const addKo = (m) => { const k = matchKey(m); if (!seen.has(k)) { seen.add(k); ko.push(m); } };
  for (const l of liveEnriched) if (l.match.synthetic) addKo(l.match);
  for (const b of bracket ?? []) addKo(bracketToMatch(b));
  ko.sort((a, b) => new Date(a.utcDate || 0) - new Date(b.utcDate || 0));
  const matches = [...data.matches, ...ko];
  if (!matches.length) { container.hidden = true; return; }
  container.hidden = false;

  const liveByKey = new Map(liveEnriched.map((l) => [matchKey(l.match), l]));

  // En match som just gått live ska alltid synas – snäpp tillbaka till ankaret.
  const liveSet = new Set(liveEnriched.filter((l) => l.isLive).map((l) => matchKey(l.match)));
  if ([...liveSet].some((k) => !heroPrevLive.has(k))) heroFocusKey = null;
  heroPrevLive = liveSet;

  // Ankaret: live → senast spelade (ligger kvar tills nästa går live) → nästa kommande.
  const anchorKey = () => {
    const live = liveEnriched.find((l) => l.isLive);
    if (live) return matchKey(live.match);
    let played = null;
    for (const mm of matches) {
      const li = liveByKey.get(matchKey(mm));
      if (mm.result || li?.status === "FINISHED") played = matchKey(mm);
    }
    if (played != null) return played;
    const up = matches.find((mm) => !mm.result);
    return up ? matchKey(up) : matchKey(matches[matches.length - 1]);
  };

  const focusKey = heroFocusKey ?? anchorKey();
  let idx = matches.findIndex((mm) => matchKey(mm) === focusKey);
  if (idx < 0) idx = matches.findIndex((mm) => matchKey(mm) === anchorKey());

  const m = matches[idx];
  const li = liveByKey.get(matchKey(m));

  // Bläddra: lämna heroFocusKey = null om man landar på ankaret (resumera auto-följning).
  const go = (delta) => {
    const t = matches[idx + delta];
    if (!t) return;
    heroFocusKey = matchKey(t) === anchorKey() ? null : matchKey(t);
    renderHero(container, liveEnriched, data, bracket);
  };
  const toLive = () => { heroFocusKey = null; renderHero(container, liveEnriched, data, bracket); };

  const inner = el("div", { class: "hero-inner" }, [
    heroNav(matches, idx, liveEnriched, go, toLive),
    heroBody(m, li, data.people),
  ]);
  container.replaceChildren(inner);
}

// Väljer rätt kortinnehåll utifrån matchens läge.
function heroBody(m, li, people) {
  if (li && li.isLive) return liveBody(m, li, people);
  const resStr = m.result ?? (li?.status === "FINISHED" ? li.scoreStr : null);
  if (resStr) return resultBody(m, resStr, people);
  return upcomingBody(m, people);
}

function heroHead(m, badge) {
  const label = m.synthetic ? m.group : m.group ? `Grupp ${m.group}` : "";
  return el("div", { class: "hero-meta" }, [
    el("span", { text: label }),
    badge,
  ]);
}

function teamCol(code, name) {
  return el("div", { class: "hero-team" }, [
    el("span", { class: "hero-flag", text: flagEmoji(code) }),
    el("span", { class: "hero-name", text: name }),
  ]);
}

// Formaterar en målpost: "Dembélé 7'" (+ markör för straff/självmål).
function fmtGoal(g) {
  const mark = /pen/i.test(g.type) ? " (str)" : /own/i.test(g.type) ? " (sj)" : "";
  return `${g.scorer}${g.minute ? ` ${g.minute}'` : ""}${mark}`;
}

// Målskyttar i två kolumner (hemma vänster, borta höger) med boll i mitten.
function scorersBlock(goals) {
  if (!Array.isArray(goals) || !goals.length) return null;
  const home = goals.filter((g) => g.side === "home");
  const away = goals.filter((g) => g.side === "away");
  if (!home.length && !away.length) return null;
  const col = (list, cls) =>
    el("div", { class: "hs-col " + cls }, list.map((g) => el("div", { class: "hs-item", text: fmtGoal(g) })));
  return el("div", { class: "hero-scorers" }, [
    col(home, "hs-home"),
    el("span", { class: "hs-ball", text: "⚽" }),
    col(away, "hs-away"),
  ]);
}

const MEDAL = { Guld: { emoji: "🥇", rank: 0 }, Silver: { emoji: "🥈", rank: 1 }, Brons: { emoji: "🥉", rank: 2 } };

// Vilka tippade laget (lagkod) till medalj + vilken (deras högsta om flera)?
function medalSupporters(code, people) {
  const out = [];
  for (const p of people) {
    let best = null;
    for (const b of p.bonus) {
      const med = MEDAL[b.label];
      if (!med || codeFromSv((b.value || "").trim()) !== code) continue;
      if (!best || med.rank < MEDAL[best.medal].rank) best = { name: p.name, medal: b.label };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => MEDAL[a.medal].rank - MEDAL[b.medal].rank);
}

// Per lag: vilka tippat laget till medalj – grupperat per medalj (🥇/🥈/🥉 + namn).
function supportersBlock(m, people) {
  const home = medalSupporters(m.home, people);
  const away = medalSupporters(m.away, people);
  if (!home.length && !away.length) return null;
  const line = (sv, list) => {
    const byMedal = { Guld: [], Silver: [], Brons: [] };
    for (const s of list) byMedal[s.medal].push(s.name);
    const groups = ["Guld", "Silver", "Brons"]
      .filter((med) => byMedal[med].length)
      .map((med) => el("span", { class: "sup-group" }, [
        el("span", { class: "sup-medal", text: MEDAL[med].emoji }),
        el("span", { class: "sup-group-names", text: byMedal[med].join(", ") }),
      ]));
    return el("div", { class: "sup-row" }, [
      el("span", { class: "sup-team", text: sv }),
      groups.length ? el("span", { class: "sup-groups" }, groups) : el("span", { class: "muted", text: "ingen" }),
    ]);
  };
  return el("div", { class: "hero-supporters" }, [
    el("div", { class: "sup-h", text: "Vill se laget gå långt" }),
    line(m.homeSv, home),
    line(m.awaySv, away),
  ]);
}

function liveBody(m, l, people) {
  const timeLabel = l.status === "PAUSED" ? "Paus"
    : l.minute != null ? `${l.minute}'` : "Live";
  const dist = tipDistribution(m, people);
  return el("div", {}, [
    heroHead(m, el("span", { class: "hero-pulse" }, [el("span", { class: "hero-dot" }), "LIVE"])),
    el("div", { class: "hero-match" }, [
      teamCol(m.home, m.homeSv),
      el("div", { class: "hero-center" }, [
        el("div", { class: "hero-score", text: `${l.homeScore} – ${l.awayScore}` }),
        el("span", { class: "hero-time" }, [el("span", { class: "hero-dot" }), timeLabel]),
      ]),
      teamCol(m.away, m.awaySv),
    ]),
    scorersBlock(m.goals),
    dist.length ? distBlock(dist, l.scoreStr) : null,
    supportersBlock(m, people),
  ]);
}

function resultBody(m, resStr, people) {
  const [hs, as] = resStr.split("-");
  const dist = tipDistribution(m, people);
  const exact = (dist.find(([s]) => s === resStr) || [null, []])[1];
  return el("div", {}, [
    heroHead(m, el("span", { class: "hero-finished-badge", text: "SLUTRESULTAT" })),
    el("div", { class: "hero-match" }, [
      teamCol(m.home, m.homeSv),
      el("div", { class: "hero-center" }, [
        el("div", { class: "hero-score", text: `${hs} – ${as}` }),
      ]),
      teamCol(m.away, m.awaySv),
    ]),
    scorersBlock(m.goals),
    el("div", { class: "hero-result-line", text:
      exact.length ? `Prickade slutresultatet: ${exact.join(", ")}` : "Ingen prickade slutresultatet" }),
    dist.length ? distBlock(dist, resStr) : null,
  ]);
}

function upcomingBody(m, people) {
  const dateLabel = [m.datum, m.tid].filter(Boolean).join(" · ");
  // Slutspelsmatch: visa medaljsupportrar i stället för score-tipsfördelning (finns ej).
  let detail;
  if (m.synthetic) {
    detail = m.tbd
      ? el("div", { class: "hero-tippers" }, [el("span", { class: "muted", text: "Lagen är inte klara än" })])
      : (supportersBlock(m, people)
          ?? el("div", { class: "hero-tippers" }, [el("span", { class: "muted", text: "Inga medaljtips på lagen" })]));
  } else {
    const dist = tipDistribution(m, people);
    detail = dist.length
      ? distBlock(dist, null)
      : el("div", { class: "hero-tippers" }, [el("span", { class: "muted", text: "Inga tips inlagda ännu" })]);
  }
  return el("div", {}, [
    heroHead(m, el("span", { class: "hero-next-badge" },
      [`KOMMANDE${dateLabel ? " · " + dateLabel : ""}`])),
    el("div", { class: "hero-match" }, [
      teamCol(m.home, m.homeSv),
      el("div", { class: "hero-center" }, [
        el("div", { class: "hero-score hero-score-upcoming", text: "–" }),
      ]),
      teamCol(m.away, m.awaySv),
    ]),
    detail,
  ]);
}

// Tipsdistribution som rader; markerar ev. raden som matchar slutresultatet.
function distBlock(dist, highlight) {
  const hlOut = outcome(highlight);
  return el("div", { class: "hero-tip-dist" },
    dist.map(([score, names]) => {
      const exact = score === highlight;
      const outMatch = !exact && hlOut != null && outcome(score) === hlOut;
      const cls = "hero-tip-row" + (exact ? " hit" : outMatch ? " hit-out" : "");
      return el("div", { class: cls }, [
        el("span", { class: "tip-score", text: score }),
        el("span", { class: "tip-count", text: `${names.length}×` }),
        el("span", { class: "tip-names", text: names.join(", ") }),
      ]);
    }));
}

// Navigering: föregående · (till live) · nästa.
function heroNav(matches, idx, liveEnriched, go, toLive) {
  const prev = matches[idx - 1];
  const next = matches[idx + 1];
  const liveMatch = liveEnriched.find((l) => l.isLive);
  const offLive = liveMatch && matchKey(liveMatch.match) !== matchKey(matches[idx]);

  // Riktigt lag → lagkod (kompakt). Platshållare (anonym flagga) → svensk text.
  const navText = (code, sv) => (flagEmoji(code) === "🏳" ? sv : code);
  const navLabel = (m2) =>
    el("span", { class: "hn-label", text:
      `${flagEmoji(m2.home)} ${navText(m2.home, m2.homeSv)} – ${flagEmoji(m2.away)} ${navText(m2.away, m2.awaySv)}` });

  const btn = (m2, dir, onClick) =>
    m2
      ? el("button", { class: `hero-nav-btn ${dir}`, onclick: onClick }, dir === "prev"
          ? [el("span", { class: "hn-arrow", text: "‹" }), navLabel(m2)]
          : [navLabel(m2), el("span", { class: "hn-arrow", text: "›" })])
      : el("span", { class: "hero-nav-btn empty" });

  const center = offLive
    ? el("button", { class: "hero-nav-live", onclick: toLive }, [el("span", { class: "hero-dot" }), "Till live"])
    : el("span", { class: "hero-nav-spacer" });

  return el("div", { class: "hero-nav" }, [
    btn(prev, "prev", () => go(-1)),
    center,
    btn(next, "next", () => go(1)),
  ]);
}

function tipDistribution(match, people) {
  const counts = new Map();
  for (const p of people) {
    const tip = p.tips[match.col];
    if (!tip) continue;
    if (!counts.has(tip)) counts.set(tip, []);
    counts.get(tip).push(p.name);
  }
  return [...counts.entries()].sort((a, b) => b[1].length - a[1].length);
}

/* ---------- Topplista ---------- */
export function renderStandings(container, people, onSelect) {
  clear(container);
  const sorted = [...people].sort((a, b) => b.points - a.points);
  const rows = [];
  let rank = 0, prev = null, shown = 0;
  for (const p of sorted) {
    shown++;
    if (p.points !== prev) { rank = shown; prev = p.points; }
    const r = rank;
    rows.push(
      el("tr", { class: "click", onclick: () => onSelect(p.name) }, [
        el("td", { class: "rank " + medal(r), text: String(r) }),
        el("td", { class: "name", text: p.name }),
        el("td", { class: "pts", text: String(p.points) }),
      ])
    );
  }
  container.appendChild(
    el("table", { class: "tbl standings" }, [
      el("thead", {}, el("tr", {}, [
        el("th", { text: "#" }), el("th", { text: "Namn" }), el("th", { text: "Poäng" }),
      ])),
      el("tbody", {}, rows),
    ])
  );
}
function medal(r) { return r === 1 ? "gold" : r === 2 ? "silver" : r === 3 ? "bronze" : ""; }

/* ---------- Matcher + live ---------- */
export function renderMatches(container, data, liveEnriched) {
  clear(container);
  const { matches, people } = data;
  const liveByCol = new Map(liveEnriched.map((l) => [l.match.col, l]));

  const live = liveEnriched.filter((l) => l.isLive);
  const played = matches.filter((m) => m.result && !liveByCol.get(m.col)?.isLive);
  const upcoming = matches.filter((m) => !m.result && !liveByCol.get(m.col)?.isLive);

  if (live.length) {
    container.appendChild(el("h3", { class: "section-h live-h", text: "🔴 Pågående just nu" }));
    for (const l of live) container.appendChild(liveCard(l, people));
  }

  container.appendChild(el("h3", { class: "section-h", text: "Kommande" }));
  if (upcoming.length) {
    const list = el("div", { class: "match-list" });
    for (const m of upcoming.slice(0, 24)) list.appendChild(upcomingRow(m, people));
    container.appendChild(list);
  } else container.appendChild(el("p", { class: "muted", text: "Inga kommande matcher." }));

  container.appendChild(el("h3", { class: "section-h", text: "Spelade" }));
  const playedList = el("div", { class: "match-list" });
  for (const m of [...played].reverse()) playedList.appendChild(playedRow(m, people));
  container.appendChild(playedList);
}

function liveCard(l, people) {
  const m = l.match;
  const tippers = whoTipped(m, l.scoreStr, people);
  return el("div", { class: "live-card" }, [
    el("div", { class: "live-top" }, [
      el("span", { class: "grp", text: m.synthetic ? m.group : "Grupp " + m.group }),
      el("span", { class: "min", text: l.status === "PAUSED" ? "Paus" : (l.minute != null ? l.minute + "'" : "Live") }),
    ]),
    el("div", { class: "live-score" }, [
      el("span", { class: "t home", text: m.homeSv }),
      el("span", { class: "sc", text: `${l.homeScore} – ${l.awayScore}` }),
      el("span", { class: "t away", text: m.awaySv }),
    ]),
    scorersBlock(m.goals),
    // Gruppspel: vilka tippade exakta ställningen. Slutspel (synthetic): inga ark-tips.
    m.synthetic ? null : el("div", { class: "tippers" }, [
      el("span", { class: "tippers-label", text: `Tippade ${l.scoreStr}: ` }),
      tippers.length
        ? el("span", { class: "tippers-names", text: tippers.join(", ") })
        : el("span", { class: "muted", text: "ingen ännu" }),
    ]),
    supportersBlock(m, people),
  ]);
}

function upcomingRow(m, people) {
  const dist = tipDistribution(m, people);
  const chevron = el("span", { class: "chevron", text: "›" });

  const detailEl = el("div", { class: "match-tips" },
    dist.length
      ? dist.map(([score, names]) =>
          el("div", { class: "hero-tip-row" }, [
            el("span", { class: "tip-score", text: score }),
            el("span", { class: "tip-count", text: `${names.length}×` }),
            el("span", { class: "tip-names", text: names.join(", ") }),
          ]))
      : [el("span", { class: "muted", text: "Inga tips ännu" })]
  );
  detailEl.hidden = true;

  const row = el("div", { class: "match-row match-row--expand" }, [
    el("div", { class: "when" }, [
      el("span", { class: "when-date", text: m.datum }),
      el("span", { class: "when-time", text: m.tid }),
    ]),
    el("span", { class: "teams", text: `${m.homeSv} – ${m.awaySv}` }),
    el("span", { class: "grp", text: m.group }),
    chevron,
  ]);
  row.addEventListener("click", () => {
    const open = !detailEl.hidden;
    detailEl.hidden = open;
    chevron.classList.toggle("open", !open);
    row.classList.toggle("expanded", !open);
  });

  return el("div", { class: "match-row-wrap" }, [row, detailEl]);
}

function playedRow(m, people) {
  const dist = tipDistribution(m, people);
  const exact = (dist.find(([s]) => s === m.result) || [null, []])[1].length;
  const chevron = el("span", { class: "chevron", text: "›" });

  const scorers = scorersBlock(m.goals);
  const detailEl = el("div", { class: "match-tips" }, [
    scorers,
    ...(dist.length
      ? dist.map(([score, names]) =>
          el("div", { class: "hero-tip-row" + (score === m.result ? " hit" : "") }, [
            el("span", { class: "tip-score", text: score }),
            el("span", { class: "tip-count", text: `${names.length}×` }),
            el("span", { class: "tip-names", text: names.join(", ") }),
          ]))
      : [el("span", { class: "muted", text: "Inga tips" })]),
  ]);
  detailEl.hidden = true;

  const row = el("div", { class: "match-row played" }, [
    el("span", { class: "when", text: m.datum }),
    el("span", { class: "teams", text: `${m.homeSv} – ${m.awaySv}` }),
    el("div", { class: "res-group" }, [
      el("span", { class: "res", text: m.result }),
      el("span", { class: "exact", text: `${exact} prick` }),
    ]),
    chevron,
  ]);
  row.addEventListener("click", () => {
    const open = !detailEl.hidden;
    detailEl.hidden = open;
    chevron.classList.toggle("open", !open);
    row.classList.toggle("expanded", !open);
  });

  return el("div", { class: "match-row-wrap" }, [row, detailEl]);
}

/* ---------- Per-person ---------- */
export function renderPerson(container, person, data, onBack) {
  const matches = data.matches;
  clear(container);
  if (!person) { container.appendChild(el("p", { text: "Välj en person i topplistan." })); return; }
  container.appendChild(
    el("div", { class: "person-head" }, [
      el("button", { class: "back", text: "← Tillbaka", onclick: onBack }),
      el("h3", { text: person.name }),
      el("span", { class: "person-pts", text: `${person.points} p` }),
    ])
  );

  const rows = matches.map((m) => {
    const tip = person.tips[m.col];
    const res = m.result;
    let cls = "";
    if (res && tip) cls = tip === res ? "hit-exact" : (outcome(tip) === outcome(res) ? "hit-out" : "miss");
    return el("tr", { class: cls }, [
      el("td", { class: "when", text: `${m.datum}` }),
      el("td", { class: "teams", text: `${m.homeSv} – ${m.awaySv}` }),
      el("td", { class: "tip", text: tip || "–" }),
      el("td", { class: "res", text: res || "" }),
    ]);
  });
  container.appendChild(
    el("table", { class: "tbl person" }, [
      el("thead", {}, el("tr", {}, [
        el("th", { text: "Datum" }), el("th", { text: "Match" }),
        el("th", { text: "Tips" }), el("th", { text: "Resultat" }),
      ])),
      el("tbody", {}, rows),
    ])
  );

  // Vidare-tips per grupp
  appendAdvanceSection(container, person, data.advanceGroups);

  // Bonus-tips (slutspel/skyttekung)
  const bonus = person.bonus.filter((b) => /Brons|Silver|Guld|Skyttekung/i.test(b.label) && b.value);
  if (bonus.length) {
    container.appendChild(el("h4", { class: "bonus-h", text: "Slutspelstips" }));
    container.appendChild(
      el("div", { class: "bonus" }, bonus.map((b) =>
        el("div", { class: "bonus-item" }, [
          el("span", { class: "bk", text: b.label }),
          el("span", { class: "bv", text: b.value }),
        ])
      ))
    );
  }
}

/* ---------- Vidare från grupperna ---------- */

// En persons vidare-tips grupperade på grupp: Map(grupp -> [lagnamn, …]).
function personAdvancePicks(person) {
  const m = new Map();
  for (const b of person.bonus) {
    if (b.label !== "Vidare" || !b.group) continue;
    if (!m.has(b.group)) m.set(b.group, []);
    m.get(b.group).push(b.value);
  }
  return m;
}

// Sammanlagt avancemang: ett tippat lag räknas som rätt om det gått vidare i NÅGON
// position (1:a/2:a/bästa 3:a) – samma lenienta regel som arkets poäng. Bygger en
// union av alla facit-celler. `advanced(pick)` = predikat; `fullyDecided` när alla
// vidare-celler är ifyllda (annars markeras inga missar).
function advancementState(advanceGroups) {
  const codes = new Set();
  const names = new Set();
  let filled = 0, slots = 0;
  for (const g of advanceGroups || []) {
    slots += g.slots || g.correct.length;
    for (const c of g.correct) {
      const code = codeFromSv(c);
      if (code) codes.add(code); else names.add(normName(c));
      filled++;
    }
  }
  const advanced = (pick) => {
    const pc = codeFromSv(pick);
    return pc ? codes.has(pc) : names.has(normName(pick));
  };
  return { advanced, fullyDecided: slots > 0 && filled >= slots };
}

// Lag-chip: flagga + namn. cls styr ev. hit/miss/facit-stil.
function teamChip(name, cls = "") {
  const code = codeFromSv(name);
  return el("span", { class: ("adv-chip " + cls).trim() }, [
    el("span", { class: "adv-flag", text: code ? flagEmoji(code) : "🏳" }),
    el("span", { class: "adv-chip-name", text: name }),
  ]);
}

// Sektion i personvyn: tippade lag vidare per grupp + ev. rätt/fel.
function appendAdvanceSection(container, person, advanceGroups) {
  if (!advanceGroups || !advanceGroups.length) return;
  const picks = personAdvancePicks(person);
  if (![...picks.values()].some((arr) => arr.some((v) => (v || "").trim()))) return;

  const { advanced, fullyDecided } = advancementState(advanceGroups);
  let grpHits = 0, grpDecided = 0, b3Hits = 0, b3Decided = 0;
  const rows = [];
  for (const g of advanceGroups) {
    const vals = (picks.get(g.group) || []).filter((v) => (v || "").trim());
    if (!vals.length) continue;
    const isB3 = g.group === "Bästa 3a";
    const chips = vals.map((v) => {
      const hit = advanced(v);
      const cls = hit ? "hit" : fullyDecided ? "miss" : "";
      if (hit || fullyDecided) {
        if (isB3) { b3Decided++; if (hit) b3Hits++; }
        else { grpDecided++; if (hit) grpHits++; }
      }
      return teamChip(v, cls);
    });
    rows.push(el("div", { class: "adv-grp-row" + (isB3 ? " wide" : "") }, [
      el("span", { class: "adv-grp", text: isB3 ? "Bästa 3:a" : g.group }),
      el("div", { class: "adv-picks" }, chips),
    ]));
  }

  container.appendChild(el("h4", { class: "bonus-h", text: "Vidare från grupperna" }));
  container.appendChild(el("div", { class: "advance-person" }, rows));

  if (grpDecided || b3Decided) {
    const parts = [];
    if (grpDecided) parts.push(`${grpHits}/${grpDecided} rätt i grupperna`);
    if (b3Decided) parts.push(`${b3Hits}/${b3Decided} bästa 3:or`);
    container.appendChild(el("div", { class: "adv-summary", text: parts.join(" · ") }));
  }
}

// Flik: grupp-för-grupp-översikt över vilka lag som tippats vidare.
export function renderAdvance(container, data, bracket) {
  clear(container);
  const { people, advanceGroups } = data;

  // Medaljpall överst – vem gänget tippat till guld/silver/brons.
  container.appendChild(el("h3", { class: "section-h", text: "🏆 Folkets pall" }));
  container.appendChild(el("p", { class: "muted",
    text: "Mest tippade till guld, silver och brons. Klicka på ett lag för att se vilka som tippat det." }));
  container.appendChild(renderPodium(people));

  // Slutspelsträd (kommande slutspelsmatcher från ESPN).
  const ko = renderBracket(bracket);
  if (ko) {
    container.appendChild(el("h3", { class: "section-h", text: "Slutspelsträd" }));
    container.appendChild(ko);
  }

  // Vidare ur grupperna.
  if (advanceGroups && advanceGroups.length) {
    container.appendChild(el("h3", { class: "section-h", text: "Vidare ur grupperna" }));
    container.appendChild(el("p", { class: "muted",
      text: "Lag som tippats gå vidare ur varje grupp. ✓ = gick vidare (fylls i när gruppspelet är klart)." }));
    const { advanced } = advancementState(advanceGroups);
    for (const g of advanceGroups) container.appendChild(advanceCard(g, people, advanced));
  }
}

function advanceCard(g, people, advanced) {
  // Räkna röster per lag i gruppen + vilka som tippat. Hoppa över värden som inte
  // matchar ett känt lag (t.ex. exempelradens platshållare "a"/"b") så översikten hålls ren.
  const counts = new Map();
  for (const p of people) {
    for (const b of p.bonus) {
      if (b.label !== "Vidare" || b.group !== g.group) continue;
      const v = (b.value || "").trim();
      const code = codeFromSv(v);
      if (!code) continue;
      if (!counts.has(code)) counts.set(code, { name: v, people: [] });
      counts.get(code).people.push(p.name);
    }
  }
  const sorted = [...counts.values()].sort((a, b) => b.people.length - a.people.length);
  const isB3 = g.group === "Bästa 3a";
  const title = isB3 ? "Bästa 3:orna" : `Grupp ${g.group}`;

  const head = el("div", { class: "adv-card-head" }, [
    el("span", { class: "adv-card-title", text: title }),
    g.correct.length
      ? el("div", { class: "adv-facit" }, g.correct.map((c) => teamChip(c, "facit")))
      : el("span", { class: "muted adv-pending", text: "Ej avgjort" }),
  ]);

  const votes = sorted.map((s) =>
    voteRow(s.name, s.people, { hit: advanced(s.name) }));

  return el("div", { class: "adv-card" }, [head, el("div", { class: "adv-votes" }, votes)]);
}

// Utfällbar röstrad: flagga + namn (+ ev. ✓) + antal · klick fäller ut tipparna.
function voteRow(name, voters, { hit = false } = {}) {
  const code = codeFromSv(name);
  const chevron = el("span", { class: "chevron", text: "›" });
  const row = el("div", { class: "adv-vote" + (hit ? " advanced" : "") }, [
    el("span", { class: "adv-flag", text: code ? flagEmoji(code) : "🏳" }),
    el("span", { class: "adv-team" }, [name, hit ? el("span", { class: "adv-check", text: "✓" }) : null]),
    el("span", { class: "adv-count", text: `${voters.length}×` }),
    chevron,
  ]);
  const names = el("div", { class: "adv-names", text: voters.join(", ") });
  names.hidden = true;
  row.addEventListener("click", () => {
    const open = !names.hidden;
    names.hidden = open;
    chevron.classList.toggle("open", !open);
    row.classList.toggle("expanded", !open);
  });
  return el("div", { class: "adv-vote-wrap" }, [row, names]);
}

// Aggregerar medaljtips (label = "Guld"/"Silver"/"Brons") per lagkod.
// -> [{ name, people:[…] }] sorterat på flest röster. Okända lag (exempelrad) hoppas över.
function medalCounts(label, people) {
  const counts = new Map();
  for (const p of people) {
    for (const b of p.bonus) {
      if (b.label !== label) continue;
      const code = codeFromSv((b.value || "").trim());
      if (!code) continue;
      if (!counts.has(code)) counts.set(code, { name: b.value.trim(), people: [] });
      counts.get(code).people.push(p.name);
    }
  }
  return [...counts.values()].sort((a, b) => b.people.length - a.people.length);
}

// Medaljpall: tre steg (Silver–Guld–Brons) med mest tippade lag + utfällbara listor.
function renderPodium(people) {
  const medals = [
    { label: "Silver", emoji: "🥈", cls: "silver" },
    { label: "Guld", emoji: "🥇", cls: "guld" },
    { label: "Brons", emoji: "🥉", cls: "brons" },
  ].map((m) => ({ ...m, counts: medalCounts(m.label, people) }));

  const steps = el("div", { class: "podium" }, medals.map((med) => {
    const top = med.counts[0];
    const code = top ? codeFromSv(top.name) : null;
    return el("div", { class: "podium-step podium-" + med.cls }, [
      el("div", { class: "podium-medal", text: med.emoji }),
      el("div", { class: "podium-flag", text: code ? flagEmoji(code) : "🏳" }),
      el("div", { class: "podium-team", text: top ? top.name : "–" }),
      el("div", { class: "podium-count", text: top ? `${top.people.length}×` : "–" }),
    ]);
  }));

  // Full fördelning per medalj i ordning Guld → Silver → Brons.
  const lists = ["Guld", "Silver", "Brons"].map((label) => {
    const med = medals.find((m) => m.label === label);
    return el("div", { class: "podium-list" }, [
      el("h4", { class: "podium-list-h", text: `${med.emoji} ${label}` }),
      med.counts.length
        ? el("div", { class: "adv-votes" }, med.counts.map((c) => voteRow(c.name, c.people)))
        : el("p", { class: "muted", text: "Inga tips" }),
    ]);
  });

  return el("div", { class: "podium-wrap" }, [steps, ...lists]);
}

/* ---------- Slutspelsträd (bracket från ESPN) ---------- */

const KO_ORDER = ["Sextondelsfinal", "Åttondelsfinal", "Kvartsfinal", "Semifinal", "Bronsmatch", "Final"];

// Översätter ESPN:s platshållarnamn till svenska. Faller tillbaka på råtexten.
function translatePlaceholder(text) {
  return (text || "")
    .replace(/Third Place Group\s*/i, "3:a grupp ")
    .replace(/Group\s+(\w+)\s+Winner/i, "Vinnare grupp $1")
    .replace(/Group\s+(\w+)\s+Runner-?Up/i, "2:a grupp $1")
    .replace(/Round of 32\s+(\d+)\s+Winner/i, "Vinnare sextondel $1")
    .replace(/Round of 16\s+(\d+)\s+Winner/i, "Vinnare åttondel $1")
    .replace(/Quarterfinal\s+(\d+)\s+Winner/i, "Vinnare kvartsfinal $1")
    .replace(/Semifinal\s+(\d+)\s+Winner/i, "Vinnare semifinal $1")
    .replace(/Semifinal\s+(\d+)\s+Loser/i, "Förlorare semifinal $1");
}

function fmtKoDate(utc) {
  if (!utc) return "";
  return new Date(utc).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

// Bracket-post -> match-objekt i hero-format, så den blir navigerbar. Lag som inte
// är klara blir platshållare: home/away = råetiketten (→ anonym flagga via flagEmoji),
// homeSv/awaySv = svensk översättning ("2:a grupp J").
function bracketToMatch(b) {
  return {
    col: null,
    code: `${b.homeCode || b.home}-${b.awayCode || b.away}`,
    group: b.stage,
    home: b.homeCode || b.home,
    away: b.awayCode || b.away,
    homeSv: b.homeCode ? teamSv(b.homeCode) : translatePlaceholder(b.home),
    awaySv: b.awayCode ? teamSv(b.awayCode) : translatePlaceholder(b.away),
    result: b.status === "FINISHED" && b.homeScore != null ? `${b.homeScore}-${b.awayScore}` : null,
    datum: fmtKoDate(b.utcDate),
    tid: "",
    synthetic: true,
    tbd: !(b.homeCode && b.awayCode),
    utcDate: b.utcDate,
  };
}

// Hela trädet grupperat per rond. null om inget data.
function renderBracket(bracket) {
  if (!Array.isArray(bracket) || !bracket.length) return null;
  const byStage = new Map();
  for (const m of bracket) {
    if (!byStage.has(m.stage)) byStage.set(m.stage, []);
    byStage.get(m.stage).push(m);
  }
  const rounds = KO_ORDER.filter((s) => byStage.has(s)).map((stage) => {
    const ms = byStage.get(stage).sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
    return el("div", { class: "ko-round" }, [
      el("h4", { class: "ko-round-h", text: stage }),
      ...ms.map(koMatch),
    ]);
  });
  return el("div", { class: "ko-bracket" }, rounds);
}

function koMatch(m) {
  const played = ["FINISHED", "LIVE", "PAUSED"].includes(m.status);
  const side = (code, label, score) =>
    el("div", { class: "ko-team" + (code ? "" : " ko-tbd") }, [
      el("span", { class: "ko-flag", text: code ? flagEmoji(code) : "🏳" }),
      el("span", { class: "ko-name", text: code ? teamSv(code) : translatePlaceholder(label) }),
      played && score != null ? el("span", { class: "ko-score", text: String(score) }) : null,
    ]);
  const live = m.status === "LIVE" || m.status === "PAUSED";
  const meta = live
    ? el("span", { class: "ko-when ko-live", text: "live" })
    : el("span", { class: "ko-when", text: m.status === "FINISHED" ? "slut" : fmtKoDate(m.utcDate) });
  return el("div", { class: "ko-match" }, [
    el("div", { class: "ko-teams" }, [side(m.homeCode, m.home, m.homeScore), side(m.awayCode, m.away, m.awayScore)]),
    meta,
  ]);
}

/* ---------- Tippare (alfabetisk lista → person-vy) ---------- */
export function renderTippers(container, people, onSelect) {
  clear(container);
  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name, "sv"));
  container.appendChild(
    el("div", { class: "tippers-list" },
      sorted.map((p) =>
        el("button", { class: "tipper-btn", onclick: () => onSelect(p.name) }, [
          el("span", { class: "tipper-name", text: p.name }),
          el("span", { class: "tipper-pts", text: `${p.points} p` }),
          el("span", { class: "tipper-arrow", text: "›" }),
        ])
      )
    )
  );
}

/* ---------- Statistik / kuriosa ---------- */
export function renderStats(container, data) {
  clear(container);
  const { matches, people } = data;
  const finished = matches.filter((m) => m.result);

  container.appendChild(el("p", { class: "muted",
    text: `Härledd statistik från ${finished.length} spelade matcher. De officiella poängen kommer från arket.` }));

  // Träffsäkerhet: exakt resultat + rätt utfall
  const stats = people.map((p) => {
    let exact = 0, out = 0;
    for (const m of finished) {
      const tip = p.tips[m.col];
      if (!tip) continue;
      if (tip === m.result) exact++;
      if (outcome(tip) === outcome(m.result)) out++;
    }
    return { name: p.name, exact, out };
  });

  container.appendChild(miniTable("Flest exakta resultat", [...stats].sort((a, b) => b.exact - a.exact), "exact"));
  container.appendChild(miniTable("Flest rätt utfall (1-X-2)", [...stats].sort((a, b) => b.out - a.out), "out"));

  // Folkets favoriter (guldfavoriten finns nu i Slutspel-fliken som medaljpall).
  container.appendChild(el("h3", { class: "section-h", text: "Folkets favoriter" }));
  container.appendChild(faves("Skyttekung", people, /Skyttekung/i));
}

function miniTable(title, list, key) {
  const rows = list.slice(0, 8).map((s, i) =>
    el("tr", {}, [
      el("td", { class: "rank", text: String(i + 1) }),
      el("td", { class: "name", text: s.name }),
      el("td", { class: "pts", text: String(s[key]) }),
    ])
  );
  return el("div", { class: "stat-block" }, [
    el("h3", { class: "section-h", text: title }),
    el("table", { class: "tbl" }, el("tbody", {}, rows)),
  ]);
}

function faves(title, people, labelRe) {
  const counts = new Map();
  for (const p of people) {
    const b = p.bonus.find((x) => labelRe.test(x.label));
    const v = normFave(b?.value);
    if (v) counts.set(v, (counts.get(v) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  return el("div", { class: "stat-block" }, [
    el("h4", { class: "bonus-h", text: title }),
    el("div", { class: "fave-list" }, sorted.map(([name, n]) =>
      el("div", { class: "fave" }, [
        el("span", { class: "bv", text: name }),
        el("span", { class: "bk", text: `${n} röst${n === 1 ? "" : "er"}` }),
      ])
    )),
  ]);
}

// Slå ihop uppenbara stavvarianter (trim + versalisera första bokstaven).
function normFave(v) {
  const s = (v || "").trim();
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------- Skytteliga (Wikipedia) ---------- */

// Normaliserar ett namn för jämförelse: gemen, strippa diakritik.
function normName(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// Avgör om ett tippat skyttekung-tips matchar ett spelarnamn.
// Kräver ord-för-ord-match och minst 3 tecken för att undvika falska träffar
// som "ag" (ej angiven) matchar delar av spelarnamn som "Iago".
function tipMatchesScorer(scorerName, tip) {
  const sn = normName(scorerName);
  const t = normName(tip);
  if (!t || t.length < 3) return false;
  if (sn === t) return true;
  const sWords = sn.split(/\s+/);
  const tWords = t.split(/\s+/).filter(Boolean);
  return tWords.length > 0 && tWords.every((w) => sWords.some((sw) => sw === w));
}

export async function renderGoalscorers(container, people) {
  clear(container);
  container.appendChild(el("p", { class: "muted", text: "Hämtar skytteliga från Wikipedia…" }));

  let scorers;
  try {
    scorers = await fetchGoalscorers();
  } catch (err) {
    clear(container);
    container.appendChild(el("p", { class: "muted", text: "Kunde inte hämta skytteligan: " + err.message }));
    return;
  }

  clear(container);
  container.appendChild(el("p", { class: "muted scorer-source" }, [
    "Källa: ",
    el("a", { href: "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup#Goalscorers",
      target: "_blank", rel: "noopener noreferrer", text: "Wikipedia" }),
  ]));

  const rows = [];
  let rank = 0, prevGoals = null, shown = 0;
  for (const s of scorers) {
    shown++;
    if (s.goals !== prevGoals) { rank = shown; prevGoals = s.goals; }

    const tippers = people
      .map((p) => {
        const b = p.bonus.find((x) => /Skyttekung/i.test(x.label));
        return b && tipMatchesScorer(s.name, b.value) ? p.name : null;
      })
      .filter(Boolean);

    const rankCls = "rank " + (rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "");
    const tipText = tippers.join(", ");
    rows.push(
      el("tr", {}, [
        el("td", { class: rankCls, text: String(rank) }),
        el("td", { class: "scorer-name" }, [
          s.flag ? el("span", { class: "scorer-flag", text: s.flag }) : null,
          el("span", { text: s.name }),
          tipText ? el("span", { class: "scorer-mobile-tip", text: tipText }) : null,
        ]),
        el("td", { class: "pts", text: String(s.goals) }),
        el("td", { class: "scorer-tippers scorer-tippers-col" },
          tippers.length
            ? [el("span", { class: "tippers-names", text: tipText })]
            : [el("span", { class: "muted", text: "–" })]
        ),
      ])
    );
  }

  container.appendChild(
    el("table", { class: "tbl scorers" }, [
      el("thead", {}, el("tr", {}, [
        el("th", { text: "#" }),
        el("th", { text: "Spelare" }),
        el("th", { class: "pts", text: "Mål" }),
        el("th", { text: "Tippade" }),
      ])),
      el("tbody", {}, rows),
    ])
  );
}
