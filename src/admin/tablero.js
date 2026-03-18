import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase, showToast } from '../common/supabase.js';

requireRole('admin');

// ─── PLANTILLAS ──────────────────────────────────────────────────────────────
const PRESETS = {
  'funes-viernes':  { sede: 'funes',  label: 'FUNES — Viernes',  dayOffset: 4, courts: 6, slots: ['17:00','17:30','19:00','19:30','21:00'] },
  'funes-sabado':   { sede: 'funes',  label: 'FUNES — Sábado',   dayOffset: 5, courts: 6, slots: ['08:00','08:30','10:15','10:30','11:45','13:15','15:00','17:00'] },
  'funes-domingo':  { sede: 'funes',  label: 'FUNES — Domingo',  dayOffset: 6, courts: 6, slots: ['09:00','09:30','10:00','11:00','11:30','13:00','15:00','17:00'] },
  'centro-viernes': { sede: 'centro', label: 'CENTRO — Viernes', dayOffset: 4, courts: 4, slots: ['17:00','17:30','19:00','19:30','21:00'] },
  'centro-sabado':  { sede: 'centro', label: 'CENTRO — Sábado',  dayOffset: 5, courts: 4, slots: ['08:00','08:30','10:15','10:30','11:45','13:15','15:00','17:00'] },
  'centro-domingo': { sede: 'centro', label: 'CENTRO — Domingo', dayOffset: 6, courts: 6, slots: ['09:00','09:30','10:00','11:00','11:30','13:00','15:00','17:00'] },
};

// ─── ESTADO ───────────────────────────────────────────────────────────────────
let allPlayers       = new Map();
let allTournaments   = [];
let allInscriptions  = [];
let weekAvailability = [];
let currentWeekStart = getStartOfWeek(new Date());
let activePresets    = new Set();   // múltiples presets activos
let selectedTournamentIds = [];
let activeCatFilter  = null;

// Jugadores disponibles para los días seleccionados
// [{id, name, catName, catColor, slots: [{dayAbbr, turn, presetKey, date}]}]
let availablePlayers = [];

// assignments: "date|time|court" → {p1Id, p2Id, p3Id, p4Id}
let assignments = new Map();

// customSlots: presetKey → array of time strings (overrides PRESETS[key].slots)
let customSlots = new Map();

// cellModes: slotKey → 'singles'|'dobles' (default 'singles')
let cellModes = new Map();

let draggedPlayerId = null;
let draggedPair     = null;

// Matchmaking scoring data (loaded on generate)
let playerMatchCounts   = new Map(); // playerId → completed matches in selected tournaments
let playerRanks         = new Map(); // `${tid}-${pid}` → rank (1 = best)
let matchHistorySet     = new Set(); // `"p1-p2"` sorted → already played

