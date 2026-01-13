import { DataLoader } from './modules/data-loader.js';
import { StandingsRenderer } from './modules/standings.js';
import { MatchesRenderer } from './modules/matches.js';
import { StatisticsRenderer } from './modules/statistics.js';
import { formatDate, escapeHtml } from './utils/helpers.js';
import { STORAGE_KEYS } from '../shared/constants.js';

class DisplayApp {
  constructor() {
    this.dataLoader = new DataLoader();
    this.leagueData = null;
    this.allLeaguesData = null; // Store all leagues when loaded from GitHub
    this.currentView = 'standings';
    this.dataSource = 'github'; // 'github' or 'local'
    this.init();
  }

  async init() {
    // Set up event listeners
    this.setupEventListeners();

    // Load local leagues list
    this.loadLocalLeaguesList();

    // Always load data if we have a URL (including default)
    if (this.dataLoader.dataUrl) {
      document.getElementById('github-url').value = this.dataLoader.dataUrl;
      await this.loadData();
    } else {
      this.showConfigSection();
    }
  }

  setupEventListeners() {
    // Configuration tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Configuration
    const loadDataBtn = document.getElementById('load-data-btn');
    if (loadDataBtn) {
      loadDataBtn.addEventListener('click', () => this.saveAndLoadUrl());
    }

    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadData());
    }

    // Navigation
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.target.dataset.view;
        this.switchView(view);
      });
    });

    // Enter key on URL input
    const urlInput = document.getElementById('github-url');
    if (urlInput) {
      urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.saveAndLoadUrl();
        }
      });
    }
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.config-tab').forEach(tab => {
      tab.style.display = 'none';
    });

    const activeTab = document.getElementById(`${tabName}-tab`);
    if (activeTab) {
      activeTab.style.display = 'block';
    }

    this.dataSource = tabName;

    // Reload local leagues if switching to local tab
    if (tabName === 'local') {
      this.loadLocalLeaguesList();
    }
  }

  loadLocalLeaguesList() {
    const container = document.getElementById('local-leagues-list');
    if (!container) return;

    try {
      const leaguesJson = localStorage.getItem(STORAGE_KEYS.LEAGUES);
      if (!leaguesJson) {
        container.innerHTML = `
          <div class="no-leagues">
            <p>No local leagues found.</p>
            <p>Create leagues using the <a href="../admin/index.html">Admin Interface</a>.</p>
          </div>
        `;
        return;
      }

      const leagues = JSON.parse(leaguesJson);
      const leaguesList = Object.values(leagues).map(league => ({
        id: league.league.id,
        name: league.league.name,
        updatedAt: league.league.updatedAt,
        currentRound: league.league.currentRound,
        totalRounds: league.league.totalRounds,
        status: league.league.currentRound >= league.league.totalRounds ? 'completed' : 'active'
      })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

      if (leaguesList.length === 0) {
        container.innerHTML = `
          <div class="no-leagues">
            <p>No local leagues found.</p>
            <p>Create leagues using the <a href="../admin/index.html">Admin Interface</a>.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="local-leagues-grid">
          ${leaguesList.map(league => `
            <div class="league-card ${league.status}">
              <div class="league-card-header">
                <h4>${escapeHtml(league.name)}</h4>
                <span class="badge badge-${league.status}">${league.status}</span>
              </div>
              <div class="league-card-body">
                <p><strong>Round:</strong> ${league.currentRound} of ${league.totalRounds}</p>
                <p><strong>Last Updated:</strong> ${formatDate(league.updatedAt)}</p>
              </div>
              <div class="league-card-actions">
                <button class="btn btn-primary" onclick="displayApp.loadLocalLeague('${league.id}')">
                  View League
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (error) {
      console.error('Failed to load local leagues:', error);
      container.innerHTML = `
        <div class="error-message">
          <p>Failed to load local leagues.</p>
        </div>
      `;
    }
  }

  loadLocalLeague(leagueId) {
    try {
      const leaguesJson = localStorage.getItem(STORAGE_KEYS.LEAGUES);
      if (!leaguesJson) {
        this.showError('No local leagues found');
        return;
      }

      const leagues = JSON.parse(leaguesJson);
      const leagueData = leagues[leagueId];

      if (!leagueData) {
        this.showError('League not found');
        return;
      }

      this.leagueData = leagueData;
      // Store all leagues data for cross-league stats
      this.allLeaguesData = { leagues: leagues };
      this.dataSource = 'local';
      this.hideConfigSection();
      this.renderLeagueInfo();
      this.renderCurrentView();
      this.showSuccess('League loaded successfully!');
      this.updateLastUpdated(leagueData.league.updatedAt);
      this.showLeagueSelectorButton();
    } catch (error) {
      this.showError('Failed to load league: ' + error.message);
    }
  }

  async saveAndLoadUrl() {
    const url = document.getElementById('github-url').value.trim();
    
    if (!url) {
      this.showError('Please enter a GitHub URL');
      return;
    }

    this.dataLoader.saveUrl(url);
    await this.loadData();
  }

  async loadData() {
    this.showLoading(true);
    
    try {
      const result = await this.dataLoader.fetchLeagueData();
      
      if (result.success) {
        // Check if it's multi-league format
        if (result.isMultiLeague) {
          this.allLeaguesData = result.data;
          
          // If there's a current league ID, load that league
          if (result.data.currentLeagueId && result.data.leagues[result.data.currentLeagueId]) {
            this.leagueData = result.data.leagues[result.data.currentLeagueId];
            this.hideConfigSection();
            this.renderLeagueInfo();
            this.renderCurrentView();
            this.showSuccess('Data loaded successfully!');
            this.updateLastUpdated(result.timestamp);
            
            // Show league selector button if multiple leagues
            this.showLeagueSelectorButton();
          } else {
            // Show league selector if no current league
            this.showGitHubLeagueSelector();
          }
        } else {
          // Legacy single-league format
          this.leagueData = result.data;
          this.hideConfigSection();
          this.renderLeagueInfo();
          this.renderCurrentView();
          this.showSuccess('Data loaded successfully!');
          this.updateLastUpdated(result.timestamp);
        }
      } else {
        this.showError(`Failed to load data: ${result.error}`);
        this.showConfigSection();
      }
    } catch (error) {
      this.showError(`Error loading data: ${error.message}`);
      this.showConfigSection();
    } finally {
      this.showLoading(false);
    }
  }

  showLeagueSelectorButton() {
    if (!this.allLeaguesData || Object.keys(this.allLeaguesData.leagues).length <= 1) {
      return;
    }

    const leagueInfo = document.getElementById('league-info');
    if (leagueInfo && !document.getElementById('change-league-btn')) {
      const button = document.createElement('button');
      button.id = 'change-league-btn';
      button.className = 'btn btn-secondary';
      button.textContent = 'Switch League';
      button.style.marginTop = '10px';
      button.onclick = () => this.showGitHubLeagueSelector();
      leagueInfo.appendChild(button);
    }
  }

  showGitHubLeagueSelector() {
    if (!this.allLeaguesData) return;

    const appMain = document.querySelector('.app-main');
    if (!appMain) return;

    const leagues = this.allLeaguesData.leagues;
    const leaguesList = Object.values(leagues).map(league => ({
      id: league.league.id,
      name: league.league.name,
      updatedAt: league.league.updatedAt,
      currentRound: league.league.currentRound,
      totalRounds: league.league.totalRounds,
      status: league.league.status || (league.league.currentRound >= league.league.totalRounds ? 'completed' : 'active')
    })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    // Hide all view containers
    document.querySelectorAll('.view-container').forEach(container => {
      container.style.display = 'none';
    });

    // Remove existing selector if present
    const existingSelector = document.querySelector('.league-selector-container');
    if (existingSelector) {
      existingSelector.remove();
    }

    // Create and insert league selector
    const selectorHTML = `
      <div class="league-selector-container view-container" style="padding: 2rem; display: block;">
        <h2>Select a League to View</h2>
        <div class="local-leagues-grid" style="margin-top: 2rem;">
          ${leaguesList.map(league => `
            <div class="league-card ${league.status}">
              <div class="league-card-header">
                <h4>${escapeHtml(league.name)}</h4>
                <span class="badge badge-${league.status}">${league.status}</span>
              </div>
              <div class="league-card-body">
                <p><strong>Round:</strong> ${league.currentRound} of ${league.totalRounds}</p>
                <p><strong>Last Updated:</strong> ${formatDate(league.updatedAt)}</p>
              </div>
              <div class="league-card-actions">
                <button class="btn btn-primary" onclick="displayApp.selectGitHubLeague('${league.id}')">
                  View League
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    appMain.insertAdjacentHTML('beforeend', selectorHTML);
    
    // Ensure main content is visible
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.style.display = 'flex';
    }
    
    this.hideConfigSection();
  }

  selectGitHubLeague(leagueId) {
    if (!this.allLeaguesData || !this.allLeaguesData.leagues[leagueId]) {
      this.showError('League not found');
      return;
    }

    this.leagueData = this.allLeaguesData.leagues[leagueId];
    
    // Remove the league selector if it exists
    const selectorContainer = document.querySelector('.league-selector-container');
    if (selectorContainer) {
      selectorContainer.remove();
    }
    
    // Ensure main content structure is visible
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.style.display = 'flex';
    }
    
    this.hideConfigSection();
    this.renderLeagueInfo();
    this.switchView('standings'); // Reset to standings view
    this.showSuccess('League loaded successfully!');
    this.updateLastUpdated(this.leagueData.league.updatedAt);
    this.showLeagueSelectorButton();
  }

  showConfigSection() {
    const configSection = document.getElementById('config-section');
    const mainContent = document.getElementById('main-content');
    
    if (configSection) configSection.style.display = 'block';
    if (mainContent) mainContent.style.display = 'none';
  }

  hideConfigSection() {
    const configSection = document.getElementById('config-section');
    const mainContent = document.getElementById('main-content');
    
    if (configSection) configSection.style.display = 'none';
    if (mainContent) mainContent.style.display = 'flex';
  }

  renderLeagueInfo() {
    if (!this.leagueData) return;

    const container = document.getElementById('league-info');
    if (!container) return;

    const { league } = this.leagueData;

    container.innerHTML = `
      <div class="league-header">
        <h1>🎱 ${escapeHtml(league.name)}</h1>
        <p class="league-format">Swiss Format - Best of ${league.bestOfFrames}</p>
        <p class="league-rounds">Round ${league.currentRound} of ${league.totalRounds}</p>
      </div>
    `;
  }

  switchView(viewName) {
    this.currentView = viewName;

    // Update navigation
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    this.renderCurrentView();
  }

  renderCurrentView() {
    if (!this.leagueData) return;

    // Hide all view containers
    document.querySelectorAll('.view-container').forEach(container => {
      container.style.display = 'none';
    });

    // Show and render current view
    const viewContainer = document.getElementById(`${this.currentView}-container`);
    if (viewContainer) {
      viewContainer.style.display = 'block';
    }

    switch (this.currentView) {
      case 'standings':
        StandingsRenderer.render(this.leagueData, 'standings-content');
        StatisticsRenderer.renderLeagueStats(this.leagueData, 'league-stats-content');
        break;
      case 'matches':
        MatchesRenderer.renderOutstanding(this.leagueData, 'outstanding-content');
        break;
      case 'history':
        MatchesRenderer.renderHistory(this.leagueData, 'history-content');
        break;
      case 'statistics':
        // Pass allLeaguesData if available to show cross-league stats
        StatisticsRenderer.renderPlayerStats(this.leagueData, 'statistics-content', this.allLeaguesData);
        break;
    }
  }

  toggleFrames(matchId) {
    MatchesRenderer.toggleFrames(matchId);
  }

  sortPlayerStats(column) {
    if (!this.leagueData) return;
    
    // Toggle direction if clicking the same column
    if (StatisticsRenderer.currentSort.column === column) {
      StatisticsRenderer.currentSort.direction =
        StatisticsRenderer.currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      // New column, default to descending for numeric columns, ascending for name
      StatisticsRenderer.currentSort.column = column;
      StatisticsRenderer.currentSort.direction = column === 'name' ? 'asc' : 'desc';
    }
    
    // Re-render the statistics view
    StatisticsRenderer.renderPlayerStats(this.leagueData, 'statistics-content');
  }

  sortCrossLeagueStats(column) {
    if (!this.allLeaguesData) return;
    
    // Toggle direction if clicking the same column
    if (StatisticsRenderer.crossLeagueSort.column === column) {
      StatisticsRenderer.crossLeagueSort.direction =
        StatisticsRenderer.crossLeagueSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      // New column, default to descending for numeric columns, ascending for name
      StatisticsRenderer.crossLeagueSort.column = column;
      StatisticsRenderer.crossLeagueSort.direction = column === 'name' ? 'asc' : 'desc';
    }
    
    // Re-render the cross-league statistics view
    StatisticsRenderer.renderPlayerStats(this.leagueData, 'statistics-content', this.allLeaguesData);
  }

  showPlayerDetails(playerId) {
    // Create modal or switch to details view
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div id="player-details-content"></div>
      </div>
    `;
    document.body.appendChild(modal);

    StatisticsRenderer.renderPlayerDetails(this.leagueData, playerId, 'player-details-content');

    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closePlayerDetails();
      }
    });
  }

  closePlayerDetails() {
    const modal = document.querySelector('.modal');
    if (modal) {
      modal.remove();
    }
  }

  showLoading(show) {
    const loader = document.getElementById('loading-indicator');
    if (loader) {
      loader.style.display = show ? 'flex' : 'none';
    }
  }

  updateLastUpdated(timestamp) {
    const element = document.getElementById('last-updated');
    if (element && timestamp) {
      element.textContent = `Last updated: ${formatDate(timestamp)}`;
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
const displayApp = new DisplayApp();
window.displayApp = displayApp; // Make available globally for onclick handlers
