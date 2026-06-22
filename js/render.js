import { whoTipped } from "./live.js";
import { flagEmoji } from "./config.js";
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
// Vilken matchkolumn heron visar. null = följ ankaret automatiskt.
let heroFocusCol = null;
let heroPrevLive = new Set();

export function renderHero(container, liveEnriched, data) {
  const matches = data.matches;
  if (!matches.length) { container.hidden = true; return; }
  container.hidden = false;

  const liveByCol = new Map(liveEnriched.map((l) => [l.match.col, l]));

  // En match som just gått live ska alltid synas – snäpp tillbaka till ankaret.
  const liveSet = new Set(liveEnriched.filter((l) => l.isLive).map((l) => l.match.col));
  if ([...liveSet].some((c) => !heroPrevLive.has(c))) heroFocusCol = null;
  heroPrevLive = liveSet;

  // Ankaret: live → senast spelade (ligger kvar tills nästa går live) → nästa kommande.
  const anchorCol = () => {
    const live = liveEnriched.find((l) => l.isLive);
    if (live) return live.match.col;
    let played = null;
    for (const mm of matches) {
      const li = liveByCol.get(mm.col);
      if (mm.result || li?.status === "FINISHED") played = mm.col;
    }
    if (played != null) return played;
    const up = matches.find((mm) => !mm.result);
    return up ? up.col : matches[matches.length - 1].col;
  };

  const focusCol = heroFocusCol ?? anchorCol();
  let idx = matches.findIndex((mm) => mm.col === focusCol);
  if (idx < 0) idx = matches.findIndex((mm) => mm.col === anchorCol());

  const m = matches[idx];
  const li = liveByCol.get(m.col);

  // Bläddra: lämna heroFocusCol = null om man landar på ankaret (resumera auto-följning).
  const go = (delta) => {
    const t = matches[idx + delta];
    if (!t) return;
    heroFocusCol = t.col === anchorCol() ? null : t.col;
    renderHero(container, liveEnriched, data);
  };
  const toLive = () => { heroFocusCol = null; renderHero(container, liveEnriched, data); };

  const inner = el("div", { class: "hero-inner" }, [
    heroBody(m, li, data.people),
    heroNav(matches, idx, liveEnriched, go, toLive),
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
  return el("div", { class: "hero-meta" }, [
    el("span", { text: m.group ? `Grupp ${m.group}` : "" }),
    badge,
  ]);
}

function teamCol(code, name) {
  return el("div", { class: "hero-team" }, [
    el("span", { class: "hero-flag", text: flagEmoji(code) }),
    el("span", { class: "hero-name", text: name }),
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
    dist.length ? distBlock(dist, l.scoreStr) : null,
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
    el("div", { class: "hero-result-line", text:
      exact.length ? `Prickade slutresultatet: ${exact.join(", ")}` : "Ingen prickade slutresultatet" }),
    dist.length ? distBlock(dist, resStr) : null,
  ]);
}

function upcomingBody(m, people) {
  const dist = tipDistribution(m, people);
  const dateLabel = [m.datum, m.tid].filter(Boolean).join(" · ");
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
    dist.length
      ? distBlock(dist, null)
      : el("div", { class: "hero-tippers" }, [el("span", { class: "muted", text: "Inga tips inlagda ännu" })]),
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
  const offLive = liveMatch && liveMatch.match.col !== matches[idx].col;

  const navLabel = (m2) =>
    el("span", { class: "hn-label", text: `${flagEmoji(m2.home)} ${m2.home} – ${flagEmoji(m2.away)} ${m2.away}` });

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
      el("span", { class: "grp", text: "Grupp " + m.group }),
      el("span", { class: "min", text: l.status === "PAUSED" ? "Paus" : (l.minute != null ? l.minute + "'" : "Live") }),
    ]),
    el("div", { class: "live-score" }, [
      el("span", { class: "t home", text: m.homeSv }),
      el("span", { class: "sc", text: `${l.homeScore} – ${l.awayScore}` }),
      el("span", { class: "t away", text: m.awaySv }),
    ]),
    el("div", { class: "tippers" }, [
      el("span", { class: "tippers-label", text: `Tippade ${l.scoreStr}: ` }),
      tippers.length
        ? el("span", { class: "tippers-names", text: tippers.join(", ") })
        : el("span", { class: "muted", text: "ingen ännu" }),
    ]),
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

  const detailEl = el("div", { class: "match-tips" },
    dist.length
      ? dist.map(([score, names]) =>
          el("div", { class: "hero-tip-row" + (score === m.result ? " hit" : "") }, [
            el("span", { class: "tip-score", text: score }),
            el("span", { class: "tip-count", text: `${names.length}×` }),
            el("span", { class: "tip-names", text: names.join(", ") }),
          ]))
      : [el("span", { class: "muted", text: "Inga tips" })]
  );
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
export function renderPerson(container, person, matches, onBack) {
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

  // Folkets favoriter (Guld + Skyttekung)
  container.appendChild(el("h3", { class: "section-h", text: "Folkets favoriter" }));
  container.appendChild(faves("Guldfavorit", people, /Guld/i));
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
