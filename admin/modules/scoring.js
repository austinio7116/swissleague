import { MATCH_STATUS, ROUND_STATUS, ERROR_TYPES, allowsDraws, getFramesToWin, isMatchDecided, getMatchWinnerId } from '../../shared/constants.js';
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

    const bestOfFrames = leagueData.league.bestOfFrames;

    // Check if match is already decided (best-of-2 ends once both frames are played)
    if (isMatchDecided(match.player1FramesWon, match.player2FramesWon, match.frames.length, bestOfFrames)) {
      throw new LeagueError('Match is already decided', ERROR_TYPES.VALIDATION);
    }

    // Determine frame winner
    const winnerId = player1Score > player2Score ? match.player1Id : match.player2Id;

    // Create frame - omit point scores if not tracking them
    const trackScores = leagueData.league.trackFrameScores !== false;
    const frame = {
      frameNumber: match.frames.length + 1,
      winnerId
    };
    if (trackScores) {
      frame.player1Score = parseInt(player1Score, 10);
      frame.player2Score = parseInt(player2Score, 10);
    }

    // Update frame counts
    const updatedMatch = {
      ...match,
      frames: [...match.frames, frame],
      player1FramesWon: match.player1FramesWon + (winnerId === match.player1Id ? 1 : 0),
      player2FramesWon: match.player2FramesWon + (winnerId === match.player2Id ? 1 : 0),
      status: MATCH_STATUS.IN_PROGRESS
    };

    // Check if match is now complete (draw possible in best-of-2)
    if (isMatchDecided(updatedMatch.player1FramesWon, updatedMatch.player2FramesWon, updatedMatch.frames.length, bestOfFrames)) {
      updatedMatch.status = MATCH_STATUS.COMPLETED;
      updatedMatch.winnerId = getMatchWinnerId(
        updatedMatch.player1FramesWon, updatedMatch.player2FramesWon,
        match.player1Id, match.player2Id
      );
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

  static addFrameByWinner(leagueData, matchId, winnerId) {
    // Convenience method for frames-only mode: just specify who won the frame
    // Use dummy scores (1-0 or 0-1) to indicate the winner
    const { match } = this.findMatch(leagueData, matchId);
    if (!match) {
      throw new LeagueError('Match not found', ERROR_TYPES.VALIDATION);
    }
    const p1Score = winnerId === match.player1Id ? 1 : 0;
    const p2Score = winnerId === match.player2Id ? 1 : 0;
    return this.addFrame(leagueData, matchId, p1Score, p2Score);
  }

  static submitMatchResult(leagueData, matchId, player1FramesWon, player2FramesWon) {
    // Submit a complete match result at once (for frames-only mode)
    // Creates all frames at once based on the overall score
    const { match } = this.findMatch(leagueData, matchId);
    if (!match) {
      throw new LeagueError('Match not found', ERROR_TYPES.VALIDATION);
    }
    if (match.status === MATCH_STATUS.COMPLETED) {
      throw new LeagueError('Match is already completed', ERROR_TYPES.VALIDATION);
    }

    const totalFrames = player1FramesWon + player2FramesWon;
    const bestOfFrames = leagueData.league.bestOfFrames;

    if (allowsDraws(bestOfFrames)) {
      // Best-of-2: a fixed 2 frames are always played; 2-0, 1-1 and 0-2 are all valid
      if (totalFrames !== bestOfFrames) {
        throw new LeagueError(`Best of ${bestOfFrames}: exactly ${bestOfFrames} frames must be played (e.g. 2-0, 1-1, 0-2)`, ERROR_TYPES.VALIDATION);
      }
    } else {
      const framesToWin = getFramesToWin(bestOfFrames);
      if (player1FramesWon < framesToWin && player2FramesWon < framesToWin) {
        throw new LeagueError(`Match not complete: need ${framesToWin} frames to win`, ERROR_TYPES.VALIDATION);
      }
      if (player1FramesWon >= framesToWin && player2FramesWon >= framesToWin) {
        throw new LeagueError('Both players cannot reach the frames needed to win', ERROR_TYPES.VALIDATION);
      }
      if (totalFrames > bestOfFrames) {
        throw new LeagueError(`Too many frames: ${totalFrames} exceeds best of ${bestOfFrames}`, ERROR_TYPES.VALIDATION);
      }
    }

    // addFrame closes the match the instant the winner reaches the threshold, so we
    // can't just add all of one player's frames first (the remainder would be rejected
    // with "Match is already completed"). Order the frames so the match-deciding frame
    // is added last.
    const order = this.buildFrameOrder(
      match.player1Id, match.player2Id,
      player1FramesWon, player2FramesWon, bestOfFrames
    );

    let updatedData = leagueData;
    for (const winnerId of order) {
      updatedData = this.addFrameByWinner(updatedData, matchId, winnerId);
    }

    return updatedData;
  }

  static buildFrameOrder(player1Id, player2Id, player1FramesWon, player2FramesWon, bestOfFrames) {
    // Produce a sequence of frame winners such that the match is only "decided" after
    // the final frame. Greedily prefer a frame that does not end the match early; the
    // last remaining frame is always allowed to be the deciding one.
    const total = player1FramesWon + player2FramesWon;
    const order = [];
    let p1Count = 0, p2Count = 0;
    let p1Remaining = player1FramesWon, p2Remaining = player2FramesWon;

    while (order.length < total) {
      const isLastFrame = order.length === total - 1;
      let chosen = null;

      for (const addToP1 of [true, false]) {
        if (addToP1 ? p1Remaining <= 0 : p2Remaining <= 0) continue;
        const nextP1 = p1Count + (addToP1 ? 1 : 0);
        const nextP2 = p2Count + (addToP1 ? 0 : 1);
        if (isLastFrame || !isMatchDecided(nextP1, nextP2, nextP1 + nextP2, bestOfFrames)) {
          chosen = addToP1 ? player1Id : player2Id;
          if (addToP1) { p1Count++; p1Remaining--; } else { p2Count++; p2Remaining--; }
          break;
        }
      }

      if (chosen === null) {
        // Fallback (should not occur for a validated result): take any remaining frame.
        if (p1Remaining > 0) { chosen = player1Id; p1Count++; p1Remaining--; }
        else { chosen = player2Id; p2Count++; p2Remaining--; }
      }

      order.push(chosen);
    }

    return order;
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

    const bestOfFrames = leagueData.league.bestOfFrames;

    // Update match
    const updatedMatch = {
      ...match,
      frames: updatedFrames,
      player1FramesWon,
      player2FramesWon
    };

    // Check if match status needs updating (draw possible in best-of-2)
    if (isMatchDecided(player1FramesWon, player2FramesWon, updatedFrames.length, bestOfFrames)) {
      updatedMatch.status = MATCH_STATUS.COMPLETED;
      updatedMatch.winnerId = getMatchWinnerId(player1FramesWon, player2FramesWon, match.player1Id, match.player2Id);
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
    const framesToWin = getFramesToWin(bestOfFrames);

    return {
      player1FramesWon: match.player1FramesWon,
      player2FramesWon: match.player2FramesWon,
      framesToWin,
      framesPlayed: match.frames.length,
      maxFrames: bestOfFrames,
      allowsDraws: allowsDraws(bestOfFrames),
      isComplete: match.status === MATCH_STATUS.COMPLETED
    };
  }
}
