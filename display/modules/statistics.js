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

  static renderPlayerStats(leagueData, containerId, allLeaguesData = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // If we have all leagues data, show cross-league stats
    if (allLeaguesData && allLeaguesData.leagues) {
      this.renderCrossLeagueStats(allLeaguesData, containerId);
      return;
    }

    const players = leagueData.players.filter(p => p.active && p.stats.matchesPlayed > 0);

    if (players.length === 0) {
      container.innerHTML = '<p class="no-data">No player statistics available yet.</p>';
      return;
    }

    // Sort players
    const sortedPlayers = this.sortPlayers(players, leagueData, this.currentSort.column, this.currentSort.direction);

    let html = `
      <div class="player-statistics">
        <h2>Player Statistics</h2>
        <div class="table-responsive">
          <table class="stats-table">
            <thead>
              <tr>
                <th data-sort="name" class="${this.currentSort.column === 'name' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('name')">Player</th>
                <th data-sort="matchPoints" class="${this.currentSort.column === 'matchPoints' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('matchPoints')">Match Pts</th>
                <th data-sort="buchholzScore" class="${this.currentSort.column === 'buchholzScore' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('buchholzScore')" title="Sum of opponents' match points">Buchholz</th>
                <th data-sort="strengthOfSchedule" class="${this.currentSort.column === 'strengthOfSchedule' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('strengthOfSchedule')" title="Average opponent win rate">SOS</th>
                <th data-sort="matchesWon" class="${this.currentSort.column === 'matchesWon' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('matchesWon')">Wins</th>
                <th data-sort="matchesLost" class="${this.currentSort.column === 'matchesLost' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('matchesLost')">Losses</th>
                <th data-sort="matchesPlayed" class="${this.currentSort.column === 'matchesPlayed' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('matchesPlayed')">Played</th>
                <th data-sort="winRate" class="${this.currentSort.column === 'winRate' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('winRate')">Win %</th>
                <th data-sort="framesWon" class="${this.currentSort.column === 'framesWon' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('framesWon')">Frames Won</th>
                <th data-sort="framesLost" class="${this.currentSort.column === 'framesLost' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('framesLost')">Frames Lost</th>
                <th data-sort="frameDifference" class="${this.currentSort.column === 'frameDifference' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('frameDifference')">Frame Diff</th>
                <th data-sort="pointsScored" class="${this.currentSort.column === 'pointsScored' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('pointsScored')">Points For</th>
                <th data-sort="pointsConceded" class="${this.currentSort.column === 'pointsConceded' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('pointsConceded')">Points Against</th>
                <th data-sort="pointsDifference" class="${this.currentSort.column === 'pointsDifference' ? 'sort-' + this.currentSort.direction : ''}" onclick="displayApp.sortPlayerStats('pointsDifference')">Points Diff</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
    `;

    sortedPlayers.forEach(player => {
      const winRate = calculateWinRate(player.stats);
      const snookerPoints = this.calculateSnookerPoints(leagueData, player.id);
      const buchholz = player.stats.buchholzScore || 0;
      const sos = player.stats.strengthOfSchedule || 0;
      const sosPercent = (sos * 100).toFixed(1);

      html += `
        <tr>
          <td class="player-name">${escapeHtml(player.name)}</td>
          <td class="points">${player.stats.points}</td>
          <td class="buchholz">${buchholz}</td>
          <td class="sos">${sosPercent}%</td>
          <td class="wins">${player.stats.matchesWon}</td>
          <td class="losses">${player.stats.matchesLost}</td>
          <td>${player.stats.matchesPlayed}</td>
          <td>${winRate}%</td>
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

  static sortPlayers(players, leagueData, column, direction) {
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
        
        case 'buchholzScore':
          aVal = a.stats.buchholzScore || 0;
          bVal = b.stats.buchholzScore || 0;
          break;
        
        case 'strengthOfSchedule':
          aVal = a.stats.strengthOfSchedule || 0;
          bVal = b.stats.strengthOfSchedule || 0;
          break;
        
        case 'pointsScored':
          aVal = this.calculateSnookerPoints(leagueData, a.id).pointsScored;
          bVal = this.calculateSnookerPoints(leagueData, b.id).pointsScored;
          break;
        
        case 'pointsConceded':
          aVal = this.calculateSnookerPoints(leagueData, a.id).pointsConceded;
          bVal = this.calculateSnookerPoints(leagueData, b.id).pointsConceded;
          break;
        
        case 'pointsDifference':
          aVal = this.calculateSnookerPoints(leagueData, a.id).pointsDifference;
          bVal = this.calculateSnookerPoints(leagueData, b.id).pointsDifference;
          break;
        
        case 'matchPoints':
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

  static renderCrossLeagueStats(allLeaguesData, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Aggregate stats across all leagues
    const playerStats = {};

    Object.values(allLeaguesData.leagues).forEach(leagueData => {
      leagueData.players.forEach(player => {
        if (!player.stats || player.stats.matchesPlayed === 0) return;

        if (!playerStats[player.name]) {
          playerStats[player.name] = {
            name: player.name,
            totalMatchPoints: 0,
            totalMatchesWon: 0,
            totalMatchesLost: 0,
            totalMatchesPlayed: 0,
            totalFramesWon: 0,
            totalFramesLost: 0,
            totalPointsScored: 0,
            totalPointsConceded: 0,
            totalBuchholz: 0,
            totalSOS: 0,
            leagueCount: 0,
            leagues: []
          };
        }

        const stats = playerStats[player.name];
        stats.totalMatchPoints += player.stats.points;
        stats.totalMatchesWon += player.stats.matchesWon;
        stats.totalMatchesLost += player.stats.matchesLost;
        stats.totalMatchesPlayed += player.stats.matchesPlayed;
        stats.totalFramesWon += player.stats.framesWon;
        stats.totalFramesLost += player.stats.framesLost;
        stats.totalBuchholz += (player.stats.buchholzScore || 0);
        stats.totalSOS += (player.stats.strengthOfSchedule || 0);
        stats.leagueCount++;

        // Calculate snooker points for this league
        const snookerPoints = this.calculateSnookerPoints(leagueData, player.id);
        stats.totalPointsScored += snookerPoints.pointsScored;
        stats.totalPointsConceded += snookerPoints.pointsConceded;

        stats.leagues.push(leagueData.league.name);
      });
    });

    const playersArray = Object.values(playerStats);

    if (playersArray.length === 0) {
      container.innerHTML = '<p class="no-data">No player statistics available yet.</p>';
      return;
    }

    // Sort by total match points by default
    playersArray.sort((a, b) => b.totalMatchPoints - a.totalMatchPoints);

    let html = `
      <div class="player-statistics">
        <h2>All-Time Player Statistics</h2>
        <p class="stats-subtitle">Aggregated across all leagues</p>
        <div class="table-responsive">
          <table class="stats-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Match Pts</th>
                <th title="Sum of Buchholz scores across leagues">Buchholz</th>
                <th title="Average SOS across leagues">Avg SOS</th>
                <th>Wins</th>
                <th>Losses</th>
                <th>Played</th>
                <th>Win %</th>
                <th>Frames Won</th>
                <th>Frames Lost</th>
                <th>Frame Diff</th>
                <th>Points For</th>
                <th>Points Against</th>
                <th>Points Diff</th>
                <th>Leagues</th>
              </tr>
            </thead>
            <tbody>
    `;

    playersArray.forEach(player => {
      const winRate = player.totalMatchesPlayed > 0
        ? ((player.totalMatchesWon / player.totalMatchesPlayed) * 100).toFixed(1)
        : 0;
      const frameDiff = player.totalFramesWon - player.totalFramesLost;
      const pointsDiff = player.totalPointsScored - player.totalPointsConceded;
      const avgSOS = player.leagueCount > 0 ? (player.totalSOS / player.leagueCount) : 0;
      const avgSOSPercent = (avgSOS * 100).toFixed(1);

      html += `
        <tr>
          <td class="player-name">${escapeHtml(player.name)}</td>
          <td class="points">${player.totalMatchPoints}</td>
          <td class="buchholz">${player.totalBuchholz}</td>
          <td class="sos">${avgSOSPercent}%</td>
          <td class="wins">${player.totalMatchesWon}</td>
          <td class="losses">${player.totalMatchesLost}</td>
          <td>${player.totalMatchesPlayed}</td>
          <td>${winRate}%</td>
          <td>${player.totalFramesWon}</td>
          <td>${player.totalFramesLost}</td>
          <td class="frame-diff ${frameDiff >= 0 ? 'positive' : 'negative'}">
            ${frameDiff > 0 ? '+' : ''}${frameDiff}
          </td>
          <td>${player.totalPointsScored}</td>
          <td>${player.totalPointsConceded}</td>
          <td class="points-diff ${pointsDiff >= 0 ? 'positive' : 'negative'}">
            ${pointsDiff > 0 ? '+' : ''}${pointsDiff}
          </td>
          <td><span class="league-count">${player.leagues.length} league${player.leagues.length !== 1 ? 's' : ''}</span></td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
        <div class="stats-note" style="margin-top: 1rem; padding: 1rem; background: #e7f3ff; border-radius: 4px;">
          <p><strong>Note:</strong> These statistics are aggregated across all leagues. Individual league statistics can be viewed by selecting a specific league.</p>
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
    
    // Count rounds as completed if all their matches are completed
    const completedRounds = rounds.filter(round => {
      if (round.matches.length === 0) return false;
      return round.matches.every(match => match.status === 'completed');
    }).length;

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
