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

  static recalculatePlayerStats(leagueData, playerId) {
    const player = leagueData.players.find(p => p.id === playerId);
    if (!player) return leagueData;

    const stats = {
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      framesWon: 0,
      framesLost: 0,
      points: 0,
      frameDifference: 0,
      byesReceived: 0,
      strengthOfSchedule: 0,
      buchholzScore: 0
    };

    const opponentIds = [];

    // Calculate stats from all completed matches
    for (const round of leagueData.rounds) {
      for (const match of round.matches) {
        if (match.status !== 'completed') continue;

        // Check if this is a bye match
        if (match.isBye && match.player1Id === playerId) {
          stats.byesReceived++;
          stats.matchesWon++;
          stats.matchesPlayed++;
          stats.points += POINTS.BYE;
          stats.framesWon += match.player1FramesWon || 0;
          continue;
        }

        // Regular match
        if (match.player1Id === playerId) {
          stats.matchesPlayed++;
          stats.framesWon += match.player1FramesWon;
          stats.framesLost += match.player2FramesWon;
          opponentIds.push(match.player2Id);
          
          if (match.winnerId === playerId) {
            stats.matchesWon++;
            stats.points += POINTS.WIN;
          } else {
            stats.matchesLost++;
            stats.points += POINTS.LOSS;
          }
        } else if (match.player2Id === playerId) {
          stats.matchesPlayed++;
          stats.framesWon += match.player2FramesWon;
          stats.framesLost += match.player1FramesWon;
          opponentIds.push(match.player1Id);
          
          if (match.winnerId === playerId) {
            stats.matchesWon++;
            stats.points += POINTS.WIN;
          } else {
            stats.matchesLost++;
            stats.points += POINTS.LOSS;
          }
        }
      }
    }

    stats.frameDifference = stats.framesWon - stats.framesLost;

    // Calculate Strength of Schedule (SOS) and Buchholz Score
    if (opponentIds.length > 0) {
      let totalOpponentWinRate = 0;
      let totalOpponentPoints = 0;

      for (const opponentId of opponentIds) {
        const opponent = leagueData.players.find(p => p.id === opponentId);
        if (opponent && opponent.stats) {
          // Calculate opponent's win rate
          const opponentWinRate = opponent.stats.matchesPlayed > 0
            ? (opponent.stats.matchesWon / opponent.stats.matchesPlayed)
            : 0;
          totalOpponentWinRate += opponentWinRate;
          
          // Sum opponent's points for Buchholz
          totalOpponentPoints += opponent.stats.points;
        }
      }

      // SOS is the average win rate of all opponents
      stats.strengthOfSchedule = totalOpponentWinRate / opponentIds.length;
      
      // Buchholz is the sum of all opponents' points
      stats.buchholzScore = totalOpponentPoints;
    }

    return this.updatePlayer(leagueData, playerId, { stats });
  }

  static recalculateAllPlayerStats(leagueData) {
    let updatedData = leagueData;
    
    for (const player of leagueData.players) {
      updatedData = this.recalculatePlayerStats(updatedData, player.id);
    }

    return updatedData;
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
