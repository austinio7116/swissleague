import { STORAGE_KEYS, ERROR_TYPES } from '../../shared/constants.js';

class LeagueError extends Error {
  constructor(message, type, details = {}) {
    super(message);
    this.name = 'LeagueError';
    this.type = type;
    this.details = details;
  }
}

class StorageManager {
  // Multi-league methods
  static saveLeague(leagueData) {
    try {
      leagueData.league.updatedAt = new Date().toISOString();
      const leagues = this.getAllLeagues();
      leagues[leagueData.league.id] = leagueData;
      localStorage.setItem(STORAGE_KEYS.LEAGUES, JSON.stringify(leagues));
      return true;
    } catch (error) {
      console.error('Storage save failed:', error);
      throw new LeagueError(
        'Failed to save league data to local storage. Storage may be full.',
        ERROR_TYPES.STORAGE,
        { error }
      );
    }
  }

  static loadLeague(leagueId) {
    try {
      const leagues = this.getAllLeagues();
      return leagues[leagueId] || null;
    } catch (error) {
      console.error('Storage load failed:', error);
      throw new LeagueError(
        'Failed to load league data from local storage. Data may be corrupted.',
        ERROR_TYPES.STORAGE,
        { error }
      );
    }
  }

  static getAllLeagues() {
    try {
      const json = localStorage.getItem(STORAGE_KEYS.LEAGUES);
      return json ? JSON.parse(json) : {};
    } catch (error) {
      console.error('Failed to load leagues:', error);
      return {};
    }
  }

  static getLeaguesList() {
    try {
      const leagues = this.getAllLeagues();
      return Object.values(leagues).map(league => ({
        id: league.league.id,
        name: league.league.name,
        createdAt: league.league.createdAt,
        updatedAt: league.league.updatedAt,
        currentRound: league.league.currentRound,
        totalRounds: league.league.totalRounds,
        status: league.league.currentRound >= league.league.totalRounds ? 'completed' : 'active'
      })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    } catch (error) {
      console.error('Failed to get leagues list:', error);
      return [];
    }
  }

  static deleteLeague(leagueId) {
    try {
      const leagues = this.getAllLeagues();
      delete leagues[leagueId];
      localStorage.setItem(STORAGE_KEYS.LEAGUES, JSON.stringify(leagues));
      
      // Clear current league if it was deleted
      if (this.getCurrentLeagueId() === leagueId) {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_LEAGUE_ID);
      }
      return true;
    } catch (error) {
      console.error('Delete league failed:', error);
      return false;
    }
  }

  static setCurrentLeagueId(leagueId) {
    try {
      localStorage.setItem(STORAGE_KEYS.CURRENT_LEAGUE_ID, leagueId);
      return true;
    } catch (error) {
      console.error('Set current league failed:', error);
      return false;
    }
  }

