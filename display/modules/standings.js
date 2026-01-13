import { calculateStandings, escapeHtml, calculateWinRate, calculateAvgFrames } from '../utils/helpers.js';

export class StandingsRenderer {
  static calculateSnookerPoints(leagueData, playerId) {
    let pointsScored = 0;
    let pointsConceded = 0;

    leagueData.rounds.forEach(round => {
      round.matches.forEach(match => {
        if (match.status === 'completed' && !match.isBye) {
          const isPlayer1 = match.player1Id === playerId;
          const isPlayer2 = match.player2Id === playerId;

          if (isPlayer1 || isPlayer2) {
            match.frames.forEach(frame => {
              if (isPlayer1) {
                pointsScored += frame.player1Score;
                pointsConceded += frame.player2Score;
              } else if (isPlayer2) {
                pointsScored += frame.player2Score;
                pointsConceded += frame.player1Score;
              }
            });
          }
        }
      });
    });

    return {
      pointsScored,
      pointsConceded,
      pointsDifference: pointsScored - pointsConceded
    };
  }

  static render(leagueData, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const standings = calculateStandings(leagueData);

    if (standings.length === 0) {
      container.innerHTML = '<p class="no-data">No players in the league yet.</p>';
      return;
    }

    let html = `
      <div class="standings-header">
        <h2>League Standings</h2>
        <p class="standings-info">${standings.length} active players</p>
      </div>
      <div class="table-responsive">
        <table class="standings-table" id="standings-table">
          <thead>
            <tr>
              <th data-sort="rank">Rank</th>
              <th data-sort="name">Player</th>
              <th data-sort="points">Match Pts</th>
              <th data-sort="buchholz" title="Buchholz Score: Adds up all your opponents' match points. Higher = you played tougher opponents. Used as first tiebreaker when players have equal points.">Buchholz ⓘ</th>
              <th data-sort="sos" title="Strength of Schedule (SOS): Shows how strong your opponents were on average. 100% = all opponents won all their matches. 0% = all opponents lost all their matches. Used as second tiebreaker.">SOS ⓘ</th>
              <th data-sort="played">Played</th>
              <th data-sort="won">Won</th>
              <th data-sort="lost">Lost</th>
              <th data-sort="framesWon">Frames Won</th>
              <th data-sort="framesLost">Frames Lost</th>
              <th data-sort="frameDiff">Frame +/-</th>
              <th data-sort="pointsScored">Points For</th>
              <th data-sort="pointsConceded">Points Against</th>
              <th data-sort="pointsDiff">Points +/-</th>
              <th data-sort="winRate">Win %</th>
            </tr>
          </thead>
          <tbody>
    `;

    standings.forEach((player, index) => {
      const winRate = calculateWinRate(player.stats);
      const snookerPoints = this.calculateSnookerPoints(leagueData, player.id);
      const rankClass = index < 3 ? `rank-${index + 1}` : '';
      const buchholz = player.stats.buchholzScore || 0;
      const sos = player.stats.strengthOfSchedule || 0;
      const sosPercent = (sos * 100).toFixed(1);
      
      html += `
        <tr class="${rankClass}" data-player-id="${player.id}">
          <td class="rank">${index + 1}</td>
          <td class="player-name">${escapeHtml(player.name)}</td>
          <td class="points"><strong>${player.stats.points}</strong></td>
          <td class="buchholz">${buchholz}</td>
          <td class="sos">${sosPercent}%</td>
          <td>${player.stats.matchesPlayed}</td>
          <td class="wins">${player.stats.matchesWon}</td>
          <td class="losses">${player.stats.matchesLost}</td>
          <td>${player.stats.framesWon}</td>
          <td>${player.stats.framesLost}</td>
          <td class="frame-diff ${player.stats.frameDifference >= 0 ? 'positive' : 'negative'}">
            ${player.stats.frameDifference > 0 ? '+' : ''}${player.stats.frameDifference}
          </td>
          <td>${snookerPoints.pointsScored}</td>
          <td>${snookerPoints.pointsConceded}</td>
          <td class="points-diff ${snookerPoints.pointsDifference >= 0 ? 'positive' : 'negative'}">
            ${snookerPoints.pointsDifference > 0 ? '+' : ''}${snookerPoints.pointsDifference}
          </td>
          <td>${winRate}%</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;

    // Add sorting functionality
    this.addSortingListeners();
  }

  static addSortingListeners() {
    const table = document.getElementById('standings-table');
    if (!table) return;

    const headers = table.querySelectorAll('th[data-sort]');
    let currentSort = { column: 'rank', direction: 'asc' };

    headers.forEach(header => {
      header.style.cursor = 'pointer';
      header.addEventListener('click', () => {
        const sortBy = header.dataset.sort;
        
        // Toggle direction if same column
        if (currentSort.column === sortBy) {
          currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort.column = sortBy;
          currentSort.direction = 'asc';
        }

        this.sortTable(table, sortBy, currentSort.direction);
        
        // Update header indicators
        headers.forEach(h => {
          h.classList.remove('sort-asc', 'sort-desc');
        });
        header.classList.add(`sort-${currentSort.direction}`);
      });
    });
  }

  static sortTable(table, column, direction) {
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));

    rows.sort((a, b) => {
      let aVal, bVal;

      switch (column) {
        case 'rank':
          aVal = parseInt(a.querySelector('.rank').textContent);
          bVal = parseInt(b.querySelector('.rank').textContent);
          break;
        case 'name':
          aVal = a.querySelector('.player-name').textContent;
          bVal = b.querySelector('.player-name').textContent;
          return direction === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        case 'points':
          aVal = parseInt(a.querySelector('.points').textContent);
          bVal = parseInt(b.querySelector('.points').textContent);
          break;
        case 'buchholz':
          aVal = parseInt(a.querySelector('.buchholz').textContent);
          bVal = parseInt(b.querySelector('.buchholz').textContent);
          break;
        case 'sos':
          aVal = parseFloat(a.querySelector('.sos').textContent);
          bVal = parseFloat(b.querySelector('.sos').textContent);
          break;
        case 'played':
          aVal = parseInt(a.cells[5].textContent);
          bVal = parseInt(b.cells[5].textContent);
          break;
        case 'won':
          aVal = parseInt(a.querySelector('.wins').textContent);
          bVal = parseInt(b.querySelector('.wins').textContent);
          break;
        case 'lost':
          aVal = parseInt(a.querySelector('.losses').textContent);
          bVal = parseInt(b.querySelector('.losses').textContent);
          break;
        case 'framesWon':
          aVal = parseInt(a.cells[8].textContent);
          bVal = parseInt(b.cells[8].textContent);
          break;
        case 'framesLost':
          aVal = parseInt(a.cells[9].textContent);
          bVal = parseInt(b.cells[9].textContent);
          break;
        case 'frameDiff':
          aVal = parseInt(a.querySelector('.frame-diff').textContent);
          bVal = parseInt(b.querySelector('.frame-diff').textContent);
          break;
        case 'pointsScored':
          aVal = parseInt(a.cells[11].textContent);
          bVal = parseInt(b.cells[11].textContent);
          break;
        case 'pointsConceded':
          aVal = parseInt(a.cells[12].textContent);
          bVal = parseInt(b.cells[12].textContent);
          break;
        case 'pointsDiff':
          aVal = parseInt(a.querySelector('.points-diff').textContent);
          bVal = parseInt(b.querySelector('.points-diff').textContent);
          break;
        case 'winRate':
          aVal = parseFloat(a.cells[14].textContent);
          bVal = parseFloat(b.cells[14].textContent);
          break;
        default:
          return 0;
      }

      if (direction === 'asc') {
        return aVal - bVal;
      } else {
        return bVal - aVal;
      }
    });

    // Re-append rows in sorted order
    rows.forEach(row => tbody.appendChild(row));
  }

  static renderCompact(leagueData, containerId, limit = 5) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const standings = calculateStandings(leagueData).slice(0, limit);

    let html = `
      <div class="standings-compact">
        <h3>Top ${limit} Players</h3>
        <ol class="compact-list">
    `;

    standings.forEach(player => {
      html += `
        <li>
          <span class="player-name">${escapeHtml(player.name)}</span>
          <span class="player-points">${player.stats.points} pts</span>
        </li>
      `;
    });

    html += `
        </ol>
      </div>
    `;

    container.innerHTML = html;
  }
}
