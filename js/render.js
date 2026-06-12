import { whoTipped } from "./live.js";
import { flagEmoji } from "./config.js";

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

/* ---------- Hero (live-match eller nästa kommande match) ---------- */
export function renderHero(container, liveEnriched, data) {
  container.replaceChildren();
  const live = liveEnriched.filter((l) => l.isLive);

  if (live.length) {
    container.hidden = false;
    const inner = el("div", { class: "hero-inner" });
    for (const l of live) inner.appendChild(heroCard(l, data.people));
    container.appendChild(inner);
    return;
  }

  // Ingen live-match: visa nästa kommande match
  const liveMatchCols = new Set(liveEnriched.map((l) => l.match.col));
  const next = data.matches.find((m) => !m.result && !liveMatchCols.has(m.col));
  if (!next) { container.hidden = true; return; }

  container.hidden = false;
  const inner = el("div", { class: "hero-inner" });
  inner.appendChild(nextMatchCard(next, data.people));
  container.appendChild(inner);
}

function nextMatchCard(match, people) {
  const dist = tipDistribution(match, people);
  const dateLabel = [match.datum, match.tid].filter(Boolean).join(" · ");
  return el("div", {}, [
    el("div", { class: "hero-meta" }, [
      el("span", { text: match.group ? `Grupp ${match.group}` : "" }),
      el("span", { class: "hero-next-badge" },
        [`NÄSTA MATCH${dateLabel ? " · " + dateLabel : ""}`]),
    ]),
    el("div", { class: "hero-match" }, [
      el("div", { class: "hero-team" }, [
        el("span", { class: "hero-flag", text: flagEmoji(match.home) }),
        el("span", { class: "hero-name", text: match.homeSv }),
      ]),
      el("div", { class: "hero-center" }, [
        el("div", { class: "hero-score hero-score-upcoming", text: "–" }),
      ]),
      el("div", { class: "hero-team" }, [
        el("span", { class: "hero-flag", text: flagEmoji(match.away) }),
        el("span", { class: "hero-name", text: match.awaySv }),
      ]),
    ]),
    dist.length
      ? el("div", { class: "hero-tip-dist" },
          dist.slice(0, 6).map(([score, names]) =>
            el("div", { class: "hero-tip-row" }, [
              el("span", { class: "tip-score", text: score }),
              el("span", { class: "tip-count", text: `${names.length}×` }),
              el("span", { class: "tip-names", text: names.join(", ") }),
            ])
          ))
      : el("div", { class: "hero-tippers" },
          [el("span", { class: "muted", text: "Inga tips inlagda ännu" })]),
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

function heroCard(l, people) {
  const m = l.match;
  const tippers = whoTipped(m, l.scoreStr, people);
  const timeLabel = l.status === "PAUSED" ? "Paus"
    : l.minute != null ? `${l.minute}'` : "Live";

  return el("div", {}, [
    el("div", { class: "hero-meta" }, [
      el("span", { text: m.group ? `Grupp ${m.group}` : "" }),
      el("span", { class: "hero-pulse" }, [
        el("span", { class: "hero-dot" }),
        "LIVE",
      ]),
    ]),
    el("div", { class: "hero-match" }, [
      el("div", { class: "hero-team" }, [
        el("span", { class: "hero-flag", text: flagEmoji(m.home) }),
        el("span", { class: "hero-name", text: m.homeSv }),
      ]),
      el("div", { class: "hero-center" }, [
        el("div", { class: "hero-score", text: `${l.homeScore} – ${l.awayScore}` }),
        el("span", { class: "hero-time" }, [
          el("span", { class: "hero-dot" }),
          timeLabel,
        ]),
      ]),
      el("div", { class: "hero-team" }, [
        el("span", { class: "hero-flag", text: flagEmoji(m.away) }),
        el("span", { class: "hero-name", text: m.awaySv }),
      ]),
    ]),
    el("div", { class: "hero-tippers" }, [
      el("span", { class: "tippers-label", text: `Tippade ${l.scoreStr}: ` }),
      tippers.length
        ? el("span", { class: "tippers-names", text: tippers.join(", ") })
        : el("span", { class: "muted", text: "ingen" }),
    ]),
  ]);
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
    for (const m of upcoming.slice(0, 24)) list.appendChild(upcomingRow(m));
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

function upcomingRow(m) {
  return el("div", { class: "match-row" }, [
    el("span", { class: "when", text: `${m.datum} ${m.tid}` }),
    el("span", { class: "teams", text: `${m.homeSv} – ${m.awaySv}` }),
    el("span", { class: "grp", text: m.group }),
  ]);
}

function playedRow(m, people) {
  const exact = people.filter((p) => p.tips[m.col] === m.result).length;
  return el("div", { class: "match-row played" }, [
    el("span", { class: "when", text: m.datum }),
    el("span", { class: "teams", text: `${m.homeSv} – ${m.awaySv}` }),
    el("span", { class: "res", text: m.result }),
    el("span", { class: "exact", text: `${exact} prick` }),
  ]);
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
