# VM-tips 2026

En liten statisk hemsida som visar gängets VM-tips: topplista, matcher, live-resultat,
per-person-detaljer och kuriosa-statistik. **Google Sheets är databasen** – sidan läser
bara, skriver aldrig tillbaka. Hostas gratis på GitHub Pages.

## Hur det fungerar

- **Topplista, matcher, tips, statistik** hämtas direkt i webbläsaren från arket via
  Googles publika CSV-endpoint (`gviz/tq?tqx=out:csv`). Inget byggsteg.
- **Live-resultat** hämtas automatiskt av ett schemalagt GitHub Actions-jobb
  (`.github/workflows/live-scores.yml`) som var ~5:e minut anropar en fotbolls-API och
  sparar `data/live.json`. Sidan läser den filen och visar pågående matcher överst –
  med exakt vilka som tippat den rådande ställningen. Ingen manuell uppdatering.
- Officiella **resultat och poäng** kommer alltid från arket (era formler). API:t ger
  bara live-overlay för pågående matcher.

## Filer

| Fil | Roll |
|-----|------|
| `index.html`, `css/style.css` | Sidans skal och stil |
| `js/config.js` | Datakontrakt: ark-ID, rad/kol-index, lagkoder |
| `js/sheets.js` | Hämtar + parsar arket (CSV → matcher/personer/tips) |
| `js/live.js` | Läser `data/live.json` och parar ihop med rätt match |
| `js/render.js` | Bygger de fyra vyerna |
| `js/app.js` | Navigering + auto-refresh |
| `scripts/fetch-scores.mjs` | Hämtar live-resultat (körs av Actions) |
| `.github/workflows/live-scores.yml` | Schemalägger live-hämtningen |
| `data/live.json` | Cachade live-resultat (skrivs av Actions) |

## Uppsättning

### 1. Dela arket
Öppna arket → **Dela** → "Alla med länken" = **Visa**. (Arket är redan inställt så i
`js/config.js`: `SHEET_ID` och `GID`. Byter ni ark, uppdatera dem – ID och gid finns i
ark-URL:en: `.../d/SHEET_ID/edit?gid=GID`.)

### 2. Live-resultat (valfritt men rekommenderat)
1. Skaffa en gratis API-nyckel på <https://www.football-data.org/client/register>.
2. I repot: **Settings → Secrets and variables → Actions → New repository secret**
   – namn `FOOTBALL_API_TOKEN`, värde = nyckeln.
3. **Settings → Actions → General**: tillåt workflows och ge "Read and write permissions".
4. Aktivera workflowet (Actions-fliken). Kör det manuellt en gång via **Run workflow**.

> Täcker inte gratisnivån VM? Byt källa i `scripts/fetch-scores.mjs` (t.ex. API-Football
> eller TheSportsDB) – behåll bara utdataformatet, så behöver inget annat ändras.

### 3. Publicera på GitHub Pages
1. Pusha repot till GitHub.
2. **Settings → Pages → Deploy from a branch → `main` / `root`**.
3. Sidan blir live på `https://<användarnamn>.github.io/<repo>/`.

## Köra lokalt

```bash
python3 -m http.server 8000
# öppna http://localhost:8000
```

Testa live-hämtaren lokalt:

```bash
FOOTBALL_API_TOKEN=din_nyckel node scripts/fetch-scores.mjs
```

## Arkets struktur (för parsern)

Arket är ett brett blad i tipspromenad-form – **varje match är en kolumn**:

- Rad 1–4: grupp / datum / tid / matchetikett (`MEX-SAF`).
- Rad 5: faktiska resultat per match (kol A–C = `Namn`/`Poäng`/`Resultat`).
- Rad 6+: en rad per person, med poäng (kol B) och tips per match, samt slutspels-
  och skyttekungstips i kolumnerna längst till höger.

Lagkoderna är svenska 3-bokstavskoder som mappas till lagnamn i `js/config.js`
(`teamCodes`). Lägg till/justera där om koder saknas.