// ─── DOM REFS ─────────────────────────────────────────────────────────────────
const weekDisplay      = document.getElementById('current-week-display');
const presetButtonsContainer = document.getElementById('preset-buttons');
const dateLabelEl      = document.getElementById('selected-date-label');
const tourCheckList    = document.getElementById('tournament-checkbox-list');
const btnSelectAll     = document.getElementById('btn-select-all');
const btnGenerate      = document.getElementById('btn-generate');
const btnBack          = document.getElementById('btn-back');
const btnSave          = document.getElementById('btn-save');
const saveCountEl      = document.getElementById('save-count');
const configPanel      = document.getElementById('config-panel');
const tableroContainer = document.getElementById('tablero-container');
const tableroTitle     = document.getElementById('tablero-title');
const playersList      = document.getElementById('suggestions-list');
const pairsList        = document.getElementById('pairs-list');
const sugCounter       = document.getElementById('sug-counter');
const catFilters       = document.getElementById('cat-filters');
const gridThead        = document.getElementById('grid-thead');
const gridTbody        = document.getElementById('grid-tbody');

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  mon.setHours(0,0,0,0);
  return mon;
}
function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d;
}
function formatYMD(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function formatDayLabel(date) {
  const days   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${days[date.getDay()]} ${date.getDate()} de ${months[date.getMonth()]}`;
}
function formatWeekLabel(start) {
  const end = addDays(start, 6);
  return `${String(start.getDate()).padStart(2,'0')}/${String(start.getMonth()+1).padStart(2,'0')} — ${String(end.getDate()).padStart(2,'0')}/${String(end.getMonth()+1).padStart(2,'0')}`;
}
function getDayAbbr(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()];
}
function isColorLight(hex) {
  if (!hex) return false;
  let c = hex.replace('#','');
  if (c.length === 3) c = c.split('').map(x=>x+x).join('');
  const r=parseInt(c.substr(0,2),16), g=parseInt(c.substr(2,2),16), b=parseInt(c.substr(4,2),16);
  return (0.299*r + 0.587*g + 0.114*b) > 150;
}
function sortTournaments(ts) {
  return [...ts].sort((a,b) => {
    const n = t => { const m = t.name.match(/^(\d+)/); return m ? parseInt(m[1]) : 999; };
    return n(a) - n(b) || a.name.localeCompare(b.name);
  });
}
function findCommonTournament(p1Id, p2Id, p3Id, p4Id) {
  const pIds = [p1Id, p2Id, p3Id, p4Id].filter(Boolean);
  if (!pIds.length) return null;
  // Build set of tournament_ids for first player
  let commonSet = new Set(
    allInscriptions
      .filter(i => i.player_id === pIds[0] && selectedTournamentIds.includes(i.tournament_id))
      .map(i => i.tournament_id)
  );
  // Intersect with each additional player
  for (let k = 1; k < pIds.length; k++) {
    const pidTids = new Set(
      allInscriptions
        .filter(i => i.player_id === pIds[k] && selectedTournamentIds.includes(i.tournament_id))
        .map(i => i.tournament_id)
    );
    commonSet = new Set([...commonSet].filter(tid => pidTids.has(tid)));
  }
  return commonSet.size ? [...commonSet][0] : null;
}
function getPlayerCat(pid) {
  for (const ins of allInscriptions) {
    if (ins.player_id !== pid) continue;
    const t = allTournaments.find(t => t.id === ins.tournament_id && selectedTournamentIds.includes(t.id));
    if (t) return { catName: t.catName, catColor: t.catColor };
  }
  return { catName: '', catColor: '#374151' };
}
function shortName(fullName) {
  const parts = fullName.trim().split(' ');
  return parts.length <= 2 ? fullName : parts[0] + ' ' + parts[parts.length - 1];
}
function isPlayerAssigned(pid) {
  for (const asgn of assignments.values()) {
    if (asgn.p1Id === pid || asgn.p2Id === pid || asgn.p3Id === pid || asgn.p4Id === pid) return true;
  }
  return false;
}
function getSlotsForPreset(key) {
  return customSlots.get(key) || [...PRESETS[key].slots];
}
function isComplete(slotKey) {
  const asgn = assignments.get(slotKey);
  if (!asgn) return false;
  if (cellModes.get(slotKey) === 'dobles') return !!(asgn.p1Id && asgn.p2Id && asgn.p3Id && asgn.p4Id);
  return !!(asgn.p1Id && asgn.p2Id);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('header').innerHTML = renderHeader();
  updateWeekDisplay();
  await loadInitialData();
  setupEventListeners();
});

async function loadInitialData() {
  const [
    { data: tourData },
    { data: playerData },
    { data: inscData }
  ] = await Promise.all([
    supabase.from('tournaments').select('id, name, category:category_id(id, name, color)').not('category.name','eq','Equipos'),
    supabase.from('players').select('id, name, category_id').order('name'),
    supabase.from('tournament_players').select('player_id, tournament_id')
  ]);

  allPlayers      = new Map((playerData || []).map(p => [p.id, p]));
  allInscriptions = inscData || [];
  allTournaments  = sortTournaments(
    (tourData || []).filter(t => t.category).map(t => ({
      id: t.id, name: t.name, category_id: t.category.id,
      catName: t.category.name, catColor: t.category.color
    }))
  );
  renderTournamentCheckboxes();
}

async function loadWeekData() {
  const startStr = formatYMD(currentWeekStart);
  const endStr   = formatYMD(addDays(currentWeekStart, 6));
  const { data } = await supabase
    .from('player_availability')
    .select('player_id, available_date, time_slot, zone')
    .gte('available_date', startStr)
    .lte('available_date', endStr);
  weekAvailability = (data || []).map(a => ({ ...a, available_date: a.available_date.split('T')[0] }));
}

async function loadMatchmakingData() {
  if (!selectedTournamentIds.length) return;
  const { data: matchesData } = await supabase
    .from('matches')
    .select('player1_id, player2_id, winner_id, tournament_id')
    .in('tournament_id', selectedTournamentIds);

  playerMatchCounts = new Map();
  matchHistorySet   = new Set();
  const playerWins  = new Map();

  (matchesData || []).forEach(m => {
    const key = [m.player1_id, m.player2_id].sort().join('-');
    matchHistorySet.add(key);
    if (m.winner_id) {
      playerMatchCounts.set(m.player1_id, (playerMatchCounts.get(m.player1_id) || 0) + 1);
      playerMatchCounts.set(m.player2_id, (playerMatchCounts.get(m.player2_id) || 0) + 1);
      playerWins.set(m.winner_id, (playerWins.get(m.winner_id) || 0) + 1);
    }
  });

  // Rank players within each tournament: sort by wins desc, then matches played desc
  playerRanks = new Map();
  selectedTournamentIds.forEach(tid => {
    const pids = allInscriptions.filter(i => i.tournament_id === tid).map(i => i.player_id);
    const sorted = [...pids].sort((a, b) => {
      const wDiff = (playerWins.get(b) || 0) - (playerWins.get(a) || 0);
      return wDiff !== 0 ? wDiff : (playerMatchCounts.get(b) || 0) - (playerMatchCounts.get(a) || 0);
    });
    sorted.forEach((pid, idx) => playerRanks.set(`${tid}-${pid}`, idx + 1));
  });
}

// ─── LOAD EXISTING MATCHES ────────────────────────────────────────────────────
async function loadExistingMatches(activePresetsList) {
  const dates = activePresetsList.map(p => p.date);
  if (!dates.length) return;
  const { data } = await supabase
    .from('matches')
    .select('player1_id, player2_id, player3_id, player4_id, match_date, match_time, location')
    .in('match_date', dates);

  (data || []).forEach(m => {
    if (!m.match_time || !m.location) return;
    const courtMatch = m.location.match(/Cancha\s+(\d+)/i);
    if (!courtMatch) return;
    const court = parseInt(courtMatch[1]);
    const locLower = m.location.toLowerCase();
    const matchingPreset = activePresetsList.find(p =>
      p.date === m.match_date && locLower.includes(p.preset.sede)
    );
    if (!matchingPreset) return;
    // Normalize time: Supabase may return "17:00:00", grid uses "17:00"
    const time = m.match_time.substring(0, 5);
    const slotKey = `${m.match_date}|${time}|${court}`;
    if (assignments.has(slotKey)) return; // don't overwrite if already set
    assignments.set(slotKey, {
      p1Id: m.player1_id,
      p2Id: m.player2_id,
      p3Id: m.player3_id || null,
      p4Id: m.player4_id || null,
      locked: true
    });
    if (m.player3_id && m.player4_id) cellModes.set(slotKey, 'dobles');
  });
}

// ─── BUILD AVAILABLE PLAYERS ──────────────────────────────────────────────────
function buildAvailablePlayers(activePresetsList) {
  // Map: playerId → {slots: [{dayAbbr, turn, presetKey, date}]}
  const playerSlots = new Map();

  activePresetsList.forEach(({ key, preset, date }) => {
    const { sede } = preset;
    const dayAbbr  = getDayAbbr(date);

    weekAvailability
      .filter(a => {
        if (a.available_date !== date) return false;
        const z = (a.zone || '').toLowerCase();
        return z === sede || z === 'ambas';
      })
      .forEach(a => {
        if (!playerSlots.has(a.player_id)) playerSlots.set(a.player_id, []);
        // Avoid duplicate badges for same day+turn
        const existing = playerSlots.get(a.player_id);
        const dup = existing.some(s => s.date === date && s.turn === a.time_slot);
        if (!dup) existing.push({ dayAbbr, turn: a.time_slot, presetKey: key, date });
      });
  });

  const inscribedIds = new Set(
    allInscriptions.filter(i => selectedTournamentIds.includes(i.tournament_id)).map(i => i.player_id)
  );

  const result = [];
  playerSlots.forEach((slots, pid) => {
    if (!inscribedIds.has(pid)) return;
    const player = allPlayers.get(pid);
    if (!player) return;
    const { catName, catColor } = getPlayerCat(pid);
    result.push({ id: pid, name: player.name, catName, catColor, slots });
  });

  result.sort((a,b) => a.catName.localeCompare(b.catName) || a.name.localeCompare(b.name));
  return result;
}

// ─── TOURNAMENT CHECKBOXES ────────────────────────────────────────────────────
function renderTournamentCheckboxes() {
  if (!allTournaments.length) { tourCheckList.innerHTML = '<p class="text-gray-400 text-sm p-2">No hay torneos.</p>'; return; }
  tourCheckList.innerHTML = allTournaments.map(t => {
    const dot = t.catColor ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${t.catColor};margin-right:6px;vertical-align:middle;"></span>` : '';
    return `<div class="checkbox-list-item"><label><input type="checkbox" class="tour-checkbox" value="${t.id}" checked>${dot}${t.catName} — ${t.name}</label></div>`;
  }).join('');
  selectedTournamentIds = allTournaments.map(t => t.id);
  updateGenerateButton();
  tourCheckList.addEventListener('change', () => {
    selectedTournamentIds = [...tourCheckList.querySelectorAll('.tour-checkbox:checked')].map(cb => parseInt(cb.value));
    updateGenerateButton();
  });
}

