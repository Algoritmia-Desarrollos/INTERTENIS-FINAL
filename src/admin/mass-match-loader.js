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
      color: #fff;
    }
    .action-btn:hover {
      color: #fdc100;
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
      color: #fff !important;
      background: #232323 !important;
    }
    #mass-matches-table th, #mass-matches-table td {
      background: #18191b !important;
      color: #fff !important;
      border: 1px solid #333 !important;
    }
    #mass-matches-table thead th {
      background: #111 !important;
      color: #fff !important;
      font-weight: 700;
      text-transform: uppercase;
    }
    #mass-matches-table td {
      font-size: 10pt;
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
  const individualTournaments = allTournaments.filter(t => t.category && t.category.name !== 'Equipos');
  const tournamentOptionsHTML = `<option value="">Seleccionar Torneo</option>` + individualTournaments.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

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
      // Necesitamos encontrar el valor real en `matchesData` para copiarlo correctamente
      const match = matchesData.find(m => m.clientId == rowId);
      value = match ? match[field] : ''; // Usar el valor del estado, no del DOM
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
        matchesData[matchIdxTo][field] = dragCellInfo.value; // Pegar el valor del estado
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

  const cellStyle = "overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color:#fff; background:#18191b;";
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

    const originalContent = cell.innerHTML; // Guardar contenido HTML para restaurar
    const originalValue = match[field] || ''; // Guardar valor real del estado
    cell.innerHTML = '';

    let inputElement;

    // Función para guardar cambios (solo una vez)
    let saveChangeCalled = false;
    const saveChange = () => {
        if (saveChangeCalled) return;
        saveChangeCalled = true;
        if (!cell.classList.contains('is-editing')) return; // Evitar doble guardado en blur + change

        const newValue = inputElement.value;
        const matchIndex = matchesData.findIndex(m => m.clientId == rowId);

        if (matchIndex > -1) {
            // Validar jugador duplicado ANTES de guardar
            if (field === 'player1_id' && newValue && newValue === matchesData[matchIndex].player2_id) {
                alert("El Jugador 1 no puede ser igual al Jugador 2.");
                cell.innerHTML = originalContent; // Restaurar contenido
                cell.classList.remove('is-editing');
                return;
            }
            if (field === 'player2_id' && newValue && newValue === matchesData[matchIndex].player1_id) {
                alert("El Jugador 2 no puede ser igual al Jugador 1.");
                cell.innerHTML = originalContent; // Restaurar contenido
                cell.classList.remove('is-editing');
                return;
            }

            // Actualizar el estado
            matchesData[matchIndex][field] = newValue;

            // Lógica de reseteo si cambia torneo
            if (field === 'tournament_id' && newValue !== originalValue) {
                matchesData[matchIndex].player1_id = null;
                matchesData[matchIndex].player2_id = null;
                // Re-renderizar toda la tabla para actualizar opciones de jugador
                renderTable();
                return; // Salir porque renderTable() se encarga
            }

             // Actualizar visualización de la celda editada
            let displayValue = newValue;
            if (inputElement.tagName === 'SELECT' && inputElement.selectedIndex > 0) {
                 displayValue = inputElement.options[inputElement.selectedIndex].text;
            } else if (inputElement.tagName === 'SELECT' && inputElement.selectedIndex <= 0) {
                 displayValue = '---'; // Mostrar si se selecciona "-- Seleccionar --"
            }
             cell.innerHTML = displayValue || '---';

        } else {
             // Si algo falló (no debería pasar), restaurar
             cell.innerHTML = originalContent;
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
                 // Usar tournamentPlayersMap para obtener jugadores del torneo seleccionado
                const playerIdsInTournament = tournamentPlayersMap.get(Number(match.tournament_id)) || new Set();
                const playersInTournament = allPlayers.filter(p => playerIdsInTournament.has(p.id));

                let opponentId = null;
                if (field === 'player1_id') opponentId = match.player2_id;
                if (field === 'player2_id') opponentId = match.player1_id;

                 // Filtrar para no mostrar el oponente
                const availablePlayers = opponentId
                    ? playersInTournament.filter(p => String(p.id) !== String(opponentId))
                    : playersInTournament;

                inputElement.innerHTML = '<option value="">Seleccionar</option>' + availablePlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                inputElement.value = match[field] || ''; // Establecer valor actual
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
            let timeOptions = '<option value="">Seleccionar</option>';
            for (let h = 8; h <= 22; h++) {
                for (let m = 0; m < 60; m += 15) {
                    let hour = h.toString().padStart(2, '0');
                    let min = m.toString().padStart(2, '0');
                    let value = `${hour}:${min}`;
                    timeOptions += `<option value="${value}">${value}</option>`;
                }
            }
            inputElement.innerHTML = timeOptions;
            inputElement.value = match.match_time || '';
            break;

        case 'match_date':
            inputElement = document.createElement('input');
            inputElement.type = 'text'; // Para usar flatpickr
            inputElement.placeholder = 'Seleccionar fecha...';
            inputElement.className = 'editing-input'; // Aplicar estilo base
             // Anular estilos conflictivos para input de fecha
            inputElement.style.position = 'static';
            inputElement.style.color = '#333';
            inputElement.style.background = '#fff';
            inputElement.style.padding = '4px 6px';
            inputElement.style.border = '1px solid #ccc';
            inputElement.style.borderRadius = '4px';

            cell.appendChild(inputElement);

            // Función para abrir calendario (flatpickr)
            const openCalendar = () => {
                flatpickr(inputElement, {
                    dateFormat: 'd/m/Y', // Formato día/mes/año
                    allowInput: true, // Permitir escribir
                    defaultDate: match.match_date || 'today', // Fecha inicial
                    onClose: (selectedDates, dateStr, instance) => {
                        // Usar el valor del input, que puede ser tipeado o seleccionado
                        const finalValue = instance.input.value;
                        const matchIndex = matchesData.findIndex(m => m.clientId == rowId);
                        if (matchIndex > -1) {
                            // Validar formato d/m/Y antes de guardar
                            if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(finalValue) || finalValue === '') {
                                matchesData[matchIndex].match_date = finalValue || null;
                                cell.innerHTML = finalValue || '---';
                            } else {
                                // Si el formato es inválido, revertir
                                cell.innerHTML = originalContent;
                                alert("Formato de fecha inválido. Use DD/MM/AAAA.");
                            }
                        } else {
                             cell.innerHTML = originalContent; // Restaurar si no se encuentra
                        }
                        cell.classList.remove('is-editing'); // Quitar modo edición
                    }
                }).open(); // Abrir inmediatamente
            };

            // Cargar flatpickr si no está y luego abrir calendario
            if (!window.flatpickr) {
                const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css'; document.head.appendChild(link);
                const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/flatpickr'; script.onload = openCalendar; document.body.appendChild(script);
            } else { openCalendar(); }
            return; // No continuar con listeners genéricos

        default: cell.innerHTML = originalContent; cell.classList.remove('is-editing'); return;
    }

    inputElement.className = 'editing-input';
    cell.appendChild(inputElement);
    inputElement.focus();
    
    // Si es un select, intentar abrirlo
    if (inputElement.tagName === 'SELECT' && typeof inputElement.showPicker === 'function') {
         setTimeout(() => inputElement.showPicker(), 0); // Intentar abrir el dropdown
    } else if (inputElement.tagName === 'SELECT') {
         // Fallback para navegadores que no soportan showPicker
         const event = new MouseEvent('mousedown'); inputElement.dispatchEvent(event);
    }
    
    inputElement.addEventListener('change', saveChange);
    inputElement.addEventListener('blur', saveChange);
    inputElement.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); inputElement.blur(); } 
      else if (e.key === 'Escape') { cell.innerHTML = originalContent; cell.classList.remove('is-editing'); }
    });
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
  // AÑADIDO: Comprobar si hay datos pre-cargados en sessionStorage
  const preloadedData = sessionStorage.getItem('matchesToPreload');
  if (preloadedData) {
      try {
          matchesData = JSON.parse(preloadedData);
          // Limpiar sessionStorage después de cargarlo
          sessionStorage.removeItem('matchesToPreload');
          console.log("Datos de sugerencias cargados desde sessionStorage:", matchesData);
      } catch (e) {
          console.error("Error al parsear datos pre-cargados:", e);
          matchesData = []; // Resetear si hay error
      }
  } else {
      matchesData = []; // Empezar vacío si no hay nada pre-cargado
  }

  renderTable(); // Renderizar la tabla con los datos (pre-cargados o vacíos)
  if (matchesData.length === 0) {
      addRow(); // Añadir una fila vacía si no se cargó nada
  } else {
      updateSaveButton(); // Actualizar el contador del botón si se cargaron datos
  }
}