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
  let currentSelectedCell = null;
  let clipboardCellValue = null;
  // --- COPIAR Y PEGAR CELDAS CON CTRL+C / CTRL+V ---
  document.addEventListener('keydown', function(e) {
    if (!currentSelectedCell) return;
    // Copiar (Ctrl+C)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      const field = currentSelectedCell.dataset.field;
      const rowId = currentSelectedCell.parentElement.dataset.rowId;
      const match = matchesData.find(m => m.clientId == rowId);
      if (match && field) {
        clipboardCellValue = match[field];
        // También copiar al portapapeles del sistema
        navigator.clipboard.writeText(clipboardCellValue ?? '').catch(()=>{});
      }
      e.preventDefault();
    }
    // Pegar (Ctrl+V)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      if (clipboardCellValue !== null) {
        const field = currentSelectedCell.dataset.field;
        const rowId = currentSelectedCell.parentElement.dataset.rowId;
        const matchIndex = matchesData.findIndex(m => m.clientId == rowId);
        if (matchIndex > -1 && field) {
          matchesData[matchIndex][field] = clipboardCellValue;
          renderTable();
          // Volver a seleccionar la celda pegada
          setTimeout(() => {
            const table = tableContainer.querySelector('table');
            if (!table) return;
            const row = table.querySelector(`tr[data-row-id="${rowId}"]`);
            if (!row) return;
            const cell = row.querySelector(`td[data-field="${field}"]`);
            if (cell) {
              cell.classList.add('cell-selected');
              currentSelectedCell = cell;
            }
          }, 0);
        }
      }
      e.preventDefault();
    }
  });

  // --- INYECTAR ESTILOS CSS ---
  const style = document.createElement('style');
  style.textContent = `
    .cell-selected {
      outline: 2px solid #0d6efd !important;
      outline-offset: -2px;
    }
    .action-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1.2rem;
      padding: 0 5px;
    }
    .editing-input {
      border: none;
      padding: 0;
      margin: 0;
      width: 100%;
      height: 100%;
      position: absolute;
      left: 0;
      top: 0;
      font-size: inherit;
      font-family: inherit;
      color: black !important;
      background: white !important;
    }
    #mass-matches-table td, #mass-matches-table th {
      color: black !important;
    }
  `;
  document.head.appendChild(style);


  // --- LÓGICA DE COPIADO ---
  async function copyTableToClipboard() {
    const headers = ["Torneo", "Jugador 1", "Jugador 2", "Fecha", "Hora", "Sede", "Cancha"];
    let tsvContent = headers.join('\t') + '\n';

    const rows = matchesData.map(match => {
        const tournamentName = allTournaments.find(t => t.id == match.tournament_id)?.name || '';
        const player1Name = allPlayers.find(p => p.id == match.player1_id)?.name || '';
        const player2Name = allPlayers.find(p => p.id == match.player2_id)?.name || '';
        return [
            tournamentName,
            player1Name,
            player2Name,
            match.match_date || '',
            match.match_time || '',
            match.sede || '',
            match.cancha || ''
        ].join('\t');
    });

    tsvContent += rows.join('\n');

    try {
        await navigator.clipboard.writeText(tsvContent);
        alert('Tabla copiada al portapapeles.');
    } catch (err) {
        alert('Error al copiar la tabla.');
    }
  }


  // --- CREAR BOTONES SI NO EXISTEN ---
  const headerContainer = document.createElement('div');
  headerContainer.style.display = 'flex';
  headerContainer.style.justifyContent = 'flex-end';
  headerContainer.style.padding = '1rem 0';
  


  if (!btnAddRow) {
      btnAddRow = document.createElement('button');
      btnAddRow.innerHTML = `✚ Crear Partido`;
      btnAddRow.style.background = '#198754';
      btnAddRow.style.color = 'white';
      btnAddRow.style.border = 'none';
      btnAddRow.style.padding = '10px 15px';
      btnAddRow.style.borderRadius = '5px';
      btnAddRow.style.cursor = 'pointer';
      btnAddRow.style.marginLeft = '10px';
      btnAddRow.style.fontWeight = 'bold';
      headerContainer.appendChild(btnAddRow);
  }
  if (!btnSave) {
      btnSave = document.createElement('button');
      btnSave.innerHTML = `💾 Guardar Partidos`;
      btnSave.style.background = '#0dcaf0';
      btnSave.style.color = 'white';
      btnSave.style.border = 'none';
      btnSave.style.padding = '10px 15px';
      btnSave.style.borderRadius = '5px';
      btnSave.style.cursor = 'pointer';
      btnSave.style.marginLeft = '10px';
      btnSave.style.fontWeight = 'bold';
      headerContainer.appendChild(btnSave);
  }
  
  container.prepend(headerContainer);


  // --- OPCIONES CACHEADAS ---
  const tournamentOptionsHTML = `<option value="">Seleccionar</option>` + allTournaments.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  const sedeOptionsHTML = `<option value="">Seleccionar</option>` + ['Funes', 'Centro'].map(s => `<option value="${s}">${s}</option>`).join('');
  const canchaOptionsHTML = `<option value="">Seleccionar</option>` + [1, 2, 3, 4, 5, 6].map(n => `<option value="Cancha ${n}">Cancha ${n}</option>`).join('');

  const tableContainer = document.createElement('div');
  tableContainer.className = 'overflow-x-auto';
  
  const existingTable = container.querySelector('#mass-matches-table');
  if(existingTable) existingTable.parentElement.remove();
  container.appendChild(tableContainer);

  // --- RENDERIZADO Y ACTUALIZACIÓN DEL DOM ---

  function renderTable() {
    tableContainer.innerHTML = `
      <table class="w-full border-collapse text-sm table-fixed" id="mass-matches-table" style="table-layout:fixed;">
        <colgroup>
            <col style="width: 18%"><col style="width: 14%"><col style="width: 14%">
            <col style="width: 10%"><col style="width: 8%"><col style="width: 10%">
            <col style="width: 10%"><col style="width: 12%">
        </colgroup>
        <thead class="bg-gray-100">
          <tr>
            <th class="p-2 border text-left">Torneo</th><th class="p-2 border text-left">Jugador 1</th>
            <th class="p-2 border text-left">Jugador 2</th><th class="p-2 border text-left">Fecha</th>
            <th class="p-2 border text-left">Hora</th><th class="p-2 border text-left">Sede</th>
            <th class="p-2 border text-left">Cancha</th><th class="p-2 border text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${matchesData.map(renderRow).join('')}
        </tbody>
      </table>
    `;
    // Drag and drop de celdas individuales
    const table = tableContainer.querySelector('table');
    if (table) {
      const tds = table.querySelectorAll('td[data-field]');
      tds.forEach(cell => {
        cell.setAttribute('draggable', 'true');
        cell.addEventListener('dragstart', handleCellDragStart);
        cell.addEventListener('dragover', handleCellDragOver);
        cell.addEventListener('drop', handleCellDrop);
        cell.addEventListener('dragend', handleCellDragEnd);
      });
    }
    updateSaveButton();
  }

  // --- DRAG AND DROP DE CELDAS (COPIAR/PEGAR, SIEMPRE ACTIVO) ---
  let dragCellInfo = null;
  function handleCellDragStart(e) {
    const field = this.dataset.field;
    const rowId = this.parentElement.dataset.rowId;
    let value = '';
    // Si está en modo edición, tomar el valor del input/select
    const editingInput = this.querySelector('.editing-input');
    if (editingInput) {
      value = editingInput.value;
    } else {
      value = this.textContent;
    }
    dragCellInfo = { rowId, field, value };
    this.style.opacity = '0.5';
  }
  function handleCellDragOver(e) {
    e.preventDefault();
    if (dragCellInfo && this.dataset.field === dragCellInfo.field) {
      this.style.border = '2px dashed #0d6efd';
    }
  }
  function handleCellDrop(e) {
    e.preventDefault();
    this.style.border = '';
    if (!dragCellInfo) return;
    if (this.dataset.field === dragCellInfo.field && this.parentElement.dataset.rowId !== dragCellInfo.rowId) {
      const rowIdTarget = this.parentElement.dataset.rowId;
      const matchIdxTo = matchesData.findIndex(m => m.clientId == rowIdTarget);
      if (matchIdxTo > -1) {
        const field = this.dataset.field;
        matchesData[matchIdxTo][field] = dragCellInfo.value;
        renderTable();
      }
    }
    dragCellInfo = null;
  }
  function handleCellDragEnd(e) {
    this.style.opacity = '';
    this.style.border = '';
    dragCellInfo = null;
  }

  // --- DRAG AND DROP LOGIC ---
  let dragSrcRowId = null;
  function handleDragStart(e) {
    dragSrcRowId = this.dataset.rowId;
    this.style.opacity = '0.5';
  }
  function handleDragOver(e) {
    e.preventDefault();
    this.style.borderTop = '2px solid #0d6efd';
  }
  function handleDrop(e) {
    e.preventDefault();
    this.style.borderTop = '';
    const targetRowId = this.dataset.rowId;
    if (dragSrcRowId && dragSrcRowId !== targetRowId) {
      const fromIdx = matchesData.findIndex(m => m.clientId == dragSrcRowId);
      const toIdx = matchesData.findIndex(m => m.clientId == targetRowId);
      if (fromIdx > -1 && toIdx > -1) {
        const [moved] = matchesData.splice(fromIdx, 1);
        matchesData.splice(toIdx, 0, moved);
        renderTable();
      }
    }
    dragSrcRowId = null;
  }
  function handleDragEnd(e) {
    this.style.opacity = '';
    this.style.borderTop = '';
    dragSrcRowId = null;
  }

  function renderRow(match) {
    const tournamentName = allTournaments.find(t => t.id == match.tournament_id)?.name || '---';
    const player1Name = allPlayers.find(p => p.id == match.player1_id)?.name || '---';
    const player2Name = allPlayers.find(p => p.id == match.player2_id)?.name || '---';
    
  const cellStyle = "overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color:black;";
    return `
      <tr data-row-id="${match.clientId}">
        <td class="p-2 border relative" data-field="tournament_id" style="${cellStyle}">${tournamentName}</td>
        <td class="p-2 border relative" data-field="player1_id" style="${cellStyle}">${player1Name}</td>
        <td class="p-2 border relative" data-field="player2_id" style="${cellStyle}">${player2Name}</td>
        <td class="p-2 border relative" data-field="match_date" style="${cellStyle}">${match.match_date || '---'}</td>
        <td class="p-2 border relative" data-field="match_time" style="${cellStyle}">${match.match_time || '---'}</td>
        <td class="p-2 border relative" data-field="sede" style="${cellStyle}">${match.sede || '---'}</td>
        <td class="p-2 border relative" data-field="cancha" style="${cellStyle}">${match.cancha || '---'}</td>
        <td class="p-2 border text-center">
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

  // Función para guardar cambios (solo una vez)
  let saveChangeCalled = false;
  const saveChange = () => {
    if (saveChangeCalled) return;
    saveChangeCalled = true;
    if (!cell.classList.contains('is-editing')) return;
    const newValue = inputElement.value;
    const matchIndex = matchesData.findIndex(m => m.clientId == rowId);
    if (matchIndex > -1) {
      matchesData[matchIndex][field] = newValue;
      if (field === 'tournament_id') {
        matchesData[matchIndex].player1_id = null;
        matchesData[matchIndex].player2_id = null;
        renderTable(); return;
      }
      let displayValue = newValue;
      if (inputElement.tagName === 'SELECT') {
        displayValue = inputElement.options[inputElement.selectedIndex]?.text || '---';
      }
      cell.innerHTML = displayValue || '---';
    }
    cell.classList.remove('is-editing');
  };

  switch (field) {
    case 'tournament_id': case 'player1_id': case 'player2_id': case 'sede': case 'cancha':
      inputElement = document.createElement('select');
      if (field === 'tournament_id') {
        inputElement.innerHTML = tournamentOptionsHTML;
        inputElement.value = match.tournament_id || '';
      } else if (field === 'player1_id' || field === 'player2_id') {
        const playerIds = tournamentPlayersMap.get(Number(match.tournament_id)) || new Set();
        const players = allPlayers.filter(p => playerIds.has(p.id));
        let excludeId = null;
        if (field === 'player1_id') excludeId = match.player2_id;
        if (field === 'player2_id') excludeId = match.player1_id;
        const filteredPlayers = excludeId ? players.filter(p => String(p.id) !== String(excludeId)) : players;
        inputElement.innerHTML = '<option value="">Seleccionar</option>' + filteredPlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        inputElement.value = match[field] || '';
      } else if (field === 'sede') {
        inputElement.innerHTML = sedeOptionsHTML;
        inputElement.value = match.sede || '';
      } else if (field === 'cancha') {
        inputElement.innerHTML = canchaOptionsHTML;
        inputElement.value = match.cancha || '';
      }
      break;
        
  case 'match_time':
    inputElement = document.createElement('select');
    inputElement.className = 'editing-input';
    inputElement.style.color = 'black';
    inputElement.style.background = 'white';
    // Generar opciones de 08:00 a 22:45 cada 15 minutos
    let options = '<option value="">Seleccionar</option>';
    for (let h = 8; h <= 22; h++) {
    for (let m = 0; m < 60; m += 15) {
      let hour = h.toString().padStart(2, '0');
      let min = m.toString().padStart(2, '0');
      let value = `${hour}:${min}`;
      options += `<option value="${value}">${value}</option>`;
    }
    }
    inputElement.innerHTML = options;
    inputElement.value = match.match_time || '';
    break;

        case 'match_date':
      inputElement = document.createElement('input');
      inputElement.type = 'text';
      inputElement.placeholder = 'Seleccionar fecha...';
      // Evitar que el input expanda la celda
      inputElement.style.width = '100%';
      inputElement.style.height = '100%';
      inputElement.style.boxSizing = 'border-box';
      inputElement.style.fontSize = 'inherit';
      inputElement.style.fontFamily = 'inherit';
      inputElement.style.background = 'white';
      inputElement.style.border = 'none';
      inputElement.style.outline = 'none';
      inputElement.style.padding = '0 2px';
      inputElement.style.margin = '0';
      cell.appendChild(inputElement);

      function openCalendar() {
        const fp = flatpickr(inputElement, {
          dateFormat: 'd/m/Y', allowInput: true,
          defaultDate: match.match_date || 'today',
          onClose: (selectedDates, dateStr, instance) => {
            const finalValue = instance.input.value;
            const matchIndex = matchesData.findIndex(m => m.clientId == rowId);
            if (matchIndex > -1) matchesData[matchIndex].match_date = finalValue;
            cell.innerHTML = finalValue || '---';
            cell.classList.remove('is-editing');
          }
        });
        fp.open();
      }

      if (window.flatpickr) {
        openCalendar();
      } else {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
        document.head.appendChild(link);
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/flatpickr';
        script.onload = openCalendar;
        document.body.appendChild(script);
      }
      return; // Evitar listeners genéricos

        default:
            cell.innerHTML = originalContent;
            cell.classList.remove('is-editing');
            return;
    }

  inputElement.className = 'editing-input';
  inputElement.style.color = 'black';
  inputElement.style.background = 'white';
  cell.appendChild(inputElement);
  inputElement.focus();

  // MEJORA: Abrir el selector de hora automáticamente
  if ((inputElement.tagName === 'SELECT' || inputElement.type === 'time') && typeof inputElement.showPicker === 'function') {
      setTimeout(() => inputElement.showPicker(), 0);
  }

  // Confirmar selección automáticamente al elegir una opción en <select>
  if (inputElement.tagName === 'SELECT') {
    inputElement.addEventListener('change', () => {
      saveChange();
    });
  }

  inputElement.addEventListener('blur', saveChange);
  inputElement.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); inputElement.blur(); } 
      else if (e.key === 'Escape') { cell.innerHTML = originalContent; cell.classList.remove('is-editing'); }
  });
  // Restaurar comportamiento estándar del select, pero forzar apertura hacia abajo solo con CSS moderno
  if (inputElement.tagName === 'SELECT') {
    inputElement.style.color = 'black';
    inputElement.style.background = 'white';
    inputElement.style.direction = 'ltr';
    // CSS para forzar apertura hacia abajo en navegadores modernos
    inputElement.style.position = '';
    inputElement.style.zIndex = '';
    inputElement.style.boxShadow = '';
    setTimeout(() => inputElement.focus(), 0);
  }
  }

  // --- OPERACIONES DE FILA ---
  function addRow() { uniqueIdCounter++; matchesData.push({ clientId: `new_${Date.now()}_${uniqueIdCounter}`, tournament_id: null, player1_id: null, player2_id: null, match_date: null, match_time: null, sede: null, cancha: null }); renderTable(); }
  function duplicateRow(rowId) { const originalMatch = matchesData.find(m => m.clientId == rowId); if (!originalMatch) return; uniqueIdCounter++; const newMatch = { ...originalMatch, clientId: `new_${Date.now()}_${uniqueIdCounter}` }; const originalIndex = matchesData.findIndex(m => m.clientId == rowId); matchesData.splice(originalIndex + 1, 0, newMatch); renderTable(); }
  function deleteRow(rowId) { matchesData = matchesData.filter(m => m.clientId != rowId); renderTable(); }
  function updateSaveButton() { if(btnSave) { btnSave.innerHTML = `💾 Guardar ${matchesData.length} Partidos`; btnSave.disabled = matchesData.length === 0; } }
  async function saveAllMatches() { const matchesToInsert = []; for (const match of matchesData) { if (!match.tournament_id || !match.player1_id || !match.player2_id || !match.match_date || !match.sede || !match.cancha) { alert(`Fila incompleta. Revisa que todas tengan Torneo, Jugadores, Fecha, Sede y Cancha.`); return; } if (match.player1_id === match.player2_id) { alert(`Un jugador no puede enfrentarse a sí mismo.`); return; } const [d, m, y] = match.match_date.split('/'); const tournament = allTournaments.find(t => t.id == match.tournament_id); matchesToInsert.push({ tournament_id: match.tournament_id, category_id: tournament?.category?.id, player1_id: match.player1_id, player2_id: match.player2_id, match_date: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, match_time: match.match_time || null, location: `${match.sede} - ${match.cancha}` }); } if (matchesToInsert.length === 0) return; btnSave.disabled = true; btnSave.textContent = 'Guardando...'; const { error } = await supabase.from('matches').insert(matchesToInsert); if (error) { alert('Error al guardar: ' + error.message); btnSave.disabled = false; updateSaveButton(); } else { alert(`${matchesToInsert.length} partidos guardados con éxito.`); matchesData = []; renderTable(); if (typeof loadInitialData === 'function') await loadInitialData(); } }


  // --- EVENT LISTENERS ---
  tableContainer.addEventListener('click', (e) => {
    const cell = e.target.closest('td[data-field]');
    if (cell) {
      if (currentSelectedCell) {
        currentSelectedCell.classList.remove('cell-selected');
      }
      cell.classList.add('cell-selected');
      currentSelectedCell = cell;
    }
    
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
    if (cell) makeCellEditable(cell);
  });

  btnAddRow.addEventListener('click', addRow);
  btnSave.addEventListener('click', saveAllMatches);
  
  // --- INICIALIZACIÓN ---
  renderTable();
  if (matchesData.length === 0) addRow();
}