// Utility helper functions

export function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDateShort(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short'
  });
}

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function sortByStandings(players) {
  return [...players].sort((a, b) => {
    // Primary: Points (descending)
    if (b.stats.points !== a.stats.points) {
      return b.stats.points - a.stats.points;
    }
    // Secondary: Frame difference (descending)
    if (b.stats.frameDifference !== a.stats.frameDifference) {
      return b.stats.frameDifference - a.stats.frameDifference;
    }
    // Tertiary: Frames won (descending)
    if (b.stats.framesWon !== a.stats.framesWon) {
      return b.stats.framesWon - a.stats.framesWon;
    }
    // Quaternary: Alphabetical by name
    return a.name.localeCompare(b.name);
  });
}

export function calculateStandings(leagueData) {
  const { players } = leagueData;
  return sortByStandings(players.filter(p => p.active));
}

export function getPlayerById(leagueData, playerId) {
  return leagueData.players.find(p => p.id === playerId);
}

export function getMatchById(leagueData, matchId) {
  for (const round of leagueData.rounds) {
    const match = round.matches.find(m => m.id === matchId);
    if (match) {
      return { match, round };
    }
  }
  return null;
}

export function getCurrentRound(leagueData) {
  return leagueData.rounds.find(r => r.roundNumber === leagueData.league.currentRound);
}

export function getAllMatches(leagueData) {
  const matches = [];
  for (const round of leagueData.rounds) {
    for (const match of round.matches) {
      matches.push({ ...match, roundNumber: round.roundNumber });
    }
  }
  return matches;
}

export function getPlayerMatches(leagueData, playerId) {
  return getAllMatches(leagueData).filter(m =>
    m.player1Id === playerId || m.player2Id === playerId
  );
}

export function downloadJSON(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function readJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        resolve(data);
      } catch (error) {
        reject(new Error('Invalid JSON file'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}

export function validateLeagueData(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Data must be an object' };
  }
  
  if (!data.league || !data.league.id || !data.league.name) {
    return { valid: false, error: 'Invalid league data' };
  }
  
  if (!Array.isArray(data.players)) {
    return { valid: false, error: 'Players must be an array' };
  }
  
  if (!Array.isArray(data.rounds)) {
    return { valid: false, error: 'Rounds must be an array' };
  }
  
  if (!Array.isArray(data.pairingHistory)) {
    return { valid: false, error: 'Pairing history must be an array' };
  }
  
  return { valid: true };
}
