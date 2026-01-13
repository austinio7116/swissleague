import { MATCH_STATUS, ROUND_STATUS, ERROR_TYPES } from '../../shared/constants.js';
import { LeagueError } from './storage.js';
import { PlayerManager } from './players.js';

export class ScoringManager {
  static updateRoundStatus(round) {
    // Check if all matches in the round are completed
    const allMatchesCompleted = round.matches.every(match =>
      match.status === MATCH_STATUS.COMPLETED
    );
    
    if (allMatchesCompleted && round.matches.length > 0) {
      return { ...round, status: ROUND_STATUS.COMPLETED };
    }
    
    return round;
  }

  static addFrame(leagueData, matchId, player1Score, player2Score) {
    const { match, round } = this.findMatch(leagueData, matchId);
    
    if (!match) {
      throw new LeagueError('Match not found', ERROR_TYPES.VALIDATION);
    }

    if (match.isBye) {
      throw new LeagueError('Cannot add frames to bye match', ERROR_TYPES.VALIDATION);
    }

    if (match.status === MATCH_STATUS.COMPLETED) {
      throw new LeagueError('Match is already completed', ERROR_TYPES.VALIDATION);
    }

    const framesToWin = Math.ceil(leagueData.league.bestOfFrames / 2);

    // Check if match is already decided
    if (match.player1FramesWon >= framesToWin || match.player2FramesWon >= framesToWin) {
      throw new LeagueError('Match is already decided', ERROR_TYPES.VALIDATION);
    }

    // Determine frame winner
    const winnerId = player1Score > player2Score ? match.player1Id : match.player2Id;

    // Create frame
    const frame = {
      frameNumber: match.frames.length + 1,
      player1Score: parseInt(player1Score, 10),
      player2Score: parseInt(player2Score, 10),
      winnerId
    };

    // Update frame counts
    const updatedMatch = {
      ...match,
      frames: [...match.frames, frame],
      player1FramesWon: match.player1FramesWon + (winnerId === match.player1Id ? 1 : 0),
      player2FramesWon: match.player2FramesWon + (winnerId === match.player2Id ? 1 : 0),
      status: MATCH_STATUS.IN_PROGRESS
    };

    // Check if match is now complete
    if (updatedMatch.player1FramesWon >= framesToWin) {
      updatedMatch.status = MATCH_STATUS.COMPLETED;
      updatedMatch.winnerId = match.player1Id;
      updatedMatch.completedAt = new Date().toISOString();
    } else if (updatedMatch.player2FramesWon >= framesToWin) {
      updatedMatch.status = MATCH_STATUS.COMPLETED;
      updatedMatch.winnerId = match.player2Id;
      updatedMatch.completedAt = new Date().toISOString();
    }

    // Update match in round
    let updatedRound = {
      ...round,
      matches: round.matches.map(m => m.id === matchId ? updatedMatch : m)
    };

    // Check if round should be marked as completed
    updatedRound = this.updateRoundStatus(updatedRound);

    // Update round in league data
    let updatedData = {
      ...leagueData,
      rounds: leagueData.rounds.map(r =>
        r.roundNumber === round.roundNumber ? updatedRound : r
      )
    };

    // Recalculate player stats if match is completed
    if (updatedMatch.status === MATCH_STATUS.COMPLETED) {
      updatedData = PlayerManager.recalculatePlayerStats(updatedData, match.player1Id);
      updatedData = PlayerManager.recalculatePlayerStats(updatedData, match.player2Id);
    }

    return updatedData;
  }

