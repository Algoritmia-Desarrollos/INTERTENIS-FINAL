// REEMPLAZA el contenido completo de src/admin/calculatePoints.js
export function calculatePoints(match) {
    let p1_points = 0; // Puntos para el Lado 1 (Jugador 1 y 3)
    let p2_points = 0; // Puntos para el Lado 2 (Jugador 2 y 4)

    if (match.winner_id) {
        const winnerIsSide1 = match.winner_id === match.player1_id || match.winner_id === match.player3_id;

        // Caso 1: Partido ganado por Walkover (WO)
        if (match.status === 'completado_wo') {
            if (winnerIsSide1) {
                p1_points = 2;
                p2_points = 0;
            } else {
                p1_points = 0;
                p2_points = 2;
            }
            return { p1_points, p2_points };
        }

        // Caso 2: Partido ganado por Retiro
        if (match.status === 'completado_ret') {
            if (winnerIsSide1) {
                p1_points = 2; // Ganador recibe 2 puntos
                p2_points = match.bonus_loser ? 1 : 0; // Perdedor recibe 1 punto SI ganó un set
            } else {
                p2_points = 2; // Ganador recibe 2 puntos
                p1_points = match.bonus_loser ? 1 : 0; // Perdedor recibe 1 punto SI ganó un set
            }
            return { p1_points, p2_points };
        }

        // Caso 3: Partido completado normalmente
        let p1TotalGames = 0;
        let p2TotalGames = 0;
        let p1SetsWon = 0;
        let p2SetsWon = 0;

        (match.sets || []).forEach(s => {
            p1TotalGames += s.p1;
            p2TotalGames += s.p2;
            if (s.p1 > s.p2) {
                p1SetsWon++;
            } else {
                p2SetsWon++;
            }
        });

        if (winnerIsSide1) {
            p1_points = 2;
            if (p2TotalGames <= 3) p1_points += 1; // Bonus ganador
            if (p2SetsWon === 1) p2_points += 1;   // Bonus perdedor
        } else {
            p2_points = 2;
            if (p1TotalGames <= 3) p2_points += 1; // Bonus ganador
            if (p1SetsWon === 1) p1_points += 1;   // Bonus perdedor
        }
    }
    return { p1_points, p2_points };
}