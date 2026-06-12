import { CONFIG, teamSv } from "./config.js";

// Minimal CSV-parser: hanterar citerade fält, inbäddade kommatecken/radbrytningar
// och dubblade citattecken ("") inuti fält. Returnerar en matris (rader av celler).
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c === "\r") {
      // ignorera; \n hanterar radslut
    } else field += c;
  }
  // sista fältet/raden
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Hämtar bladet som CSV via gviz (samma origin-säkra publika endpoint).
export async function fetchSheetCSV() {
  const url =
    `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}` +
    `/gviz/tq?tqx=out:csv&gid=${CONFIG.GID}&cb=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Kunde inte hämta arket (${res.status})`);
  return res.text();
}

// Parsar matrisen till { matches, people, bonusCols }.
export function parseSheet(rows) {
  const { rows: R, cols: C, matchLabelRegex, excludeNames } = CONFIG.layout;
  const labelRow = rows[R.match] || [];
  const groupRow = rows[R.grupp] || [];
  const dateRow = rows[R.datum] || [];
  const timeRow = rows[R.tid] || [];
  const resultRow = rows[R.resultat] || [];

  // Matchkolumner = de där etiketten i match-raden ser ut som "XXX-YYY".
  const matches = [];
  for (let col = C.firstMatch; col < labelRow.length; col++) {
    const label = (labelRow[col] || "").trim();
    if (!matchLabelRegex.test(label)) continue;
    const [home, away] = label.split("-");
    matches.push({
      col,
      code: label,
      group: (groupRow[col] || "").trim(),
      datum: (dateRow[col] || "").trim(),
      tid: (timeRow[col] || "").trim(),
      home, away,
      homeSv: teamSv(home),
      awaySv: teamSv(away),
      result: normScore(resultRow[col]),
    });
  }

  // Bonus-kolumner (Vidare/Bästa 3a, Brons/Silver/Guld/Skyttekung) = allt efter sista
  // matchkolumnen där match-raden har en icke-tom etikett.
  const lastMatchCol = matches.length ? matches[matches.length - 1].col : C.firstMatch;
  const bonusCols = [];
  for (let col = lastMatchCol + 1; col < labelRow.length; col++) {
    const label = (labelRow[col] || "").trim();
    const group = (groupRow[col] || "").trim();
    if (!label && !group) continue;
    bonusCols.push({ col, label, group }); // label: "Vidare"/"Brons"/"Silver"/"Guld"/"Skyttekung"
  }

  // Personer = rader från firstPerson med ett namn (exkl. exempel-/tomma rader).
  const people = [];
  for (let r = R.firstPerson; r < rows.length; r++) {
    const cells = rows[r] || [];
    const name = (cells[C.namn] || "").trim();
    if (!name) continue;
    if (excludeNames.some((re) => re.test(name))) continue;
    const tips = {};
    let hasTip = false;
    for (const m of matches) {
      const t = normScore(cells[m.col]);
      tips[m.col] = t;
      if (t) hasTip = true;
    }
    // Riktiga deltagare har minst ett match-tips. Detta filtrerar bort summaraden
    // ("Antal deltagare") och lag-legenden (Grupp A, Mexiko, …) som ligger under listan.
    if (!hasTip) continue;
    const bonus = bonusCols.map((b) => ({ ...b, value: (cells[b.col] || "").trim() }));
    people.push({
      name,
      points: toNum(cells[C.poang]),
      tips,
      bonus,
    });
  }

  return { matches, people, bonusCols };
}

// "2-0" / "2 - 0" -> "2-0"; tomt -> null
function normScore(v) {
  const s = (v || "").trim();
  const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

function toNum(v) {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Bekvämlighet: hämta + parsa i ett steg.
export async function loadSheet() {
  const csv = await fetchSheetCSV();
  return parseSheet(parseCSV(csv));
}
