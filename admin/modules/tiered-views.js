import { TierManager } from './tier-manager.js';
import { LEAGUE_FORMATS, DEFAULT_TIER_NAMES, TIER_DEFAULTS } from '../../shared/constants.js';
import { escapeHtml, formatDate } from '../utils/helpers.js';

/**
 * Rendering helpers for tiered round-robin league views in the admin UI.
 */
export class TieredViews {

  /**
   * Render the tiered league creation form fields (shown when tiered format selected).
   */
  static renderTierConfigFields() {
    const defaultTiers = DEFAULT_TIER_NAMES;
    return `
      <div id="tier-config-fields" class="tier-config-section">
        <div class="form-group">
          <label for="tier-count">Number of Tiers</label>
          <select id="tier-count" class="form-control">
            ${[2, 3, 4, 5, 6].map(n => `<option value="${n}"${n === 4 ? ' selected' : ''}>${n} tiers</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="tier-names-group">
          <label>Tier Names (highest to lowest)</label>
          <div id="tier-names-inputs">
            ${defaultTiers.map((name, i) => `
              <input type="text" class="form-control tier-name-input" value="${name}" placeholder="Tier ${i + 1} name" data-tier-index="${i}" style="margin-bottom: 0.5rem;">
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label for="players-per-tier">Players per Tier</label>
          <input type="number" id="players-per-tier" class="form-control" value="${TIER_DEFAULTS.PLAYERS_PER_TIER}" min="${TIER_DEFAULTS.MIN_PLAYERS_PER_TIER}" max="20">
          <small class="form-text">Target players per tier. Total: <span id="total-players-needed">${TIER_DEFAULTS.PLAYERS_PER_TIER * 4}</span>. Tiers will auto-balance if player count doesn't divide evenly.</small>
        </div>
        <div class="form-group">
          <label for="promotion-count">Promotions/Relegations per Season</label>
          <input type="number" id="promotion-count" class="form-control" value="${TIER_DEFAULTS.PROMOTION_COUNT}" min="1" max="5">
          <small class="form-text">Number of players promoted/relegated between adjacent tiers each season</small>
        </div>
        <div class="form-group">
          <label>Rounds per Season</label>
          <p class="form-text"><strong id="tier-rounds-count">${TIER_DEFAULTS.PLAYERS_PER_TIER - 1}</strong> rounds (round-robin: each player plays every other in their tier once)</p>
        </div>
      </div>
    `;
  }

  /**
   * Update tier name inputs when tier count changes.
   */
  static updateTierNameInputs(tierCount) {
    const container = document.getElementById('tier-names-inputs');
    if (!container) return;

    const defaults = [...DEFAULT_TIER_NAMES];
    // Extend defaults if needed
    while (defaults.length < tierCount) {
      defaults.push(`Tier ${defaults.length + 1}`);
    }

    container.innerHTML = defaults.slice(0, tierCount).map((name, i) => `
      <input type="text" class="form-control tier-name-input" value="${name}" placeholder="Tier ${i + 1} name" data-tier-index="${i}" style="margin-bottom: 0.5rem;">
    `).join('');
  }

  /**
   * Get tier config from the form fields.
   */
  static getTierConfigFromForm() {
    const tierCount = parseInt(document.getElementById('tier-count').value, 10);
    const playersPerTier = parseInt(document.getElementById('players-per-tier').value, 10);
    const promotionCount = parseInt(document.getElementById('promotion-count').value, 10);
    const tierNameInputs = document.querySelectorAll('.tier-name-input');
    const tiers = [];
    tierNameInputs.forEach(input => {
      if (tiers.length < tierCount) {
        tiers.push(input.value.trim() || `Tier ${tiers.length + 1}`);
      }
    });

    return { tierCount, playersPerTier, promotionCount, tiers, tierSizes: null };
  }

  /**
   * Render current league info for a tiered league.
   */
  static renderTieredLeagueInfo(leagueData) {
    const { league } = leagueData;
    const { tierConfig } = league;
    const activePlayers = leagueData.players.filter(p => p.active);

    return `
      <div class="league-info" style="margin-bottom: 2rem;">
        <h2>Current League: ${escapeHtml(league.name)}</h2>
        <div class="league-details">
          <p><strong>Format:</strong> Tiered Round-Robin (Best of ${league.bestOfFrames})${league.trackFrameScores === false ? ' - Frame scores not tracked' : ''}</p>
          <p><strong>Season:</strong> ${league.currentSeason}</p>
          <p><strong>Tiers:</strong> ${tierConfig.tiers.join(', ')}</p>
          <p><strong>Players per Tier:</strong> ${tierConfig.tierSizes ? tierConfig.tierSizes.join(', ') : tierConfig.playersPerTier}</p>
          <p><strong>Promotion/Relegation:</strong> ${tierConfig.promotionCount} per season</p>
          <p><strong>Rounds per Season:</strong> ${league.totalRounds}</p>
          <p><strong>Current Round:</strong> ${league.currentRound}</p>
          <p><strong>Active Players:</strong> ${activePlayers.length}</p>
          <p><strong>Created:</strong> ${formatDate(league.createdAt)}</p>
        </div>
      </div>
    `;
  }

  /**
   * Render players grouped by tier with ranking controls.
   */
  static renderTieredPlayers(leagueData, availablePlayerNames) {
    const { tierConfig } = leagueData.league;
    const activePlayers = leagueData.players.filter(p => p.active);
    const unassigned = activePlayers.filter(p => !p.tier);
    const hasStarted = leagueData.rounds.length > 0;
    const tierSizes = tierConfig.tierSizes || tierConfig.tiers.map(() => tierConfig.playersPerTier);
    const expectedTotal = tierSizes.reduce((sum, s) => sum + s, 0);
    const tierSizeLabel = tierSizes.every(s => s === tierSizes[0])
      ? `${tierConfig.tiers.length} tiers x ${tierSizes[0]} players`
      : `tiers: ${tierConfig.tiers.map((t, i) => `${t} (${tierSizes[i]})`).join(', ')}`;
    const currentPlayerNames = leagueData.players.map(p => p.name);
    const filteredAvailable = availablePlayerNames.filter(name => !currentPlayerNames.includes(name));

    let html = `
      <div class="players-section">
        <h2>Player Management - Tiered League</h2>
        <p>Total players needed: <strong>${expectedTotal}</strong> (${tierSizeLabel}). Currently have: <strong>${activePlayers.length}</strong></p>

        <div class="add-player-form">
          <div class="form-group">
            <label for="player-name">Add Player</label>
            <div class="input-group">
              <input type="text" id="player-name" class="form-control" placeholder="Enter player name" list="existing-players">
              <datalist id="existing-players">
                ${filteredAvailable.map(name => `<option value="${escapeHtml(name)}">`).join('')}
              </datalist>
              <button id="add-player-btn" class="btn btn-primary">Add Player</button>
            </div>
          </div>
          <div id="player-errors" class="error-container"></div>

          ${filteredAvailable.length > 0 ? `
            <div class="existing-players-section" style="margin-top: 1rem;">
              <h4>Quick Add from Other Leagues</h4>
              <div class="player-chips">
                ${filteredAvailable.slice(0, 10).map(name => `
                  <button class="player-chip" onclick="app.quickAddPlayer('${escapeHtml(name)}')">
                    + ${escapeHtml(name)}
                  </button>
                `).join('')}
                ${filteredAvailable.length > 10 ? `<span class="more-players">+${filteredAvailable.length - 10} more</span>` : ''}
              </div>
            </div>
          ` : ''}
        </div>
    `;

    // Show ranking/distribution UI if enough players and league hasn't started
    if (!hasStarted && activePlayers.length > 0) {
      if (unassigned.length > 0 || activePlayers.length >= tierConfig.tiers.length * TIER_DEFAULTS.MIN_PLAYERS_PER_TIER) {
        html += `
          <div class="tier-ranking-section" style="margin-top: 2rem;">
            <h3>Player Rankings & Tier Distribution</h3>
            <p>Drag players to reorder by skill (best at top), then distribute to tiers.</p>
            <div id="ranking-list" class="ranking-list">
              ${this.renderRankingList(leagueData)}
            </div>
            ${activePlayers.length === expectedTotal ? `
              <button class="btn btn-success" id="distribute-tiers-btn" style="margin-top: 1rem;">
                Distribute to Tiers (${tierSizes.join(', ')} players)
              </button>
            ` : activePlayers.length >= tierConfig.tiers.length * TIER_DEFAULTS.MIN_PLAYERS_PER_TIER ? `
              <button class="btn btn-success" id="distribute-tiers-btn" style="margin-top: 1rem;">
                Auto-balance & Distribute (${TierManager.calculateTierSizes(activePlayers.length, tierConfig.tiers.length).join(', ')} players)
              </button>
              <p class="form-text" style="margin-top: 0.5rem;">
                Players will be auto-balanced across ${tierConfig.tiers.length} tiers.
              </p>
            ` : `
              <p class="alert alert-warning" style="margin-top: 1rem;">
                Need at least ${tierConfig.tiers.length * TIER_DEFAULTS.MIN_PLAYERS_PER_TIER} players (${TIER_DEFAULTS.MIN_PLAYERS_PER_TIER} per tier minimum). Currently have ${activePlayers.length}.
              </p>
            `}
          </div>
        `;
      }
    }

    // Show tier assignments if players are assigned
    const assignedPlayers = activePlayers.filter(p => p.tier);
    if (assignedPlayers.length > 0) {
      html += this.renderTierAssignments(leagueData);
    }

    html += '</div>';
    return html;
  }

  /**
   * Render draggable ranking list for tier distribution.
   */
  static renderRankingList(leagueData) {
    const activePlayers = leagueData.players.filter(p => p.active);
    // Sort by tierRank if assigned, otherwise by order added
    const sorted = [...activePlayers].sort((a, b) => {
      if (a.tierRank && b.tierRank) return a.tierRank - b.tierRank;
      if (a.tier && b.tier) {
        const tierIdx = (t) => leagueData.league.tierConfig.tiers.indexOf(t);
        const tierDiff = tierIdx(a.tier) - tierIdx(b.tier);
        if (tierDiff !== 0) return tierDiff;
        return (a.tierRank || 0) - (b.tierRank || 0);
      }
      return 0;
    });

    return sorted.map((player, idx) => `
      <div class="ranking-item" data-player-id="${player.id}" draggable="true">
        <span class="rank-number">${idx + 1}.</span>
        <span class="rank-name">${escapeHtml(player.name)}</span>
        <span class="rank-controls">
          <button class="btn btn-sm" onclick="app.movePlayerRank('${player.id}', -1)" title="Move up">&#9650;</button>
          <button class="btn btn-sm" onclick="app.movePlayerRank('${player.id}', 1)" title="Move down">&#9660;</button>
        </span>
        <button class="btn btn-sm btn-danger" onclick="app.removePlayer('${player.id}')" title="Remove">x</button>
      </div>
    `).join('');
  }

  /**
   * Render tier assignment tables.
   */
  static renderTierAssignments(leagueData) {
    const { tierConfig } = leagueData.league;
    const tierColors = {
      'Diamond': '#b9f2ff',
      'Gold': '#ffd700',
      'Silver': '#c0c0c0',
      'Bronze': '#cd7f32'
    };

    let html = '<div class="tier-assignments" style="margin-top: 2rem;">';
    html += '<h3>Tier Assignments</h3>';

    for (const tierName of tierConfig.tiers) {
      const tierPlayers = TierManager.getTierStandings(leagueData, tierName);
      const bgColor = tierColors[tierName] || '#e8e8e8';
      const promotionCount = tierConfig.promotionCount;
      const tierIndex = tierConfig.tiers.indexOf(tierName);
      const isTopTier = tierIndex === 0;
      const isBottomTier = tierIndex === tierConfig.tiers.length - 1;

      html += `
        <div class="tier-table" style="margin-bottom: 1.5rem;">
          <h4 style="background: ${bgColor}; padding: 0.5rem 1rem; border-radius: 4px; margin-bottom: 0;">
            ${escapeHtml(tierName)} (${tierPlayers.length} players)
          </h4>
          <table class="standings-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Points</th>
                <th>Played</th>
                <th>Won</th>
                <th>Lost</th>
                <th>Frames +/-</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${tierPlayers.map((player, index) => {
                let rowClass = '';
                // Promotion zone (top N, not in top tier)
                if (!isTopTier && index < promotionCount) {
                  rowClass = 'promotion-zone';
                }
                // Relegation zone (bottom N, not in bottom tier)
                if (!isBottomTier && index >= tierPlayers.length - promotionCount) {
                  rowClass = 'relegation-zone';
                }
                return `
                  <tr class="${rowClass}">
                    <td>${index + 1}</td>
                    <td>${escapeHtml(player.name)}</td>
                    <td><strong>${player.stats.points}</strong></td>
                    <td>${player.stats.matchesPlayed}</td>
                    <td>${player.stats.matchesWon}</td>
                    <td>${player.stats.matchesLost}</td>
                    <td>${player.stats.frameDifference > 0 ? '+' : ''}${player.stats.frameDifference}</td>
                    <td>
                      <button class="btn btn-sm btn-secondary" onclick="app.editPlayer('${player.id}')">Edit</button>
                      <button class="btn btn-sm btn-danger" onclick="app.removePlayer('${player.id}')">Remove</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  /**
   * Render rounds view with matches grouped by tier.
   */
  static renderTieredRoundMatches(round, leagueData) {
    const { tierConfig } = leagueData.league;
    const tierColors = {
      'Diamond': '#b9f2ff',
      'Gold': '#ffd700',
      'Silver': '#c0c0c0',
      'Bronze': '#cd7f32'
    };

    // Group matches by tier (look up player1's tier)
    const matchesByTier = {};
    for (const tierName of tierConfig.tiers) {
      matchesByTier[tierName] = [];
    }

    for (const match of round.matches) {
      const player1 = leagueData.players.find(p => p.id === match.player1Id);
      const tierName = player1 ? player1.tier : 'Unknown';
      if (!matchesByTier[tierName]) matchesByTier[tierName] = [];
      matchesByTier[tierName].push(match);
    }

    let html = '';
    for (const tierName of tierConfig.tiers) {
      const matches = matchesByTier[tierName] || [];
      if (matches.length === 0) continue;
      const bgColor = tierColors[tierName] || '#e8e8e8';

      html += `
        <div class="tier-matches-group" style="margin-bottom: 1rem;">
          <h5 style="background: ${bgColor}; padding: 0.3rem 0.75rem; border-radius: 4px; margin-bottom: 0.5rem;">
            ${escapeHtml(tierName)}
          </h5>
          <div class="matches-list">
            ${matches.map(match => {
              const player1 = leagueData.players.find(p => p.id === match.player1Id);
              const player2 = match.player2Id ? leagueData.players.find(p => p.id === match.player2Id) : null;

              if (match.isBye) {
                return `<div class="match-card bye-match"><span>${escapeHtml(player1.name)} - BYE</span></div>`;
              }
              if (match.isForfeit) {
                const winner = match.winnerId ? leagueData.players.find(p => p.id === match.winnerId) : null;
                const isDouble = match.forfeitType === 'double';
                return `
                  <div class="match-card match-completed forfeit-match">
                    <div class="match-players">
                      <span>${escapeHtml(player1.name)}</span>
                      <span class="vs">vs</span>
                      <span>${escapeHtml(player2.name)}</span>
                    </div>
                    <div class="match-score"><span class="score forfeit-label">${isDouble ? 'DOUBLE FORFEIT' : 'FORFEIT'}</span></div>
                  </div>
                `;
              }
              return `
                <div class="match-card match-${match.status}">
                  <div class="match-players">
                    <span>${escapeHtml(player1.name)}</span>
                    <span class="vs">vs</span>
                    <span>${escapeHtml(player2.name)}</span>
                  </div>
                  <div class="match-score">
                    <span class="score">${match.player1FramesWon} - ${match.player2FramesWon}</span>
                  </div>
                  <button class="btn btn-sm btn-primary" onclick="app.selectMatch('${match.id}')">
                    ${match.status === 'pending' ? 'Enter Scores' : 'View/Edit'}
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    return html;
  }

  /**
   * Render season management section (promotion/relegation preview + new season button).
   */
  static renderSeasonManagement(leagueData) {
    const { league } = leagueData;
    const canStart = TierManager.canStartNewSeason(leagueData);
    const { promotions, relegations } = TierManager.calculatePromotionRelegation(leagueData);

    let html = `
      <div class="season-management" style="margin-top: 2rem; padding: 1.5rem; border: 2px solid #007bff; border-radius: 8px;">
        <h3>Season ${league.currentSeason} Management</h3>
    `;

    if (canStart.canStart) {
      html += `
        <div class="promotion-relegation-preview" style="margin-bottom: 1.5rem;">
          <h4>Promotion/Relegation Preview</h4>
      `;

      if (promotions.length > 0) {
        html += `
          <div style="margin-bottom: 1rem;">
            <h5 style="color: #28a745;">Promotions &#9650;</h5>
            <ul>
              ${promotions.map(p => `<li><strong>${escapeHtml(p.player.name)}</strong>: ${escapeHtml(p.fromTier)} &#8594; ${escapeHtml(p.toTier)}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      if (relegations.length > 0) {
        html += `
          <div style="margin-bottom: 1rem;">
            <h5 style="color: #dc3545;">Relegations &#9660;</h5>
            <ul>
              ${relegations.map(r => `<li><strong>${escapeHtml(r.player.name)}</strong>: ${escapeHtml(r.fromTier)} &#8594; ${escapeHtml(r.toTier)}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      html += `
        </div>
        <button class="btn btn-success btn-lg" id="start-new-season-btn">
          Start Season ${league.currentSeason + 1}
        </button>
        <p class="form-text" style="margin-top: 0.5rem;">This will apply promotions/relegations, reset season stats, and prepare new round-robin fixtures.</p>
      `;
    } else {
      html += `
        <div class="alert alert-warning">
          <p>Complete all rounds before starting a new season:</p>
          <ul>${canStart.errors.map(e => `<li>${e}</li>`).join('')}</ul>
        </div>
      `;

      // Still show preview of what would happen
      if (leagueData.rounds.length > 0) {
        html += `
          <div class="promotion-relegation-preview" style="margin-top: 1rem; opacity: 0.7;">
            <h4>Current Projection (may change)</h4>
        `;
        if (promotions.length > 0) {
          html += `<p><strong>Promotions:</strong> ${promotions.map(p => `${escapeHtml(p.player.name)} (${escapeHtml(p.fromTier)} &#8594; ${escapeHtml(p.toTier)})`).join(', ')}</p>`;
        }
        if (relegations.length > 0) {
          html += `<p><strong>Relegations:</strong> ${relegations.map(r => `${escapeHtml(r.player.name)} (${escapeHtml(r.fromTier)} &#8594; ${escapeHtml(r.toTier)})`).join(', ')}</p>`;
        }
        html += '</div>';
      }
    }

    // Season history
    if (leagueData.seasons && leagueData.seasons.length > 1) {
      const completedSeasons = leagueData.seasons.filter(s => s.status === 'completed');
      if (completedSeasons.length > 0) {
        html += `
          <div class="season-history" style="margin-top: 2rem;">
            <h4>Season History</h4>
            ${completedSeasons.map(season => `
              <div class="season-card" style="border: 1px solid #ddd; padding: 1rem; margin-bottom: 1rem; border-radius: 4px;">
                <h5>Season ${season.seasonNumber}</h5>
                <p>Completed: ${formatDate(season.completedAt)}</p>
                ${season.promotions.length > 0 ? `
                  <p><strong>Promoted:</strong> ${season.promotions.map(p => {
                    const player = leagueData.players.find(pl => pl.id === p.playerId);
                    return player ? `${escapeHtml(player.name)} (${p.fromTier} &#8594; ${p.toTier})` : 'Unknown';
                  }).join(', ')}</p>
                ` : ''}
                ${season.relegations.length > 0 ? `
                  <p><strong>Relegated:</strong> ${season.relegations.map(r => {
                    const player = leagueData.players.find(pl => pl.id === r.playerId);
                    return player ? `${escapeHtml(player.name)} (${r.fromTier} &#8594; ${r.toTier})` : 'Unknown';
                  }).join(', ')}</p>
                ` : ''}
              </div>
            `).join('')}
          </div>
        `;
      }
    }

    html += '</div>';
    return html;
  }
}
