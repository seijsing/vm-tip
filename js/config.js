// Datakontrakt: all koppling mellan arkets matrislayout och sidan samlas här.
// Arket är ETT brett blad i tipspromenad-form (varje match är en kolumn).
export const CONFIG = {
  SHEET_ID: "1DDFMinCIiscli2gQr4XvgLOxVNxypw1j",
  GID: "617996315",
  refreshMs: 60000, // hur ofta sidan hämtar om ark + live.json

  layout: {
    rows: { grupp: 0, datum: 1, tid: 2, match: 3, resultat: 4, firstPerson: 5 },
    cols: { namn: 0, poang: 1, firstMatch: 3 },
    // urskiljer riktiga matchkolumner (MEX-SAF) från Vidare/Brons/Silver/Guld/Skyttekung
    matchLabelRegex: /^[A-ZÅÄÖ]{2,4}-[A-ZÅÄÖ]{2,4}$/,
    // namn som inte ska visas som deltagare
    excludeNames: [],
  },

  live: { file: "data/live.json" },

  // Svensk 3-bokstavskod -> { sv, en, iso }.
  // iso = 2-bokstavs ISO 3166-1 alpha-2, används för att rendera flagg-emoji.
  teamCodes: {
    ALG: { sv: "Algeriet",        en: "Algeria",               iso: "DZ" },
    ARG: { sv: "Argentina",       en: "Argentina",             iso: "AR" },
    AUS: { sv: "Australien",      en: "Australia",             iso: "AU" },
    BEL: { sv: "Belgien",         en: "Belgium",               iso: "BE" },
    BOS: { sv: "Bosnien",         en: "Bosnia-Herzegovina",    iso: "BA" },
    BRA: { sv: "Brasilien",       en: "Brazil",                iso: "BR" },
    COL: { sv: "Colombia",        en: "Colombia",              iso: "CO" },
    CUR: { sv: "Curaçao",         en: "Curaçao",               iso: "CW" },
    ECU: { sv: "Ecuador",         en: "Ecuador",               iso: "EC" },
    EGY: { sv: "Egypten",         en: "Egypt",                 iso: "EG" },
    ELF: { sv: "Elfenbenskusten", en: "Côte d'Ivoire",         iso: "CI" },
    ENG: { sv: "England",         en: "England",               iso: "GB" },
    FRA: { sv: "Frankrike",       en: "France",                iso: "FR" },
    GHA: { sv: "Ghana",           en: "Ghana",                 iso: "GH" },
    HAI: { sv: "Haiti",           en: "Haiti",                 iso: "HT" },
    IRA: { sv: "Irak",            en: "Iraq",                  iso: "IQ" },
    IRN: { sv: "Iran",            en: "Iran",                  iso: "IR" },
    JOR: { sv: "Jordanien",       en: "Jordan",                iso: "JO" },
    JPN: { sv: "Japan",           en: "Japan",                 iso: "JP" },
    KAN: { sv: "Kanada",          en: "Canada",                iso: "CA" },
    KAP: { sv: "Kap Verde",       en: "Cape Verde Islands",    iso: "CV" },
    KON: { sv: "Kongo",           en: "Congo DR",              iso: "CD" },
    KOR: { sv: "Sydkorea",        en: "Korea Republic",        iso: "KR" },
    KRO: { sv: "Kroatien",        en: "Croatia",               iso: "HR" },
    MAR: { sv: "Marocko",         en: "Morocco",               iso: "MA" },
    MEX: { sv: "Mexiko",          en: "Mexico",                iso: "MX" },
    NED: { sv: "Nederländerna",   en: "Netherlands",           iso: "NL" },
    NOR: { sv: "Norge",           en: "Norway",                iso: "NO" },
    NZL: { sv: "Nya Zeeland",     en: "New Zealand",           iso: "NZ" },
    PAN: { sv: "Panama",          en: "Panama",                iso: "PA" },
    PAR: { sv: "Paraguay",        en: "Paraguay",              iso: "PY" },
    POR: { sv: "Portugal",        en: "Portugal",              iso: "PT" },
    QAT: { sv: "Qatar",           en: "Qatar",                 iso: "QA" },
    SAF: { sv: "Sydafrika",       en: "South Africa",          iso: "ZA" },
    SAU: { sv: "Saudiarabien",    en: "Saudi Arabia",          iso: "SA" },
    SCO: { sv: "Skottland",       en: "Scotland",              iso: "GB" },
    SEN: { sv: "Senegal",         en: "Senegal",               iso: "SN" },
    SPA: { sv: "Spanien",         en: "Spain",                 iso: "ES" },
    SWE: { sv: "Sverige",         en: "Sweden",                iso: "SE" },
    SWZ: { sv: "Schweiz",         en: "Switzerland",           iso: "CH" },
    TJE: { sv: "Tjeckien",        en: "Czechia",               iso: "CZ" },
    TUN: { sv: "Tunisien",        en: "Tunisia",               iso: "TN" },
    TUR: { sv: "Turkiet",         en: "Türkiye",               iso: "TR" },
    TYS: { sv: "Tyskland",        en: "Germany",               iso: "DE" },
    URU: { sv: "Uruguay",         en: "Uruguay",               iso: "UY" },
    USA: { sv: "USA",             en: "United States",         iso: "US" },
    UZB: { sv: "Uzbekistan",      en: "Uzbekistan",            iso: "UZ" },
    ÖST: { sv: "Österrike",       en: "Austria",               iso: "AT" },
  },
};

// Slå upp svenskt visningsnamn för en lagkod (faller tillbaka på koden).
export function teamSv(code) {
  return CONFIG.teamCodes[code]?.sv ?? code;
}

// Returnerar flagg-emoji för en 3-bokstavs lagkod (via ISO 2-bokstavskod).
export function flagEmoji(code) {
  const iso = CONFIG.teamCodes[code]?.iso;
  if (!iso || iso.length !== 2) return "🏳";
  const base = 0x1F1E6; // Regional Indicator A
  return String.fromCodePoint(
    base + iso.charCodeAt(0) - 65,
    base + iso.charCodeAt(1) - 65
  );
}
