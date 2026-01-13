import { DataLoader } from './modules/data-loader.js';
import { StandingsRenderer } from './modules/standings.js';
import { MatchesRenderer } from './modules/matches.js';
import { StatisticsRenderer } from './modules/statistics.js';
import { formatDate, escapeHtml } from './utils/helpers.js';

class DisplayApp {
  constructor() {
    this.dataLoader = new DataLoader();
    this.leagueData = null;
    this.currentView = 'standings';
    this.init();
  }

  async init() {
    // Set up event listeners
    this.setupEventListeners();

    // Always load data if we have a URL (including default)
    if (this.dataLoader.dataUrl) {
      document.getElementById('github-url').value = this.dataLoader.dataUrl;
      await this.loadData();
    } else {
      this.showConfigSection();
    }
  }

  setupEventListeners() {
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
        this.leagueData = result.data;
        this.hideConfigSection();
        this.renderLeagueInfo();
        this.renderCurrentView();
        this.showSuccess('Data loaded successfully!');
        this.updateLastUpdated(result.timestamp);
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
        StatisticsRenderer.renderPlayerStats(this.leagueData, 'statistics-content');
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
