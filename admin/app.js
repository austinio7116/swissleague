import { StorageManager, LeagueError } from './modules/storage.js';
import { LeagueManager } from './modules/league.js';
import { PlayerManager } from './modules/players.js';
import { RoundManager } from './modules/rounds.js';
import { ScoringManager } from './modules/scoring.js';
import { SwissPairing } from './modules/swiss-pairing.js';
import { ScoreValidator, showValidationErrors, clearValidationErrors } from './utils/validation.js';
import { 
  generateId, 
  formatDate, 
  escapeHtml, 
  calculateStandings,
  downloadJSON,
  readJSONFile,
  validateLeagueData
} from './utils/helpers.js';
import { VIEWS, ERROR_TYPES } from '../shared/constants.js';

class AdminApp {
  constructor() {
    this.leagueData = null;
    this.currentView = VIEWS.LEAGUE_SETUP;
    this.selectedMatchId = null;
    this.init();
  }

  init() {
    // Load existing league data
    try {
      this.leagueData = StorageManager.load();
    } catch (error) {
      this.showError('Failed to load league data: ' + error.message);
    }

    // Set up event listeners
    this.setupEventListeners();

    // Render initial view
    if (this.leagueData) {
      this.switchView(VIEWS.PLAYERS);
    } else {
      this.switchView(VIEWS.LEAGUE_SETUP);
    }
  }

