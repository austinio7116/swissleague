import { generateId } from '../utils/helpers.js';
import { BEST_OF_OPTIONS, LEAGUE_FORMATS, DEFAULT_TIER_NAMES, TIER_DEFAULTS, TRACK_FRAME_SCORES_DEFAULT } from '../../shared/constants.js';

export class LeagueManager {
  static createLeague(name, bestOfFrames, totalRounds, options = {}) {
    const trackFrameScores = options.trackFrameScores !== undefined
      ? options.trackFrameScores
      : TRACK_FRAME_SCORES_DEFAULT[LEAGUE_FORMATS.SWISS];

    const league = {
      id: generateId(),
      name: name.trim(),
      format: 'swiss',
      bestOfFrames: parseInt(bestOfFrames, 10),
      trackFrameScores,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentRound: 1,
      totalRounds: parseInt(totalRounds, 10)
    };

    return {
      league,
      players: [],
      rounds: [],
      pairingHistory: []
    };
  }

  static createTieredLeague(name, bestOfFrames, tierConfig, options = {}) {
    const tiers = tierConfig.tiers || DEFAULT_TIER_NAMES.slice(0, tierConfig.tierCount || 4);
    const promotionCount = parseInt(tierConfig.promotionCount, 10) || TIER_DEFAULTS.PROMOTION_COUNT;
    const trackFrameScores = options.trackFrameScores !== undefined
      ? options.trackFrameScores
      : TRACK_FRAME_SCORES_DEFAULT[LEAGUE_FORMATS.TIERED_ROUND_ROBIN];

    // Support explicit tierSizes or fall back to uniform playersPerTier
    const tierSizes = tierConfig.tierSizes
      ? tierConfig.tierSizes.map(s => parseInt(s, 10))
      : null;
    const playersPerTier = tierSizes ? Math.max(...tierSizes) : parseInt(tierConfig.playersPerTier, 10);

    // Calculate totalRounds from the largest tier
    // Even N: N-1 rounds, Odd N: N rounds (one bye per round)
    const maxTierSize = tierSizes ? Math.max(...tierSizes) : playersPerTier;
    const totalRounds = maxTierSize % 2 === 0 ? maxTierSize - 1 : maxTierSize;

    const league = {
      id: generateId(),
      name: name.trim(),
      format: LEAGUE_FORMATS.TIERED_ROUND_ROBIN,
      bestOfFrames: parseInt(bestOfFrames, 10),
      trackFrameScores,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentRound: 1,
      totalRounds,
      currentSeason: 1,
      tierConfig: {
        playersPerTier,
        tierSizes: tierSizes || tiers.map(() => playersPerTier),
        promotionCount,
        tiers
      }
    };

    return {
      league,
      players: [],
      rounds: [],
      pairingHistory: [],
      seasons: []
    };
  }

  static updateLeague(leagueData, updates) {
    const updatedLeague = {
      ...leagueData.league,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    return {
      ...leagueData,
      league: updatedLeague
    };
  }

  static canStartLeague(leagueData) {
    const errors = [];
    const activePlayers = leagueData.players.filter(p => p.active);

    if (leagueData.rounds.length > 0) {
      errors.push('League has already started');
    }

    if (leagueData.league.format === LEAGUE_FORMATS.TIERED_ROUND_ROBIN) {
      const { tierConfig } = leagueData.league;
      const tierSizes = tierConfig.tierSizes || tierConfig.tiers.map(() => tierConfig.playersPerTier);
      const expectedTotal = tierSizes.reduce((sum, s) => sum + s, 0);
      if (activePlayers.length !== expectedTotal) {
        errors.push(`Need exactly ${expectedTotal} active players (tiers: ${tierSizes.join(', ')}). Currently have ${activePlayers.length}`);
      }
      const minTierSize = Math.min(...tierSizes);
      if (minTierSize < TIER_DEFAULTS.MIN_PLAYERS_PER_TIER) {
        errors.push(`Need at least ${TIER_DEFAULTS.MIN_PLAYERS_PER_TIER} players per tier (smallest tier has ${minTierSize})`);
      }
      // Check all players have tier assignments
      const unassigned = activePlayers.filter(p => !p.tier);
      if (unassigned.length > 0) {
        errors.push(`${unassigned.length} player(s) not assigned to a tier. Use "Distribute to Tiers" first`);
      }
    } else {
      if (activePlayers.length < 2) {
        errors.push('Need at least 2 active players to start the league');
      }
    }

    return {
      canStart: errors.length === 0,
      errors
    };
  }

  static canGenerateNextRound(leagueData) {
    const errors = [];
    const { league, rounds, players } = leagueData;
    
    // Check if league has started
    if (rounds.length === 0) {
      return { canGenerate: true, errors: [] };
    }
    
    // Check if current round is complete
    const currentRound = rounds.find(r => r.roundNumber === league.currentRound);
    if (currentRound) {
      const incompleteMatches = currentRound.matches.filter(m => m.status !== 'completed');
      if (incompleteMatches.length > 0) {
        errors.push(`Current round has ${incompleteMatches.length} incomplete match(es)`);
      }
    }
    
    // Check if we've reached total rounds
    if (league.currentRound > league.totalRounds) {
      errors.push('League has completed all rounds');
    }
    
    // Check we have enough active players
    const activePlayers = players.filter(p => p.active);
    if (activePlayers.length < 2) {
      errors.push('Need at least 2 active players');
    }
    
    return {
      canGenerate: errors.length === 0,
      errors
    };
  }

  static getLeagueStats(leagueData) {
    const { league, players, rounds } = leagueData;
    
    const activePlayers = players.filter(p => p.active);
    const completedRounds = rounds.filter(r => r.status === 'completed');
    
    let totalMatches = 0;
    let completedMatches = 0;
    
    for (const round of rounds) {
      totalMatches += round.matches.length;
      completedMatches += round.matches.filter(m => m.status === 'completed').length;
    }
    
    return {
      totalPlayers: players.length,
      activePlayers: activePlayers.length,
      totalRounds: league.totalRounds,
      completedRounds: completedRounds.length,
      currentRound: league.currentRound,
      totalMatches,
      completedMatches,
      pendingMatches: totalMatches - completedMatches
    };
  }

  static getLeagueProgress(leagueData) {
    const stats = this.getLeagueStats(leagueData);
    const roundProgress = (stats.completedRounds / stats.totalRounds) * 100;
    const matchProgress = stats.totalMatches > 0 
      ? (stats.completedMatches / stats.totalMatches) * 100 
      : 0;
    
    return {
      roundProgress: Math.round(roundProgress),
      matchProgress: Math.round(matchProgress),
      isComplete: stats.completedRounds === stats.totalRounds
    };
  }

  static getBestOfOptions() {
    return BEST_OF_OPTIONS;
  }

  static getRecommendedRounds(playerCount) {
    if (playerCount < 2) return 1;
    // Swiss format typically uses log2(n) rounds, plus a few extra
    return Math.ceil(Math.log2(playerCount)) + 2;
  }
}