function updateGenerateButton() {
  btnGenerate.disabled = !(activePresets.size > 0 && selectedTournamentIds.length > 0);
}
function updateWeekDisplay() {
  weekDisplay.textContent = formatWeekLabel(currentWeekStart);
}
function updateActiveDateLabel() {
  if (!activePresets.size) { dateLabelEl.textContent = ''; return; }
  const labels = [...activePresets].map(key => {
    const p = PRESETS[key];
    const d = addDays(currentWeekStart, p.dayOffset);
    return formatDayLabel(d);
  });
  dateLabelEl.textContent = `→ ${labels.join(' | ')}`;
}

// ─── CATEGORY FILTERS ─────────────────────────────────────────────────────────
function renderCatFilters() {
  catFilters.innerHTML = '';
  activeCatFilter = null;
  const cats = new Map();
  availablePlayers.forEach(p => { if (!cats.has(p.catName)) cats.set(p.catName, p.catColor); });
  if (cats.size <= 1) return;

  const allChip = document.createElement('button');
  allChip.className = 'cat-filter-chip all-chip active';
  allChip.textContent = 'Todos'; allChip.dataset.cat = '';
  catFilters.appendChild(allChip);

  [...cats.entries()]
    .sort((a, b) => {
      const na = parseInt(a[0]), nb = parseInt(b[0]);
      return (!isNaN(na) && !isNaN(nb)) ? na - nb : a[0].localeCompare(b[0]);
    })
    .forEach(([name, color]) => {
      const chip = document.createElement('button');
      chip.className = 'cat-filter-chip'; chip.textContent = name; chip.dataset.cat = name;
      const bg = color || '#374151';
      chip.style.background = bg; chip.style.color = isColorLight(bg) ? '#111' : '#fff';
      catFilters.appendChild(chip);
    });

  catFilters.addEventListener('click', e => {
    const chip = e.target.closest('.cat-filter-chip');
    if (!chip) return;
    catFilters.querySelectorAll('.cat-filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeCatFilter = chip.dataset.cat || null;
    applyCatFilter();
  });
}

function applyCatFilter() {
  playersList.querySelectorAll('.player-card').forEach(card => {
    const pid = parseInt(card.dataset.id);
    if (isPlayerAssigned(pid)) { card.style.display = 'none'; return; }
    const player = availablePlayers.find(p => p.id === pid);
    card.style.display = (!activeCatFilter || player?.catName === activeCatFilter) ? '' : 'none';
  });
  renderPairSuggestions();
  updateCounter();
}

// ─── RENDER PLAYER PANEL ──────────────────────────────────────────────────────
function renderPlayerPanel() {
  playersList.innerHTML = '';

  if (!availablePlayers.length) {
    playersList.innerHTML = '<p style="color:#6b7280;font-size:0.8rem;text-align:center;padding:16px 8px">No hay jugadores disponibles.</p>';
    updateCounter(); return;
  }

  availablePlayers.forEach(player => {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.dataset.id = player.id;
    card.draggable = true;

    const bg  = player.catColor || '#374151';
    const txt = isColorLight(bg) ? '#111' : '#fff';

    // Build availability badges: group by day+turn, deduplicated
    const badgeMap = new Map(); // "VIE_mañana" → {dayAbbr, turn}
    player.slots.forEach(s => {
      const k = `${s.dayAbbr}_${s.turn}`;
      if (!badgeMap.has(k)) badgeMap.set(k, s);
    });
    const turnBadges = [...badgeMap.values()].map(s => {
      const turnLabel = s.turn === 'mañana' ? 'M' : 'T';
      const cls = s.turn === 'mañana' ? 'mañana' : 'tarde';
      return `<span class="avail-badge ${cls}">${s.dayAbbr} ${turnLabel}</span>`;
    }).join('');

    card.innerHTML = `
      <div class="prow1">
        <span class="cat-dot" style="background:${bg};color:${txt}">${player.catName}</span>
        <span class="pname">${player.name}</span>
      </div>
      <div class="prow2 pbadges">${turnBadges}</div>
    `;

    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragend',   onDragEnd);
    playersList.appendChild(card);
  });

  // Mark players already in locked (pre-existing) matches
  assignments.forEach((asgn) => {
    if (!asgn.locked) return;
    [asgn.p1Id, asgn.p2Id, asgn.p3Id, asgn.p4Id].forEach(pid => { if (pid) hidePlayer(pid); });
  });

  updateCounter();
  renderPairSuggestions();
}

// ─── PAIR SUGGESTIONS ─────────────────────────────────────────────────────────
function generatePairSuggestions() {
  const unassigned = availablePlayers.filter(p => !isPlayerAssigned(p.id));
  const scoredPairs = [];

  for (let i = 0; i < unassigned.length; i++) {
    for (let j = i + 1; j < unassigned.length; j++) {
      const p1 = unassigned[i], p2 = unassigned[j];
      const tid = findCommonTournament(p1.id, p2.id);
      if (!tid) continue;
      const t = allTournaments.find(t => t.id === tid);
      if (activeCatFilter && t?.catName !== activeCatFilter) continue;

      // Must share at least one availability slot (same date + same turn)
      const p1SlotKeys = new Set(p1.slots.map(s => `${s.date}|${s.turn}`));
      if (!p2.slots.some(s => p1SlotKeys.has(`${s.date}|${s.turn}`))) continue;

      const r1 = playerRanks.get(`${tid}-${p1.id}`) || 999;
      const r2 = playerRanks.get(`${tid}-${p2.id}`) || 999;
      const rankDiff       = Math.abs(r1 - r2);
      const combinedMatch  = (playerMatchCounts.get(p1.id) || 0) + (playerMatchCounts.get(p2.id) || 0);
      const isRevancha     = matchHistorySet.has([p1.id, p2.id].sort().join('-'));
      // Lower score = better: prioritize close ranks, fewer matches, avoid revanchas
      const score = rankDiff * 10 + combinedMatch + (isRevancha ? 500 : 0);

      scoredPairs.push({ p1, p2, catName: t?.catName || '', catColor: t?.catColor || '#374151', score });
    }
  }

  scoredPairs.sort((a, b) => a.score - b.score);

  // Greedy: pick best pair, mark both players as used, skip pairs with used players
  const used = new Set();
  const result = [];
  for (const pair of scoredPairs) {
    if (used.has(pair.p1.id) || used.has(pair.p2.id)) continue;
    result.push(pair);
    used.add(pair.p1.id);
    used.add(pair.p2.id);
  }
  return result;
}

function renderPairSuggestions() {
  pairsList.innerHTML = '';
  const pairs = generatePairSuggestions();

  pairs.forEach(({ p1, p2, catName, catColor }) => {
    const card = document.createElement('div');
    card.className = 'pair-card';
    card.dataset.p1 = p1.id;
    card.dataset.p2 = p2.id;
    card.draggable = true;
    const bg = catColor || '#374151';
    const txt = isColorLight(bg) ? '#111' : '#fff';
    card.innerHTML = `
      <span class="cat-dot" style="background:${bg};color:${txt};margin-top:2px">${catName}</span>
      <div class="pair-players">
        <span class="pair-pname">${shortName(p1.name)}</span>
        <span class="pair-vs">vs</span>
        <span class="pair-pname">${shortName(p2.name)}</span>
      </div>
    `;
    card.addEventListener('dragstart', onPairDragStart);
    card.addEventListener('dragend', onPairDragEnd);
    card.addEventListener('click', () => autoAssignPair(p1, p2));
    pairsList.appendChild(card);
  });
}

function autoAssignPair(p1, p2) {
  // Find shared date+turn slots
  const p1Keys = new Set(p1.slots.map(s => `${s.date}|${s.turn}`));
  const shared = p2.slots.filter(s => p1Keys.has(`${s.date}|${s.turn}`));
  if (!shared.length) { showToast('No hay turno en común.', 'error'); return; }

  // Build active preset map: date → {key, preset}
  const presetByDate = new Map();
  for (const key of activePresets) {
    const preset = PRESETS[key];
    const date = formatYMD(addDays(currentWeekStart, preset.dayOffset));
    presetByDate.set(date, { key, preset });
  }

  for (const { date, turn } of shared) {
    const entry = presetByDate.get(date);
    if (!entry) continue;
    const slots = getSlotsForPreset(entry.key);
    const turnSlots = slots.filter(time => {
      const h = parseInt(time.split(':')[0]);
      return turn === 'mañana' ? h < 13 : h >= 13;
    });
    for (const time of turnSlots) {
      for (let c = 1; c <= entry.preset.courts; c++) {
        const slotKey = `${date}|${time}|${c}`;
        const asgn = assignments.get(slotKey);
        if (asgn?.locked) continue;
        if (!asgn || (!asgn.p1Id && !asgn.p2Id)) {
          assignPairToCell(slotKey, p1.id, p2.id);
          // Highlight and scroll to the cell
          const td = gridTbody.querySelector(`td[data-slot-key="${slotKey}"]`);
          if (td) {
            td.classList.add('just-assigned');
            setTimeout(() => td.classList.remove('just-assigned'), 1200);
            td.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }
      }
    }
  }
  showToast('No hay cancha libre en el turno que coinciden.', 'error');
}

function assignPairToCell(slotKey, p1Id, p2Id) {
  if (assignments.get(slotKey)?.locked) return;
  if (!assignments.has(slotKey)) assignments.set(slotKey, { p1Id: null, p2Id: null, p3Id: null, p4Id: null });
  const asgn = assignments.get(slotKey);
  const isDobles = cellModes.get(slotKey) === 'dobles';

  // Remove both players from any other cell first
  [p1Id, p2Id].forEach(pid => {
    assignments.forEach((a, key) => {
      if (key === slotKey) return;
      let changed = false;
      if (a.p1Id === pid) { a.p1Id = null; changed = true; }
      if (a.p2Id === pid) { a.p2Id = null; changed = true; }
      if (a.p3Id === pid) { a.p3Id = null; changed = true; }
      if (a.p4Id === pid) { a.p4Id = null; changed = true; }
      if (changed) {
        if (!a.p1Id && !a.p2Id && !a.p3Id && !a.p4Id) assignments.delete(key);
        refreshCell(key);
      }
    });
  });

  if (isDobles) {
    // Fill team A (p1+p2) first; if both filled, fill team B (p3+p4)
    if (!asgn.p1Id && !asgn.p2Id) {
      // Release old team A if different
      [asgn.p1Id, asgn.p2Id].forEach(old => { if (old && old !== p1Id && old !== p2Id) showPlayer(old); });
      asgn.p1Id = p1Id; asgn.p2Id = p2Id;
    } else {
      // Release old team B if different
      [asgn.p3Id, asgn.p4Id].forEach(old => { if (old && old !== p1Id && old !== p2Id) showPlayer(old); });
      asgn.p3Id = p1Id; asgn.p4Id = p2Id;
    }
  } else {
    // Singles: release previous occupants then fill
    [asgn.p1Id, asgn.p2Id].forEach(old => { if (old && old !== p1Id && old !== p2Id) showPlayer(old); });
    asgn.p1Id = p1Id; asgn.p2Id = p2Id;
  }

  hidePlayer(p1Id);
  hidePlayer(p2Id);
  refreshCell(slotKey);
  renderPairSuggestions();
  updateSaveButton();
  updateCounter();
}

// ─── SCHEDULE EDIT ────────────────────────────────────────────────────────────
function renderScheduleEdit() {
  const section = document.getElementById('schedule-edit-section');
  const container = document.getElementById('schedule-edit-container');
  if (!activePresets.size) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  container.innerHTML = '';

  [...activePresets].forEach(presetKey => {
    const preset = PRESETS[presetKey];
    const slots = getSlotsForPreset(presetKey);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;';

    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:0.75rem;font-weight:700;color:#9ca3af;min-width:140px;flex-shrink:0;';
    lbl.textContent = preset.label;
    row.appendChild(lbl);

    const chipsWrap = document.createElement('div');
    chipsWrap.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;align-items:center;';

    function renderChips() {
      chipsWrap.innerHTML = '';
      const current = getSlotsForPreset(presetKey);
      current.forEach(t => {
        const chip = document.createElement('span');
        chip.className = 'time-chip';
        chip.innerHTML = `${t}<button class="remove-time" title="Quitar">×</button>`;
        chip.querySelector('.remove-time').addEventListener('click', () => {
          const arr = getSlotsForPreset(presetKey).filter(s => s !== t);
          customSlots.set(presetKey, arr);
          renderChips();
        });
        chipsWrap.appendChild(chip);
      });

      // Add input + button
      const inp = document.createElement('input');
      inp.className = 'time-add-input';
      inp.type = 'text';
      inp.placeholder = 'HH:MM';
      inp.maxLength = 5;

      const addBtn = document.createElement('button');
      addBtn.className = 'time-add-btn';
      addBtn.textContent = '+';

      const doAdd = () => {
        const val = inp.value.trim();
        if (!/^\d{2}:\d{2}$/.test(val)) { inp.style.borderColor = '#ef4444'; return; }
        inp.style.borderColor = '';
        const arr = [...getSlotsForPreset(presetKey)];
        if (!arr.includes(val)) {
          arr.push(val);
          arr.sort();
          customSlots.set(presetKey, arr);
        }
        inp.value = '';
        renderChips();
      };
      addBtn.addEventListener('click', doAdd);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });

      chipsWrap.appendChild(inp);
      chipsWrap.appendChild(addBtn);
    }

    renderChips();
    row.appendChild(chipsWrap);
    container.appendChild(row);
  });
}

