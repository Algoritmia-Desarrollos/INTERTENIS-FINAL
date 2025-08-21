import { supabase } from '../common/supabase.js';

export function setupDoublesMatchLoader({
  container,
  btnAddRow,
  btnSave,
  allTournaments,
  allPlayers,
  allTeams,
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
      background: none; border: none; cursor: pointer;
      font-size: 1.2rem; padding: 0 5px; color: #fff;
    }
    .action-btn:hover { color: #fdc100; }
    .editing-input {
      border: none; padding: 0; margin: 0; width: 100%; height: 100%;
      position: absolute; left: 0; top: 0; font-size: inherit; font-family: inherit;
      color: #fff !important; background: #232323 !important;
    }
    #doubles-matches-table th, #doubles-matches-table td {
      background: #18191b !important; color: #fff !important;
      border: 1px solid #333 !important;
    }
    #doubles-matches-table thead th {
      background: #111 !important; color: #fff !important;
      font-weight: 700; text-transform: uppercase;
    }
    #doubles-matches-table td { font-size: 10pt; }
  `;
  document.head.appendChild(style);

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
  const teamTournaments = allTournaments.filter(t => t.category && t.category.name === 'Equipos');
  const tournamentOptionsHTML = `<option value="">Seleccionar Torneo</option>` + teamTournaments.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  const teamOptionsHTML = `<option value="">Seleccionar Equipo</option>` + allTeams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  const sedeOptionsHTML = `<option value="">Seleccionar</option>` + ['Funes', 'Centro'].map(s => `<option value="${s}">${s}</option>`).join('');
  const canchaOptionsHTML = `<option value="">Seleccionar</option>` + [1, 2, 3, 4, 5, 6].map(n => `<option value="Cancha ${n}">Cancha ${n}</option>`).join('');

  const tableContainer = document.createElement('div');
  tableContainer.className = 'overflow-x-auto';
  
  const existingTable = container.querySelector('#doubles-matches-table');
  if(existingTable) existingTable.parentElement.remove();
  container.appendChild(tableContainer);

  // --- RENDERIZADO Y ACTUALIZACIÓN DEL DOM ---
  function renderTable() {
    tableContainer.innerHTML = `
      <table class="w-full border-collapse text-sm table-fixed" id="doubles-matches-table" style="table-layout:fixed;">
        <colgroup>
            <col style="width: 15%"><col style="width: 10%"><col style="width: 12%"><col style="width: 12%">
            <col style="width: 10%"><col style="width: 12%"><col style="width: 12%">
            <col style="width: 9%"><col style="width: 8%"><col style="width: 9%">
            <col style="width: 9%"><col style="width: 10%">
        </colgroup>
        <thead>
          <tr>
            <th>Torneo</th><th>Equipo A</th><th>Jugador A1</th><th>Jugador A2</th>
            <th>Equipo B</th><th>Jugador B1</th><th>Jugador B2</th>
            <th>Fecha</th><th>Hora</th><th>Sede</th><th>Cancha</th>
            <th class="text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${matchesData.map(renderRow).join('')}
        </tbody>
      </table>
    `;
    // Drag and drop de celdas
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
  
  // --- DRAG AND DROP DE CELDAS ---
  let dragCellInfo = null;
  function handleCellDragStart(e) {
    const field = this.dataset.field;
    const rowId = this.parentElement.dataset.rowId;
    const match = matchesData.find(m => m.clientId == rowId);
    if (!match) return;
    dragCellInfo = { rowId, field, value: match[field] };
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
        matchesData[matchIdxTo][dragCellInfo.field] = dragCellInfo.value;
        renderTable();
      }
    }
    dragCellInfo = null;
  }
  function handleCellDragEnd() {
    this.style.opacity = '';
    this.style.border = '';
    dragCellInfo = null;
  }
  
  function renderRow(match) {
    const tournamentName = allTournaments.find(t => t.id == match.tournament_id)?.name || '---';
    const teamAName = allTeams.find(t => t.id == match.teamA_id)?.name || '---';
    const playerA1Name = allPlayers.find(p => p.id == match.playerA1_id)?.name || '---';
    const playerA2Name = allPlayers.find(p => p.id == match.playerA2_id)?.name || '---';
    const teamBName = allTeams.find(t => t.id == match.teamB_id)?.name || '---';
    const playerB1Name = allPlayers.find(p => p.id == match.playerB1_id)?.name || '---';
    const playerB2Name = allPlayers.find(p => p.id == match.playerB2_id)?.name || '---';

    const cellStyle = "overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color:#fff; background:#18191b; padding: 8px;";
    return `
      <tr data-row-id="${match.clientId}">
        <td data-field="tournament_id" style="${cellStyle}">${tournamentName}</td>
        <td data-field="teamA_id" style="${cellStyle}">${teamAName}</td>
        <td data-field="playerA1_id" style="${cellStyle}">${playerA1Name}</td>
        <td data-field="playerA2_id" style="${cellStyle}">${playerA2Name}</td>
        <td data-field="teamB_id" style="${cellStyle}">${teamBName}</td>
        <td data-field="playerB1_id" style="${cellStyle}">${playerB1Name}</td>
        <td data-field="playerB2_id" style="${cellStyle}">${playerB2Name}</td>
        <td data-field="match_date" style="${cellStyle}">${match.match_date || '---'}</td>
        <td data-field="match_time" style="${cellStyle}">${match.match_time || '---'}</td>
        <td data-field="sede" style="${cellStyle}">${match.sede || '---'}</td>
        <td data-field="cancha" style="${cellStyle}">${match.cancha || '---'}</td>
        <td class="text-center">
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

    let saveChangeCalled = false;
    const saveChange = () => {
      if (saveChangeCalled) return;
      saveChangeCalled = true;
      if (!cell.classList.contains('is-editing')) return;

      const newValue = inputElement.value;
      const matchIndex = matchesData.findIndex(m => m.clientId == rowId);
      if (matchIndex > -1) {
        matchesData[matchIndex][field] = newValue;
        
        // Reset dependent fields
        if (field === 'tournament_id') {
            ['teamA_id', 'playerA1_id', 'playerA2_id', 'teamB_id', 'playerB1_id', 'playerB2_id'].forEach(f => matchesData[matchIndex][f] = null);
        } else if (field === 'teamA_id') {
            ['playerA1_id', 'playerA2_id'].forEach(f => matchesData[matchIndex][f] = null);
        } else if (field === 'teamB_id') {
            ['playerB1_id', 'playerB2_id'].forEach(f => matchesData[matchIndex][f] = null);
        } else if (field === 'playerA1_id' && newValue) {
            matchesData[matchIndex].playerA2_id = null;
        } else if (field === 'playerB1_id' && newValue) {
            matchesData[matchIndex].playerB2_id = null;
        }
        renderTable();
      } else {
        cell.innerHTML = originalContent;
        cell.classList.remove('is-editing');
      }
    };

    switch (field) {
      case 'tournament_id':
      case 'teamA_id':
      case 'playerA1_id':
      case 'playerA2_id':
      case 'teamB_id':
      case 'playerB1_id':
      case 'playerB2_id':
      case 'sede':
      case 'cancha':
      case 'match_time':
        inputElement = document.createElement('select');
        let options = '';
        if (field === 'tournament_id') {
          options = tournamentOptionsHTML;
        } else if (field === 'teamA_id' || field === 'teamB_id') {
          const otherTeamId = field === 'teamA_id' ? match.teamB_id : match.teamA_id;
          const filteredTeams = otherTeamId ? allTeams.filter(t => String(t.id) !== String(otherTeamId)) : allTeams;
          options = '<option value="">Seleccionar Equipo</option>' + filteredTeams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        } else if (field === 'playerA1_id' || field === 'playerA2_id') {
          const teamId = match.teamA_id;
          const otherPlayerId = field === 'playerA1_id' ? match.playerA2_id : match.playerA1_id;
          const players = allPlayers.filter(p => String(p.team_id) === String(teamId) && String(p.id) !== String(otherPlayerId));
          options = '<option value="">Seleccionar Jugador</option>' + players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        } else if (field === 'playerB1_id' || field === 'playerB2_id') {
          const teamId = match.teamB_id;
          const otherPlayerId = field === 'playerB1_id' ? match.playerB2_id : match.playerB1_id;
          const players = allPlayers.filter(p => String(p.team_id) === String(teamId) && String(p.id) !== String(otherPlayerId));
          options = '<option value="">Seleccionar Jugador</option>' + players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        } else if (field === 'sede') {
          options = sedeOptionsHTML;
        } else if (field === 'cancha') {
          options = canchaOptionsHTML;
        } else if (field === 'match_time') {
          options = '<option value="">Seleccionar</option>';
          for (let h = 8; h <= 22; h++) {
            for (let m = 0; m < 60; m += 15) {
              let hour = h.toString().padStart(2, '0');
              let min = m.toString().padStart(2, '0');
              let value = `${hour}:${min}`;
              options += `<option value="${value}">${value}</option>`;
            }
          }
        }
        inputElement.innerHTML = options;
        inputElement.value = match[field] || '';
        break;

      case 'match_date':
        inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.placeholder = 'Seleccionar fecha...';
        inputElement.id = `editing-${field}-${rowId}`;
        cell.appendChild(inputElement);
        
        flatpickr(inputElement, {
          dateFormat: 'd/m/Y',
          allowInput: true,
          defaultDate: match.match_date || 'today',
          onClose: (selectedDates, dateStr) => {
            const matchIndex = matchesData.findIndex(m => m.clientId == rowId);
            if (matchIndex > -1) {
                matchesData[matchIndex].match_date = dateStr;
                renderTable();
            } else {
                cell.innerHTML = originalContent;
                cell.classList.remove('is-editing');
            }
          }
        }).open();
        return;

      default:
        cell.innerHTML = originalContent;
        cell.classList.remove('is-editing');
        return;
    }

    inputElement.id = `editing-${field}-${rowId}`;
    inputElement.className = 'editing-input';
    cell.appendChild(inputElement);
    inputElement.focus();

    inputElement.addEventListener('change', saveChange);
    inputElement.addEventListener('blur', saveChange);
    inputElement.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        inputElement.blur();
      } else if (e.key === 'Escape') {
        cell.innerHTML = originalContent;
        cell.classList.remove('is-editing');
      }
    });

    // --- INICIO DE LA CORRECCIÓN ---
    // Este bloque anula los estilos problemáticos para los <select>
    // y les da una apariencia estándar para que el navegador los maneje correctamente.
    if (inputElement.tagName === 'SELECT') {
        inputElement.style.color = '#222';
        inputElement.style.background = '#fff';
        inputElement.style.position = 'static';
        inputElement.style.zIndex = '10';
        inputElement.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        inputElement.style.width = 'auto';
        inputElement.style.maxWidth = '220px';
        inputElement.style.minWidth = '120px';
        inputElement.style.fontSize = '1rem';
        inputElement.style.borderRadius = '6px';
        inputElement.style.border = '1px solid #bbb';
        inputElement.style.padding = '4px 8px';
        setTimeout(() => {
          inputElement.focus();
          // Forzar abrir el select en la mayoría de navegadores
          if (typeof inputElement.showPicker === 'function') {
            inputElement.showPicker();
          } else {
            const event = document.createEvent('MouseEvents');
            event.initMouseEvent('mousedown', true, true, window);
            inputElement.dispatchEvent(event);
          }
        }, 0);
    }
    // --- FIN DE LA CORRECCIÓN ---
  }

  // --- OPERACIONES DE FILA ---
  function addRow() {
    uniqueIdCounter++;
    matchesData.push({
      clientId: `new_${Date.now()}_${uniqueIdCounter}`,
      tournament_id: null, teamA_id: null, playerA1_id: null, playerA2_id: null,
      teamB_id: null, playerB1_id: null, playerB2_id: null,
      match_date: null, match_time: null, sede: null, cancha: null
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
    if (btnSave) {
      btnSave.innerHTML = `💾 Guardar ${matchesData.length} Partidos`;
      btnSave.disabled = matchesData.length === 0;
    }
  }
  async function saveAllMatches() {
    const matchesToInsert = [];
    for (const match of matchesData) {
      if (!match.tournament_id || !match.playerA1_id || !match.playerA2_id || !match.playerB1_id || !match.playerB2_id || !match.match_date || !match.sede || !match.cancha) {
        alert(`Fila incompleta. Revisa que todas tengan torneo, los 4 jugadores, fecha, sede y cancha.`);
        return;
      }
      const playerIds = [match.playerA1_id, match.playerA2_id, match.playerB1_id, match.playerB2_id];
      if (new Set(playerIds).size !== playerIds.length) {
        alert('Un jugador no puede estar en más de una posición en el mismo partido.');
        return;
      }
      if (match.teamA_id === match.teamB_id) {
          alert('Un equipo no puede enfrentarse a sí mismo.');
          return;
      }
      
      const [d, m, y] = match.match_date.split('/');
      const tournament = allTournaments.find(t => t.id == match.tournament_id);
      matchesToInsert.push({
        tournament_id: match.tournament_id,
        category_id: tournament?.category?.id,
        player1_id: match.playerA1_id,
        player3_id: match.playerA2_id,
        player2_id: match.playerB1_id,
        player4_id: match.playerB2_id,
        match_date: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
        match_time: match.match_time || null,
        location: `${match.sede} - ${match.cancha}`
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
  // Cargar flatpickr si no está disponible
  if (!window.flatpickr) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/flatpickr';
    document.body.appendChild(script);
  }
  
  renderTable();
  if (matchesData.length === 0) addRow();
}