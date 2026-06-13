import { CONFIG } from "./config.js";
import { loadSheet } from "./sheets.js";
import { fetchLive, matchLiveToSheet } from "./live.js";
import { renderStandings, renderMatches, renderPerson, renderStats, renderHero, renderTippers } from "./render.js";

const view = document.getElementById("view");
const heroEl = document.getElementById("hero");
const statusEl = document.getElementById("status");
const tabs = [...document.querySelectorAll(".tab")];

const state = {
  data: null,       // { matches, people, bonusCols }
  liveEnriched: [], // berikade live-matcher
  active: "standings",
  selected: null,   // valt personnamn
};

function setActive(name) {
  state.active = name;
  for (const t of tabs) t.classList.toggle("active", t.dataset.view === name);
  render();
}

function selectPerson(name) {
  state.selected = name;
  setActive("person");
}

function render() {
  if (!state.data) return;
  const { data } = state;
  switch (state.active) {
    case "standings":
      renderStandings(view, data.people, selectPerson); break;
    case "matches":
      renderMatches(view, data, state.liveEnriched); break;
    case "person": {
      const person = data.people.find((p) => p.name === state.selected) || null;
      renderPerson(view, person, data.matches, () => setActive("standings")); break;
    }
    case "tippers":
      renderTippers(view, data.people, selectPerson); break;
    case "stats":
      renderStats(view, data); break;
  }
}

async function refresh() {
  try {
    const [data, live] = await Promise.all([loadSheet(), fetchLive()]);
    state.data = data;
    state.liveEnriched = matchLiveToSheet(live.matches, data.matches);
    const liveCount = state.liveEnriched.filter((l) => l.isLive).length;
    setStatus(liveCount
      ? `🔴 ${liveCount} match${liveCount === 1 ? "" : "er"} live · uppdaterad ${time()}`
      : `Uppdaterad ${time()}`);
    renderHero(heroEl, state.liveEnriched, data);
    render();
  } catch (err) {
    setStatus("Kunde inte hämta data: " + err.message, true);
    console.error(err);
  }
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("err", isError);
}
function time() {
  return new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

// Init
for (const t of tabs) t.addEventListener("click", () => setActive(t.dataset.view));
setStatus("Hämtar …");
refresh();
setInterval(refresh, CONFIG.refreshMs);
