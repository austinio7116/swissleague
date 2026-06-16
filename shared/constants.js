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
  DRAW: 1,
  LOSS: 0,
  BYE: 1,
  FORFEIT_WIN: 1,
  FORFEIT_LOSS: 0,
  DOUBLE_FORFEIT: 0
};

// Best-of-2 scoring: a fixed 2-frame match that can end in a draw (1-1).
// Win = 2 points, Draw = 1 point, Loss = 0. All other (odd) formats use 1/0.
export const BEST_OF_2_POINTS = {
  WIN: 2,
  DRAW: 1,
  LOSS: 0,
  BYE: 2
};

export const FORFEIT_TYPE = {
  SINGLE: 'single',    // One player forfeits, other wins
  DOUBLE: 'double'     // Both players forfeit, neither wins
};

export const LEAGUE_FORMATS = {
  SWISS: 'swiss',
  TIERED_ROUND_ROBIN: 'tiered-round-robin'
};

export const DEFAULT_TIER_NAMES = ['Diamond', 'Gold', 'Silver', 'Bronze'];

export const TIER_DEFAULTS = {
  PLAYERS_PER_TIER: 6,
  PROMOTION_COUNT: 2,
  MIN_TIERS: 2,
  MAX_TIERS: 6,
  MIN_PLAYERS_PER_TIER: 3
};

export const BEST_OF_OPTIONS = [3, 5, 7, 9, 11];

// Tiered round-robin also offers Best of 2 (fixed 2 frames, draws allowed, 2/1/0 scoring)
export const TIERED_BEST_OF_OPTIONS = [2, 3, 5, 7, 9, 11];

// A best-of-2 match plays a fixed 2 frames and may end in a draw (1-1).
export function allowsDraws(bestOfFrames) {
  return parseInt(bestOfFrames, 10) === 2;
}

// Frames a player must win to take the match (only meaningful for odd best-of formats).
export function getFramesToWin(bestOfFrames) {
  return Math.floor(parseInt(bestOfFrames, 10) / 2) + 1;
}

// Points awarded for win/draw/loss/bye, depending on the match format.
export function getMatchPoints(bestOfFrames) {
  return allowsDraws(bestOfFrames)
    ? { ...BEST_OF_2_POINTS }
    : { WIN: POINTS.WIN, DRAW: 0, LOSS: POINTS.LOSS, BYE: POINTS.BYE };
}

// Whether a match is finished given current frame wins and frames played.
// Best-of-2: complete once both frames are played. Odd: once someone reaches frames-to-win.
export function isMatchDecided(player1FramesWon, player2FramesWon, framesPlayed, bestOfFrames) {
  if (allowsDraws(bestOfFrames)) {
    return framesPlayed >= parseInt(bestOfFrames, 10);
  }
  const framesToWin = getFramesToWin(bestOfFrames);
  return player1FramesWon >= framesToWin || player2FramesWon >= framesToWin;
}

// Resolve the winner of a completed match; null indicates a draw (best-of-2 only).
export function getMatchWinnerId(player1FramesWon, player2FramesWon, player1Id, player2Id) {
  if (player1FramesWon > player2FramesWon) return player1Id;
  if (player2FramesWon > player1FramesWon) return player2Id;
  return null;
}

// Whether to track individual frame point scores (e.g. 63-45) vs just frame wins
// When false, only overall match frame score (e.g. 2-1) is recorded
export const TRACK_FRAME_SCORES_DEFAULT = {
  [LEAGUE_FORMATS.SWISS]: true,
  [LEAGUE_FORMATS.TIERED_ROUND_ROBIN]: false
};

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
