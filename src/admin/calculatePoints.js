// Extraído de dashboard.js para unificar el cálculo de puntos
export function calculatePoints(match) {
    let p1_points = 0;
    let p2_points = 0;

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

        if (match.winner_id === match.player1_id) {
            // Jugador 1 es el ganador
            p1_points = 2; // Puntos base para el ganador
            p2_points = 0; // Puntos base para el perdedor

            // Aplicar Bonus Ganador para Jugador 1
            if (p2TotalGames <= 3) {
                p1_points += 1;
            }

            // Aplicar Bonus Perdedor para Jugador 2
            if (p2SetsWon === 1) {
                p2_points += 1;
            }
        } else {
            // Jugador 2 es el ganador
            p2_points = 2; // Puntos base para el ganador
            p1_points = 0; // Puntos base para el perdedor

            // Aplicar Bonus Ganador para Jugador 2
            if (p1TotalGames <= 3) {
                p2_points += 1;
            }
            
            // Aplicar Bonus Perdedor para Jugador 1
            if (p1SetsWon === 1) {
                p1_points += 1;
            }
        }
    }
    return { p1_points, p2_points };
}