  static getCurrentLeagueId() {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_LEAGUE_ID);
  }

  static getCurrentLeague() {
    const leagueId = this.getCurrentLeagueId();
    return leagueId ? this.loadLeague(leagueId) : null;
  }

  // Legacy single-league methods (for backward compatibility)
  static save(leagueData) {
    // Save to both old and new storage for migration
    try {
      leagueData.league.updatedAt = new Date().toISOString();
      const json = JSON.stringify(leagueData);
      localStorage.setItem(STORAGE_KEYS.LEAGUE_DATA, json);
      
      // Also save to new multi-league storage
      this.saveLeague(leagueData);
      this.setCurrentLeagueId(leagueData.league.id);
      
      return true;
    } catch (error) {
      console.error('Storage save failed:', error);
      throw new LeagueError(
        'Failed to save data to local storage. Storage may be full.',
        ERROR_TYPES.STORAGE,
        { error }
      );
    }
  }

  static load() {
    try {
      // Try to load current league from new storage first
      const currentLeague = this.getCurrentLeague();
      if (currentLeague) {
        return currentLeague;
      }
      
      // Fall back to legacy storage
      const json = localStorage.getItem(STORAGE_KEYS.LEAGUE_DATA);
      if (json) {
        const data = JSON.parse(json);
        // Migrate to new storage
        this.saveLeague(data);
        this.setCurrentLeagueId(data.league.id);
        return data;
      }
      
      return null;
    } catch (error) {
      console.error('Storage load failed:', error);
      throw new LeagueError(
        'Failed to load data from local storage. Data may be corrupted.',
        ERROR_TYPES.STORAGE,
        { error }
      );
    }
  }

  static backup() {
    try {
      const current = this.load();
      if (current) {
        const backup = {
          data: current,
          timestamp: new Date().toISOString()
        };
        localStorage.setItem(STORAGE_KEYS.BACKUP, JSON.stringify(backup));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Backup failed:', error);
      return false;
    }
  }

  static restore() {
    try {
      const backupJson = localStorage.getItem(STORAGE_KEYS.BACKUP);
      if (backupJson) {
        const backup = JSON.parse(backupJson);
        this.save(backup.data);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Restore failed:', error);
      throw new LeagueError(
        'Failed to restore backup data.',
        ERROR_TYPES.STORAGE,
        { error }
      );
    }
  }

  static clear() {
    try {
      localStorage.removeItem(STORAGE_KEYS.LEAGUE_DATA);
      const currentId = this.getCurrentLeagueId();
      if (currentId) {
        this.deleteLeague(currentId);
      }
      return true;
    } catch (error) {
      console.error('Clear failed:', error);
      return false;
    }
  }

  static clearAll() {
    try {
      localStorage.removeItem(STORAGE_KEYS.LEAGUES);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_LEAGUE_ID);
      localStorage.removeItem(STORAGE_KEYS.LEAGUE_DATA);
      return true;
    } catch (error) {
      console.error('Clear all failed:', error);
      return false;
    }
  }

  static exists() {
    return this.getCurrentLeague() !== null || localStorage.getItem(STORAGE_KEYS.LEAGUE_DATA) !== null;
  }

  static getBackupInfo() {
    try {
      const backupJson = localStorage.getItem(STORAGE_KEYS.BACKUP);
      if (backupJson) {
        const backup = JSON.parse(backupJson);
        return {
          exists: true,
          timestamp: backup.timestamp,
          leagueName: backup.data.league.name
        };
      }
      return { exists: false };
    } catch (error) {
      return { exists: false };
    }
  }

  // Cross-league player statistics
  static updateAllPlayersStats() {
    try {
      const leagues = this.getAllLeagues();
      const allPlayers = {};

      Object.values(leagues).forEach(leagueData => {
        leagueData.players.forEach(player => {
          if (!allPlayers[player.name]) {
            allPlayers[player.name] = {
              name: player.name,
              totalMatchesPlayed: 0,
              totalMatchesWon: 0,
              totalMatchesLost: 0,
              totalFramesWon: 0,
              totalFramesLost: 0,
              totalPoints: 0,
              leagues: []
            };
          }

          allPlayers[player.name].totalMatchesPlayed += player.stats.matchesPlayed;
          allPlayers[player.name].totalMatchesWon += player.stats.matchesWon;
          allPlayers[player.name].totalMatchesLost += player.stats.matchesLost;
          allPlayers[player.name].totalFramesWon += player.stats.framesWon;
          allPlayers[player.name].totalFramesLost += player.stats.framesLost;
          allPlayers[player.name].totalPoints += player.stats.points;
          allPlayers[player.name].leagues.push({
            leagueId: leagueData.league.id,
            leagueName: leagueData.league.name
          });
        });
      });

      localStorage.setItem(STORAGE_KEYS.ALL_PLAYERS, JSON.stringify(allPlayers));
      return allPlayers;
    } catch (error) {
      console.error('Failed to update all players stats:', error);
      return {};
    }
  }

  static getAllPlayersStats() {
    try {
      const json = localStorage.getItem(STORAGE_KEYS.ALL_PLAYERS);
      if (json) {
        return JSON.parse(json);
      }
      // If not cached, calculate and cache
      return this.updateAllPlayersStats();
    } catch (error) {
      console.error('Failed to get all players stats:', error);
      return {};
    }
  }
}

export { StorageManager, LeagueError };
