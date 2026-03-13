import { ERROR_TYPES } from '../../shared/constants.js';
import { LeagueError } from './storage.js';

export class RoundRobinPairing {
  /**
   * Generate pairings for a specific round using the circle method.
   * For N players, generates N/2 matches per round (N must be even).
   * @param {Array} players - Array of player objects
   * @param {number} roundIndex - 0-based round index
   * @returns {Array} Array of pairing objects { player1, player2, isBye: false, isRepeat: false }
   */
  static generateRoundPairings(players, roundIndex) {
    if (players.length < 2) {
      throw new LeagueError(
        'Need at least 2 players for round-robin pairings',
        ERROR_TYPES.PAIRING
      );
    }

    // For odd number of players, add a null placeholder (bye)
    const list = [...players];
    const hasBye = list.length % 2 !== 0;
    if (hasBye) {
      list.push(null);
    }

    const n = list.length;
    // Fix the first player, rotate the rest
    const fixed = list[0];
    const rotating = list.slice(1);

    // Rotate the array by roundIndex positions
    const rotated = [...rotating];
    for (let i = 0; i < roundIndex; i++) {
      rotated.unshift(rotated.pop());
    }

    const pairings = [];
    // First pairing: fixed vs first in rotated
    const opponent = rotated[0];
    if (fixed && opponent) {
      pairings.push({ player1: fixed, player2: opponent, isBye: false, isRepeat: false });
    } else if (fixed) {
      pairings.push({ player1: fixed, player2: null, isBye: true, isRepeat: false });
    } else if (opponent) {
      pairings.push({ player1: opponent, player2: null, isBye: true, isRepeat: false });
    }

    // Remaining pairings: pair from outside in
    for (let i = 1; i < n / 2; i++) {
      const p1 = rotated[i];
      const p2 = rotated[n - 1 - i];
      if (p1 && p2) {
        pairings.push({ player1: p1, player2: p2, isBye: false, isRepeat: false });
      } else if (p1) {
        pairings.push({ player1: p1, player2: null, isBye: true, isRepeat: false });
      } else if (p2) {
        pairings.push({ player1: p2, player2: null, isBye: true, isRepeat: false });
      }
    }

    return pairings;
  }

  /**
   * Generate all rounds for a round-robin tournament.
   * @param {Array} players - Array of player objects
   * @returns {Array} Array of rounds, each containing an array of pairings
   */
  static generateAllRounds(players) {
    const n = players.length % 2 === 0 ? players.length : players.length + 1;
    const totalRounds = n - 1;
    const rounds = [];

    for (let i = 0; i < totalRounds; i++) {
      rounds.push(this.generateRoundPairings(players, i));
    }

    return rounds;
  }

  /**
   * Validate that round-robin pairings are correct.
   * @param {Array} allRounds - Array of rounds from generateAllRounds
   * @param {Array} players - Original player array
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validatePairings(allRounds, players) {
    const errors = [];
    const expectedMatchups = new Set();

    // Build expected matchup set (every pair plays exactly once)
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const key = [players[i].id, players[j].id].sort().join('-');
        expectedMatchups.add(key);
      }
    }

    const seenMatchups = new Map(); // key -> count

    for (let r = 0; r < allRounds.length; r++) {
      const round = allRounds[r];
      const playersInRound = new Set();

      for (const pairing of round) {
        if (pairing.isBye) {
          playersInRound.add(pairing.player1.id);
          continue;
        }

        const key = [pairing.player1.id, pairing.player2.id].sort().join('-');
        seenMatchups.set(key, (seenMatchups.get(key) || 0) + 1);
        playersInRound.add(pairing.player1.id);
        playersInRound.add(pairing.player2.id);
      }

      // Check all players appear in each round
      for (const player of players) {
        if (!playersInRound.has(player.id)) {
          errors.push(`Round ${r + 1}: Player ${player.name} not included`);
        }
      }
    }

    // Check all matchups appear exactly once
    for (const key of expectedMatchups) {
      const count = seenMatchups.get(key) || 0;
      if (count !== 1) {
        errors.push(`Matchup ${key} appears ${count} times (expected 1)`);
      }
    }

    // Check no unexpected matchups
    for (const [key, count] of seenMatchups) {
      if (!expectedMatchups.has(key)) {
        errors.push(`Unexpected matchup: ${key}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
