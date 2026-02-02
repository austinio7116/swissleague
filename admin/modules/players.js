import { generateId } from '../utils/helpers.js';
import { POINTS } from '../../shared/constants.js';

export class PlayerManager {
  static createPlayer(name) {
    return {
      id: generateId(),
      name: name.trim(),
      active: true,
      stats: {
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        framesWon: 0,
        framesLost: 0,
        points: 0,
        frameDifference: 0,
        byesReceived: 0,
        forfeitsReceived: 0,
        forfeitsGiven: 0,
        strengthOfSchedule: 0,
        buchholzScore: 0
      }
    };
  }

  static addPlayer(leagueData, name) {
    const player = this.createPlayer(name);
    
    return {
      ...leagueData,
      players: [...leagueData.players, player]
    };
  }

  static updatePlayer(leagueData, playerId, updates) {
    const players = leagueData.players.map(p => {
      if (p.id === playerId) {
        return {
          ...p,
          ...updates
        };
      }
      return p;
    });

    return {
      ...leagueData,
      players
    };
  }

  static deactivatePlayer(leagueData, playerId) {
    return this.updatePlayer(leagueData, playerId, { active: false });
  }

  static activatePlayer(leagueData, playerId) {
    return this.updatePlayer(leagueData, playerId, { active: true });
  }

  static deletePlayer(leagueData, playerId) {
    // Check if player has played any matches
    const hasMatches = leagueData.rounds.some(round =>
      round.matches.some(match =>
        match.player1Id === playerId || match.player2Id === playerId
      )
    );

    if (hasMatches) {
      // Don't delete, just deactivate
      return this.deactivatePlayer(leagueData, playerId);
    }

    // Safe to delete if no matches
    return {
      ...leagueData,
      players: leagueData.players.filter(p => p.id !== playerId)
    };
  }

