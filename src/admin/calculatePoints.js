// Extraído de dashboard.js para unificar el cálculo de puntos
export function calculatePoints(match) {
    let p1_points = 0;
    let p2_points = 0;

    if (match.winner_id) {
        let p1TotalGames = 0, p2TotalGames = 0, p1SetsWon = 0, p2SetsWon = 0;
        (match.sets || []).forEach(s => {
            p1TotalGames += s.p1;
            p2TotalGames += s.p2;
            if (s.p1 > s.p2) p1SetsWon++;
            if (s.p2 > s.p1) p2SetsWon++;
        });

        if (match.winner_id === match.player1_id) {
            p1_points = (p2TotalGames < 3) ? 3 : 2;
            p2_points = (p2SetsWon >= 1) ? 1 : 0;
        } else {
            p2_points = (p1TotalGames < 3) ? 3 : 2;
            p1_points = (p1SetsWon >= 1) ? 1 : 0;
        }
    }
    return { p1_points, p2_points };
}