  setupEventListeners() {
    // Navigation
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.target.dataset.view;
        this.switchView(view);
      });
    });

    // League setup
    const createLeagueBtn = document.getElementById('create-league-btn');
    if (createLeagueBtn) {
      createLeagueBtn.addEventListener('click', () => this.createLeague());
    }

    // Player management
    const addPlayerBtn = document.getElementById('add-player-btn');
    if (addPlayerBtn) {
      addPlayerBtn.addEventListener('click', () => this.addPlayer());
    }

    // Round generation
    const generateRoundBtn = document.getElementById('generate-round-btn');
    if (generateRoundBtn) {
      generateRoundBtn.addEventListener('click', () => this.generateRound());
    }

    // Data management
    const exportBtn = document.getElementById('export-json-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportJSON());
    }

    const importBtn = document.getElementById('import-json-btn');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        document.getElementById('import-file-input').click();
      });
    }

    const importFileInput = document.getElementById('import-file-input');
    if (importFileInput) {
      importFileInput.addEventListener('change', (e) => this.importJSON(e));
    }

    const clearDataBtn = document.getElementById('clear-data-btn');
    if (clearDataBtn) {
      clearDataBtn.addEventListener('click', () => this.clearData());
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
          e.preventDefault();
          this.saveData();
        } else if (e.key === 'e') {
          e.preventDefault();
          this.exportJSON();
        }
      }
    });
  }

  switchView(viewName) {
    this.currentView = viewName;

    // Update navigation
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
      view.style.display = 'none';
    });

    // Show selected view
    const activeView = document.getElementById(`${viewName}-view`);
    if (activeView) {
      activeView.style.display = 'block';
    }

    // Render view content
    this.renderView(viewName);

    // Update navigation visibility
    this.updateNavigation();
  }

  updateNavigation() {
    const nav = document.querySelector('.main-nav');
    if (!nav) return;

    if (this.leagueData) {
      nav.style.display = 'flex';
    } else {
      nav.style.display = 'none';
    }
  }

  renderView(viewName) {
    switch (viewName) {
      case VIEWS.LEAGUE_SETUP:
        this.renderLeagueSetup();
        break;
      case VIEWS.PLAYERS:
        this.renderPlayers();
        break;
      case VIEWS.ROUNDS:
        this.renderRounds();
        break;
      case VIEWS.SCORING:
        this.renderScoring();
        break;
      case VIEWS.DATA:
        this.renderData();
        break;
    }
  }

  renderLeagueSetup() {
    const container = document.getElementById('league-setup-content');
    if (!container) return;

    if (this.leagueData) {
      // Show existing league info
      const league = this.leagueData.league;
      const stats = LeagueManager.getLeagueStats(this.leagueData);
      
      container.innerHTML = `
        <div class="league-info">
          <h2>${escapeHtml(league.name)}</h2>
          <div class="league-details">
            <p><strong>Format:</strong> Swiss (Best of ${league.bestOfFrames})</p>
            <p><strong>Total Rounds:</strong> ${league.totalRounds}</p>
            <p><strong>Current Round:</strong> ${league.currentRound}</p>
            <p><strong>Active Players:</strong> ${stats.activePlayers}</p>
            <p><strong>Completed Rounds:</strong> ${stats.completedRounds}</p>
            <p><strong>Created:</strong> ${formatDate(league.createdAt)}</p>
          </div>
          <button class="btn btn-danger" onclick="app.resetLeague()">Reset League</button>
        </div>
      `;
    } else {
      // Show create league form
      const bestOfOptions = LeagueManager.getBestOfOptions();
      
      container.innerHTML = `
        <div class="create-league-form">
          <h2>Create New League</h2>
          <div class="form-group">
            <label for="league-name">League Name</label>
            <input type="text" id="league-name" class="form-control" placeholder="e.g., Winter 2026 Snooker League" required>
          </div>
          <div class="form-group">
            <label for="best-of-frames">Best of Frames</label>
            <select id="best-of-frames" class="form-control">
              ${bestOfOptions.map(n => `<option value="${n}"${n === 5 ? ' selected' : ''}>Best of ${n}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="total-rounds">Total Rounds</label>
            <input type="number" id="total-rounds" class="form-control" value="7" min="1" max="20">
            <small class="form-text">Recommended: 7 rounds for Swiss format</small>
          </div>
          <div id="league-errors" class="error-container"></div>
          <button id="create-league-btn" class="btn btn-primary">Create League</button>
        </div>
      `;
            // Attach event listener after button is rendered
      const createLeagueBtn = document.getElementById('create-league-btn');
      if (createLeagueBtn) {
        createLeagueBtn.addEventListener('click', () => this.createLeague());
      }
    }
  }

  renderPlayers() {
    if (!this.leagueData) return;

    const container = document.getElementById('players-content');
    if (!container) return;

    const activePlayers = PlayerManager.getActivePlayers(this.leagueData);
    const inactivePlayers = PlayerManager.getInactivePlayers(this.leagueData);
    const standings = calculateStandings(this.leagueData);

    container.innerHTML = `
      <div class="players-section">
        <h2>Player Management</h2>
        
        <div class="add-player-form">
          <div class="form-group">
            <label for="player-name">Add Player</label>
            <div class="input-group">
              <input type="text" id="player-name" class="form-control" placeholder="Player name">
              <button id="add-player-btn" class="btn btn-primary">Add Player</button>
            </div>
          </div>
          <div id="player-errors" class="error-container"></div>
        </div>

        <div class="standings-table-container">
          <h3>Current Standings (${activePlayers.length} players)</h3>
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
              ${standings.map((player, index) => `
                <tr>
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
              `).join('')}
            </tbody>
          </table>
        </div>

        ${inactivePlayers.length > 0 ? `
          <div class="inactive-players">
            <h3>Inactive Players</h3>
            <ul>
              ${inactivePlayers.map(player => `
                <li>
                  ${escapeHtml(player.name)}
                  <button class="btn btn-sm btn-primary" onclick="app.activatePlayer('${player.id}')">Reactivate</button>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
        // Attach event listener after button is rendered
    const addPlayerBtn = document.getElementById('add-player-btn');
    if (addPlayerBtn) {
      addPlayerBtn.addEventListener('click', () => this.addPlayer());
    }
  }

  renderRounds() {
    if (!this.leagueData) return;

    const container = document.getElementById('rounds-content');
    if (!container) return;

    const { league, rounds } = this.leagueData;
    const currentRound = RoundManager.getCurrentRound(this.leagueData);
    const isCurrentRoundComplete = currentRound && RoundManager.isRoundComplete(this.leagueData, league.currentRound);
    const canGenerate = LeagueManager.canGenerateNextRound(this.leagueData);

    container.innerHTML = `
      <div class="rounds-section">
        <h2>Round Management</h2>
        
        <div class="round-info">
          <p><strong>Current Round:</strong> ${league.currentRound} of ${league.totalRounds}</p>
          ${isCurrentRoundComplete ? `
            ${league.currentRound < league.totalRounds ? `
              <button id="advance-round-btn" class="btn btn-success">Advance to Round ${league.currentRound + 1}</button>
            ` : `
              <div class="alert alert-success">
                <p><strong>League Complete!</strong> All rounds have been played.</p>
              </div>
            `}
          ` : canGenerate.canGenerate ? `
            <button id="generate-round-btn" class="btn btn-primary">Generate Round ${league.currentRound}</button>
          ` : `
            <div class="alert alert-warning">
              ${canGenerate.errors.map(err => `<p>${err}</p>`).join('')}
            </div>
          `}
        </div>

        <div class="rounds-list">
          ${rounds.map(round => this.renderRoundSummary(round)).join('')}
        </div>
      </div>
    `;
        // Attach event listeners after buttons are rendered
    const generateRoundBtn = document.getElementById('generate-round-btn');
    if (generateRoundBtn) {
      generateRoundBtn.addEventListener('click', () => this.generateRound());
    }
    
    const advanceRoundBtn = document.getElementById('advance-round-btn');
    if (advanceRoundBtn) {
      advanceRoundBtn.addEventListener('click', () => this.advanceRound());
    }
  }

  renderRoundSummary(round) {
    const stats = RoundManager.getRoundStats(round);
    
    return `
      <div class="round-card">
        <h3>Round ${round.roundNumber} <span class="badge badge-${round.status}">${round.status}</span></h3>
        <p>Progress: ${stats.completedMatches}/${stats.totalMatches} matches (${stats.progress}%)</p>
        <div class="matches-list">
          ${round.matches.map(match => this.renderMatchSummary(match, round.roundNumber)).join('')}
        </div>
      </div>
    `;
  }

  renderMatchSummary(match, roundNumber) {
    const player1 = this.leagueData.players.find(p => p.id === match.player1Id);
    const player2 = match.player2Id ? this.leagueData.players.find(p => p.id === match.player2Id) : null;

    if (match.isBye) {
      return `
        <div class="match-card bye-match">
          <span>${escapeHtml(player1.name)} - BYE (Auto Win)</span>
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
          ${match.status === 'completed' ? `
            <span class="score">${match.player1FramesWon} - ${match.player2FramesWon}</span>
          ` : `
            <span class="score">${match.player1FramesWon} - ${match.player2FramesWon}</span>
          `}
        </div>
        <button class="btn btn-sm btn-primary" onclick="app.selectMatch('${match.id}')">
          ${match.status === 'pending' ? 'Enter Scores' : 'View/Edit'}
        </button>
      </div>
    `;
  }

  renderScoring() {
    if (!this.leagueData) return;

    const container = document.getElementById('scoring-content');
    if (!container) return;

    if (!this.selectedMatchId) {
      container.innerHTML = `
        <div class="scoring-section">
          <h2>Score Entry</h2>
          <p>Select a match from the Rounds view to enter scores.</p>
        </div>
      `;
      return;
    }

    const matchData = ScoringManager.getMatchWithPlayers(this.leagueData, this.selectedMatchId);
    if (!matchData) {
      container.innerHTML = '<p>Match not found.</p>';
      return;
    }

    const progress = ScoringManager.getMatchProgress(matchData, this.leagueData.league.bestOfFrames);

    container.innerHTML = `
      <div class="scoring-section">
        <h2>Score Entry</h2>
        
        <div class="match-header">
          <h3>${escapeHtml(matchData.player1.name)} vs ${escapeHtml(matchData.player2.name)}</h3>
          <p>Best of ${this.leagueData.league.bestOfFrames} (First to ${progress.framesToWin})</p>
          <p class="match-score">
            <span class="player1-score">${matchData.player1.name}: ${progress.player1FramesWon}</span>
            <span class="separator">-</span>
            <span class="player2-score">${matchData.player2.name}: ${progress.player2FramesWon}</span>
          </p>
        </div>

        ${!progress.isComplete ? `
          <div class="add-frame-form">
            <h4>Add Frame ${matchData.frames.length + 1}</h4>
            <div class="frame-inputs">
              <div class="form-group">
                <label>${escapeHtml(matchData.player1.name)}</label>
                <input type="number" id="frame-p1-score" class="form-control" min="0" max="147" placeholder="0">
              </div>
              <div class="form-group">
                <label>${escapeHtml(matchData.player2.name)}</label>
                <input type="number" id="frame-p2-score" class="form-control" min="0" max="147" placeholder="0">
              </div>
            </div>
            <div id="frame-errors" class="error-container"></div>
            <button class="btn btn-primary" onclick="app.addFrame()">Add Frame</button>
          </div>
        ` : `
          <div class="alert alert-success">
            <strong>Match Complete!</strong> Winner: ${escapeHtml(matchData.player1.id === matchData.winnerId ? matchData.player1.name : matchData.player2.name)}
          </div>
        `}

        <div class="frames-list">
          <h4>Frames</h4>
          <table class="frames-table">
            <thead>
              <tr>
                <th>Frame</th>
                <th>${escapeHtml(matchData.player1.name)}</th>
                <th>${escapeHtml(matchData.player2.name)}</th>
                <th>Winner</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${matchData.frames.map(frame => {
                const winner = frame.winnerId === matchData.player1Id ? matchData.player1 : matchData.player2;
                return `
                  <tr>
                    <td>${frame.frameNumber}</td>
                    <td>${frame.player1Score}</td>
                    <td>${frame.player2Score}</td>
                    <td>${escapeHtml(winner.name)}</td>
                    <td>
                      ${frame.frameNumber === matchData.frames.length ? `
                        <button class="btn btn-sm btn-danger" onclick="app.deleteFrame(${frame.frameNumber})">Delete</button>
                      ` : ''}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <button class="btn btn-secondary" onclick="app.switchView('${VIEWS.ROUNDS}')">Back to Rounds</button>
      </div>
    `;
  }

  renderData() {
    if (!this.leagueData) return;

    const container = document.getElementById('data-content');
    if (!container) return;

    const backupInfo = StorageManager.getBackupInfo();

    container.innerHTML = `
      <div class="data-section">
        <h2>Data Management</h2>
        
        <div class="data-actions">
          <button id="export-json-btn" class="btn btn-primary">Export JSON</button>
          <button id="import-json-btn" class="btn btn-secondary">Import JSON</button>
          <input type="file" id="import-file-input" accept=".json" style="display: none;">
          <button id="clear-data-btn" class="btn btn-danger">Clear All Data</button>
        </div>

        ${backupInfo.exists ? `
          <div class="backup-info">
            <h3>Backup Available</h3>
            <p>League: ${escapeHtml(backupInfo.leagueName)}</p>
            <p>Date: ${formatDate(backupInfo.timestamp)}</p>
            <button class="btn btn-secondary" onclick="app.restoreBackup()">Restore Backup</button>
          </div>
        ` : ''}

        <div class="data-preview">
          <h3>Current Data</h3>
          <pre>${JSON.stringify(this.leagueData, null, 2)}</pre>
        </div>
      </div>
    `;
        // Attach event listeners after buttons are rendered
    const exportBtn = document.getElementById('export-json-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportJSON());
    }
    
    const importBtn = document.getElementById('import-json-btn');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        document.getElementById('import-file-input').click();
      });
    }
    
    const importFileInput = document.getElementById('import-file-input');
    if (importFileInput) {
      importFileInput.addEventListener('change', (e) => this.importJSON(e));
    }
    
    const clearDataBtn = document.getElementById('clear-data-btn');
    if (clearDataBtn) {
      clearDataBtn.addEventListener('click', () => this.clearData());
    }
  }

  // Action methods
  createLeague() {
    const name = document.getElementById('league-name').value;
    const bestOfFrames = document.getElementById('best-of-frames').value;
    const totalRounds = document.getElementById('total-rounds').value;

    clearValidationErrors('league-errors');

    // Validate
    const nameValidation = ScoreValidator.validateLeagueName(name);
    if (!nameValidation.valid) {
      showValidationErrors(nameValidation.errors, 'league-errors');
      return;
    }

    const framesValidation = ScoreValidator.validateBestOfFrames(bestOfFrames);
    if (!framesValidation.valid) {
      showValidationErrors(framesValidation.errors, 'league-errors');
      return;
    }

    const roundsValidation = ScoreValidator.validateTotalRounds(totalRounds, 0);
    if (!roundsValidation.valid) {
      showValidationErrors(roundsValidation.errors, 'league-errors');
      return;
    }

    try {
      this.leagueData = LeagueManager.createLeague(name, bestOfFrames, totalRounds);
      this.saveData();
      this.showSuccess('League created successfully!');
      this.switchView(VIEWS.PLAYERS);
    } catch (error) {
      this.showError('Failed to create league: ' + error.message);
    }
  }

  addPlayer() {
    const nameInput = document.getElementById('player-name');
    const name = nameInput.value;

    clearValidationErrors('player-errors');

    const validation = ScoreValidator.validatePlayerName(name, this.leagueData.players);
    if (!validation.valid) {
      showValidationErrors(validation.errors, 'player-errors');
      return;
    }

    try {
      this.leagueData = PlayerManager.addPlayer(this.leagueData, name);
      this.saveData();
      nameInput.value = '';
      this.showSuccess(`Player ${name} added successfully!`);
      this.renderPlayers();
    } catch (error) {
      this.showError('Failed to add player: ' + error.message);
    }
  }

  removePlayer(playerId) {
    const player = this.leagueData.players.find(p => p.id === playerId);
    if (!player) return;

    const canDelete = PlayerManager.canDeletePlayer(this.leagueData, playerId);
    const action = canDelete ? 'delete' : 'deactivate';
    
    if (!confirm(`Are you sure you want to ${action} ${player.name}?`)) {
      return;
    }

    try {
      this.leagueData = PlayerManager.deletePlayer(this.leagueData, playerId);
      this.saveData();
      this.showSuccess(`Player ${action}d successfully!`);
      this.renderPlayers();
    } catch (error) {
      this.showError(`Failed to ${action} player: ` + error.message);
    }
  }

  activatePlayer(playerId) {
    try {
      this.leagueData = PlayerManager.activatePlayer(this.leagueData, playerId);
      this.saveData();
      this.showSuccess('Player reactivated successfully!');
      this.renderPlayers();
    } catch (error) {
      this.showError('Failed to reactivate player: ' + error.message);
    }
  }

  editPlayer(playerId) {
    const player = this.leagueData.players.find(p => p.id === playerId);
    if (!player) return;

    const newName = prompt('Enter new name:', player.name);
    if (!newName || newName === player.name) return;

    const validation = ScoreValidator.validatePlayerName(newName, this.leagueData.players.filter(p => p.id !== playerId));
    if (!validation.valid) {
      alert(validation.errors.join('\n'));
      return;
    }

    try {
      this.leagueData = PlayerManager.updatePlayer(this.leagueData, playerId, { name: newName });
      this.saveData();
      this.showSuccess('Player updated successfully!');
      this.renderPlayers();
    } catch (error) {
      this.showError('Failed to update player: ' + error.message);
    }
  }

  generateRound() {
    try {
      StorageManager.backup();
      this.leagueData = RoundManager.generateRound(this.leagueData);
      this.saveData();
      this.showSuccess(`Round ${this.leagueData.league.currentRound} generated successfully!`);
      this.renderRounds();
    } catch (error) {
      this.showError('Failed to generate round: ' + error.message);
    }
  }

  advanceRound() {
    try {
      const currentRound = this.leagueData.league.currentRound;
      this.leagueData = RoundManager.advanceToNextRound(this.leagueData);
      this.saveData();
      this.showSuccess(`Advanced to Round ${this.leagueData.league.currentRound}!`);
      this.renderRounds();
    } catch (error) {
      this.showError('Failed to advance round: ' + error.message);
    }
  }

  selectMatch(matchId) {
    this.selectedMatchId = matchId;
    this.switchView(VIEWS.SCORING);
  }

  addFrame() {
    const p1Score = document.getElementById('frame-p1-score').value;
    const p2Score = document.getElementById('frame-p2-score').value;

    clearValidationErrors('frame-errors');

    const validation = ScoreValidator.validateFrame(p1Score, p2Score);
    if (!validation.valid) {
      showValidationErrors(validation.errors, 'frame-errors');
      return;
    }

    try {
      this.leagueData = ScoringManager.addFrame(
        this.leagueData,
        this.selectedMatchId,
        validation.player1Score,
        validation.player2Score
      );
      this.saveData();
      this.showSuccess('Frame added successfully!');
      
      // Clear inputs
      document.getElementById('frame-p1-score').value = '';
      document.getElementById('frame-p2-score').value = '';
      
      this.renderScoring();
    } catch (error) {
      this.showError('Failed to add frame: ' + error.message);
    }
  }

  deleteFrame(frameNumber) {
    if (!confirm('Are you sure you want to delete this frame?')) {
      return;
    }

    try {
      this.leagueData = ScoringManager.deleteFrame(this.leagueData, this.selectedMatchId, frameNumber);
      this.saveData();
      this.showSuccess('Frame deleted successfully!');
      this.renderScoring();
    } catch (error) {
      this.showError('Failed to delete frame: ' + error.message);
    }
  }

  exportJSON() {
    if (!this.leagueData) {
      this.showError('No league data to export');
      return;
    }

    try {
      const filename = `${this.leagueData.league.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.json`;
      downloadJSON(this.leagueData, filename);
      this.showSuccess('League data exported successfully!');
    } catch (error) {
      this.showError('Failed to export data: ' + error.message);
    }
  }

  async importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const data = await readJSONFile(file);
      const validation = validateLeagueData(data);
      
      if (!validation.valid) {
        this.showError('Invalid league data: ' + validation.error);
        return;
      }

      if (!confirm('This will replace all current data. Continue?')) {
        return;
      }

      StorageManager.backup();
      this.leagueData = data;
      this.saveData();
      this.showSuccess('League data imported successfully!');
      this.switchView(VIEWS.PLAYERS);
    } catch (error) {
      this.showError('Failed to import data: ' + error.message);
    }

    // Reset file input
    event.target.value = '';
  }

  clearData() {
    if (!confirm('This will delete ALL league data. This cannot be undone. Continue?')) {
      return;
    }

    if (!confirm('Are you ABSOLUTELY sure? This will permanently delete everything.')) {
      return;
    }

    try {
      StorageManager.clear();
      this.leagueData = null;
      this.showSuccess('All data cleared successfully!');
      this.switchView(VIEWS.LEAGUE_SETUP);
    } catch (error) {
      this.showError('Failed to clear data: ' + error.message);
    }
  }

  resetLeague() {
    if (!confirm('This will reset the league and delete all data. Continue?')) {
      return;
    }

    this.clearData();
  }

  restoreBackup() {
    if (!confirm('This will restore the backup and replace current data. Continue?')) {
      return;
    }

    try {
      StorageManager.restore();
      this.leagueData = StorageManager.load();
      this.showSuccess('Backup restored successfully!');
      this.renderView(this.currentView);
    } catch (error) {
      this.showError('Failed to restore backup: ' + error.message);
    }
  }

  saveData() {
    try {
      StorageManager.save(this.leagueData);
    } catch (error) {
      this.showError('Failed to save data: ' + error.message);
    }
  }

  showError(message) {
    this.showToast(message, 'error');
  }

  showSuccess(message) {
    this.showToast(message, 'success');
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, type === 'error' ? 5000 : 3000);
  }
}

// Initialize app
const app = new AdminApp();
window.app = app; // Make available globally for onclick handlers
