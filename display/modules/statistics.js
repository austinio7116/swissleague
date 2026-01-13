import { 
  getPlayerById, 
  getPlayerMatches, 
  getHeadToHead,
  escapeHtml, 
  calculateWinRate, 
  calculateAvgFrames 
} from '../utils/helpers.js';

export class StatisticsRenderer {
  static currentSort = { column: 'matchesWon', direction: 'desc' };

  static renderPlayerStats(leagueData, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const players = leagueData.players.filter(p => p.active && p.stats.matchesPlayed > 0);

    if (players.length === 0) {
      container.innerHTML = '<p class="no-data">No player statistics available yet.</p>';
      return;
    }

    // Sort players
    const sortedPlayers = this.sortPlayers(players, this.currentSort.column, this.currentSort.direction);

    let html = `
      <div class="player-statistics">
        <h2>Player Statistics</h2>
        <div class="table-responsive">
          <table class="stats-table">
            <thead>
              <tr>
                <th data-sort="name" class="${this.currentSort.column === 'name' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('name')">Player</th>
                <th data-sort="points" class="${this.currentSort.column === 'points' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('points')">Points</th>
                <th data-sort="matchesWon" class="${this.currentSort.column === 'matchesWon' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('matchesWon')">Wins</th>
                <th data-sort="matchesLost" class="${this.currentSort.column === 'matchesLost' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('matchesLost')">Losses</th>
                <th data-sort="matchesPlayed" class="${this.currentSort.column === 'matchesPlayed' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('matchesPlayed')">Played</th>
                <th data-sort="winRate" class="${this.currentSort.column === 'winRate' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('winRate')">Win %</th>
                <th data-sort="framesWon" class="${this.currentSort.column === 'framesWon' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('framesWon')">Frames Won</th>
                <th data-sort="framesLost" class="${this.currentSort.column === 'framesLost' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('framesLost')">Frames Lost</th>
                <th data-sort="frameDifference" class="${this.currentSort.column === 'frameDifference' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('frameDifference')">Frame Diff</th>
                <th data-sort="pointsDifference" class="${this.currentSort.column === 'pointsDifference' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('pointsDifference')">Points Diff</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
    `;

    sortedPlayers.forEach(player => {
      const winRate = calculateWinRate(player.stats);
      const pointsDifference = (player.stats.matchesWon * 2) - (player.stats.matchesLost * 0); // 2 points per win, 0 per loss

      html += `
        <tr>
          <td class="player-name">${escapeHtml(player.name)}</td>
          <td class="points">${player.stats.points}</td>
          <td class="wins">${player.stats.matchesWon}</td>
          <td class="losses">${player.stats.matchesLost}</td>
          <td>${player.stats.matchesPlayed}</td>
          <td>${winRate}%</td>
          <td>${player.stats.framesWon}</td>
          <td>${player.stats.framesLost}</td>
          <td class="frame-diff ${player.stats.frameDifference >= 0 ? 'positive' : 'negative'}">
            ${player.stats.frameDifference > 0 ? '+' : ''}${player.stats.frameDifference}
          </td>
          <td class="points-diff ${pointsDifference >= 0 ? 'positive' : 'negative'}">
            ${pointsDifference > 0 ? '+' : ''}${pointsDifference}
          </td>
          <td>
            <button class="btn-view-details" onclick="displayApp.showPlayerDetails('${player.id}')">
              View Details
            </button>
          </td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  static sortPlayers(players, column, direction) {
    const sorted = [...players].sort((a, b) => {
      let aVal, bVal;

      switch (column) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          return direction === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        
        case 'winRate':
          aVal = calculateWinRate(a.stats);
          bVal = calculateWinRate(b.stats);
          break;
        
        case 'pointsDifference':
          aVal = (a.stats.matchesWon * 2);
          bVal = (b.stats.matchesWon * 2);
          break;
        
        case 'points':
          aVal = a.stats.points;
          bVal = b.stats.points;
          break;
        
        case 'matchesWon':
          aVal = a.stats.matchesWon;
          bVal = b.stats.matchesWon;
          break;
        
        case 'matchesLost':
          aVal = a.stats.matchesLost;
          bVal = b.stats.matchesLost;
          break;
        
        case 'matchesPlayed':
          aVal = a.stats.matchesPlayed;
          bVal = b.stats.matchesPlayed;
          break;
        
        case 'framesWon':
          aVal = a.stats.framesWon;
          bVal = b.stats.framesWon;
          break;
        
        case 'framesLost':
          aVal = a.stats.framesLost;
          bVal = b.stats.framesLost;
          break;
        
        case 'frameDifference':
          aVal = a.stats.frameDifference;
          bVal = b.stats.frameDifference;
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

    return sorted;
  }

  static renderPlayerDetails(leagueData, playerId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const player = getPlayerById(leagueData, playerId);
    if (!player) {
      container.innerHTML = '<p>Player not found.</p>';
      return;
    }

    const matches = getPlayerMatches(leagueData, playerId);
    const completedMatches = matches.filter(m => m.status === 'completed' && !m.isBye);
    const winRate = calculateWinRate(player.stats);
    const avgFrames = calculateAvgFrames(player.stats);

    let html = `
      <div class="player-details">
        <div class="details-header">
          <h2>${escapeHtml(player.name)}</h2>
          <button class="btn-back" onclick="displayApp.closePlayerDetails()">Back</button>
        </div>

        <div class="details-stats">
          <div class="stat-box">
            <div class="stat-number">${player.stats.points}</div>
            <div class="stat-label">Points</div>
          </div>
          <div class="stat-box">
            <div class="stat-number">${winRate}%</div>
            <div class="stat-label">Win Rate</div>
          </div>
          <div class="stat-box">
            <div class="stat-number">${player.stats.matchesWon}-${player.stats.matchesLost}</div>
            <div class="stat-label">W-L Record</div>
          </div>
          <div class="stat-box">
            <div class="stat-number ${player.stats.frameDifference >= 0 ? 'positive' : 'negative'}">
              ${player.stats.frameDifference > 0 ? '+' : ''}${player.stats.frameDifference}
            </div>
            <div class="stat-label">Frame Diff</div>
          </div>
        </div>

        <div class="match-history-section">
          <h3>Match History</h3>
          <div class="matches-list">
    `;

    completedMatches.forEach(match => {
      const opponent = match.player1Id === playerId 
        ? getPlayerById(leagueData, match.player2Id)
        : getPlayerById(leagueData, match.player1Id);
      
      const isPlayer1 = match.player1Id === playerId;
      const playerFrames = isPlayer1 ? match.player1FramesWon : match.player2FramesWon;
      const opponentFrames = isPlayer1 ? match.player2FramesWon : match.player1FramesWon;
      const won = match.winnerId === playerId;

      html += `
        <div class="match-detail-item ${won ? 'won' : 'lost'}">
          <div class="match-result">
            <span class="result-badge">${won ? 'W' : 'L'}</span>
            <span class="opponent">vs ${escapeHtml(opponent.name)}</span>
          </div>
          <div class="match-score">${playerFrames} - ${opponentFrames}</div>
          <div class="match-round">Round ${match.roundNumber}</div>
        </div>
      `;
    });

    html += `
          </div>
        </div>

        <div class="head-to-head-section">
          <h3>Head-to-Head Records</h3>
          <div class="h2h-list">
    `;

    // Get all opponents
    const opponents = new Set();
    completedMatches.forEach(match => {
      const opponentId = match.player1Id === playerId ? match.player2Id : match.player1Id;
      if (opponentId) opponents.add(opponentId);
    });

    if (opponents.size === 0) {
      html += '<p>No head-to-head records yet.</p>';
    } else {
      opponents.forEach(opponentId => {
        const opponent = getPlayerById(leagueData, opponentId);
        const h2h = getHeadToHead(leagueData, playerId, opponentId);

        html += `
          <div class="h2h-item">
            <div class="h2h-opponent">${escapeHtml(opponent.name)}</div>
            <div class="h2h-record">
              <span class="h2h-wins">${h2h.player1Wins}W</span>
              <span class="h2h-separator">-</span>
              <span class="h2h-losses">${h2h.player2Wins}L</span>
            </div>
            <div class="h2h-frames">
              Frames: ${h2h.player1Frames}-${h2h.player2Frames}
            </div>
          </div>
        `;
      });
    }

    html += `
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  static renderLeagueStats(leagueData, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { league, players, rounds } = leagueData;
    
    let totalMatches = 0;
    let completedMatches = 0;
    let totalFrames = 0;

    rounds.forEach(round => {
      totalMatches += round.matches.length;
      round.matches.forEach(match => {
        if (match.status === 'completed') {
          completedMatches++;
          totalFrames += match.frames.length;
        }
      });
    });

    const activePlayers = players.filter(p => p.active).length;
    const completedRounds = rounds.filter(r => r.status === 'completed').length;

    let html = `
      <div class="league-stats">
        <h3>League Statistics</h3>
        <div class="league-stats-grid">
          <div class="league-stat-item">
            <span class="stat-value">${activePlayers}</span>
            <span class="stat-label">Active Players</span>
          </div>
          <div class="league-stat-item">
            <span class="stat-value">${completedRounds}/${league.totalRounds}</span>
            <span class="stat-label">Rounds Completed</span>
          </div>
          <div class="league-stat-item">
            <span class="stat-value">${completedMatches}/${totalMatches}</span>
            <span class="stat-label">Matches Completed</span>
          </div>
          <div class="league-stat-item">
            <span class="stat-value">${totalFrames}</span>
            <span class="stat-label">Total Frames Played</span>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }
}
