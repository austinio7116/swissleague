import { generateId } from '../utils/helpers.js';
import { BEST_OF_OPTIONS } from '../../shared/constants.js';

export class LeagueManager {
  static createLeague(name, bestOfFrames, totalRounds) {
    const league = {
      id: generateId(),
      name: name.trim(),
      format: 'swiss',
      bestOfFrames: parseInt(bestOfFrames, 10),
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
    
    if (activePlayers.length < 2) {
      errors.push('Need at least 2 active players to start the league');
    }
    
    if (leagueData.rounds.length > 0) {
      errors.push('League has already started');
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
