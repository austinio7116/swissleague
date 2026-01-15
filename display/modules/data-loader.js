import { STORAGE_KEYS } from '../../shared/constants.js';
import { convertGitHubUrl } from '../utils/helpers.js';

const DEFAULT_GITHUB_URL = 'https://raw.githubusercontent.com/austinio7116/swissleague/refs/heads/main/data/league.json';
const LOCAL_DATA_URL = '/data/league.json';

function isDevMode() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

export class DataLoader {
  constructor() {
    this.devMode = isDevMode();
    this.dataUrl = this.devMode ? LOCAL_DATA_URL : this.loadSavedUrl();
    this.lastFetchTime = null;
    this.cachedData = null;
  }

  loadSavedUrl() {
    try {
      const savedUrl = localStorage.getItem(STORAGE_KEYS.GITHUB_URL);
      return savedUrl || DEFAULT_GITHUB_URL;
    } catch (error) {
      console.error('Failed to load saved URL:', error);
      return DEFAULT_GITHUB_URL;
    }
  }

  saveUrl(url) {
    try {
      localStorage.setItem(STORAGE_KEYS.GITHUB_URL, url);
      this.dataUrl = url;
      return true;
    } catch (error) {
      console.error('Failed to save URL:', error);
      return false;
    }
  }

  async fetchLeagueData(url = null) {
    const fetchUrl = url || this.dataUrl;

    if (!fetchUrl) {
      throw new Error('No data URL configured');
    }

    // Skip GitHub URL conversion in dev mode (loading from local file)
    const rawUrl = this.devMode ? fetchUrl : convertGitHubUrl(fetchUrl);

    try {
      const response = await fetch(rawUrl, {
        cache: 'no-cache',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Check if it's the new multi-league format
      if (data.leagues && typeof data.leagues === 'object') {
        // New multi-league format
        this.cachedData = data;
        this.lastFetchTime = new Date().toISOString();
        
        return {
          success: true,
          data,
          isMultiLeague: true,
          timestamp: this.lastFetchTime
        };
      }
      
      // Legacy single-league format
      if (!data.league || !data.players || !data.rounds) {
        throw new Error('Invalid league data structure');
      }

      this.cachedData = data;
      this.lastFetchTime = new Date().toISOString();

      return {
        success: true,
        data,
        isMultiLeague: false,
        timestamp: this.lastFetchTime
      };
    } catch (error) {
      console.error('Fetch error:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async testConnection(url) {
    const result = await this.fetchLeagueData(url);
    return result.success;
  }

  getCachedData() {
    return this.cachedData;
  }

  getLastFetchTime() {
    return this.lastFetchTime;
  }

  clearCache() {
    this.cachedData = null;
    this.lastFetchTime = null;
  }
}
