// Shared constants for the Swiss Snooker League system

export const STORAGE_KEYS = {
  LEAGUE_DATA: 'snooker_league_data', // Legacy - single league
  LEAGUES: 'snooker_leagues', // New - multiple leagues
  CURRENT_LEAGUE_ID: 'snooker_current_league_id',
  SETTINGS: 'snooker_league_settings',
  BACKUP: 'snooker_league_backup',
  GITHUB_URL: 'snooker_league_github_url',
  ALL_PLAYERS: 'snooker_all_players' // Cross-league player stats
};

export const MATCH_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed'
};

export const ROUND_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed'
};

export const POINTS = {
  WIN: 1,
  LOSS: 0,
  BYE: 1
};

export const BEST_OF_OPTIONS = [3, 5, 7, 9, 11];

export const MAX_FRAME_SCORE = 147; // Maximum possible break in snooker

export const ERROR_TYPES = {
  VALIDATION: 'VALIDATION',
  STORAGE: 'STORAGE',
  PAIRING: 'PAIRING',
  NETWORK: 'NETWORK',
  GENERAL: 'GENERAL'
};

export const VIEWS = {
  LEAGUE_SELECTOR: 'league-selector',
  LEAGUE_SETUP: 'league-setup',
  PLAYERS: 'players',
  ROUNDS: 'rounds',
  SCORING: 'scoring',
  DATA: 'data'
};
