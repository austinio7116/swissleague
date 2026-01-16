import { escapeHtml, getPlayerById } from '../utils/helpers.js';

export class PlayerModal {
  static leagueData = null;

  static init(leagueData) {
    this.leagueData = leagueData;
    this.setupEventListeners();
  }

  static setupEventListeners() {
    const modal = document.getElementById('player-modal');
    const backdrop = modal.querySelector('.modal-backdrop');
    const closeBtn = modal.querySelector('.modal-close');

    backdrop.addEventListener('click', () => this.close());
    closeBtn.addEventListener('click', () => this.close());

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display !== 'none') {
        this.close();
      }
    });
  }

  static open(playerId) {
    const player = getPlayerById(this.leagueData, playerId);
    if (!player) return;

    const modal = document.getElementById('player-modal');
    const playerName = document.getElementById('modal-player-name');
    const playerStats = document.getElementById('modal-player-stats');
    const matchHistory = document.getElementById('modal-match-history');

    playerName.textContent = player.name;
    playerStats.innerHTML = this.renderPlayerStats(player);
    matchHistory.innerHTML = this.renderMatchHistory(playerId);

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  static close() {
    const modal = document.getElementById('player-modal');
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  static renderPlayerStats(player) {
    const stats = player.stats;
    const winRate = stats.matchesPlayed > 0
      ? ((stats.matchesWon / stats.matchesPlayed) * 100).toFixed(0)
      : 0;

    return `
      <div class="modal-stats-container">
        <div class="stats-primary">
          <div class="stat-highlight">
            <span class="stat-value">${stats.points}</span>
            <span class="stat-label">Points</span>
          </div>
          <div class="stat-highlight">
            <span class="stat-value">${stats.matchesWon}-${stats.matchesLost}</span>
            <span class="stat-label">Record</span>
          </div>
          <div class="stat-highlight">
            <span class="stat-value">${winRate}%</span>
            <span class="stat-label">Win Rate</span>
          </div>
        </div>
      </div>
    `;
  }

  static renderMatchHistory(playerId) {
    const matches = this.getPlayerMatches(playerId);

    if (matches.length === 0) {
      return '<p class="no-matches">No matches played yet.</p>';
    }

    let html = '<h3>Match History</h3><div class="match-history-list">';

    for (const { match, roundNumber } of matches) {
      const isPlayer1 = match.player1Id === playerId;
      const opponentId = isPlayer1 ? match.player2Id : match.player1Id;
      const opponent = getPlayerById(this.leagueData, opponentId);

      if (match.isBye) {
        html += `
          <div class="match-card bye">
            <div class="match-left">
              <span class="match-round">Round ${roundNumber}</span>
            </div>
            <div class="match-center">
              <span class="match-opponent">BYE</span>
            </div>
            <div class="match-right">
              <span class="frames-score">+1 pt</span>
            </div>
          </div>
        `;
        continue;
      }

      const playerFrames = isPlayer1 ? match.player1FramesWon : match.player2FramesWon;
      const opponentFrames = isPlayer1 ? match.player2FramesWon : match.player1FramesWon;
      const isWinner = match.winnerId === playerId;
      const resultClass = isWinner ? 'win' : 'loss';

      // Calculate snooker points for this match
      let playerPoints = 0;
      let opponentPoints = 0;
      for (const frame of match.frames || []) {
        if (isPlayer1) {
          playerPoints += frame.player1Score;
          opponentPoints += frame.player2Score;
        } else {
          playerPoints += frame.player2Score;
          opponentPoints += frame.player1Score;
        }
      }

      const pointsDiff = playerPoints - opponentPoints;
      html += `
        <div class="match-card ${resultClass}">
          <div class="match-left">
            <span class="match-round">Round ${roundNumber}</span>
            <span class="result-badge ${resultClass}">${isWinner ? 'WIN' : 'LOSS'}</span>
          </div>
          <div class="match-center">
            <span class="match-opponent">vs ${escapeHtml(opponent?.name || 'Unknown')}</span>
            <span class="match-frames">${this.renderFramesCompact(match.frames || [], isPlayer1)}</span>
          </div>
          <div class="match-right">
            <span class="frames-score">${playerFrames} - ${opponentFrames}</span>
            <span class="points-summary ${pointsDiff >= 0 ? 'positive' : 'negative'}">${pointsDiff >= 0 ? '+' : ''}${pointsDiff} pts</span>
          </div>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  static renderFrames(frames, isPlayer1) {
    if (frames.length === 0) return '';

    return frames.map((frame, idx) => {
      const playerScore = isPlayer1 ? frame.player1Score : frame.player2Score;
      const opponentScore = isPlayer1 ? frame.player2Score : frame.player1Score;
      const isWinner = playerScore > opponentScore;

      return `
        <span class="frame ${isWinner ? 'frame-win' : 'frame-loss'}">
          ${playerScore}-${opponentScore}
        </span>
      `;
    }).join('');
  }

  static renderFramesCompact(frames, isPlayer1) {
    if (frames.length === 0) return '';

    return frames.map((frame) => {
      const playerScore = isPlayer1 ? frame.player1Score : frame.player2Score;
      const opponentScore = isPlayer1 ? frame.player2Score : frame.player1Score;
      return `${playerScore}-${opponentScore}`;
    }).join(', ');
  }

  static getPlayerMatches(playerId) {
    const matches = [];
    for (const round of this.leagueData.rounds || []) {
      for (const match of round.matches || []) {
        if (match.status !== 'completed') continue;
        if (match.player1Id === playerId || match.player2Id === playerId) {
          matches.push({ match, roundNumber: round.roundNumber });
        }
      }
    }
    // Sort by round number ascending
    matches.sort((a, b) => a.roundNumber - b.roundNumber);
    return matches;
  }
}
