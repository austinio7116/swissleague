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
  static save(leagueData) {
    try {
      leagueData.league.updatedAt = new Date().toISOString();
      const json = JSON.stringify(leagueData);
      localStorage.setItem(STORAGE_KEYS.LEAGUE_DATA, json);
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
      const json = localStorage.getItem(STORAGE_KEYS.LEAGUE_DATA);
      return json ? JSON.parse(json) : null;
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
        localStorage.setItem(STORAGE_KEYS.LEAGUE_DATA, JSON.stringify(backup.data));
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
      return true;
    } catch (error) {
      console.error('Clear failed:', error);
      return false;
    }
  }

  static exists() {
    return localStorage.getItem(STORAGE_KEYS.LEAGUE_DATA) !== null;
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
}

export { StorageManager, LeagueError };
