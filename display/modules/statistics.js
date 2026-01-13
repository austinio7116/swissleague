import { 
  getPlayerById, 
  getPlayerMatches, 
  getHeadToHead,
  escapeHtml, 
  calculateWinRate, 
  calculateAvgFrames 
} from '../utils/helpers.js';

export class StatisticsRenderer {
  static renderPlayerStats(leagueData, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const players = leagueData.players.filter(p => p.active && p.stats.matchesPlayed > 0);

    if (players.length === 0) {
      container.innerHTML = '<p class="no-data">No player statistics available yet.</p>';
      return;
    }

    let html = `
      <div class="player-statistics">
        <h2>Player Statistics</h2>
        <div class="stats-grid">
    `;

    players.forEach(player => {
      const winRate = calculateWinRate(player.stats);
      const avgFrames = calculateAvgFrames(player.stats);
      const matches = getPlayerMatches(leagueData, player.id);
      const completedMatches = matches.filter(m => m.status === 'completed');

      html += `
        <div class="player-stat-card">
          <h3>${escapeHtml(player.name)}</h3>
          <div class="stat-grid">
            <div class="stat-item">
              <span class="stat-label">Points</span>
              <span class="stat-value">${player.stats.points}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Win Rate</span>
              <span class="stat-value">${winRate}%</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Matches</span>
              <span class="stat-value">${player.stats.matchesPlayed}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Wins</span>
              <span class="stat-value wins">${player.stats.matchesWon}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Losses</span>
              <span class="stat-value losses">${player.stats.matchesLost}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Frames Won</span>
              <span class="stat-value">${player.stats.framesWon}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Frames Lost</span>
              <span class="stat-value">${player.stats.framesLost}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Frame Diff</span>
              <span class="stat-value ${player.stats.frameDifference >= 0 ? 'positive' : 'negative'}">
                ${player.stats.frameDifference > 0 ? '+' : ''}${player.stats.frameDifference}
              </span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Avg Frames/Match</span>
              <span class="stat-value">${avgFrames}</span>
            </div>
            ${player.stats.byesReceived > 0 ? `
              <div class="stat-item">
                <span class="stat-label">Byes</span>
                <span class="stat-value">${player.stats.byesReceived}</span>
              </div>
            ` : ''}
          </div>
          <button class="btn-view-details" onclick="displayApp.showPlayerDetails('${player.id}')">
            View Details
          </button>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    container.innerHTML = html;
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