// ─── RENDER GRID ──────────────────────────────────────────────────────────────
function renderGrid(activePresetsList) {
  // Sort by date
  const sorted = [...activePresetsList].sort((a, b) => a.date.localeCompare(b.date));
  const maxCourts = Math.max(...sorted.map(p => p.preset.courts));

  gridThead.innerHTML = `
    <tr>
      <th style="min-width:65px">Horario</th>
      ${Array.from({length: maxCourts}, (_,i) => `<th>Cancha ${i+1}</th>`).join('')}
    </tr>`;

  gridTbody.innerHTML = '';

  sorted.forEach(({ key, preset, date }) => {
    // Day separator
    const sepRow = document.createElement('tr');
    sepRow.innerHTML = `
      <td colspan="${maxCourts + 1}" style="
        background:#facc15; color:#111; font-weight:900; font-size:0.75rem;
        padding:5px 10px; text-transform:uppercase; letter-spacing:1px;
      ">${preset.label} — ${formatDayLabel(addDays(currentWeekStart, preset.dayOffset))}</td>`;
    gridTbody.appendChild(sepRow);

    getSlotsForPreset(key).forEach(time => {
      const tr = document.createElement('tr');

      const timeTd = document.createElement('td');
      timeTd.className = 'time-col';
      timeTd.textContent = time;
      tr.appendChild(timeTd);

      for (let c = 1; c <= maxCourts; c++) {
        const td = document.createElement('td');
        if (c > preset.courts) {
          // This day doesn't have this court — gray cell
          td.style.cssText = 'background:#111;';
          tr.appendChild(td);
          continue;
        }
        const slotKey = `${date}|${time}|${c}`;
        td.className = 'grid-cell';
        td.dataset.slotKey = slotKey;
        td.innerHTML = buildCellHTML(slotKey);
        updateCellClass(td, slotKey);
        setupCellListeners(td, slotKey);
        tr.appendChild(td);
      }
      gridTbody.appendChild(tr);
    });
  });
}

