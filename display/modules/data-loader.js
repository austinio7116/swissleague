import { STORAGE_KEYS } from '../../shared/constants.js';
import { convertGitHubUrl } from '../utils/helpers.js';

export class DataLoader {
  constructor() {
    this.dataUrl = this.loadSavedUrl();
    this.lastFetchTime = null;
    this.cachedData = null;
  }

  loadSavedUrl() {
    try {
      return localStorage.getItem(STORAGE_KEYS.GITHUB_URL) || '';
    } catch (error) {
      console.error('Failed to load saved URL:', error);
      return '';
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

    const rawUrl = convertGitHubUrl(fetchUrl);

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
      
      // Validate basic structure
      if (!data.league || !data.players || !data.rounds) {
        throw new Error('Invalid league data structure');
      }

      this.cachedData = data;
      this.lastFetchTime = new Date().toISOString();

      return {
        success: true,
        data,
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
