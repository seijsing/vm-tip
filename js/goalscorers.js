const WIKI_API =
  "https://en.wikipedia.org/w/api.php" +
  "?action=query&titles=Module%3AGoalscorers%2Fdata%2F2026_FIFA_World_Cup" +
  "&prop=revisions&rvprop=content&format=json&origin=*";

// FIFA/Wikipedia 3-letter code → ISO 3166-1 alpha-2 for flag emoji.
const FIFA_ISO2 = {
  ALB:'AL', ALG:'DZ', ARG:'AR', AUS:'AU', AUT:'AT',
  BEL:'BE', BIH:'BA', BOL:'BO', BRA:'BR',
  CAN:'CA', CGO:'CG', CHI:'CL', CHN:'CN', CIV:'CI', COD:'CD', COL:'CO', CPV:'CV', CRC:'CR', CRO:'HR', CUW:'CW', CZE:'CZ',
  DEN:'DK',
  ECU:'EC', EGY:'EG', ENG:'GB', ESP:'ES',
  FRA:'FR',
  GEO:'GE', GER:'DE', GHA:'GH', GRE:'GR', GUI:'GN',
  HAI:'HT', HND:'HN', HUN:'HU',
  IRN:'IR', IRQ:'IQ', ISL:'IS',
  JAM:'JM', JOR:'JO', JPN:'JP',
  KOR:'KR', KSA:'SA',
  MAR:'MA', MEX:'MX', MLI:'ML',
  NED:'NL', NGA:'NG', NOR:'NO', NZL:'NZ',
  PAN:'PA', PAR:'PY', PER:'PE', POL:'PL', POR:'PT',
  QAT:'QA',
  ROU:'RO', RSA:'ZA', RUS:'RU',
  SAU:'SA', SCO:'GB', SEN:'SN', SLE:'SL', SRB:'RS', SUI:'CH', SVK:'SK', SVN:'SI', SWE:'SE',
  TUN:'TN', TUR:'TR',
  UKR:'UA', URU:'UY', USA:'US', UZB:'UZ',
  VEN:'VE',
  WAL:'GB',
};

function codeToFlag(code) {
  const iso = FIFA_ISO2[code] ?? '';
  if (iso.length !== 2) return '';
  const base = 0x1F1E6;
  return String.fromCodePoint(base + iso.charCodeAt(0) - 65, base + iso.charCodeAt(1) - 65);
}

let _cache = null;

export async function fetchGoalscorers() {
  if (_cache) return _cache;
  const res = await fetch(WIKI_API);
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const json = await res.json();
  const pages = json.query?.pages ?? {};
  const rev = Object.values(pages)[0]?.revisions?.[0];
  const content = rev?.['*'] ?? rev?.content ?? '';
  _cache = parseGoalscorers(content);
  return _cache;
}

function parseGoalscorers(lua) {
  // Each scorer entry: { "[[Name]]", "CODE", goals }
  // Own-goal entries have a table as 3rd element: { "[[Name]]", "CODE", { n, "Opponent" } }
  // The [,}] at the end ensures the 3rd element is a number, not a table.
  const re = /\{\s*"(?:\[\[)?([^"\]]+?)(?:\]\])?"\s*,\s*"([A-Z]{2,4})"\s*,\s*(\d+)\s*[,}]/g;
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(lua)) !== null) {
    // Lua-wikilinks kan ha disambiguering: "[[Artikel (disambiguation)|Visningsnamn]]"
    // — ta alltid delen efter | om den finns.
    const raw = m[1].replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
    const name = raw.includes('|') ? raw.split('|').pop().trim() : raw;
    const code = m[2];
    const goals = parseInt(m[3], 10);
    if (!seen.has(name) && goals > 0) {
      seen.add(name);
      out.push({ name, code, goals, flag: codeToFlag(code) });
    }
  }
  return out.sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, 'en'));
}
