import { POINTS, ERROR_TYPES } from '../../shared/constants.js';
import { sortByStandings } from '../utils/helpers.js';
import { LeagueError } from './storage.js';

export class SwissPairing {
  static generatePairings(leagueData) {
    const { players, rounds, pairingHistory, league } = leagueData;
    
    // Get active players
    const activePlayers = players.filter(p => p.active);
    
    if (activePlayers.length < 2) {
      throw new LeagueError(
        'Need at least 2 active players to generate pairings',
        ERROR_TYPES.PAIRING
      );
    }
    
    // Sort by standings
    const sortedPlayers = sortByStandings(activePlayers);
    
    // Handle bye if odd number
    let byePlayer = null;
    let pairablePlayers = [...sortedPlayers];
    
    if (sortedPlayers.length % 2 !== 0) {
      byePlayer = this.selectByePlayer(sortedPlayers, rounds);
      pairablePlayers = sortedPlayers.filter(p => p.id !== byePlayer.id);
    }
    
    // Generate pairings using a simpler approach that handles cross-group pairing
    const pairings = this.pairAllPlayers(pairablePlayers, pairingHistory);
    
    // Add bye match if needed
    if (byePlayer) {
      pairings.push(this.createByeMatch(byePlayer, league.bestOfFrames));
    }
    
    return pairings;
  }

  static pairAllPlayers(players, pairingHistory) {
    const pairings = [];
    const available = [...players];
    const paired = new Set();
    
    while (available.length >= 2) {
      const player1 = available[0];
      let player2 = null;
      let player2Index = -1;
      let isRepeat = false;
      
      // Try to find opponent who hasn't played player1
      for (let i = 1; i < available.length; i++) {
        const candidate = available[i];
        if (!this.hasPlayedBefore(player1.id, candidate.id, pairingHistory)) {
          player2 = candidate;
          player2Index = i;
          break;
        }
      }
      
      // If all have played before, pair with next available (repeat pairing)
      if (!player2 && available.length >= 2) {
        player2 = available[1];
        player2Index = 1;
        isRepeat = true;
      }
      
      if (player2) {
        pairings.push({
          player1,
          player2,
          isRepeat,
          isBye: false
        });
        
        paired.add(player1.id);
        paired.add(player2.id);
        
        // Remove paired players from available list
        available.splice(player2Index, 1);
        available.splice(0, 1);
      } else {
        // Should not happen if we have even number of players
        break;
      }
    }
    
    return pairings;
  }

  static selectByePlayer(sortedPlayers, rounds) {
    // Count byes for each player
    const byeCounts = sortedPlayers.map(player => {
      let byeCount = 0;
      for (const round of rounds) {
        const byeMatch = round.matches.find(m => 
          m.isBye && (m.player1Id === player.id || m.player2Id === player.id)
        );
        if (byeMatch) byeCount++;
      }
      return { player, byeCount };
    });
    
    // Sort by bye count (ascending), then by current standing (descending - give to lowest ranked)
    byeCounts.sort((a, b) => {
      if (a.byeCount !== b.byeCount) {
        return a.byeCount - b.byeCount;
      }
      // Give bye to lowest-ranked player among those with same bye count
      return sortedPlayers.indexOf(b.player) - sortedPlayers.indexOf(a.player);
    });
    
    return byeCounts[0].player;
  }

  static createScoreGroups(players) {
    const groups = [];
    let currentGroup = [];
    let currentPoints = null;
    
    for (const player of players) {
      if (currentPoints === null || player.stats.points === currentPoints) {
        currentGroup.push(player);
        currentPoints = player.stats.points;
      } else {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = [player];
        currentPoints = player.stats.points;
      }
    }
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }

  static pairGroup(group, paired, pairingHistory) {
    const pairings = [];
    const available = group.filter(p => !paired.has(p.id));
    
    while (available.length >= 2) {
      const player1 = available[0];
      let player2 = null;
      let player2Index = -1;
      let isRepeat = false;
      
      // Try to find opponent who hasn't played player1
      for (let i = 1; i < available.length; i++) {
        const candidate = available[i];
        if (!this.hasPlayedBefore(player1.id, candidate.id, pairingHistory)) {
          player2 = candidate;
          player2Index = i;
          break;
        }
      }
      
      // If all have played before, pair with next available (repeat pairing)
      if (!player2) {
        player2 = available[1];
        player2Index = 1;
        isRepeat = true;
      }
      
      pairings.push({
        player1,
        player2,
        isRepeat
      });
      
      paired.add(player1.id);
      paired.add(player2.id);
      
      // Remove paired players from available list
      available.splice(player2Index, 1);
      available.splice(0, 1);
    }
    
    // Handle odd player in group (pair with top of next group)
    if (available.length === 1) {
      // This player will be handled by the next group or become a bye
      // For now, we'll leave them unpaired and let the next group handle it
    }
    
    return pairings;
  }

  static hasPlayedBefore(player1Id, player2Id, pairingHistory) {
    return pairingHistory.some(pair => 
      (pair[0] === player1Id && pair[1] === player2Id) ||
      (pair[0] === player2Id && pair[1] === player1Id)
    );
  }

  static createByeMatch(player, bestOfFrames) {
    const framesToWin = Math.ceil(bestOfFrames / 2);
    return {
      player1: player,
      player2: null,
      isBye: true,
      autoWin: true,
      framesAwarded: framesToWin
    };
  }

  static getPairingExplanation(pairing) {
    if (pairing.isBye) {
      return `${pairing.player1.name} receives a BYE (automatic win)`;
    }
    
    const p1Points = pairing.player1.stats.points;
    const p2Points = pairing.player2.stats.points;
    const p1Diff = pairing.player1.stats.frameDifference;
    const p2Diff = pairing.player2.stats.frameDifference;
    
    let explanation = `${pairing.player1.name} (${p1Points}pts, ${p1Diff > 0 ? '+' : ''}${p1Diff}) vs ${pairing.player2.name} (${p2Points}pts, ${p2Diff > 0 ? '+' : ''}${p2Diff})`;
    
    if (pairing.isRepeat) {
      explanation += ' ⚠️ REPEAT PAIRING';
    }
    
    return explanation;
  }

  static validatePairings(pairings, activePlayers) {
    const errors = [];
    const pairedPlayerIds = new Set();
    
    // Check all active players are included
    for (const pairing of pairings) {
      pairedPlayerIds.add(pairing.player1.id);
      if (pairing.player2) {
        pairedPlayerIds.add(pairing.player2.id);
      }
    }
    
    for (const player of activePlayers) {
      if (!pairedPlayerIds.has(player.id)) {
        errors.push(`Player ${player.name} is not included in pairings`);
      }
    }
    
    // Check for duplicate pairings in same round
    const pairingSet = new Set();
    for (const pairing of pairings) {
      if (!pairing.isBye) {
        const key = [pairing.player1.id, pairing.player2.id].sort().join('-');
        if (pairingSet.has(key)) {
          errors.push(`Duplicate pairing: ${pairing.player1.name} vs ${pairing.player2.name}`);
        }
        pairingSet.add(key);
      }
    }
    
    // Check only one bye
    const byeCount = pairings.filter(p => p.isBye).length;
    if (byeCount > 1) {
      errors.push(`Multiple byes detected (${byeCount})`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
