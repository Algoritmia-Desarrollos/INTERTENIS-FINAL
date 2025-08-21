import { supabase } from '../common/supabase.js';

export function setupDoublesMatchLoader({
  container,
  allTournaments,
  allPlayers,
  allTeams,
  loadInitialData
}) {

  let matchesData = [];
  let uniqueIdCounter = 0;

  // --- ESTILOS CSS PARA LA TABLA ---
  const style = document.createElement('style');
  style.textContent = `
    .doubles-loader-table th, .doubles-loader-table td {
      background: #18191b !important;
      color: #fff !important;
      border: 1px solid #333 !important;
      font-size: 9pt; /* Reducimos un poco el tamaño de la fuente */
      padding: 4px; /* Ajustamos el padding */
    }
    .doubles-loader-table thead th {
      background: #111 !important;
      font-weight: 700;
      text-transform: uppercase;
      padding: 8px 4px;
      font-size: 8pt; /* Letra de encabezado más chica */
    }
    .doubles-loader-table select, .doubles-loader-table input {
      background-color: #374151;
      border-color: #4b5563;
      color: #e5e7eb;
      width: 100%;
      border-radius: 4px;
      height: 36px; /* Altura más compacta */
      border: 1px solid #4b5563;
      padding: 0 6px;
    }
    .action-btn {
      background: none; border: none; cursor: pointer;
      font-size: 1.1rem; padding: 0 4px; color: #fff;
    }
    .action-btn:hover { color: #fdc100; }
  `;
  document.head.appendChild(style);

  // --- OPCIONES PARA LOS SELECTS ---
  const tournamentOptionsHTML = `<option value="">Seleccionar Torneo</option>` + allTournaments.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  const teamOptionsHTML = `<option value="">Seleccionar Equipo</option>` + allTeams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  const sedeOptionsHTML = `<option value="">Sede</option>` + ['Funes', 'Centro'].map(s => `<option value="${s}">${s}</option>`).join('');
  const canchaOptionsHTML = `<option value="">Cancha</option>` + [1, 2, 3, 4, 5, 6].map(n => `<option value="Cancha ${n}">Cancha ${n}</option>`).join('');

  // --- ESTRUCTURA HTML PRINCIPAL ---
  const tableContainer = document.createElement('div');
  tableContainer.className = 'overflow-x-auto';
  
  const headerContainer = document.createElement('div');
  headerContainer.className = 'flex justify-between items-center mt-4 pt-4 border-t border-gray-700';
  headerContainer.innerHTML = `
      <button id="btn-add-doubles-row" class="btn btn-secondary">
          <span class="material-icons">add</span> Añadir Fila
      </button>
      <button id="btn-save-all-doubles" class="btn btn-primary">
          <span class="material-icons">save</span> Guardar Partidos
      </button>
  `;
  container.innerHTML = '<h2>Cargador Masivo de Partidos de Dobles</h2>';
  container.appendChild(tableContainer);
  container.appendChild(headerContainer);

  // --- RENDERIZADO DE LA TABLA ---
  function renderTable() {
    tableContainer.innerHTML = `
      <table class="w-full border-collapse text-sm doubles-loader-table" style="table-layout:fixed;">
        <colgroup>
            <col style="width: 14%"><col style="width: 10%"><col style="width: 12%"><col style="width: 12%">
            <col style="width: 10%"><col style="width: 12%"><col style="width: 12%"><col style="width: 8%">
        </colgroup>
        <thead>
          <tr>
            <th class="p-2">Torneo</th><th class="p-2">Equipo A</th><th class="p-2">Jugador A1</th><th class="p-2">Jugador A2</th>
            <th class="p-2">Equipo B</th><th class="p-2">Jugador B1</th><th class="p-2">Jugador B2</th>
            <th class="p-2">Fecha</th><th class="p-2">Hora</th><th class="p-2">Sede</th><th class="p-2">Cancha</th>
            <th class="p-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${matchesData.map(renderRow).join('')}
        </tbody>
      </table>
    `;
    updateSaveButton();
    tableContainer.querySelectorAll('.date-input').forEach(input => {
        if (!input._flatpickr) {
            flatpickr(input, { dateFormat: "d/m/Y", allowInput: true });
        }
    });
  }

  function getPlayerOptions(teamId, excludePlayerId = null) {
      if (!teamId) return '<option value="">Seleccione Equipo</option>';
      let playersInTeam = allPlayers.filter(p => p.team_id == teamId);
      if (excludePlayerId) {
          playersInTeam = playersInTeam.filter(p => p.id != excludePlayerId);
      }
      return '<option value="">Seleccionar Jugador</option>' + playersInTeam.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  }

  function renderRow(match) {
    const playerA1Options = getPlayerOptions(match.teamA_id);
    const playerA2Options = getPlayerOptions(match.teamA_id, match.playerA1_id);
    const playerB1Options = getPlayerOptions(match.teamB_id);
    const playerB2Options = getPlayerOptions(match.teamB_id, match.playerB1_id);

    return `
      <tr data-row-id="${match.clientId}">
        <td><select data-field="tournament_id" class="input-field">${tournamentOptionsHTML}</select></td>
        <td><select data-field="teamA_id" class="input-field">${teamOptionsHTML}</select></td>
        <td><select data-field="playerA1_id" class="input-field">${playerA1Options}</select></td>
        <td><select data-field="playerA2_id" class="input-field">${playerA2Options}</select></td>
        <td><select data-field="teamB_id" class="input-field">${teamOptionsHTML}</select></td>
        <td><select data-field="playerB1_id" class="input-field">${playerB1Options}</select></td>
        <td><select data-field="playerB2_id" class="input-field">${playerB2Options}</select></td>
        <td><input type="text" data-field="match_date" class="date-input" placeholder="dd/mm/aaaa"></td>
        <td><input type="time" data-field="match_time" class="input-field"></td>
        <td><select data-field="sede" class="input-field">${sedeOptionsHTML}</select></td>
        <td><select data-field="cancha" class="input-field">${canchaOptionsHTML}</select></td>
        <td class="text-center">
            <button class="action-btn" data-action="delete" title="Eliminar Fila">🗑️</button>
        </td>
      </tr>
    `;
  }
  
  // --- LÓGICA DE FILAS Y GUARDADO ---
  function addRow() { 
      uniqueIdCounter++; 
      matchesData.push({ clientId: `new_${Date.now()}_${uniqueIdCounter}` }); 
      renderTable(); 
  }

  function deleteRow(rowId) { 
      matchesData = matchesData.filter(m => m.clientId != rowId); 
      renderTable(); 
  }

  function updateSaveButton() {
      const btn = document.getElementById('btn-save-all-doubles');
      if(btn) { 
          btn.innerHTML = `<span class="material-icons">save</span> Guardar ${matchesData.length} Partidos`; 
          btn.disabled = matchesData.length === 0; 
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
          
          const [d, m, y] = match.match_date.split('/');
          if (!y || !m || !d) {
              alert('Formato de fecha inválido. Utiliza dd/mm/aaaa.');
              return;
          }
          const isoDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          const tournament = allTournaments.find(t => t.id == match.tournament_id);

          matchesToInsert.push({ 
              tournament_id: match.tournament_id,
              category_id: tournament?.category?.id,
              player1_id: match.playerA1_id,
              player3_id: match.playerA2_id,
              player2_id: match.playerB1_id,
              player4_id: match.playerB2_id,
              match_date: isoDate,
              match_time: match.match_time || null,
              location: `${match.sede} - ${match.cancha}`,
              status: 'programado'
          }); 
      } 
      
      if (matchesToInsert.length === 0) return; 

      const btn = document.getElementById('btn-save-all-doubles');
      btn.disabled = true; 
      btn.textContent = 'Guardando...'; 

      const { error } = await supabase.from('matches').insert(matchesToInsert); 
      if (error) { 
          alert('Error al guardar: ' + error.message); 
          btn.disabled = false; 
          updateSaveButton(); 
      } else { 
          alert(`${matchesToInsert.length} partidos de dobles guardados con éxito.`); 
          matchesData = []; 
          renderTable(); 
          if (typeof loadInitialData === 'function') await loadInitialData(); 
      } 
  }

  // --- EVENT LISTENERS ---
  tableContainer.addEventListener('change', e => {
    const input = e.target;
    const rowId = input.closest('tr').dataset.rowId;
    const field = input.dataset.field;
    const value = input.value;
    const matchIndex = matchesData.findIndex(m => m.clientId == rowId);

    if (matchIndex > -1) {
        matchesData[matchIndex][field] = value;
        
        if (field === 'teamA_id' || field === 'teamB_id' || field === 'playerA1_id' || field === 'playerB1_id') {
            if (field === 'teamA_id') {
                matchesData[matchIndex].playerA1_id = null;
                matchesData[matchIndex].playerA2_id = null;
            }
            if (field === 'teamB_id') {
                matchesData[matchIndex].playerB1_id = null;
                matchesData[matchIndex].playerB2_id = null;
            }
            if (field === 'playerA1_id') {
                matchesData[matchIndex].playerA2_id = null;
            }
            if (field === 'playerB1_id') {
                matchesData[matchIndex].playerB2_id = null;
            }
            
            renderTable();
            
            matchesData.forEach((match, index) => {
                const row = tableContainer.querySelector(`tr[data-row-id="${match.clientId}"]`);
                if (row) {
                    Array.from(row.querySelectorAll('select, input')).forEach(selectOrInput => {
                        const fieldName = selectOrInput.dataset.field;
                        if (matchesData[index][fieldName]) {
                            selectOrInput.value = matchesData[index][fieldName];
                        }
                    });
                }
            });
        }
    }
  });
  
  tableContainer.addEventListener('click', (e) => {
    const button = e.target.closest('button.action-btn');
    if (button) {
      const action = button.dataset.action;
      const rowId = button.closest('tr').dataset.rowId;
      if (action === 'delete') deleteRow(rowId);
    }
  });

  document.getElementById('btn-add-doubles-row').addEventListener('click', addRow);
  document.getElementById('btn-save-all-doubles').addEventListener('click', saveAllMatches);
  
  // --- INICIALIZACIÓN ---
  renderTable();
  if (matchesData.length === 0) addRow();
}