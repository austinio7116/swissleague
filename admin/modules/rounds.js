import { generateId } from '../utils/helpers.js';
import { MATCH_STATUS, ROUND_STATUS, ERROR_TYPES } from '../../shared/constants.js';
import { SwissPairing } from './swiss-pairing.js';
import { LeagueError } from './storage.js';

export class RoundManager {
  static generateRound(leagueData) {
    const { league, rounds } = leagueData;
    
    // Generate pairings using Swiss algorithm
    const pairings = SwissPairing.generatePairings(leagueData);
    
    // Validate pairings
    const activePlayers = leagueData.players.filter(p => p.active);
    const validation = SwissPairing.validatePairings(pairings, activePlayers);
    
    if (!validation.valid) {
      throw new LeagueError(
        `Pairing validation failed: ${validation.errors.join(', ')}`,
        ERROR_TYPES.PAIRING
      );
    }
    
    // Create matches from pairings
    const matches = pairings.map(pairing => this.createMatchFromPairing(pairing, league.bestOfFrames));
    
    // Create round
    const round = {
      roundNumber: league.currentRound,
      status: ROUND_STATUS.PENDING,
      matches,
      generatedAt: new Date().toISOString()
    };
    
    // Update pairing history
    const newPairingHistory = [...leagueData.pairingHistory];
    for (const pairing of pairings) {
      if (!pairing.isBye) {
        newPairingHistory.push([pairing.player1.id, pairing.player2.id]);
      }
    }
    
    return {
      ...leagueData,
      rounds: [...rounds, round],
      pairingHistory: newPairingHistory
    };
  }

  static createMatchFromPairing(pairing, bestOfFrames) {
    if (pairing.isBye) {
      const framesToWin = Math.ceil(bestOfFrames / 2);
      return {
        id: generateId(),
        player1Id: pairing.player1.id,
        player2Id: null,
        status: MATCH_STATUS.COMPLETED,
        frames: [],
        player1FramesWon: framesToWin,
        player2FramesWon: 0,
        winnerId: pairing.player1.id,
        isBye: true,
        completedAt: new Date().toISOString()
      };
    }

    return {
      id: generateId(),
      player1Id: pairing.player1.id,
      player2Id: pairing.player2.id,
      status: MATCH_STATUS.PENDING,
      frames: [],
      player1FramesWon: 0,
      player2FramesWon: 0,
      winnerId: null,
      isBye: false
    };
  }

  static getRound(leagueData, roundNumber) {
    return leagueData.rounds.find(r => r.roundNumber === roundNumber);
  }

  static getCurrentRound(leagueData) {
    return this.getRound(leagueData, leagueData.league.currentRound);
  }

  static updateRoundStatus(leagueData, roundNumber) {
    const rounds = leagueData.rounds.map(round => {
      if (round.roundNumber !== roundNumber) return round;

      const allCompleted = round.matches.every(m => m.status === MATCH_STATUS.COMPLETED);
      const anyInProgress = round.matches.some(m => m.status === MATCH_STATUS.IN_PROGRESS);

      let status = ROUND_STATUS.PENDING;
      if (allCompleted) {
        status = ROUND_STATUS.COMPLETED;
      } else if (anyInProgress || round.matches.some(m => m.status === MATCH_STATUS.COMPLETED)) {
        status = ROUND_STATUS.IN_PROGRESS;
      }

      return {
        ...round,
        status
      };
    });

    return {
      ...leagueData,
      rounds
    };
  }

  static advanceToNextRound(leagueData) {
    const currentRound = this.getCurrentRound(leagueData);
    
    if (!currentRound) {
      throw new LeagueError(
        'No current round found',
        ERROR_TYPES.GENERAL
      );
    }

    // Check all matches are completed
    const incompleteMatches = currentRound.matches.filter(m => m.status !== MATCH_STATUS.COMPLETED);
    if (incompleteMatches.length > 0) {
      throw new LeagueError(
        `Cannot advance: ${incompleteMatches.length} match(es) still incomplete`,
        ERROR_TYPES.VALIDATION
      );
    }

    // Update current round to next
    const updatedLeague = {
      ...leagueData.league,
      currentRound: leagueData.league.currentRound + 1,
      updatedAt: new Date().toISOString()
    };

    return {
      ...leagueData,
      league: updatedLeague
    };
  }

  static isRoundComplete(leagueData, roundNumber) {
    const round = this.getRound(leagueData, roundNumber);
    if (!round) return false;

    return round.matches.every(m => m.status === MATCH_STATUS.COMPLETED);
  }

  static getRoundStats(round) {
    const totalMatches = round.matches.length;
    const completedMatches = round.matches.filter(m => m.status === MATCH_STATUS.COMPLETED).length;
    const inProgressMatches = round.matches.filter(m => m.status === MATCH_STATUS.IN_PROGRESS).length;
    const pendingMatches = round.matches.filter(m => m.status === MATCH_STATUS.PENDING).length;

    return {
      totalMatches,
      completedMatches,
      inProgressMatches,
      pendingMatches,
      progress: totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0
    };
  }

  static deleteRound(leagueData, roundNumber) {
    // Can only delete the most recent round
    const maxRound = Math.max(...leagueData.rounds.map(r => r.roundNumber));
    
    if (roundNumber !== maxRound) {
      throw new LeagueError(
        'Can only delete the most recent round',
        ERROR_TYPES.VALIDATION
      );
    }

    const round = this.getRound(leagueData, roundNumber);
    if (!round) {
      throw new LeagueError(
        'Round not found',
        ERROR_TYPES.VALIDATION
      );
    }

    // Remove pairings from history
    const pairingHistory = [...leagueData.pairingHistory];
    for (const match of round.matches) {
      if (!match.isBye) {
        const index = pairingHistory.findIndex(pair =>
          (pair[0] === match.player1Id && pair[1] === match.player2Id) ||
          (pair[0] === match.player2Id && pair[1] === match.player1Id)
        );
        if (index !== -1) {
          pairingHistory.splice(index, 1);
        }
      }
    }

    // Remove round
    const rounds = leagueData.rounds.filter(r => r.roundNumber !== roundNumber);

    // Update current round if necessary
    let currentRound = leagueData.league.currentRound;
    if (currentRound > roundNumber) {
      currentRound--;
    }

    return {
      ...leagueData,
      rounds,
      pairingHistory,
      league: {
        ...leagueData.league,
        currentRound
      }
    };
  }
}
