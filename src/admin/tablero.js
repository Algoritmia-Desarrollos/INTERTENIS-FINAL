import { renderHeader } from '../common/header.js';
import { requireRole } from '../common/router.js';
import { supabase, showToast } from '../common/supabase.js';

requireRole('admin');

// ─── PLANTILLAS ──────────────────────────────────────────────────────────────
const PRESETS = {
  'funes-viernes':  { sede: 'funes',  label: 'FUNES — Viernes',  dayOffset: 4, courts: 4, slots: ['17:00','17:30','19:00','19:30','21:00'] },
  'funes-sabado':   { sede: 'funes',  label: 'FUNES — Sábado',   dayOffset: 5, courts: 4, slots: ['08:00','08:30','10:15','10:30','11:45','13:15','15:00','17:00'] },
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

// assignments: "date|time|court" → {p1Id: null|number, p2Id: null|number}
let assignments = new Map();

let draggedPlayerId = null;

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
function findCommonTournament(p1Id, p2Id) {
  const p1T = new Set(
    allInscriptions
      .filter(i => i.player_id === p1Id && selectedTournamentIds.includes(i.tournament_id))
      .map(i => i.tournament_id)
  );
  for (const ins of allInscriptions) {
    if (ins.player_id === p2Id && p1T.has(ins.tournament_id) && selectedTournamentIds.includes(ins.tournament_id))
      return ins.tournament_id;
  }
  return null;
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
    if (asgn.p1Id === pid || asgn.p2Id === pid) return true;
  }
  return false;
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
      <span class="cat-dot" style="background:${bg};color:${txt}">${player.catName}</span>
      <span class="pname">${player.name}</span>
      <span class="pbadges">${turnBadges}</span>
    `;

    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragend',   onDragEnd);
    playersList.appendChild(card);
  });

  updateCounter();
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

  sorted.forEach(({ preset, date }) => {
    // Day separator
    const sepRow = document.createElement('tr');
    sepRow.innerHTML = `
      <td colspan="${maxCourts + 1}" style="
        background:#facc15; color:#111; font-weight:900; font-size:0.75rem;
        padding:5px 10px; text-transform:uppercase; letter-spacing:1px;
      ">${preset.label} — ${formatDayLabel(addDays(currentWeekStart, preset.dayOffset))}</td>`;
    gridTbody.appendChild(sepRow);

    preset.slots.forEach(time => {
      const tr = document.createElement('tr');

      const timeTd = document.createElement('td');
      timeTd.className = 'time-col';
      timeTd.textContent = time;
      tr.appendChild(timeTd);

      for (let c = 1; c <= maxCourts; c++) {
        const td = document.createElement('td');
        if (c > preset.courts) {
          // This day doesn't have this court — gray cell
          td.style.cssText = 'background:#111;min-width:140px;';
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
  const asgn = assignments.get(slotKey) || { p1Id: null, p2Id: null };
  const s1 = asgn.p1Id ? buildSlotFilled(slotKey, 1, asgn.p1Id) : buildSlotEmpty(slotKey, 1);
  const s2 = asgn.p2Id ? buildSlotFilled(slotKey, 2, asgn.p2Id) : buildSlotEmpty(slotKey, 2);

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
  return `<div class="cell-inner">${s1}<div class="cell-divider"></div>${s2}${catBadge}</div>`;
}

function buildSlotEmpty(slotKey, pos) {
  return `<div class="cell-slot empty" data-slot-key="${slotKey}" data-pos="${pos}"><span class="slot-hint">Jugador ${pos}</span></div>`;
}
function buildSlotFilled(slotKey, pos, playerId) {
  const player = availablePlayers.find(p => p.id === playerId);
  const name = player ? shortName(player.name) : `#${playerId}`;
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
  if (asgn.p1Id || asgn.p2Id) td.classList.add('has-player');
  if (asgn.p1Id && asgn.p2Id) td.classList.add('complete');
}
function setupCellListeners(td, slotKey) {
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
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}
function onDragEnd(e) { e.currentTarget.classList.remove('dragging'); }
function onSlotDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function onSlotDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function onSlotDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!draggedPlayerId) return;
  assignToSlot(e.currentTarget.dataset.slotKey, parseInt(e.currentTarget.dataset.pos), draggedPlayerId);
  draggedPlayerId = null;
}

function assignToSlot(slotKey, pos, playerId) {
  if (!assignments.has(slotKey)) assignments.set(slotKey, { p1Id: null, p2Id: null });
  const asgn = assignments.get(slotKey);

  // Return previous occupant of this slot to panel
  const oldId = pos === 1 ? asgn.p1Id : asgn.p2Id;
  if (oldId) showPlayer(oldId);

  // If player is in other slot of SAME cell, clear it
  if (asgn.p1Id === playerId) asgn.p1Id = null;
  if (asgn.p2Id === playerId) asgn.p2Id = null;

  // If player is in another cell, remove them from there
  assignments.forEach((a, key) => {
    if (key === slotKey) return;
    let changed = false;
    if (a.p1Id === playerId) { a.p1Id = null; changed = true; }
    if (a.p2Id === playerId) { a.p2Id = null; changed = true; }
    if (changed) {
      if (!a.p1Id && !a.p2Id) assignments.delete(key);
      refreshCell(key);
    }
  });

  // Assign
  if (pos === 1) asgn.p1Id = playerId;
  else           asgn.p2Id = playerId;

  // Hide from panel immediately
  hidePlayer(playerId);
  refreshCell(slotKey);
  updateSaveButton();
  updateCounter();
}

function removeFromSlot(slotKey, pos) {
  const asgn = assignments.get(slotKey);
  if (!asgn) return;
  const pid = pos === 1 ? asgn.p1Id : asgn.p2Id;
  if (pos === 1) asgn.p1Id = null; else asgn.p2Id = null;
  if (!asgn.p1Id && !asgn.p2Id) assignments.delete(slotKey);
  if (pid) showPlayer(pid);
  refreshCell(slotKey);
  updateSaveButton();
  updateCounter();
}

function getAssignmentLabel(pid) {
  for (const [slotKey, asgn] of assignments) {
    if (asgn.p1Id !== pid && asgn.p2Id !== pid) continue;
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
    if (!asgn.p1Id || !asgn.p2Id) return;
    const [date, time, courtStr] = slotKey.split('|');
    const court = parseInt(courtStr);

    // Find which preset this date belongs to
    let sedeLabel = 'Funes';
    for (const key of activePresets) {
      const p = PRESETS[key];
      const d = formatYMD(addDays(currentWeekStart, p.dayOffset));
      if (d === date) { sedeLabel = p.sede.charAt(0).toUpperCase() + p.sede.slice(1); break; }
    }

    const tournamentId = findCommonTournament(asgn.p1Id, asgn.p2Id);
    if (!tournamentId) {
      const p1 = availablePlayers.find(p => p.id === asgn.p1Id);
      const p2 = availablePlayers.find(p => p.id === asgn.p2Id);
      errors.push(`${p1?.name || asgn.p1Id} vs ${p2?.name || asgn.p2Id}`);
      return;
    }
    matchesToInsert.push({
      player1_id: asgn.p1Id, player2_id: asgn.p2Id,
      tournament_id: tournamentId, match_date: date, match_time: time,
      location: `${sedeLabel} - Cancha ${court}`,
    });
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
  assignments.forEach(a => { if (a.p1Id && a.p2Id) n++; });
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

    await loadWeekData();
    assignments.clear();

    // Build list of active presets with their dates
    const activePresetsList = [...activePresets].map(key => ({
      key, preset: PRESETS[key],
      date: formatYMD(addDays(currentWeekStart, PRESETS[key].dayOffset))
    }));

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
    activePresets.clear();
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    updateGenerateButton();
  });

  btnSave.addEventListener('click', saveAssignments);
}