function buildCellHTML(slotKey) {
  const asgn = assignments.get(slotKey) || { p1Id: null, p2Id: null, p3Id: null, p4Id: null };
  const isDobles = cellModes.get(slotKey) === 'dobles';
  const locked = !!asgn.locked;
  const modeToggle = locked
    ? `<span class="lock-icon" title="Partido ya guardado"><span class="material-icons" style="font-size:12px;color:#6b7280">lock</span></span>`
    : `<button class="mode-toggle" data-slot-key="${slotKey}">${isDobles ? 'Dobles → Singles' : 'Singles → Dobles'}</button>`;

  if (!isDobles) {
    const s1 = asgn.p1Id ? buildSlotFilled(slotKey, 1, asgn.p1Id, locked) : buildSlotEmpty(slotKey, 1);
    const s2 = asgn.p2Id ? buildSlotFilled(slotKey, 2, asgn.p2Id, locked) : buildSlotEmpty(slotKey, 2);
    let catBadge = '';
    if (asgn.p1Id && asgn.p2Id) {
      const tid = findCommonTournament(asgn.p1Id, asgn.p2Id);
      if (tid) {
        const t = allTournaments.find(t => t.id === tid);
        if (t) {
          const bg = t.catColor || '#374151';
          const tc = isColorLight(bg) ? '#111' : '#fff';
          catBadge = `<div style="text-align:center;margin-top:3px"><span style="font-size:0.6rem;font-weight:900;padding:1px 6px;border-radius:3px;background:${bg};color:${tc}">${t.catName}</span></div>`;
        }
      } else {
        catBadge = `<div style="text-align:center;margin-top:3px"><span style="font-size:0.6rem;color:#ef4444;font-weight:700">⚠ Cat. diferente</span></div>`;
      }
    }
    return `<div class="cell-inner${locked ? ' locked-cell' : ''}">${modeToggle}${s1}<div class="cell-divider"></div>${s2}${catBadge}</div>`;
  } else {
    const s1 = asgn.p1Id ? buildSlotFilled(slotKey, 1, asgn.p1Id, locked) : buildSlotEmpty(slotKey, 1);
    const s2 = asgn.p2Id ? buildSlotFilled(slotKey, 2, asgn.p2Id, locked) : buildSlotEmpty(slotKey, 2);
    const s3 = asgn.p3Id ? buildSlotFilled(slotKey, 3, asgn.p3Id, locked) : buildSlotEmpty(slotKey, 3);
    const s4 = asgn.p4Id ? buildSlotFilled(slotKey, 4, asgn.p4Id, locked) : buildSlotEmpty(slotKey, 4);
    let catBadge = '';
    if (asgn.p1Id && asgn.p2Id && asgn.p3Id && asgn.p4Id) {
      const tid = findCommonTournament(asgn.p1Id, asgn.p2Id, asgn.p3Id, asgn.p4Id);
      if (tid) {
        const t = allTournaments.find(t => t.id === tid);
        if (t) {
          const bg = t.catColor || '#374151';
          const tc = isColorLight(bg) ? '#111' : '#fff';
          catBadge = `<div style="text-align:center;margin-top:3px"><span style="font-size:0.6rem;font-weight:900;padding:1px 6px;border-radius:3px;background:${bg};color:${tc}">${t.catName}</span></div>`;
        }
      } else {
        catBadge = `<div style="text-align:center;margin-top:3px"><span style="font-size:0.6rem;color:#ef4444;font-weight:700">⚠ Cat. diferente</span></div>`;
      }
    }
    return `<div class="cell-inner${locked ? ' locked-cell' : ''}">${modeToggle}<div class="team-label">Equipo A</div>${s1}${s2}<div class="cell-divider"></div><div class="team-label">Equipo B</div>${s3}${s4}${catBadge}</div>`;
  }
}