  static updateFrame(leagueData, matchId, frameNumber, player1Score, player2Score) {
    const { match, round } = this.findMatch(leagueData, matchId);
    
    if (!match) {
      throw new LeagueError('Match not found', ERROR_TYPES.VALIDATION);
    }

    const frameIndex = match.frames.findIndex(f => f.frameNumber === frameNumber);
    if (frameIndex === -1) {
      throw new LeagueError('Frame not found', ERROR_TYPES.VALIDATION);
    }

    // Determine new winner
    const winnerId = player1Score > player2Score ? match.player1Id : match.player2Id;

    // Update frame
    const updatedFrames = [...match.frames];
    updatedFrames[frameIndex] = {
      ...updatedFrames[frameIndex],
      player1Score: parseInt(player1Score, 10),
      player2Score: parseInt(player2Score, 10),
      winnerId
    };

    // Recalculate frame counts
    let player1FramesWon = 0;
    let player2FramesWon = 0;
    
    for (const frame of updatedFrames) {
      if (frame.winnerId === match.player1Id) player1FramesWon++;
      else player2FramesWon++;
    }

    const framesToWin = Math.ceil(leagueData.league.bestOfFrames / 2);

    // Update match
    const updatedMatch = {
      ...match,
      frames: updatedFrames,
      player1FramesWon,
      player2FramesWon
    };

    // Check if match status needs updating
    if (player1FramesWon >= framesToWin) {
      updatedMatch.status = MATCH_STATUS.COMPLETED;
      updatedMatch.winnerId = match.player1Id;
      if (!updatedMatch.completedAt) {
        updatedMatch.completedAt = new Date().toISOString();
      }
    } else if (player2FramesWon >= framesToWin) {
      updatedMatch.status = MATCH_STATUS.COMPLETED;
      updatedMatch.winnerId = match.player2Id;
      if (!updatedMatch.completedAt) {
        updatedMatch.completedAt = new Date().toISOString();
      }
    } else {
      updatedMatch.status = MATCH_STATUS.IN_PROGRESS;
      updatedMatch.winnerId = null;
      delete updatedMatch.completedAt;
    }

    // Update match in round
    let updatedRound = {
      ...round,
      matches: round.matches.map(m => m.id === matchId ? updatedMatch : m)
    };

    // Check if round should be marked as completed
    updatedRound = this.updateRoundStatus(updatedRound);

    // Update round in league data
    let updatedData = {
      ...leagueData,
      rounds: leagueData.rounds.map(r =>
        r.roundNumber === round.roundNumber ? updatedRound : r
      )
    };

    // Recalculate player stats
    updatedData = PlayerManager.recalculatePlayerStats(updatedData, match.player1Id);
    updatedData = PlayerManager.recalculatePlayerStats(updatedData, match.player2Id);

    return updatedData;
  }

  static deleteFrame(leagueData, matchId, frameNumber) {
    const { match, round } = this.findMatch(leagueData, matchId);
    
    if (!match) {
      throw new LeagueError('Match not found', ERROR_TYPES.VALIDATION);
    }

    // Can only delete the last frame
    if (frameNumber !== match.frames.length) {
      throw new LeagueError('Can only delete the most recent frame', ERROR_TYPES.VALIDATION);
    }

    const updatedFrames = match.frames.slice(0, -1);

    // Recalculate frame counts
    let player1FramesWon = 0;
    let player2FramesWon = 0;
    
    for (const frame of updatedFrames) {
      if (frame.winnerId === match.player1Id) player1FramesWon++;
      else player2FramesWon++;
    }

    // Update match
    const updatedMatch = {
      ...match,
      frames: updatedFrames,
      player1FramesWon,
      player2FramesWon,
      status: updatedFrames.length === 0 ? MATCH_STATUS.PENDING : MATCH_STATUS.IN_PROGRESS,
      winnerId: null
    };

    delete updatedMatch.completedAt;

    // Update match in round
    let updatedRound = {
      ...round,
      matches: round.matches.map(m => m.id === matchId ? updatedMatch : m)
    };

    // Check if round should be marked as completed (or back to in-progress)
    updatedRound = this.updateRoundStatus(updatedRound);

    // Update round in league data
    let updatedData = {
      ...leagueData,
      rounds: leagueData.rounds.map(r =>
        r.roundNumber === round.roundNumber ? updatedRound : r
      )
    };

    // Recalculate player stats
    updatedData = PlayerManager.recalculatePlayerStats(updatedData, match.player1Id);
    updatedData = PlayerManager.recalculatePlayerStats(updatedData, match.player2Id);

    return updatedData;
  }

  static findMatch(leagueData, matchId) {
    for (const round of leagueData.rounds) {
      const match = round.matches.find(m => m.id === matchId);
      if (match) {
        return { match, round };
      }
    }
    return { match: null, round: null };
  }

  static getMatch(leagueData, matchId) {
    const { match } = this.findMatch(leagueData, matchId);
    return match;
  }

  static getMatchWithPlayers(leagueData, matchId) {
    const match = this.getMatch(leagueData, matchId);
    if (!match) return null;

    const player1 = leagueData.players.find(p => p.id === match.player1Id);
    const player2 = match.player2Id ? leagueData.players.find(p => p.id === match.player2Id) : null;

    return {
      ...match,
      player1,
      player2
    };
  }

  static getMatchProgress(match, bestOfFrames) {
    const framesToWin = Math.ceil(bestOfFrames / 2);
    
    return {
      player1FramesWon: match.player1FramesWon,
      player2FramesWon: match.player2FramesWon,
      framesToWin,
      framesPlayed: match.frames.length,
      maxFrames: bestOfFrames,
      isComplete: match.status === MATCH_STATUS.COMPLETED
    };
  }
}
