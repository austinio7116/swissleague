import {
  getPendingMatches,
  getCompletedMatches,
  getPlayerById,
  escapeHtml,
  formatDateShort
} from '../utils/helpers.js';
import { LEAGUE_FORMATS } from '../../shared/constants.js';

export class MatchesRenderer {
  static renderOutstanding(leagueData, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const pendingMatches = getPendingMatches(leagueData);

    if (pendingMatches.length === 0) {
      container.innerHTML = `
        <div class="no-matches">
          <p>✅ All matches completed!</p>
        </div>
      `;
      return;
    }

    // Group by round
    const matchesByRound = {};
    pendingMatches.forEach(match => {
      if (!matchesByRound[match.roundNumber]) {
        matchesByRound[match.roundNumber] = [];
      }
      matchesByRound[match.roundNumber].push(match);
    });

    let html = `
      <div class="outstanding-matches">
        <h2>Outstanding Matches</h2>
        <p class="match-count">${pendingMatches.length} match${pendingMatches.length !== 1 ? 'es' : ''} to be played</p>
    `;

    const isTiered = leagueData.league.format === LEAGUE_FORMATS.TIERED_ROUND_ROBIN;
    const tierConfig = isTiered ? leagueData.league.tierConfig : null;
    const tierColors = { 'Diamond': '#b9f2ff', 'Gold': '#ffd700', 'Silver': '#c0c0c0', 'Bronze': '#cd7f32' };

    Object.keys(matchesByRound).sort((a, b) => parseInt(a) - parseInt(b)).forEach(roundNum => {
      const matches = matchesByRound[roundNum];

      html += `
        <div class="round-section">
          <h3>Round ${roundNum}</h3>
      `;

      // Group by tier if tiered league
      const groups = isTiered ? this.groupMatchesByTier(matches, leagueData, tierConfig.tiers) : { 'all': matches };

      Object.entries(groups).forEach(([tierName, tierMatches]) => {
        if (isTiered && tierName !== 'all') {
          const bgColor = tierColors[tierName] || '#e8e8e8';
          html += `<h4 style="background: ${bgColor}; padding: 0.3rem 0.75rem; border-radius: 4px; margin: 0.5rem 0; color: #000;">${escapeHtml(tierName)}</h4>`;
        }

        html += '<div class="matches-grid">';

        tierMatches.forEach(match => {
          const player1 = getPlayerById(leagueData, match.player1Id);
          const player2 = match.player2Id ? getPlayerById(leagueData, match.player2Id) : null;

          if (match.isBye) {
            html += `
              <div class="match-card bye-match">
                <div class="match-info">
                  <span class="player">${escapeHtml(player1.name)}</span>
                  <span class="bye-label">BYE</span>
                </div>
              </div>
            `;
          } else {
            html += `
              <div class="match-card pending-match">
                <div class="match-players">
                  <span class="player">${escapeHtml(player1.name)}</span>
                  <span class="vs">vs</span>
                  <span class="player">${escapeHtml(player2.name)}</span>
                </div>
                ${match.status === 'in-progress' ? `
                  <div class="match-score">
                    ${match.player1FramesWon} - ${match.player2FramesWon}
                  </div>
                ` : ''}
                <span class="match-status status-${match.status}">${match.status}</span>
              </div>
            `;
          }
        });

        html += '</div>';
      });

      html += '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
  }

  static renderHistory(leagueData, containerId, limit = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let completedMatches = getCompletedMatches(leagueData);
    
    // Sort by round number (descending) and completion date
    completedMatches.sort((a, b) => {
      if (b.roundNumber !== a.roundNumber) {
        return b.roundNumber - a.roundNumber;
      }
      return new Date(b.completedAt) - new Date(a.completedAt);
    });

    if (limit) {
      completedMatches = completedMatches.slice(0, limit);
    }

    if (completedMatches.length === 0) {
      container.innerHTML = `
        <div class="no-matches">
          <p>No completed matches yet.</p>
        </div>
      `;
      return;
    }

    let html = `
      <div class="match-history">
        <h2>Match History</h2>
        <p class="match-count">${completedMatches.length} completed match${completedMatches.length !== 1 ? 'es' : ''}</p>
        <div class="matches-list">
    `;

    completedMatches.forEach(match => {
      const player1 = getPlayerById(leagueData, match.player1Id);
      const player2 = match.player2Id ? getPlayerById(leagueData, match.player2Id) : null;
      const winner = match.winnerId ? getPlayerById(leagueData, match.winnerId) : null;

      if (match.isBye) {
        html += `
          <div class="match-item bye-match">
            <div class="match-header">
              <span class="round-badge">Round ${match.roundNumber}</span>
              <span class="match-date">${formatDateShort(match.completedAt)}</span>
            </div>
            <div class="match-summary">
              <span class="player winner">${escapeHtml(player1.name)}</span>
              <span class="bye-label">BYE (Auto Win)</span>
            </div>
          </div>
        `;
      } else if (match.isForfeit) {
        // Forfeit match display
        const isDoubleForfeit = match.forfeitType === 'double';
        html += `
          <div class="match-item forfeit-match ${isDoubleForfeit ? 'double-forfeit' : ''}">
            <div class="match-header">
              <span class="round-badge">Round ${match.roundNumber}</span>
              <span class="match-date">${formatDateShort(match.completedAt)}</span>
            </div>
            <div class="match-summary">
              <span class="player ${!isDoubleForfeit && match.winnerId === player1.id ? 'winner' : ''}">${escapeHtml(player1.name)}</span>
              <span class="forfeit-label">${isDoubleForfeit ? 'DOUBLE FORFEIT' : 'FORFEIT'}</span>
              <span class="player ${!isDoubleForfeit && match.winnerId === player2.id ? 'winner' : ''}">${escapeHtml(player2.name)}</span>
            </div>
            <div class="forfeit-info">
              ${isDoubleForfeit
                ? 'Both players forfeit - no points awarded'
                : `${escapeHtml(winner.name)} wins by forfeit`}
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="match-item" data-match-id="${match.id}">
            <div class="match-header">
              <span class="round-badge">Round ${match.roundNumber}</span>
              <span class="match-date">${formatDateShort(match.completedAt)}</span>
            </div>
            <div class="match-summary">
              <span class="player ${match.winnerId === player1.id ? 'winner' : ''}">${escapeHtml(player1.name)}</span>
              <span class="score">${match.player1FramesWon} - ${match.player2FramesWon}</span>
              <span class="player ${match.winnerId === player2.id ? 'winner' : ''}">${escapeHtml(player2.name)}</span>
            </div>
            ${match.frames.length > 0 ? `
              <button class="toggle-frames" onclick="displayApp.toggleFrames('${match.id}')">
                Show Frames
              </button>
              <div class="frames-detail" id="frames-${match.id}" style="display: none;">
                ${this.renderFrames(match, player1, player2)}
              </div>
            ` : ''}
          </div>
        `;
      }
    });

    html += `
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  static renderFrames(match, player1, player2) {
    let html = `
      <table class="frames-table">
        <thead>
          <tr>
            <th>Frame</th>
            <th>${escapeHtml(player1.name)}</th>
            <th>${escapeHtml(player2.name)}</th>
            <th>Winner</th>
          </tr>
        </thead>
        <tbody>
    `;

    match.frames.forEach(frame => {
      const winner = frame.winnerId === player1.id ? player1 : player2;
      html += `
        <tr>
          <td>${frame.frameNumber}</td>
          <td class="${frame.winnerId === player1.id ? 'winner-cell' : ''}">${frame.player1Score}</td>
          <td class="${frame.winnerId === player2.id ? 'winner-cell' : ''}">${frame.player2Score}</td>
          <td>${escapeHtml(winner.name)}</td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    return html;
  }

  static toggleFrames(matchId) {
    const framesDiv = document.getElementById(`frames-${matchId}`);
    const button = framesDiv.previousElementSibling;
    
    if (framesDiv.style.display === 'none') {
      framesDiv.style.display = 'block';
      button.textContent = 'Hide Frames';
    } else {
      framesDiv.style.display = 'none';
      button.textContent = 'Show Frames';
    }
  }

  static groupMatchesByTier(matches, leagueData, tiers) {
    const groups = {};
    for (const tier of tiers) {
      groups[tier] = [];
    }
    for (const match of matches) {
      const player1 = getPlayerById(leagueData, match.player1Id);
      const tierName = player1 && player1.tier ? player1.tier : 'Unknown';
      if (!groups[tierName]) groups[tierName] = [];
      groups[tierName].push(match);
    }
    return groups;
  }

  static renderRoundMatches(leagueData, roundNumber, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const round = leagueData.rounds.find(r => r.roundNumber === roundNumber);
    if (!round) {
      container.innerHTML = '<p>Round not found.</p>';
      return;
    }

    let html = `
      <div class="round-matches">
        <h3>Round ${roundNumber} Matches</h3>
        <div class="matches-grid">
    `;

    round.matches.forEach(match => {
      const player1 = getPlayerById(leagueData, match.player1Id);
      const player2 = match.player2Id ? getPlayerById(leagueData, match.player2Id) : null;

      if (match.isBye) {
        html += `
          <div class="match-card bye-match">
            <span>${escapeHtml(player1.name)} - BYE</span>
          </div>
        `;
      } else if (match.isForfeit) {
        const isDoubleForfeit = match.forfeitType === 'double';
        html += `
          <div class="match-card forfeit-match ${isDoubleForfeit ? 'double-forfeit' : ''}">
            <div class="match-players">
              <span class="${!isDoubleForfeit && match.winnerId === player1.id ? 'winner' : ''}">${escapeHtml(player1.name)}</span>
              <span class="vs">vs</span>
              <span class="${!isDoubleForfeit && match.winnerId === player2.id ? 'winner' : ''}">${escapeHtml(player2.name)}</span>
            </div>
            <div class="match-score forfeit-label">${isDoubleForfeit ? 'DBL FORFEIT' : 'FORFEIT'}</div>
          </div>
        `;
      } else {
        html += `
          <div class="match-card match-${match.status}">
            <div class="match-players">
              <span class="${match.winnerId === player1.id ? 'winner' : ''}">${escapeHtml(player1.name)}</span>
              <span class="vs">vs</span>
              <span class="${match.winnerId === player2.id ? 'winner' : ''}">${escapeHtml(player2.name)}</span>
            </div>
            ${match.status === 'completed' ? `
              <div class="match-score">${match.player1FramesWon} - ${match.player2FramesWon}</div>
            ` : `
              <span class="match-status">${match.status}</span>
            `}
          </div>
        `;
      }
    });

    html += `
        </div>
      </div>
    `;

    container.innerHTML = html;
  }
}