function buildSlotEmpty(slotKey, pos) {
  return `<div class="cell-slot empty" data-slot-key="${slotKey}" data-pos="${pos}"><span class="slot-hint">Jugador ${pos}</span></div>`;
}
function buildSlotFilled(slotKey, pos, playerId, locked = false) {
  const player = availablePlayers.find(p => p.id === playerId) || allPlayers.get(playerId);
  const name = player ? shortName(player.name) : `#${playerId}`;
  if (locked) {
    return `<div class="cell-slot filled locked" data-slot-key="${slotKey}" data-pos="${pos}"><span class="slot-name">${name}</span></div>`;
  }
  return `
    <div class="cell-slot filled" data-slot-key="${slotKey}" data-pos="${pos}">
      <span class="slot-name">${name}</span>
      <button class="slot-remove" data-slot-key="${slotKey}" data-pos="${pos}" title="Quitar">
        <span class="material-icons" style="font-size:13px">close</span>
      </button>
    </div>`;
}
function updateCellClass(td, slotKey) {
  const asgn = assignments.get(slotKey);
  td.className = 'grid-cell';
  if (!asgn) return;
  if (asgn.locked) { td.classList.add('locked'); return; }
  if (asgn.p1Id || asgn.p2Id || asgn.p3Id || asgn.p4Id) td.classList.add('has-player');
  if (isComplete(slotKey)) td.classList.add('complete');
}
function setupCellListeners(td, slotKey) {
  if (assignments.get(slotKey)?.locked) return; // locked — no interaction
  td.querySelectorAll('.cell-slot').forEach(slot => {
    slot.addEventListener('dragover',  onSlotDragOver);
    slot.addEventListener('dragleave', onSlotDragLeave);
    slot.addEventListener('drop',      onSlotDrop);
  });
  td.querySelectorAll('.slot-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      removeFromSlot(e.currentTarget.dataset.slotKey, parseInt(e.currentTarget.dataset.pos));
    });
  });
  const modeBtn = td.querySelector('.mode-toggle');
  if (modeBtn) {
    modeBtn.addEventListener('click', e => {
      e.stopPropagation();
      const key = modeBtn.dataset.slotKey;
      const current = cellModes.get(key) || 'singles';
      cellModes.set(key, current === 'singles' ? 'dobles' : 'singles');
      // Release all players in this cell
      const asgn = assignments.get(key);
      if (asgn) {
        [asgn.p1Id, asgn.p2Id, asgn.p3Id, asgn.p4Id].forEach(pid => { if (pid) showPlayer(pid); });
        assignments.delete(key);
      }
      refreshCell(key);
      renderPairSuggestions();
      updateSaveButton();
      updateCounter();
    });
  }
}
function refreshCell(slotKey) {
  const td = gridTbody.querySelector(`td[data-slot-key="${slotKey}"]`);
  if (!td) return;
  td.innerHTML = buildCellHTML(slotKey);
  updateCellClass(td, slotKey);
  setupCellListeners(td, slotKey);
}

