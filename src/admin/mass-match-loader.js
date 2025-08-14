import { supabase } from '../common/supabase.js';

export function setupMassMatchLoader({
  container,
  btnAddRow,
  btnSave,
  allTournaments,
  allPlayers,
  tournamentPlayersMap,
  loadInitialData
}) {

  // --- ESTADO CENTRAL ---
  let matchesData = [];
  let uniqueIdCounter = 0;

  // --- OPCIONES CACHEADAS ---
  const tournamentOptionsHTML = `<option value="">Seleccionar</option>` + allTournaments.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  const sedeOptionsHTML = ['Funes', 'Centro'].map(s => `<option value="${s}">${s}</option>`).join('');
  const canchaOptionsHTML = [1, 2, 3, 4, 5, 6].map(n => `<option value="Cancha ${n}">Cancha ${n}</option>`).join('');

  const tableContainer = document.createElement('div');
  tableContainer.className = 'overflow-x-auto';
  container.innerHTML = ''; // Limpiar el contenedor para evitar duplicados
  container.appendChild(tableContainer);

  // --- RENDERIZADO Y ACTUALIZACIÓN DEL DOM ---

  function renderTable() {
    tableContainer.innerHTML = `
      <table class="w-full border-collapse text-sm table-fixed" id="mass-matches-table" style="table-layout:fixed;">
        <colgroup>
          <col style="width: 16%">
          <col style="width: 14%">
          <col style="width: 14%">
          <col style="width: 12%">
          <col style="width: 10%">
          <col style="width: 10%">
          <col style="width: 10%">
          <col style="width: 14%">
        </colgroup>
        <thead class="bg-gray-100">
          <tr>
            <th class="p-2 border text-left">Torneo</th>
            <th class="p-2 border text-left">Jugador 1</th>
            <th class="p-2 border text-left">Jugador 2</th>
            <th class="p-2 border text-left">Fecha</th>
            <th class="p-2 border text-left">Hora</th>
            <th class="p-2 border text-left">Sede</th>
            <th class="p-2 border text-left">Cancha</th>
            <th class="p-2 border text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${matchesData.map(renderRow).join('')}
        </tbody>
      </table>
    `;
    updateSaveButton();
  }

  function renderRow(match) {
    const tournamentName = allTournaments.find(t => t.id == match.tournament_id)?.name || '---';
    const player1Name = allPlayers.find(p => p.id == match.player1_id)?.name || '---';
    const player2Name = allPlayers.find(p => p.id == match.player2_id)?.name || '---';
    
    return `
      <tr data-row-id="${match.clientId}">
        <td class="p-2 border relative" data-field="tournament_id" style="overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${tournamentName}</td>
        <td class="p-2 border relative" data-field="player1_id" style="overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${player1Name}</td>
        <td class="p-2 border relative" data-field="player2_id" style="overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${player2Name}</td>
        <td class="p-2 border relative" data-field="match_date" style="overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${match.match_date || '---'}</td>
        <td class="p-2 border relative" data-field="match_time" style="overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${match.match_time || '---'}</td>
        <td class="p-2 border relative" data-field="sede" style="overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${match.sede || '---'}</td>
        <td class="p-2 border relative" data-field="cancha" style="overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${match.cancha || '---'}</td>
        <td class="p-2 border text-center" style="overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">
          <button class="action-btn" data-action="duplicate" title="Duplicar Fila">📋</button>
          <button class="action-btn" data-action="delete" title="Eliminar Fila">🗑️</button>
        </td>
      </tr>
    `;
  }

  // --- LÓGICA DE EDICIÓN INLINE ---
  function makeCellEditable(cell) {
    if (cell.classList.contains('is-editing')) return;
    cell.classList.add('is-editing');

    const field = cell.dataset.field;
    const rowId = cell.parentElement.dataset.rowId;
    const match = matchesData.find(m => m.clientId == rowId);
    if (!match) return;

    const originalContent = cell.innerHTML;
    cell.innerHTML = ''; 

    let inputElement;

  switch (field) {
    case 'tournament_id':
      inputElement = document.createElement('select');
      inputElement.innerHTML = tournamentOptionsHTML;
      inputElement.value = match.tournament_id || '';
      break;
    case 'player1_id':
    case 'player2_id':
      const playerIds = tournamentPlayersMap.get(Number(match.tournament_id)) || new Set();
      const players = allPlayers.filter(p => playerIds.has(p.id));
      const playerOptions = '<option value="">Seleccionar</option>' + players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
      inputElement = document.createElement('select');
      inputElement.innerHTML = playerOptions;
      inputElement.value = match[field] || '';
      break;
    case 'match_date':
      inputElement = document.createElement('input');
      inputElement.type = 'text';
      inputElement.value = match.match_date || '';
      setTimeout(() => {
        function openCalendar() {
          const fp = flatpickr(inputElement, {
            dateFormat: 'd/m/Y', allowInput: true,
            defaultDate: match.match_date || 'today',
            onClose: () => inputElement.blur()
          });
          inputElement.focus();
          fp.open();
        }
        if (window.flatpickr) {
          openCalendar();
        } else {
          // Cargar flatpickr dinámicamente si no está presente
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
          document.head.appendChild(link);
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/flatpickr';
          script.onload = openCalendar;
          document.body.appendChild(script);
        }
      }, 1);
      break;
    case 'match_time':
      inputElement = document.createElement('input');
      inputElement.type = 'text';
      inputElement.value = match.match_time || '';
      setTimeout(() => {
        function openTimePicker() {
          const fp = flatpickr(inputElement, {
            enableTime: true,
            noCalendar: true,
            dateFormat: 'H:i',
            time_24hr: true,
            allowInput: true,
            defaultDate: match.match_time || '',
            minuteIncrement: 1,
            clickOpens: true,
            // keepOpen: true, // flatpickr no soporta keepOpen, pero no cerrar hasta blur
            onReady: function(selectedDates, dateStr, instance) {
              setTimeout(() => {
                if (instance && instance.calendarContainer) {
                  instance.open();
                }
              }, 0);
            },
            onClose: () => inputElement.blur()
          });
          inputElement.focus();
          fp.open();
        }
        if (window.flatpickr) {
          openTimePicker();
        } else {
          // Cargar flatpickr dinámicamente si no está presente
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
          document.head.appendChild(link);
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/flatpickr';
          script.onload = openTimePicker;
          document.body.appendChild(script);
        }
      }, 1);
      break;
        case 'sede':
            inputElement = document.createElement('select');
            inputElement.innerHTML = sedeOptionsHTML;
            inputElement.value = match.sede || 'Funes';
            break;
        case 'cancha':
            inputElement = document.createElement('select');
            inputElement.innerHTML = canchaOptionsHTML;
            inputElement.value = match.cancha || 'Cancha 1';
            break;
        default:
            cell.innerHTML = originalContent;
            cell.classList.remove('is-editing');
            return;
    }

    inputElement.className = 'editing-input';
    // Forzar color de texto negro y ancho 100% en selects, y evitar que crezcan
    if (inputElement.tagName === 'SELECT') {
      inputElement.style.color = '#111';
      inputElement.style.background = '#fff';
      inputElement.style.width = '100%';
      inputElement.style.maxWidth = '100%';
      inputElement.style.boxSizing = 'border-box';
      // Abrir el selector automáticamente (showPicker para navegadores modernos)
      setTimeout(() => {
        if (typeof inputElement.showPicker === 'function') {
          inputElement.showPicker();
        } else {
          inputElement.focus();
          inputElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        }
      }, 0);
    }
    cell.appendChild(inputElement);
    inputElement.focus();
    
    const saveChange = () => {
        const newValue = inputElement.value;
        const matchIndex = matchesData.findIndex(m => m.clientId == rowId);
        if (matchIndex > -1) {
            matchesData[matchIndex][field] = newValue;
            if (field === 'tournament_id') {
                matchesData[matchIndex].player1_id = null;
                matchesData[matchIndex].player2_id = null;
                renderTable(); // Re-renderizar es necesario para actualizar opciones de jugadores
            } else {
                let displayValue = newValue;
                if (inputElement.tagName === 'SELECT') {
                    const selectedOption = inputElement.options[inputElement.selectedIndex];
                    displayValue = selectedOption ? selectedOption.text : '---';
                }
                cell.innerHTML = displayValue || '---';
            }
        }
        cell.classList.remove('is-editing');
    };

    inputElement.addEventListener('blur', saveChange, { once: true });
    inputElement.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault(); inputElement.blur();
        } else if (e.key === 'Escape') {
            cell.innerHTML = originalContent;
            cell.classList.remove('is-editing');
        }
    });
  }

  // --- OPERACIONES DE FILA ---
  function addRow() {
    uniqueIdCounter++;
    matchesData.push({
      clientId: `new_${Date.now()}_${uniqueIdCounter}`,
      tournament_id: null, player1_id: null, player2_id: null,
      match_date: null, match_time: null,
      sede: 'Funes', cancha: 'Cancha 1',
    });
    renderTable();
  }

  function duplicateRow(rowId) {
    const originalMatch = matchesData.find(m => m.clientId == rowId);
    if (!originalMatch) return;
    uniqueIdCounter++;
    const newMatch = { ...originalMatch, clientId: `new_${Date.now()}_${uniqueIdCounter}` };
    const originalIndex = matchesData.findIndex(m => m.clientId == rowId);
    matchesData.splice(originalIndex + 1, 0, newMatch);
    renderTable();
  }

  function deleteRow(rowId) {
    matchesData = matchesData.filter(m => m.clientId != rowId);
    renderTable();
  }
  
  function updateSaveButton() {
    btnSave.innerHTML = `💾 Guardar ${matchesData.length} Partidos`;
    btnSave.disabled = matchesData.length === 0;
  }
  
  // --- GUARDAR EN SUPABASE ---
  async function saveAllMatches() {
    const matchesToInsert = [];
    for (const match of matchesData) {
      if (!match.tournament_id || !match.player1_id || !match.player2_id || !match.match_date) {
        alert(`Fila incompleta. Revisa que todas tengan Torneo, Jugadores y Fecha.`);
        return;
      }
      if (match.player1_id === match.player2_id) {
         alert(`Un jugador no puede enfrentarse a sí mismo.`);
        return;
      }

      const [d, m, y] = match.match_date.split('/');
      const tournament = allTournaments.find(t => t.id == match.tournament_id);

      matchesToInsert.push({
        tournament_id: match.tournament_id,
        category_id: tournament?.category?.id,
        player1_id: match.player1_id,
        player2_id: match.player2_id,
        match_date: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
        match_time: match.match_time || null,
        location: `${match.sede} - ${match.cancha}`,
      });
    }

    if (matchesToInsert.length === 0) return;

    btnSave.disabled = true;
    btnSave.textContent = 'Guardando...';

    const { error } = await supabase.from('matches').insert(matchesToInsert);

    if (error) {
      alert('Error al guardar: ' + error.message);
      btnSave.disabled = false;
      updateSaveButton();
    } else {
      alert(`${matchesToInsert.length} partidos guardados con éxito.`);
      matchesData = [];
      renderTable();
      if (typeof loadInitialData === 'function') await loadInitialData();
    }
  }

  // --- EVENT LISTENERS ---
  let currentSelectedCell = null;

  tableContainer.addEventListener('click', (e) => {
    // Manejar selección de celda
    const cell = e.target.closest('td[data-field]');
    if (cell) {
      if (currentSelectedCell) {
        currentSelectedCell.classList.remove('cell-selected');
      }
      cell.classList.add('cell-selected');
      currentSelectedCell = cell;
    }
    // Manejar botones de acción
    const button = e.target.closest('button.action-btn');
    if (button) {
      const action = button.dataset.action;
      const rowId = button.closest('tr').dataset.rowId;
      if (action === 'duplicate') duplicateRow(rowId);
      if (action === 'delete') deleteRow(rowId);
    }
  });
  
  tableContainer.addEventListener('dblclick', (e) => {
    const cell = e.target.closest('td[data-field]');
    if (cell) {
      makeCellEditable(cell);
    }
  });

  btnAddRow.addEventListener('click', addRow);
  btnSave.addEventListener('click', saveAllMatches);
  
  // --- INICIALIZACIÓN ---
  renderTable();
  if (matchesData.length === 0) {
      addRow();
  }
}