  static recalculateAllPlayerStats(leagueData) {
    /**
     * Recalculate all player stats from match history using a two-pass approach.
     *
     * Pass 1: Calculate basic stats (matches, frames, points) for all players
     * Pass 2: Calculate SOS and Buchholz using the freshly computed basic stats
     *         (excluding forfeits, double forfeits, and byes from opponent calculations)
     *
     * This ensures we never rely on stale/existing player stats.
     */
    const players = leagueData.players;

    // Initialize fresh stats for all players
    const freshStats = {};
    const opponentMap = {}; // Track opponents for each player (for SOS/Buchholz - played matches only)

    for (const player of players) {
      freshStats[player.id] = {
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        framesWon: 0,
        framesLost: 0,
        points: 0,
        frameDifference: 0,
        byesReceived: 0,
        forfeitsReceived: 0,
        forfeitsGiven: 0,
        strengthOfSchedule: 0,
        buchholzScore: 0
      };
      opponentMap[player.id] = [];
    }

    // Pass 1: Calculate basic stats from match history
    for (const round of leagueData.rounds) {
      for (const match of round.matches) {
        if (match.status !== 'completed') continue;

        const player1Id = match.player1Id;
        const player2Id = match.player2Id;
        const winnerId = match.winnerId;
        const isBye = match.isBye || false;
        const isForfeit = match.isForfeit || false;
        const forfeitType = match.forfeitType; // 'single' or 'double'

        // Handle bye matches
        if (isBye) {
          if (freshStats[player1Id]) {
            freshStats[player1Id].matchesPlayed++;
            freshStats[player1Id].matchesWon++;
            freshStats[player1Id].points += POINTS.BYE;
            freshStats[player1Id].byesReceived++;
          }
          // Byes are NOT added to opponentMap (excluded from SOS/Buchholz)
          continue;
        }

        // Handle forfeit matches
        if (isForfeit) {
          if (forfeitType === 'double') {
            // Double forfeit: both lose, 0 points each, no frames
            if (freshStats[player1Id]) {
              freshStats[player1Id].matchesPlayed++;
              freshStats[player1Id].matchesLost++;
              freshStats[player1Id].forfeitsGiven++;
              // points stays 0 for double forfeit
            }
            if (freshStats[player2Id]) {
              freshStats[player2Id].matchesPlayed++;
              freshStats[player2Id].matchesLost++;
              freshStats[player2Id].forfeitsGiven++;
              // points stays 0 for double forfeit
            }
          } else {
            // Single forfeit: winner gets point, forfeiter loses
            if (freshStats[player1Id]) {
              freshStats[player1Id].matchesPlayed++;
              if (winnerId === player1Id) {
                freshStats[player1Id].matchesWon++;
                freshStats[player1Id].points += POINTS.WIN;
                freshStats[player1Id].forfeitsReceived++;
              } else {
                freshStats[player1Id].matchesLost++;
                freshStats[player1Id].forfeitsGiven++;
              }
            }
            if (freshStats[player2Id]) {
              freshStats[player2Id].matchesPlayed++;
              if (winnerId === player2Id) {
                freshStats[player2Id].matchesWon++;
                freshStats[player2Id].points += POINTS.WIN;
                freshStats[player2Id].forfeitsReceived++;
              } else {
                freshStats[player2Id].matchesLost++;
                freshStats[player2Id].forfeitsGiven++;
              }
            }
          }
          // Forfeits are NOT added to opponentMap (excluded from SOS/Buchholz)
          continue;
        }

        // Regular match - update both players
        if (freshStats[player1Id]) {
          freshStats[player1Id].matchesPlayed++;
          freshStats[player1Id].framesWon += match.player1FramesWon || 0;
          freshStats[player1Id].framesLost += match.player2FramesWon || 0;
          // Only actually played matches count for SOS/Buchholz
          opponentMap[player1Id].push(player2Id);
          if (winnerId === player1Id) {
            freshStats[player1Id].matchesWon++;
            freshStats[player1Id].points += POINTS.WIN;
          } else {
            freshStats[player1Id].matchesLost++;
            freshStats[player1Id].points += POINTS.LOSS;
          }
        }

        if (freshStats[player2Id]) {
          freshStats[player2Id].matchesPlayed++;
          freshStats[player2Id].framesWon += match.player2FramesWon || 0;
          freshStats[player2Id].framesLost += match.player1FramesWon || 0;
          // Only actually played matches count for SOS/Buchholz
          opponentMap[player2Id].push(player1Id);
          if (winnerId === player2Id) {
            freshStats[player2Id].matchesWon++;
            freshStats[player2Id].points += POINTS.WIN;
          } else {
            freshStats[player2Id].matchesLost++;
            freshStats[player2Id].points += POINTS.LOSS;
          }
        }
      }
    }

    // Calculate frame difference for all players
    for (const playerId in freshStats) {
      const stats = freshStats[playerId];
      stats.frameDifference = stats.framesWon - stats.framesLost;
    }

    // Pass 2: Calculate SOS and Buchholz using freshly computed stats
    // Note: opponentMap only contains opponents from actually played matches
    // (forfeits, double forfeits, and byes are excluded)
    for (const playerId in freshStats) {
      const opponents = opponentMap[playerId];
      if (!opponents || opponents.length === 0) continue;

      const opponentWinRates = [];
      let totalOpponentPoints = 0;

      for (const oppId of opponents) {
        if (!freshStats[oppId]) continue;
        const oppStats = freshStats[oppId];
        const oppPlayed = oppStats.matchesPlayed;
        if (oppPlayed > 0) {
          opponentWinRates.push(oppStats.matchesWon / oppPlayed);
        }
        totalOpponentPoints += oppStats.points;
      }

      if (opponentWinRates.length > 0) {
        const sumWinRates = opponentWinRates.reduce((a, b) => a + b, 0);
        freshStats[playerId].strengthOfSchedule = sumWinRates / opponentWinRates.length;
      }
      freshStats[playerId].buchholzScore = totalOpponentPoints;
    }

    // Apply fresh stats to all players
    const updatedPlayers = players.map(player => ({
      ...player,
      stats: freshStats[player.id]
    }));

    return {
      ...leagueData,
      players: updatedPlayers
    };
  }

  // Keep single-player version for backward compatibility, but it just calls the full recalc
  static recalculatePlayerStats(leagueData, playerId) {
    return this.recalculateAllPlayerStats(leagueData);
  }

  static getPlayerStats(leagueData, playerId) {
    const player = leagueData.players.find(p => p.id === playerId);
    if (!player) return null;

    const winRate = player.stats.matchesPlayed > 0
      ? ((player.stats.matchesWon / player.stats.matchesPlayed) * 100).toFixed(1)
      : 0;

    const avgFramesPerMatch = player.stats.matchesPlayed > 0
      ? (player.stats.framesWon / player.stats.matchesPlayed).toFixed(1)
      : 0;

    return {
      ...player.stats,
      winRate: parseFloat(winRate),
      avgFramesPerMatch: parseFloat(avgFramesPerMatch)
    };
  }

  static getActivePlayers(leagueData) {
    return leagueData.players.filter(p => p.active);
  }

  static getInactivePlayers(leagueData) {
    return leagueData.players.filter(p => !p.active);
  }

  static canDeletePlayer(leagueData, playerId) {
    // Check if player has played any matches
    const hasMatches = leagueData.rounds.some(round =>
      round.matches.some(match =>
        match.player1Id === playerId || match.player2Id === playerId
      )
    );

    return !hasMatches;
  }
}
