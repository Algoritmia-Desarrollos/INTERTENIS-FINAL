import { supabase } from '../common/supabase.js';

export function setupMassMatchLoader({
  container,
  btnAddRow,
  btnSave,
  allTournaments,
  allPlayers,
  tournamentPlayersMap,
  loadInitialData // Función para recargar datos después de guardar
}) {

  // --- ESTADO CENTRAL ---
  let matchesData = []; // Aquí guardaremos los datos de los partidos de la tabla
  let uniqueIdCounter = 0; // Para generar IDs únicos temporales para las filas
  let currentSelectedCell = null; // Guarda la celda TD que está seleccionada actualmente
  let clipboardCellValue = null; // Guarda el valor copiado con Ctrl+C
  let activeEditingCell = null; // Celda activa en edición

  // --- COPIAR Y PEGAR CELDAS CON CTRL+C / CTRL+V ---
  document.addEventListener('keydown', function(e) {
    if (!currentSelectedCell) return; // Si no hay celda seleccionada, no hacer nada

    // Copiar (Ctrl+C o Cmd+C en Mac)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      const field = currentSelectedCell.dataset.field; // Qué columna es (ej: 'tournament_id')
      const rowId = currentSelectedCell.parentElement.dataset.rowId; // ID temporal de la fila
      const match = matchesData.find(m => m.clientId == rowId); // Buscar el partido en nuestro array
      if (match && field) {
        clipboardCellValue = match[field]; // Guardar el valor real del array
        // Intentar copiar al portapapeles del sistema también
        navigator.clipboard.writeText(clipboardCellValue ?? '').catch(()=>{/* Ignorar error si no se puede */});
      }
      e.preventDefault(); // Evitar que el navegador haga la acción por defecto
    }

    // Pegar (Ctrl+V o Cmd+V en Mac)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      if (clipboardCellValue !== null) { // Si hay algo en nuestro portapapeles interno
        const field = currentSelectedCell.dataset.field;
        const rowId = currentSelectedCell.parentElement.dataset.rowId;
        const matchIndex = matchesData.findIndex(m => m.clientId == rowId); // Encontrar índice del partido
        if (matchIndex > -1 && field) {
          matchesData[matchIndex][field] = clipboardCellValue; // Actualizar el array de datos
          renderTable(); // Volver a dibujar la tabla con el valor pegado

          // Volver a seleccionar la celda donde se pegó para seguir trabajando
          setTimeout(() => { // Usar setTimeout para esperar a que la tabla se redibuje
            const table = tableContainer.querySelector('table');
            if (!table) return;
            const row = table.querySelector(`tr[data-row-id="${rowId}"]`);
            if (!row) return;
            const cell = row.querySelector(`td[data-field="${field}"]`);
            if (cell) {
              cell.classList.add('cell-selected'); // Marcarla como seleccionada visualmente
              currentSelectedCell = cell; // Actualizar la celda seleccionada actual
            }
          }, 0);
        }
      }
      e.preventDefault(); // Evitar acción por defecto
    }
  });

  // --- INYECTAR ESTILOS CSS (para selección, botones, inputs de edición) ---
  const style = document.createElement('style');
  style.textContent = `
    .cell-selected { outline: 2px solid #0d6efd !important; outline-offset: -2px; }
    .action-btn { background: none; border: none; cursor: pointer; font-size: 1.2rem; padding: 0 5px; color: #fff; }
    .action-btn:hover { color: #fdc100; }
    .editing-input { /* Estilo base para inputs/selects cuando se edita */
      border: none; padding: 0; margin: 0; width: 100%; height: 100%;
      position: absolute; left: 0; top: 0; font-size: inherit; font-family: inherit;
      color: #fff !important; background: #232323 !important; box-sizing: border-box;
      padding: 6px 8px; /* Mismo padding que las celdas TD */
    }
    .editing-input:focus { outline: 2px solid #facc15; }
    #mass-matches-table th, #mass-matches-table td { background: #18191b !important; color: #fff !important; border: 1px solid #333 !important; vertical-align: middle; }
    #mass-matches-table thead th { background: #111 !important; color: #fff !important; font-weight: 700; text-transform: uppercase; padding: 8px; font-size: 8pt;}
    #mass-matches-table td { font-size: 10pt; padding: 6px 8px; }
    #mass-matches-table td[data-field] { position: relative; } /* Para que el input absoluto funcione */
  `;
  document.head.appendChild(style);

  // --- LÓGICA DE COPIADO DE TABLA (no usada activamente ahora, pero puede servir) ---
  async function copyTableToClipboard() { /* ... código para copiar como TSV ... */ }

  // --- CREAR ELEMENTOS DEL DOM (Contenedor de tabla y botones si no existen) ---
  const headerContainer = document.createElement('div');
  headerContainer.className = 'flex justify-end p-4'; // Usar Tailwind para estilo

  // Botón "Añadir Fila"
  if (!btnAddRow) { // Si el botón no fue pasado como parámetro, lo creamos
      btnAddRow = document.createElement('button');
      btnAddRow.innerHTML = `✚ Crear Partido`;
      // Usar clases de Tailwind y/o estilos directos
      btnAddRow.className = 'btn btn-success ml-2'; // Asumiendo que tienes btn y btn-success en styles.css
      headerContainer.appendChild(btnAddRow);
  }
  // Botón "Guardar Partidos"
  if (!btnSave) { // Si no fue pasado, lo creamos
      btnSave = document.createElement('button');
      btnSave.innerHTML = `💾 Guardar Partidos`;
      btnSave.className = 'btn btn-info ml-2'; // Asumiendo btn y btn-info
      headerContainer.appendChild(btnSave);
  }
  // Añadir el contenedor de botones al principio del contenedor principal
  container.prepend(headerContainer);

  // --- OPCIONES CACHEADAS (para los selects de edición) ---
  // Filtrar torneos de equipos y generar HTML para el select
  const individualTournaments = allTournaments.filter(t => t.category && t.category.name !== 'Equipos');
  const tournamentOptionsHTML = `<option value="">Seleccionar Torneo</option>` +
                                individualTournaments.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  // HTML para selects de Sede y Cancha
  const sedeOptionsHTML = `<option value="">Seleccionar</option>` + ['Funes', 'Centro'].map(s => `<option value="${s}">${s}</option>`).join('');
  const canchaOptionsHTML = `<option value="">Seleccionar</option>` + [1, 2, 3, 4, 5, 6].map(n => `<option value="Cancha ${n}">Cancha ${n}</option>`).join('');

  // Contenedor donde irá la tabla
  const tableContainer = document.createElement('div');
  tableContainer.className = 'overflow-x-auto'; // Para scroll horizontal si no cabe

  // Si ya existía una tabla vieja, la quitamos
  const existingTable = container.querySelector('#mass-matches-table');
  if(existingTable) existingTable.parentElement.remove();
  // Añadimos el contenedor de la nueva tabla
  container.appendChild(tableContainer);

  // --- RENDERIZADO Y ACTUALIZACIÓN DEL DOM ---
  /** Dibuja la tabla HTML completa basada en el array `matchesData` */
  function renderTable() {
    tableContainer.innerHTML = `
      <table class="w-full border-collapse text-sm" id="mass-matches-table" style="table-layout:fixed;">
        <colgroup>
            <col style="width: 18%"><col style="width: 14%"><col style="width: 14%">
            <col style="width: 10%"><col style="width: 8%"><col style="width: 10%">
            <col style="width: 10%"><col style="width: 12%">
        </colgroup>
        <thead class="bg-gray-100 sticky top-0 z-10">
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
    // Añadir listeners de Drag & Drop a las celdas después de renderizar
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
      // Añadir listeners para Drag & Drop de filas (no implementado en el código original, opcional)
      // const trs = table.querySelectorAll('tbody tr');
      // trs.forEach(row => { /* ... listeners para dragstart, dragover, drop, dragend en TR ... */ });
    }
    updateSaveButton(); // Actualizar el texto y estado del botón Guardar
  }

  // --- DRAG AND DROP DE CELDAS (COPIAR/PEGAR, SIEMPRE ACTIVO) ---
  let dragCellInfo = null; // Guarda info de la celda que se está arrastrando {rowId, field, value}
  /** Al empezar a arrastrar una celda TD */
  function handleCellDragStart(e) {
    const field = this.dataset.field;
    const rowId = this.parentElement.dataset.rowId;
    let value = '';
    const editingInput = this.querySelector('.editing-input'); // ¿Está en modo edición?
    if (editingInput) {
      value = editingInput.value; // Tomar valor del input/select
    } else {
      const match = matchesData.find(m => m.clientId == rowId); // Buscar en el array de datos
      value = match ? (match[field] ?? '') : ''; // Usar valor del estado, ?? '' para evitar undefined/null
    }
    dragCellInfo = { rowId, field, value }; // Guardar info
    this.style.opacity = '0.5'; // Hacerla semitransparente
  }
  /** Cuando se mueve el cursor sobre otra celda TD */
  function handleCellDragOver(e) {
    e.preventDefault(); // Necesario para permitir el drop
    // Si estamos arrastrando y la columna es la misma, mostrar borde punteado
    if (dragCellInfo && this.dataset.field === dragCellInfo.field) {
      this.style.border = '2px dashed #0d6efd';
    }
  }
  /** Al soltar la celda arrastrada sobre otra celda TD */
  function handleCellDrop(e) {
    e.preventDefault();
    this.style.border = ''; // Quitar borde punteado
    if (!dragCellInfo) return;
    // Si se suelta en la misma columna pero diferente fila
    if (this.dataset.field === dragCellInfo.field && this.parentElement.dataset.rowId !== dragCellInfo.rowId) {
      const rowIdTarget = this.parentElement.dataset.rowId; // ID de la fila destino
      const matchIdxTo = matchesData.findIndex(m => m.clientId == rowIdTarget); // Índice en el array
      if (matchIdxTo > -1) {
        const field = this.dataset.field;
        matchesData[matchIdxTo][field] = dragCellInfo.value; // Pegar el valor guardado
        renderTable(); // Redibujar
      }
    }
    dragCellInfo = null; // Limpiar info de arrastre
  }
  /** Al terminar el arrastre (se suelte donde se suelte) */
  function handleCellDragEnd(e) {
    this.style.opacity = ''; // Restaurar opacidad
    this.style.border = ''; // Quitar borde si quedó
    // dragCellInfo = null; // Limpiar info (handleCellDrop ya lo hace)
  }

  // --- DRAG AND DROP DE FILAS (Opcional, no implementado completamente) ---
  let dragSrcRowId = null; // Guarda el ID de la fila que se arrastra
  function handleRowDragStart(e) { /* ... */ }
  function handleRowDragOver(e) { /* ... */ }
  function handleRowDrop(e) { /* ... */ }
  function handleRowDragEnd(e) { /* ... */ }

  /** Genera el HTML para una fila <tr> de la tabla */
  function renderRow(match) {
    const tournamentName = allTournaments.find(t => t.id == match.tournament_id)?.name || '---';
    const player1Name = allPlayers.find(p => p.id == match.player1_id)?.name || '---';
    const player2Name = allPlayers.find(p => p.id == match.player2_id)?.name || '---';
    const cellStyle = "overflow:hidden; white-space:nowrap; text-overflow:ellipsis;";
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

  // --- LÓGICA DE EDICIÓN INLINE (al hacer doble clic) ---
  /** Convierte una celda TD en editable (muestra input o select) */
  function makeCellEditable(cell) {
    if (cell.classList.contains('is-editing') || activeEditingCell === cell) return;
    if (activeEditingCell) closeActiveEditor(false);

    activeEditingCell = cell;
    cell.classList.add('is-editing');

    const field = cell.dataset.field;
    const rowId = cell.parentElement.dataset.rowId;
    const match = matchesData.find(m => m.clientId == rowId);
    if (!match) { activeEditingCell = null; return; }

    const originalContent = cell.innerHTML;
    cell.dataset.originalContent = originalContent;
    const originalValue = match[field] ?? '';
    cell.innerHTML = '';

    let inputElement;

    const saveChange = (newValueFromEvent = null) => {
      // (Función saveChange sin cambios respecto a la versión anterior)
      // ... [Incluye validaciones y actualización de estado/UI] ...
       if (saveChangeCalled) return;
       saveChangeCalled = true;
       if (!cell.classList.contains('is-editing') && activeEditingCell !== cell) { activeEditingCell = null; return; } // Chequeo adicional por si acaso

       const newValue = newValueFromEvent ?? inputElement.value;
       const matchIndex = matchesData.findIndex(m => m.clientId == rowId);

       if (matchIndex > -1) {
         if (field === 'player1_id' && newValue && newValue == matchesData[matchIndex].player2_id) { alert("Jugador 1 no puede ser igual a Jugador 2."); cell.innerHTML = originalContent; cell.classList.remove('is-editing'); activeEditingCell = null; return; }
         if (field === 'player2_id' && newValue && newValue == matchesData[matchIndex].player1_id) { alert("Jugador 2 no puede ser igual a Jugador 1."); cell.innerHTML = originalContent; cell.classList.remove('is-editing'); activeEditingCell = null; return; }
         if (field === 'match_date' && newValue && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(newValue)) { alert("Formato fecha inválido (DD/MM/AAAA)."); cell.innerHTML = originalContent; cell.classList.remove('is-editing'); activeEditingCell = null; return; }

         let valueToSave = newValue;
         if (field.endsWith('_id')) { valueToSave = newValue ? parseInt(newValue, 10) : null; if (isNaN(valueToSave)) valueToSave = null; }
         else if (field === 'match_date' && !newValue) { valueToSave = null; }

         matchesData[matchIndex][field] = valueToSave;

         if (field === 'tournament_id' && valueToSave !== originalValue) {
           matchesData[matchIndex].player1_id = null; matchesData[matchIndex].player2_id = null;
           renderTable(); activeEditingCell = null; return;
         }

         let displayValue = '';
         if (inputElement.tagName === 'SELECT') { displayValue = inputElement.selectedIndex > 0 ? inputElement.options[inputElement.selectedIndex].text : '---'; }
         else { displayValue = valueToSave || '---'; }
         cell.innerHTML = displayValue;

       } else { cell.innerHTML = originalContent; }
       cell.classList.remove('is-editing'); activeEditingCell = null;
    };
    let saveChangeCalled = false; // Mover el flag aquí

    switch (field) {
      case 'tournament_id': case 'player1_id': case 'player2_id': case 'sede': case 'cancha': case 'match_time':
        inputElement = document.createElement('select');
        let optionsHTML = '';
        if (field === 'tournament_id') optionsHTML = tournamentOptionsHTML;
        else if (field === 'player1_id' || field === 'player2_id') {
          const tournamentId = Number(match.tournament_id);
          const playerIdsInTournament = tournamentPlayersMap.get(tournamentId) || new Set();
          const playersInTournament = allPlayers.filter(p => playerIdsInTournament.has(p.id));
          const opponentId = (field === 'player1_id') ? match.player2_id : match.player1_id;
          const availablePlayers = opponentId ? playersInTournament.filter(p => p.id != opponentId) : playersInTournament;
          optionsHTML = '<option value="">Seleccionar</option>' + availablePlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        }
        else if (field === 'sede') optionsHTML = sedeOptionsHTML;
        else if (field === 'cancha') optionsHTML = canchaOptionsHTML;
        else if (field === 'match_time') {
          optionsHTML = '<option value="">Seleccionar</option>';
          for (let h = 8; h <= 22; h++) { for (let m = 0; m < 60; m += 15) {
              const value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
              optionsHTML += `<option value="${value}">${value}</option>`; } }
        }
        inputElement.innerHTML = optionsHTML; inputElement.value = originalValue ?? '';
        break;
      case 'match_date':
        inputElement = document.createElement('input'); inputElement.type = 'text'; inputElement.placeholder = 'DD/MM/AAAA';
        inputElement.value = originalValue ?? ''; inputElement.className = 'editing-input';
        inputElement.style.position = 'static'; inputElement.style.color = '#333'; inputElement.style.background = '#fff';
        cell.appendChild(inputElement);
        const openCalendar = () => { flatpickr(inputElement, { dateFormat: 'd/m/Y', allowInput: true, defaultDate: originalValue || 'today',
            onClose: (sd, ds, inst) => saveChange(inst.input.value) }).open(); };
        if (!window.flatpickr) {
          const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css'; document.head.appendChild(link);
          const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/flatpickr'; script.onload = openCalendar; document.body.appendChild(script);
        } else { openCalendar(); }
        return; // Salir, Flatpickr maneja el guardado
      default:
        cell.innerHTML = originalContent; cell.classList.remove('is-editing'); activeEditingCell = null; return;
    }

    inputElement.className = 'editing-input'; cell.appendChild(inputElement); inputElement.focus();
    if (inputElement.tagName === 'SELECT' && typeof inputElement.showPicker === 'function') { try { inputElement.showPicker(); } catch(e) {} }
    else if (inputElement.tagName === 'SELECT') { const event = new MouseEvent('mousedown'); inputElement.dispatchEvent(event); }

    inputElement.addEventListener('change', () => saveChange());
    inputElement.addEventListener('blur', () => setTimeout(() => saveChange(), 100));
    inputElement.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); saveChange(); }
      else if (e.key === 'Escape') { closeActiveEditor(false); }
      else if (e.key === 'Tab') { saveChange(); } // Guardar antes de que el blur quite el input
    });
  } // Fin makeCellEditable

   // --- OPERACIONES DE FILA ---
   function addRow() { /* (sin cambios) */ }
   function duplicateRow(rowId) { /* (sin cambios) */ }
   function deleteRow(rowId) { /* (sin cambios) */ }
   function updateSaveButton() { /* (sin cambios) */ }
   // --- Cuerpos Operaciones de fila ---
    function addRow() { uniqueIdCounter++; matchesData.push({ clientId: `new_${Date.now()}_${uniqueIdCounter}`, tournament_id: null, player1_id: null, player2_id: null, match_date: null, match_time: null, sede: null, cancha: null }); renderTable(); }
    function duplicateRow(rowId) { const originalMatch = matchesData.find(m => m.clientId == rowId); if (!originalMatch) return; uniqueIdCounter++; const newMatch = { ...originalMatch, clientId: `new_${Date.now()}_${uniqueIdCounter}` }; const originalIndex = matchesData.findIndex(m => m.clientId == rowId); matchesData.splice(originalIndex + 1, 0, newMatch); renderTable(); }
    function deleteRow(rowId) { matchesData = matchesData.filter(m => m.clientId != rowId); renderTable(); }
    function updateSaveButton() { if(btnSave) { const count = matchesData.length; btnSave.innerHTML = `💾 Guardar ${count} Partido${count !== 1 ? 's' : ''}`; btnSave.disabled = count === 0; } }
   // --- Fin cuerpos ---

  // --- GUARDADO FINAL EN BASE DE DATOS ---
  async function saveAllMatches() { /* (sin cambios) */ }
   // --- Cuerpo saveAllMatches ---
    async function saveAllMatches() {
        const matchesToInsert = []; let validationFailed = false;
        for (const match of matchesData) {
            if (!match.tournament_id || !match.player1_id || !match.player2_id || !match.match_date || !match.sede || !match.cancha) { alert(`Fila incompleta (ID: ${match.clientId}). Revisar.`); validationFailed = true; break; }
            if (match.player1_id === match.player2_id) { alert(`Jugador repetido (ID: ${match.clientId}).`); validationFailed = true; break; }
             if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(match.match_date)) { alert(`Formato fecha inválido (ID: ${match.clientId}). Usar DD/MM/AAAA.`); validationFailed = true; break; }

            const [d, m, y] = match.match_date.split('/'); const formattedDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            const tournament = allTournaments.find(t => t.id == match.tournament_id); const categoryId = tournament?.category?.id || null;
            const location = `${match.sede} - ${match.cancha}`;
            matchesToInsert.push({ tournament_id: match.tournament_id, category_id: categoryId, player1_id: match.player1_id, player2_id: match.player2_id, match_date: formattedDate, match_time: match.match_time || null, location: location });
        }
        if (validationFailed || matchesToInsert.length === 0) { if (!validationFailed && matchesToInsert.length === 0) alert("Nada para guardar."); return; }
        btnSave.disabled = true; btnSave.textContent = 'Guardando...';
        const { error } = await supabase.from('matches').insert(matchesToInsert);
        if (error) { alert('Error: ' + error.message); btnSave.disabled = false; updateSaveButton(); }
        else { alert(`${matchesToInsert.length} partidos guardados.`); matchesData = []; renderTable(); sessionStorage.removeItem('matchesToPreload'); if (typeof loadInitialData === 'function') { try { await loadInitialData(); } catch(err) {} } }
    }
   // --- Fin cuerpo ---


  // --- EVENT LISTENERS ---
  tableContainer.addEventListener('click', (e) => {
    const cell = e.target.closest('td[data-field]');
    if (cell && !cell.classList.contains('is-editing')) {
      if (currentSelectedCell && currentSelectedCell !== cell) currentSelectedCell.classList.remove('cell-selected');
      cell.classList.add('cell-selected'); currentSelectedCell = cell;
    }
    const button = e.target.closest('button.action-btn');
    if (button) { const action = button.dataset.action; const rowId = button.closest('tr').dataset.rowId;
      if (action === 'duplicate') duplicateRow(rowId); if (action === 'delete') deleteRow(rowId); }
  });
  tableContainer.addEventListener('dblclick', (e) => {
    const cell = e.target.closest('td[data-field]'); if (cell) makeCellEditable(cell);
  });
  document.addEventListener('click', (e) => { // Clic afuera
      if (activeEditingCell && !activeEditingCell.contains(e.target) && !e.target.closest('.flatpickr-calendar')) {
          closeActiveEditor(true); // Intentar guardar al hacer clic afuera
      }
  }, true);

  btnAddRow.addEventListener('click', addRow);
  btnSave.addEventListener('click', saveAllMatches);

  // --- INICIALIZACIÓN ---
  const preloadedData = sessionStorage.getItem('matchesToPreload');
  if (preloadedData) {
      try { matchesData = JSON.parse(preloadedData); console.log("Datos cargados:", matchesData); }
      catch (e) { console.error("Error parseando:", e); matchesData = []; }
  } else { matchesData = []; }

  renderTable();
  if (matchesData.length === 0) addRow(); else updateSaveButton();

  // --- Función closeActiveEditor (revisada) ---
  function closeActiveEditor(save = false) {
    if (!activeEditingCell) return;
    const input = activeEditingCell.querySelector('.editing-input');
    let needsRestoration = !save; // Por defecto, restaurar si no se guarda

    if (input) {
        // Si es flatpickr, él maneja su cierre y guardado (onClose)
        if (input._flatpickr) {
             // Si se cancela (Escape), flatpickr no llama onClose, así que forzamos cierre y restauración
             if(!save) {
                  input._flatpickr.close();
                  // No destruir aquí, puede causar problemas si se reabre rápido
             } else {
                 // Si se guarda, onClose llamará a saveChange, no necesitamos hacer nada más aquí
                 needsRestoration = false; // No restaurar, ya se guardó o se guardará
             }
        } else if (save) {
             saveChange(); // Guardar para inputs/selects normales
             needsRestoration = false; // No restaurar después de guardar
        }
    }

    // Restaurar contenido si es necesario
    if (needsRestoration && activeEditingCell.dataset.originalContent) {
        activeEditingCell.innerHTML = activeEditingCell.dataset.originalContent;
        delete activeEditingCell.dataset.originalContent;
    } else if (needsRestoration) { // Fallback si no hay originalContent
         const field = activeEditingCell.dataset.field;
         const rowId = activeEditingCell.closest('tr')?.dataset.matchId; // Corrección: debería ser rowId de mass-loader
         const rowIdCorrecto = activeEditingCell.parentElement?.dataset.rowId;
         const match = matchesData.find(m => m.clientId === rowIdCorrecto);
         if(match && field) {
             let displayValue = match[field] ?? '---';
             if(field === 'player1_id' || field === 'player2_id') displayValue = allPlayers.find(p => p.id == match[field])?.name || '---';
             else if (field === 'tournament_id') displayValue = allTournaments.find(t=> t.id == match[field])?.name || '---';
             activeEditingCell.innerHTML = displayValue;
         } else { activeEditingCell.innerHTML = '---'; }
    }

    if (activeEditingCell) activeEditingCell.classList.remove('is-editing');
    activeEditingCell = null;
  } // Fin closeActiveEditor

} // Fin setupMassMatchLoader