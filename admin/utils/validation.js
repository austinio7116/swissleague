import { MAX_FRAME_SCORE, ERROR_TYPES } from '../../shared/constants.js';
import { LeagueError } from '../modules/storage.js';

export class ScoreValidator {
  static validateFrame(player1Score, player2Score) {
    const errors = [];
    
    // Convert to numbers
    const p1Score = parseInt(player1Score, 10);
    const p2Score = parseInt(player2Score, 10);
    
    // Scores must be non-negative integers
    if (!Number.isInteger(p1Score) || p1Score < 0) {
      errors.push('Player 1 score must be a non-negative integer');
    }
    if (!Number.isInteger(p2Score) || p2Score < 0) {
      errors.push('Player 2 score must be a non-negative integer');
    }
    
    // At least one player must have scored
    if (p1Score === 0 && p2Score === 0) {
      errors.push('At least one player must score points');
    }
    
    // Maximum realistic score is 147 (maximum break)
    if (p1Score > MAX_FRAME_SCORE) {
      errors.push(`Player 1 score exceeds maximum possible (${MAX_FRAME_SCORE})`);
    }
    if (p2Score > MAX_FRAME_SCORE) {
      errors.push(`Player 2 score exceeds maximum possible (${MAX_FRAME_SCORE})`);
    }
    
    // Scores cannot be equal (there must be a winner)
    if (p1Score === p2Score) {
      errors.push('Scores cannot be equal - there must be a frame winner');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      player1Score: p1Score,
      player2Score: p2Score,
      winnerId: p1Score > p2Score ? 'player1' : 'player2'
    };
  }

  static validateMatch(match, bestOfFrames) {
    const framesToWin = Math.ceil(bestOfFrames / 2);
    const errors = [];
    
    // Check if match is already decided
    if (match.player1FramesWon >= framesToWin) {
      errors.push(`Match already won by player 1 (${match.player1FramesWon} frames)`);
    }
    if (match.player2FramesWon >= framesToWin) {
      errors.push(`Match already won by player 2 (${match.player2FramesWon} frames)`);
    }
    
    // Check frame count doesn't exceed best-of limit
    if (match.frames.length >= bestOfFrames) {
      errors.push(`Cannot add more frames - best of ${bestOfFrames} limit reached`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateLeagueName(name) {
    const errors = [];
    
    if (!name || name.trim().length === 0) {
      errors.push('League name is required');
    }
    
    if (name.trim().length < 3) {
      errors.push('League name must be at least 3 characters');
    }
    
    if (name.trim().length > 100) {
      errors.push('League name must be less than 100 characters');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validatePlayerName(name, existingPlayers = []) {
    const errors = [];
    
    if (!name || name.trim().length === 0) {
      errors.push('Player name is required');
    }
    
    if (name.trim().length < 2) {
      errors.push('Player name must be at least 2 characters');
    }
    
    if (name.trim().length > 50) {
      errors.push('Player name must be less than 50 characters');
    }
    
    // Check for duplicate names
    const trimmedName = name.trim().toLowerCase();
    const duplicate = existingPlayers.find(p => 
      p.name.toLowerCase() === trimmedName && p.active
    );
    
    if (duplicate) {
      errors.push('A player with this name already exists');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateBestOfFrames(value) {
    const errors = [];
    const num = parseInt(value, 10);
    
    if (!Number.isInteger(num)) {
      errors.push('Best of frames must be a number');
    }
    
    if (num < 1) {
      errors.push('Best of frames must be at least 1');
    }
    
    if (num % 2 === 0) {
      errors.push('Best of frames must be an odd number');
    }
    
    if (num > 21) {
      errors.push('Best of frames cannot exceed 21');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateTotalRounds(value, playerCount) {
    const errors = [];
    const num = parseInt(value, 10);
    
    if (!Number.isInteger(num)) {
      errors.push('Total rounds must be a number');
    }
    
    if (num < 1) {
      errors.push('Total rounds must be at least 1');
    }
    
    if (num > 20) {
      errors.push('Total rounds cannot exceed 20');
    }
    
    // Warn if rounds exceed what's needed for Swiss format
    if (playerCount > 0) {
      const recommendedRounds = Math.ceil(Math.log2(playerCount));
      if (num > recommendedRounds + 3) {
        errors.push(`Warning: ${num} rounds is more than recommended for ${playerCount} players (${recommendedRounds} rounds recommended)`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export function showValidationErrors(errors, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = '';
  
  if (errors.length === 0) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'block';
  const ul = document.createElement('ul');
  ul.className = 'error-list';
  
  errors.forEach(error => {
    const li = document.createElement('li');
    li.textContent = error;
    ul.appendChild(li);
  });
  
  container.appendChild(ul);
}

export function clearValidationErrors(containerId) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = '';
    container.style.display = 'none';
  }
}
