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
    excludeNames: [/exempel/i],
  },

  live: { file: "data/live.json" },

  // Svensk 3-bokstavskod -> { sv: visningsnamn, en: namn som live-API:t använder }.
  // sv används för rendering, en för att para ihop arkets match med live-matchen.
  // Osäkra (IRA, KON) är markerade — verifiera mot vald API innan live-säsong.
  teamCodes: {
    ALG: { sv: "Algeriet", en: "Algeria" },
    ARG: { sv: "Argentina", en: "Argentina" },
    AUS: { sv: "Australien", en: "Australia" },
    BEL: { sv: "Belgien", en: "Belgium" },
    BOS: { sv: "Bosnien", en: "Bosnia and Herzegovina" },
    BRA: { sv: "Brasilien", en: "Brazil" },
    COL: { sv: "Colombia", en: "Colombia" },
    CUR: { sv: "Curaçao", en: "Curaçao" },
    ECU: { sv: "Ecuador", en: "Ecuador" },
    EGY: { sv: "Egypten", en: "Egypt" },
    ELF: { sv: "Elfenbenskusten", en: "Côte d'Ivoire" },
    ENG: { sv: "England", en: "England" },
    FRA: { sv: "Frankrike", en: "France" },
    GHA: { sv: "Ghana", en: "Ghana" },
    HAI: { sv: "Haiti", en: "Haiti" },
    IRA: { sv: "Irak", en: "Iraq" }, // osäker kod – kan vara Irland
    IRN: { sv: "Iran", en: "Iran" },
    JOR: { sv: "Jordanien", en: "Jordan" },
    JPN: { sv: "Japan", en: "Japan" },
    KAN: { sv: "Kanada", en: "Canada" },
    KAP: { sv: "Kap Verde", en: "Cape Verde" },
    KON: { sv: "Kongo", en: "DR Congo" }, // osäker – Kongo-Kinshasa vs Brazzaville
    KOR: { sv: "Sydkorea", en: "South Korea" },
    KRO: { sv: "Kroatien", en: "Croatia" },
    MAR: { sv: "Marocko", en: "Morocco" },
    MEX: { sv: "Mexiko", en: "Mexico" },
    NED: { sv: "Nederländerna", en: "Netherlands" },
    NOR: { sv: "Norge", en: "Norway" },
    NZL: { sv: "Nya Zeeland", en: "New Zealand" },
    PAN: { sv: "Panama", en: "Panama" },
    PAR: { sv: "Paraguay", en: "Paraguay" },
    POR: { sv: "Portugal", en: "Portugal" },
    QAT: { sv: "Qatar", en: "Qatar" },
    SAF: { sv: "Sydafrika", en: "South Africa" },
    SAU: { sv: "Saudiarabien", en: "Saudi Arabia" },
    SCO: { sv: "Skottland", en: "Scotland" },
    SEN: { sv: "Senegal", en: "Senegal" },
    SPA: { sv: "Spanien", en: "Spain" },
    SWE: { sv: "Sverige", en: "Sweden" },
    SWZ: { sv: "Schweiz", en: "Switzerland" },
    TJE: { sv: "Tjeckien", en: "Czechia" },
    TUN: { sv: "Tunisien", en: "Tunisia" },
    TUR: { sv: "Turkiet", en: "Türkiye" },
    TYS: { sv: "Tyskland", en: "Germany" },
    URU: { sv: "Uruguay", en: "Uruguay" },
    USA: { sv: "USA", en: "United States" },
    UZB: { sv: "Uzbekistan", en: "Uzbekistan" },
    ÖST: { sv: "Österrike", en: "Austria" },
  },
};

// Slå upp svenskt visningsnamn för en lagkod (faller tillbaka på koden).
export function teamSv(code) {
  return CONFIG.teamCodes[code]?.sv ?? code;
}