// ─── DRAG & DROP ──────────────────────────────────────────────────────────────
function onDragStart(e) {
  draggedPlayerId = parseInt(e.currentTarget.dataset.id);
  draggedPair = null;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}
function onDragEnd(e) { e.currentTarget.classList.remove('dragging'); }
function onPairDragStart(e) {
  draggedPair = { p1Id: parseInt(e.currentTarget.dataset.p1), p2Id: parseInt(e.currentTarget.dataset.p2) };
  draggedPlayerId = null;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}
function onPairDragEnd(e) { e.currentTarget.classList.remove('dragging'); }
function onSlotDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function onSlotDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function onSlotDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (draggedPair) {
    assignPairToCell(e.currentTarget.dataset.slotKey, draggedPair.p1Id, draggedPair.p2Id);
    draggedPair = null;
  } else if (draggedPlayerId) {
    assignToSlot(e.currentTarget.dataset.slotKey, parseInt(e.currentTarget.dataset.pos), draggedPlayerId);
    draggedPlayerId = null;
  }
}

function assignToSlot(slotKey, pos, playerId) {
  if (assignments.get(slotKey)?.locked) return;
  if (!assignments.has(slotKey)) assignments.set(slotKey, { p1Id: null, p2Id: null, p3Id: null, p4Id: null });
  const asgn = assignments.get(slotKey);

  // Return previous occupant of this slot to panel
  const oldId = pos === 1 ? asgn.p1Id : pos === 2 ? asgn.p2Id : pos === 3 ? asgn.p3Id : asgn.p4Id;
  if (oldId) showPlayer(oldId);

  // If player is in other slot of SAME cell, clear it
  if (asgn.p1Id === playerId) asgn.p1Id = null;
  if (asgn.p2Id === playerId) asgn.p2Id = null;
  if (asgn.p3Id === playerId) asgn.p3Id = null;
  if (asgn.p4Id === playerId) asgn.p4Id = null;

  // If player is in another cell, remove them from there
  assignments.forEach((a, key) => {
    if (key === slotKey) return;
    let changed = false;
    if (a.p1Id === playerId) { a.p1Id = null; changed = true; }
    if (a.p2Id === playerId) { a.p2Id = null; changed = true; }
    if (a.p3Id === playerId) { a.p3Id = null; changed = true; }
    if (a.p4Id === playerId) { a.p4Id = null; changed = true; }
    if (changed) {
      if (!a.p1Id && !a.p2Id && !a.p3Id && !a.p4Id) assignments.delete(key);
      refreshCell(key);
    }
  });

  // Assign
  if (pos === 1)      asgn.p1Id = playerId;
  else if (pos === 2) asgn.p2Id = playerId;
  else if (pos === 3) asgn.p3Id = playerId;
  else                asgn.p4Id = playerId;

  // Hide from panel immediately
  hidePlayer(playerId);
  refreshCell(slotKey);
  updateSaveButton();
  updateCounter();
}

function removeFromSlot(slotKey, pos) {
  const asgn = assignments.get(slotKey);
  if (!asgn) return;
  const pid = pos === 1 ? asgn.p1Id : pos === 2 ? asgn.p2Id : pos === 3 ? asgn.p3Id : asgn.p4Id;
  if (pos === 1)      asgn.p1Id = null;
  else if (pos === 2) asgn.p2Id = null;
  else if (pos === 3) asgn.p3Id = null;
  else                asgn.p4Id = null;
  if (!asgn.p1Id && !asgn.p2Id && !asgn.p3Id && !asgn.p4Id) assignments.delete(slotKey);
  if (pid) showPlayer(pid);
  refreshCell(slotKey);
  renderPairSuggestions();
  updateSaveButton();
  updateCounter();
}

function getAssignmentLabel(pid) {
  for (const [slotKey, asgn] of assignments) {
    if (asgn.p1Id !== pid && asgn.p2Id !== pid && asgn.p3Id !== pid && asgn.p4Id !== pid) continue;
    const [date, time] = slotKey.split('|');
    let dayAbbr = '';
    for (const key of activePresets) {
      const p = PRESETS[key];
      if (formatYMD(addDays(currentWeekStart, p.dayOffset)) === date) {
        if (p.dayOffset === 4) dayAbbr = 'Vie';
        else if (p.dayOffset === 5) dayAbbr = 'Sáb';
        else if (p.dayOffset === 6) dayAbbr = 'Dom';
        break;
      }
    }
    const turno = parseInt(time.split(':')[0]) < 13 ? 'M' : 'T';
    return `${dayAbbr} ${turno}`.trim();
  }
  return null;
}
function hidePlayer(pid) {
  const card = playersList.querySelector(`.player-card[data-id="${pid}"]`);
  if (!card) return;
  const label = getAssignmentLabel(pid);
  card.setAttribute('draggable', 'false');
  card.classList.add('already-playing');
  let badge = card.querySelector('.playing-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'playing-badge';
    card.querySelector('.pbadges')?.appendChild(badge);
  }
  badge.textContent = label ? `Ya juega ${label}` : 'Ya juega';
}
function showPlayer(pid) {
  const card = playersList.querySelector(`.player-card[data-id="${pid}"]`);
  if (!card) return;
  const player = availablePlayers.find(p => p.id === pid);
  const ok = !activeCatFilter || player?.catName === activeCatFilter;
  card.style.display = ok ? '' : 'none';
  card.setAttribute('draggable', 'true');
  card.classList.remove('already-playing');
  card.querySelector('.playing-badge')?.remove();
}

