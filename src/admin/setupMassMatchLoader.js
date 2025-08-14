// mass-match-loader.js
import { supabase } from '../common/supabase.js';

export function setupMassMatchLoader({
  container,
  btnAddRow, // Botón para añadir nueva fila
  btnSave,   // Botón para guardar todo
  allTournaments,
  allPlayers,
  tournamentPlayersMap,
  loadInitialData
}) {

  // --- ESTADO CENTRAL ---
  // Guardamos los datos de los partidos en un array de objetos.
  // La tabla es solo una representación visual de este estado.
  let matchesData = [];
  let uniqueIdCounter = 0;

  // --- OPCIONES CACHEADAS ---
  // Generamos las opciones una sola vez para mejorar el rendimiento.
  const tournamentOptions = `<option value="">Seleccionar</option>` + allTournaments.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  const sedeOptions = ['Funes', 'Centro'].map(s => `<option value="${s}">${s}</option>`).join('');
  const canchaOptions = [1, 2, 3, 4, 5, 6].map(n => `<option value="Cancha ${n}">Cancha ${n}</option>`).join('');
  
  // Contenedor de la tabla
  const tableContainer = document.createElement('div');
  tableContainer.className = 'overflow-x-auto';
  container.appendChild(tableContainer);

  // --- RENDERIZADO DE LA TABLA ---
  function renderTable() {
    tableContainer.innerHTML = `
      <table class="w-full border-collapse text-sm" id="matches-table">
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
    // Buscamos los nombres a partir de los IDs para mostrarlos en la tabla
    const tournamentName = allTournaments.find(t => t.id == match.tournament_id)?.name || '---';
    const player1Name = allPlayers.find(p => p.id == match.player1_id)?.name || '---';
    const player2Name = allPlayers.find(p => p.id == match.player2_id)?.name || '---';

    return `
      <tr data-id="${match.clientId}">
        <td class="p-2 border" data-field="tournament_id" draggable="true">${tournamentName}</td>
        <td class="p-2 border" data-field="player1_id" draggable="true">${player1Name}</td>
        <td class="p-2 border" data-field="player2_id" draggable="true">${player2Name}</td>
        <td class="p-2 border" data-field="match_date" draggable="true">${match.match_date || '---'}</td>
        <td class="p-2 border" data-field="match_time" draggable="true">${match.match_time || '---'}</td>
        <td class="p-2 border" data-field="sede" draggable="true">${match.sede || '---'}</td>
        <td class="p-2 border" data-field="cancha" draggable="true">${match.cancha || '---'}</td>
        <td class="p-2 border text-center">
          <button class="action-btn" data-action="duplicate" title="Duplicar Fila">📋</button>
          <button class="action-btn" data-action="delete" title="Eliminar Fila">🗑️</button>
        </td>
      </tr>
    `;
  }

  // --- LÓGICA DE EDICIÓN INLINE ---
  function makeCellEditable(cell) {
    const field = cell.dataset.field;
    const rowId = cell.parentElement.dataset.id;
    const match = matchesData.find(m => m.clientId == rowId);
    if (!match) return;

    const originalContent = cell.innerHTML;
    let input = '';

    switch (field) {
      case 'tournament_id':
        input = `<select class="w-full">${tournamentOptions}</select>`;
        break;
      case 'player1_id':
      case 'player2_id':
        const playerIds = tournamentPlayersMap.get(Number(match.tournament_id)) || new Set();
        const players = allPlayers.filter(p => playerIds.has(p.id));
        const playerOptions = '<option value="">Seleccionar</option>' + players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        input = `<select class="w-full">${playerOptions}</select>`;
        break;
      case 'match_date':
        input = `<input type="text" class="w-full" placeholder="dd/mm/aaaa" />`;
        break;
      case 'match_time':
        input = `<input type="time" class="w-full" />`;
        break;
      case 'sede':
        input = `<select class="w-full">${sedeOptions}</select>`;
        break;
      case 'cancha':
        input = `<select class="w-full">${canchaOptions}</select>`;
        break;
      default:
        return;
    }

    cell.innerHTML = input;
    const inputElement = cell.firstElementChild;
    inputElement.focus();

    // Inicializar Flatpickr para la fecha
    if (field === 'match_date' && window.flatpickr) {
      flatpickr(inputElement, { dateFormat: 'd/m/Y', allowInput: true, defaultDate: match.match_date });
    } else {
        // Para selects, pre-seleccionar el valor actual
        if(inputElement.tagName === 'SELECT') {
            const valueToSelect = field === 'cancha' || field === 'sede' ? match[field] : match[field];
            if (valueToSelect) inputElement.value = valueToSelect;
        } else {
            inputElement.value = match[field] || '';
        }
    }


    const saveChange = () => {
      updateState(rowId, field, inputElement.value);
      renderTable(); // Re-renderizar toda la tabla para mantener la consistencia
    };

    inputElement.addEventListener('blur', saveChange);
    inputElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        inputElement.blur();
      } else if (e.key === 'Escape') {
        cell.innerHTML = originalContent; // Cancelar edición
        inputElement.removeEventListener('blur', saveChange);
      }
    });
  }

  // --- MANEJO DE ESTADO ---
  function updateState(rowId, field, value) {
    const match = matchesData.find(m => m.clientId == rowId);
    if (!match) return;
    
    match[field] = value;

    // Si cambia el torneo, reseteamos los jugadores
    if (field === 'tournament_id') {
      match.player1_id = null;
      match.player2_id = null;
    }
  }

  // --- OPERACIONES DE FILA ---
  function addRow() {
    uniqueIdCounter++;
    matchesData.push({
      clientId: `new_${Date.now()}_${uniqueIdCounter}`, // ID único para el cliente
      tournament_id: null,
      player1_id: null,
      player2_id: null,
      match_date: null,
      match_time: null,
      sede: 'Funes', // Valor por defecto
      cancha: 'Cancha 1', // Valor por defecto
    });
    renderTable();
  }

  function duplicateRow(rowId) {
    const originalMatch = matchesData.find(m => m.clientId == rowId);
    if (!originalMatch) return;
    
    uniqueIdCounter++;
    const newMatch = { ...originalMatch, clientId: `new_${Date.now()}_${uniqueIdCounter}` };
    const originalIndex = matchesData.findIndex(m => m.clientId == rowId);
    matchesData.splice(originalIndex + 1, 0, newMatch); // Insertar justo debajo
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

  // --- LÓGICA DE DRAG & DROP ---
  function handleDragAndDrop(tableBody) {
    let draggedCell = null;

    tableBody.addEventListener('dragstart', (e) => {
      if (e.target.tagName === 'TD') {
        draggedCell = e.target;
        e.dataTransfer.setData('text/plain', draggedCell.dataset.field);
        setTimeout(() => e.target.classList.add('opacity-50'), 0);
      }
    });

    tableBody.addEventListener('dragend', (e) => {
      if(e.target.tagName === 'TD') {
        e.target.classList.remove('opacity-50');
      }
    });

    tableBody.addEventListener('dragover', (e) => {
      const targetCell = e.target.closest('td');
      if (targetCell && draggedCell && targetCell.dataset.field === draggedCell.dataset.field && targetCell !== draggedCell) {
        e.preventDefault(); // Permitir el drop
        targetCell.classList.add('bg-green-100');
      }
    });
    
    tableBody.addEventListener('dragleave', (e) => {
        if(e.target.tagName === 'TD'){
            e.target.classList.remove('bg-green-100');
        }
    });

    tableBody.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetCell = e.target.closest('td');
      if (targetCell && draggedCell) {
        targetCell.classList.remove('bg-green-100');
        const sourceRowId = draggedCell.parentElement.dataset.id;
        const targetRowId = targetCell.parentElement.dataset.id;
        const field = draggedCell.dataset.field;
        const sourceMatch = matchesData.find(m => m.clientId == sourceRowId);
        
        if (sourceMatch) {
          updateState(targetRowId, field, sourceMatch[field]);
          // Si arrastramos un torneo, también reseteamos los jugadores en la fila de destino
           if (field === 'tournament_id') {
              updateState(targetRowId, 'player1_id', null);
              updateState(targetRowId, 'player2_id', null);
           }
          renderTable();
        }
      }
      draggedCell = null;
    });
  }

  // --- GUARDAR EN SUPABASE ---
  async function saveAllMatches() {
    const matchesToInsert = [];
    for (const match of matchesData) {
      // Validación
      if (!match.tournament_id || !match.player1_id || !match.player2_id || !match.match_date) {
        alert(`Fila incompleta (ID: ${match.clientId}). Por favor, revisa que todas las filas tengan Torneo, Jugadores y Fecha.`);
        return;
      }
      if (match.player1_id === match.player2_id) {
         alert(`En la fila (ID: ${match.clientId}), el Jugador 1 no puede ser igual al Jugador 2.`);
        return;
      }

      // Preparar datos para Supabase
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

    if (matchesToInsert.length === 0) {
      alert("No hay partidos para guardar.");
      return;
    }

    btnSave.disabled = true;
    btnSave.textContent = 'Guardando...';

    const { error } = await supabase.from('matches').insert(matchesToInsert);

    if (error) {
      alert('Error al guardar los partidos: ' + error.message);
      btnSave.disabled = false;
      updateSaveButton();
    } else {
      alert(`${matchesToInsert.length} partidos guardados con éxito.`);
      matchesData = []; // Limpiar el estado
      renderTable(); // Re-renderizar la tabla vacía
      if (typeof loadInitialData === 'function') await loadInitialData();
    }
  }


  // --- INICIALIZACIÓN Y EVENT LISTENERS ---
  
  // Usamos delegación de eventos en el cuerpo de la tabla
  tableContainer.addEventListener('dblclick', (e) => {
    if (e.target.tagName === 'TD' && e.target.dataset.field) {
      makeCellEditable(e.target);
    }
  });

  tableContainer.addEventListener('click', (e) => {
    const button = e.target.closest('button.action-btn');
    if (button) {
      const action = button.dataset.action;
      const rowId = button.closest('tr').dataset.id;
      if (action === 'duplicate') duplicateRow(rowId);
      if (action === 'delete') deleteRow(rowId);
    }
  });

  // Delegación para Drag & Drop
  handleDragAndDrop(tableContainer);

  btnAddRow.addEventListener('click', addRow);
  btnSave.addEventListener('click', saveAllMatches);
  
  // Renderizado inicial
  renderTable();
}