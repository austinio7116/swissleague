// Display interface helper functions

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

export function getAllMatches(leagueData) {
  const matches = [];
  for (const round of leagueData.rounds) {
    for (const match of round.matches) {
      matches.push({ ...match, roundNumber: round.roundNumber });
    }
  }
  return matches;
}

export function getCompletedMatches(leagueData) {
  return getAllMatches(leagueData).filter(m => m.status === 'completed');
}

export function getPendingMatches(leagueData) {
  return getAllMatches(leagueData).filter(m => m.status !== 'completed');
}

export function getPlayerMatches(leagueData, playerId) {
  return getAllMatches(leagueData).filter(m =>
    m.player1Id === playerId || m.player2Id === playerId
  );
}

export function calculateWinRate(stats) {
  if (stats.matchesPlayed === 0) return 0;
  return ((stats.matchesWon / stats.matchesPlayed) * 100).toFixed(1);
}

export function calculateAvgFrames(stats) {
  if (stats.matchesPlayed === 0) return 0;
  return (stats.framesWon / stats.matchesPlayed).toFixed(1);
}

export function getHeadToHead(leagueData, player1Id, player2Id) {
  const matches = getAllMatches(leagueData).filter(m =>
    m.status === 'completed' &&
    ((m.player1Id === player1Id && m.player2Id === player2Id) ||
     (m.player1Id === player2Id && m.player2Id === player1Id))
  );

  let player1Wins = 0;
  let player2Wins = 0;
  let player1Frames = 0;
  let player2Frames = 0;

  for (const match of matches) {
    if (match.player1Id === player1Id) {
      player1Frames += match.player1FramesWon;
      player2Frames += match.player2FramesWon;
      if (match.winnerId === player1Id) player1Wins++;
      else player2Wins++;
    } else {
      player1Frames += match.player2FramesWon;
      player2Frames += match.player1FramesWon;
      if (match.winnerId === player1Id) player1Wins++;
      else player2Wins++;
    }
  }

  return {
    matchesPlayed: matches.length,
    player1Wins,
    player2Wins,
    player1Frames,
    player2Frames
  };
}

export function convertGitHubUrl(url) {
  // Convert GitHub URL to raw content URL
  if (url.includes('raw.githubusercontent.com')) {
    return url;
  }
  
  return url
    .replace('github.com', 'raw.githubusercontent.com')
    .replace('/blob/', '/');
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
