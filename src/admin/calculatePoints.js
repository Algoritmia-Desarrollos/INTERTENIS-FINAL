// Extraído de dashboard.js para unificar el cálculo de puntos
export function calculatePoints(match) {
    let p1_points = 0; // Puntos para el Lado 1 (Jugador 1 y 3)
    let p2_points = 0; // Puntos para el Lado 2 (Jugador 2 y 4)

    if (match.winner_id) {
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

        // Determina si el ganador pertenece al Lado 1 (la primera pareja)
        const winnerIsSide1 = match.winner_id === match.player1_id || match.winner_id === match.player3_id;

        if (winnerIsSide1) {
            // Gana el Lado 1
            p1_points = 2; // Puntos base para el ganador
            p2_points = 0; // Puntos base para el perdedor

            // Bonus Ganador para el Lado 1
            if (p2TotalGames <= 3) {
                p1_points += 1;
            }
            // Bonus Perdedor para el Lado 2
            if (p2SetsWon === 1) {
                p2_points += 1;
            }
        } else {
            // Gana el Lado 2
            p2_points = 2; // Puntos base para el ganador
            p1_points = 0; // Puntos base para el perdedor

            // Bonus Ganador para el Lado 2
            if (p1TotalGames <= 3) {
                p2_points += 1;
            }
            // Bonus Perdedor para el Lado 1
            if (p1SetsWon === 1) {
                p1_points += 1;
            }
        }
    }
    return { p1_points, p2_points };
}