// ─── SAVE ─────────────────────────────────────────────────────────────────────
async function saveAssignments() {
  const matchesToInsert = [];
  const errors = [];

  assignments.forEach((asgn, slotKey) => {
    if (asgn.locked) return; // already saved
    if (!isComplete(slotKey)) return;
    const [date, time, courtStr] = slotKey.split('|');
    const court = parseInt(courtStr);
    const isDobles = cellModes.get(slotKey) === 'dobles';

    // Find which preset this date belongs to
    let sedeLabel = 'Funes';
    for (const key of activePresets) {
      const p = PRESETS[key];
      const d = formatYMD(addDays(currentWeekStart, p.dayOffset));
      if (d === date) { sedeLabel = p.sede.charAt(0).toUpperCase() + p.sede.slice(1); break; }
    }

    const tournamentId = isDobles
      ? findCommonTournament(asgn.p1Id, asgn.p2Id, asgn.p3Id, asgn.p4Id)
      : findCommonTournament(asgn.p1Id, asgn.p2Id);
    if (!tournamentId) {
      const p1 = availablePlayers.find(p => p.id === asgn.p1Id);
      const p2 = availablePlayers.find(p => p.id === asgn.p2Id);
      errors.push(`${p1?.name || asgn.p1Id} vs ${p2?.name || asgn.p2Id}`);
      return;
    }
    const tournament = allTournaments.find(t => t.id === tournamentId);
    const record = {
      player1_id: asgn.p1Id, player2_id: asgn.p2Id,
      tournament_id: tournamentId,
      category_id: tournament?.category_id ?? null,
      match_date: date, match_time: time,
      location: `${sedeLabel} - Cancha ${court}`,
    };
    if (isDobles) { record.player3_id = asgn.p3Id; record.player4_id = asgn.p4Id; }
    matchesToInsert.push(record);
  });

  if (errors.length) showToast(`Sin categoría común: ${errors.join(', ')}`, 'error');
  if (!matchesToInsert.length) { showToast('No hay partidos completos para guardar.', 'error'); return; }

  btnSave.disabled = true;
  btnSave.innerHTML = `<div class="spinner inline-block"></div> Guardando...`;

  const { error } = await supabase.from('matches').insert(matchesToInsert);
  if (error) { showToast(`Error: ${error.message}`, 'error'); updateSaveButton(); return; }

  showToast(`✓ ${matchesToInsert.length} partidos programados.`, 'success');
  setTimeout(() => { window.location.href = '/src/admin/matches.html'; }, 1500);
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function updateSaveButton() {
  let n = 0;
  assignments.forEach((a, key) => { if (!a.locked && isComplete(key)) n++; });
  saveCountEl.textContent = n;
  btnSave.disabled = n === 0;
}
function updateCounter() {
  const total    = availablePlayers.length;
  const assigned = [...playersList.querySelectorAll('.player-card')].filter(c => c.style.display === 'none').length;
  sugCounter.textContent = `${total - assigned} disponibles`;
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────
function setupEventListeners() {
  document.getElementById('btn-prev-week').addEventListener('click', () => {
    currentWeekStart = addDays(currentWeekStart, -7); updateWeekDisplay(); updateActiveDateLabel();
  });
  document.getElementById('btn-next-week').addEventListener('click', () => {
    currentWeekStart = addDays(currentWeekStart, 7); updateWeekDisplay(); updateActiveDateLabel();
  });
  document.getElementById('btn-today').addEventListener('click', () => {
    currentWeekStart = getStartOfWeek(new Date()); updateWeekDisplay(); updateActiveDateLabel();
  });

  // Multi-select preset toggle
  presetButtonsContainer.addEventListener('click', e => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    const key = btn.dataset.preset;
    if (activePresets.has(key)) {
      activePresets.delete(key);
      btn.classList.remove('active');
    } else {
      activePresets.add(key);
      btn.classList.add('active');
    }
    updateActiveDateLabel();
    updateGenerateButton();
    renderScheduleEdit();
  });

  btnSelectAll.addEventListener('click', () => {
    const cbs = tourCheckList.querySelectorAll('.tour-checkbox');
    const allChecked = [...cbs].every(cb => cb.checked);
    cbs.forEach(cb => { cb.checked = !allChecked; });
    selectedTournamentIds = [...tourCheckList.querySelectorAll('.tour-checkbox:checked')].map(cb => parseInt(cb.value));
    updateGenerateButton();
  });

  btnGenerate.addEventListener('click', async () => {
    if (!activePresets.size || !selectedTournamentIds.length) return;
    btnGenerate.disabled = true;
    btnGenerate.innerHTML = `<div class="spinner inline-block"></div> Cargando...`;

    await Promise.all([loadWeekData(), loadMatchmakingData()]);
    assignments.clear();
    cellModes = new Map();

    // Build list of active presets with their dates
    const activePresetsList = [...activePresets].map(key => ({
      key, preset: PRESETS[key],
      date: formatYMD(addDays(currentWeekStart, PRESETS[key].dayOffset))
    }));

    await loadExistingMatches(activePresetsList);
    availablePlayers = buildAvailablePlayers(activePresetsList);

    configPanel.classList.add('hidden');
    tableroContainer.classList.remove('hidden');

    const labels = activePresetsList
      .sort((a,b) => a.date.localeCompare(b.date))
      .map(p => p.preset.label).join(' + ');
    tableroTitle.textContent = labels;

    renderCatFilters();
    renderPlayerPanel();
    renderGrid(activePresetsList);
    updateSaveButton();

    btnGenerate.disabled = false;
    btnGenerate.innerHTML = `<span class="material-icons">grid_view</span> Generar Tablero`;
  });

  btnBack.addEventListener('click', () => {
    tableroContainer.classList.add('hidden');
    configPanel.classList.remove('hidden');
    assignments.clear();
    cellModes = new Map();
    activePresets.clear();
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    updateGenerateButton();
    renderScheduleEdit();
  });

  btnSave.addEventListener('click', saveAssignments);
}
