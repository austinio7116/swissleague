# Swiss-Format Snooker League - Technical Specification

## Data Structures and Interfaces

### TypeScript-style Interface Definitions

```typescript
interface League {
  id: string;
  name: string;
  format: 'swiss';
  bestOfFrames: number; // Must be odd number (3, 5, 7, 9, etc.)
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
  currentRound: number;
  totalRounds: number;
}

interface Player {
  id: string;
  name: string;
  active: boolean;
  stats: PlayerStats;
}

interface PlayerStats {
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  framesWon: number;
  framesLost: number;
  points: number; // 2 for win, 0 for loss
  frameDifference: number; // framesWon - framesLost
  byesReceived: number;
}

interface Round {
  roundNumber: number;
  status: 'pending' | 'in-progress' | 'completed';
  matches: Match[];
  generatedAt: string; // ISO-8601
}

interface Match {
  id: string;
  player1Id: string;
  player2Id: string | null; // null for bye
  status: 'pending' | 'in-progress' | 'completed';
  frames: Frame[];
  player1FramesWon: number;
  player2FramesWon: number;
  winnerId: string | null;
  isBye: boolean;
  completedAt?: string; // ISO-8601
}

interface Frame {
  frameNumber: number;
  player1Score: number;
  player2Score: number;
  winnerId: string;
}

interface LeagueData {
  league: League;
  players: Player[];
  rounds: Round[];
  pairingHistory: string[][]; // [player1Id, player2Id][]
}
```

## Swiss Pairing Algorithm - Detailed Implementation

### Core Algorithm Logic

```javascript
function generateSwissPairings(leagueData) {
  const { players, rounds, pairingHistory, league } = leagueData;
  
  // Step 1: Get active players
  const activePlayers = players.filter(p => p.active);
  
  // Step 2: Sort by standings
  const sortedPlayers = sortByStandings(activePlayers);
  
  // Step 3: Handle bye if odd number
  let byePlayer = null;
  let pairablePlayers = [...sortedPlayers];
  
  if (sortedPlayers.length % 2 !== 0) {
    byePlayer = selectByePlayer(sortedPlayers, rounds);
    pairablePlayers = sortedPlayers.filter(p => p.id !== byePlayer.id);
  }
  
  // Step 4: Create score groups
  const scoreGroups = createScoreGroups(pairablePlayers);
  
  // Step 5: Generate pairings
  const pairings = [];
  const paired = new Set();
  
  for (const group of scoreGroups) {
    const groupPairings = pairGroup(group, paired, pairingHistory);
    pairings.push(...groupPairings);
  }
  
  // Step 6: Add bye match if needed
  if (byePlayer) {
    pairings.push(createByeMatch(byePlayer, league.bestOfFrames));
  }
  
  return pairings;
}

function sortByStandings(players) {
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

function selectByePlayer(sortedPlayers, rounds) {
  // Find player with fewest byes who hasn't had one recently
  const byeCounts = sortedPlayers.map(player => ({
    player,
    byeCount: player.stats.byesReceived
  }));
  
  // Sort by bye count (ascending), then by current standing (descending)
  byeCounts.sort((a, b) => {
    if (a.byeCount !== b.byeCount) {
      return a.byeCount - b.byeCount;
    }
    // Give bye to lowest-ranked player among those with same bye count
    return sortedPlayers.indexOf(b.player) - sortedPlayers.indexOf(a.player);
  });
  
  return byeCounts[0].player;
}

function createScoreGroups(players) {
  const groups = [];
  let currentGroup = [];
  let currentPoints = null;
  
  for (const player of players) {
    if (currentPoints === null || player.stats.points === currentPoints) {
      currentGroup.push(player);
      currentPoints = player.stats.points;
    } else {
      groups.push(currentGroup);
      currentGroup = [player];
      currentPoints = player.stats.points;
    }
  }
  
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  
  return groups;
}

function pairGroup(group, paired, pairingHistory) {
  const pairings = [];
  const available = group.filter(p => !paired.has(p.id));
  
  while (available.length >= 2) {
    const player1 = available[0];
    let player2 = null;
    let player2Index = -1;
    
    // Try to find opponent who hasn't played player1
    for (let i = 1; i < available.length; i++) {
      const candidate = available[i];
      if (!hasPlayedBefore(player1.id, candidate.id, pairingHistory)) {
        player2 = candidate;
        player2Index = i;
        break;
      }
    }
    
    // If all have played before, pair with next available
    if (!player2) {
      player2 = available[1];
      player2Index = 1;
    }
    
    pairings.push({
      player1,
      player2
    });
    
    paired.add(player1.id);
    paired.add(player2.id);
    
    available.splice(player2Index, 1);
    available.splice(0, 1);
  }
  
  return pairings;
}

function hasPlayedBefore(player1Id, player2Id, pairingHistory) {
  return pairingHistory.some(pair => 
    (pair[0] === player1Id && pair[1] === player2Id) ||
    (pair[0] === player2Id && pair[1] === player1Id)
  );
}

function createByeMatch(player, bestOfFrames) {
  const framesToWin = Math.ceil(bestOfFrames / 2);
  return {
    player1: player,
    player2: null,
    isBye: true,
    autoWin: true,
    framesAwarded: framesToWin
  };
}
```

## Local Storage Schema

### Storage Keys

```javascript
const STORAGE_KEYS = {
  LEAGUE_DATA: 'snooker_league_data',
  SETTINGS: 'snooker_league_settings',
  BACKUP: 'snooker_league_backup'
};
```

### Storage Operations

```javascript
class StorageManager {
  static save(leagueData) {
    try {
      const json = JSON.stringify(leagueData);
      localStorage.setItem(STORAGE_KEYS.LEAGUE_DATA, json);
      leagueData.league.updatedAt = new Date().toISOString();
      return true;
    } catch (error) {
      console.error('Storage save failed:', error);
      return false;
    }
  }
  
  static load() {
    try {
      const json = localStorage.getItem(STORAGE_KEYS.LEAGUE_DATA);
      return json ? JSON.parse(json) : null;
    } catch (error) {
      console.error('Storage load failed:', error);
      return null;
    }
  }
  
  static backup() {
    const current = this.load();
    if (current) {
      localStorage.setItem(STORAGE_KEYS.BACKUP, JSON.stringify(current));
    }
  }
  
  static restore() {
    const backup = localStorage.getItem(STORAGE_KEYS.BACKUP);
    if (backup) {
      localStorage.setItem(STORAGE_KEYS.LEAGUE_DATA, backup);
      return true;
    }
    return false;
  }
  
  static clear() {
    localStorage.removeItem(STORAGE_KEYS.LEAGUE_DATA);
  }
}
```

## Score Entry Validation

### Validation Rules

```javascript
class ScoreValidator {
  static validateFrame(player1Score, player2Score) {
    const errors = [];
    
    // Scores must be non-negative integers
    if (!Number.isInteger(player1Score) || player1Score < 0) {
      errors.push('Player 1 score must be a non-negative integer');
    }
    if (!Number.isInteger(player2Score) || player2Score < 0) {
      errors.push('Player 2 score must be a non-negative integer');
    }
    
    // At least one player must have scored
    if (player1Score === 0 && player2Score === 0) {
      errors.push('At least one player must score points');
    }
    
    // Maximum realistic score is 147 (maximum break)
    if (player1Score > 147) {
      errors.push('Player 1 score exceeds maximum possible (147)');
    }
    if (player2Score > 147) {
      errors.push('Player 2 score exceeds maximum possible (147)');
    }
    
    // Scores cannot be equal (there must be a winner)
    if (player1Score === player2Score) {
      errors.push('Scores cannot be equal - there must be a frame winner');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  static validateMatch(match, bestOfFrames) {
    const framesToWin = Math.ceil(bestOfFrames / 2);
    const errors = [];
    
    // Check if match is already decided
    if (match.player1FramesWon >= framesToWin) {
      errors.push(`Match already won by ${match.player1Id} (${match.player1FramesWon} frames)`);
    }
    if (match.player2FramesWon >= framesToWin) {
      errors.push(`Match already won by ${match.player2Id} (${match.player2FramesWon} frames)`);
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
}
```

## GitHub Data Fetching

### Fetch Implementation

```javascript
class GitHubDataLoader {
  constructor(repoUrl) {
    // Convert GitHub URL to raw content URL
    // https://github.com/user/repo/blob/main/data/league-data.json
    // becomes
    // https://raw.githubusercontent.com/user/repo/main/data/league-data.json
    this.rawUrl = this.convertToRawUrl(repoUrl);
  }
  
  convertToRawUrl(url) {
    if (url.includes('raw.githubusercontent.com')) {
      return url;
    }
    
    return url
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/blob/', '/');
  }
  
  async fetchLeagueData() {
    try {
      const response = await fetch(this.rawUrl, {
        cache: 'no-cache',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  async testConnection() {
    const result = await this.fetchLeagueData();
    return result.success;
  }
}
```

## Statistics Calculations

### Player Statistics

```javascript
class StatisticsCalculator {
  static calculatePlayerStats(player, matches) {
    const playerMatches = matches.filter(m => 
      m.player1Id === player.id || m.player2Id === player.id
    );
    
    const completedMatches = playerMatches.filter(m => m.status === 'completed');
    
    let wins = 0;
    let losses = 0;
    let framesWon = 0;
    let framesLost = 0;
    let points = 0;
    
    for (const match of completedMatches) {
      const isPlayer1 = match.player1Id === player.id;
      const playerFrames = isPlayer1 ? match.player1FramesWon : match.player2FramesWon;
      const opponentFrames = isPlayer1 ? match.player2FramesWon : match.player1FramesWon;
      
      framesWon += playerFrames;
      framesLost += opponentFrames;
      
      if (match.winnerId === player.id) {
        wins++;
        points += 2;
      } else if (!match.isBye) {
        losses++;
      }
    }
    
    return {
      matchesPlayed: completedMatches.length,
      matchesWon: wins,
      matchesLost: losses,
      framesWon,
      framesLost,
      frameDifference: framesWon - framesLost,
      points,
      winRate: completedMatches.length > 0 ? (wins / completedMatches.length * 100).toFixed(1) : 0,
      avgFramesPerMatch: completedMatches.length > 0 ? (framesWon / completedMatches.length).toFixed(1) : 0
    };
  }
  
  static calculateHeadToHead(player1Id, player2Id, matches) {
    const h2hMatches = matches.filter(m =>
      m.status === 'completed' &&
      ((m.player1Id === player1Id && m.player2Id === player2Id) ||
       (m.player1Id === player2Id && m.player2Id === player1Id))
    );
    
    let player1Wins = 0;
    let player2Wins = 0;
    let player1Frames = 0;
    let player2Frames = 0;
    
    for (const match of h2hMatches) {
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
      matchesPlayed: h2hMatches.length,
      player1Wins,
      player2Wins,
      player1Frames,
      player2Frames
    };
  }
}
```

## UI State Management

### Admin Interface State

```javascript
class AdminState {
  constructor() {
    this.currentView = 'league-setup'; // league-setup, players, rounds, scoring
    this.selectedMatch = null;
    this.editingPlayer = null;
    this.unsavedChanges = false;
  }
  
  setView(viewName) {
    this.currentView = viewName;
    this.render();
  }
  
  selectMatch(matchId) {
    this.selectedMatch = matchId;
    this.render();
  }
  
  markUnsaved() {
    this.unsavedChanges = true;
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }
  
  markSaved() {
    this.unsavedChanges = false;
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
  }
  
  handleBeforeUnload(e) {
    if (this.unsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  }
  
  render() {
    // Update UI based on current state
    document.querySelectorAll('.view').forEach(view => {
      view.style.display = 'none';
    });
    
    const activeView = document.getElementById(`${this.currentView}-view`);
    if (activeView) {
      activeView.style.display = 'block';
    }
  }
}
```

## Error Handling

### Error Types and Handling

```javascript
class LeagueError extends Error {
  constructor(message, type, details = {}) {
    super(message);
    this.name = 'LeagueError';
    this.type = type;
    this.details = details;
  }
}

class ErrorHandler {
  static handle(error, context = '') {
    console.error(`Error in ${context}:`, error);
    
    let userMessage = 'An unexpected error occurred.';
    
    if (error instanceof LeagueError) {
      switch (error.type) {
        case 'VALIDATION':
          userMessage = `Validation Error: ${error.message}`;
          break;
        case 'STORAGE':
          userMessage = `Storage Error: ${error.message}. Try exporting your data as backup.`;
          break;
        case 'PAIRING':
          userMessage = `Pairing Error: ${error.message}`;
          break;
        case 'NETWORK':
          userMessage = `Network Error: ${error.message}. Check your connection and GitHub URL.`;
          break;
        default:
          userMessage = error.message;
      }
    }
    
    this.showError(userMessage);
  }
  
  static showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-toast';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
      errorDiv.classList.add('fade-out');
      setTimeout(() => errorDiv.remove(), 300);
    }, 5000);
  }
  
  static showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-toast';
    successDiv.textContent = message;
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
      successDiv.classList.add('fade-out');
      setTimeout(() => successDiv.remove(), 300);
    }, 3000);
  }
}
```

## Export/Import Functionality

### JSON Export

```javascript
class DataExporter {
  static exportToJSON(leagueData) {
    const json = JSON.stringify(leagueData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const filename = `${leagueData.league.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.json`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return filename;
  }
  
  static importFromJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          
          // Validate structure
          if (!this.validateLeagueData(data)) {
            reject(new LeagueError('Invalid league data format', 'VALIDATION'));
            return;
          }
          
          resolve(data);
        } catch (error) {
          reject(new LeagueError('Failed to parse JSON file', 'VALIDATION', { error }));
        }
      };
      
      reader.onerror = () => {
        reject(new LeagueError('Failed to read file', 'VALIDATION'));
      };
      
      reader.readAsText(file);
    });
  }
  
  static validateLeagueData(data) {
    return (
      data &&
      data.league &&
      data.league.id &&
      data.league.name &&
      Array.isArray(data.players) &&
      Array.isArray(data.rounds) &&
      Array.isArray(data.pairingHistory)
    );
  }
}
```

## Responsive Design Breakpoints

```css
/* Mobile First Approach */

/* Base styles for mobile (320px+) */
.container {
  padding: 1rem;
}

/* Small tablets (576px+) */
@media (min-width: 576px) {
  .container {
    padding: 1.5rem;
  }
}

/* Tablets (768px+) */
@media (min-width: 768px) {
  .container {
    max-width: 720px;
    margin: 0 auto;
  }
  
  .standings-table {
    font-size: 1rem;
  }
}

/* Desktop (992px+) */
@media (min-width: 992px) {
  .container {
    max-width: 960px;
  }
  
  .admin-layout {
    display: grid;
    grid-template-columns: 250px 1fr;
    gap: 2rem;
  }
}

/* Large desktop (1200px+) */
@media (min-width: 1200px) {
  .container {
    max-width: 1140px;
  }
}
```

## Performance Optimizations

### Virtual Scrolling for Large Match Lists

```javascript
class VirtualScroller {
  constructor(container, items, renderItem, itemHeight = 60) {
    this.container = container;
    this.items = items;
    this.renderItem = renderItem;
    this.itemHeight = itemHeight;
    this.visibleItems = Math.ceil(container.clientHeight / itemHeight) + 2;
    this.scrollTop = 0;
    
    this.init();
  }
  
  init() {
    this.container.style.position = 'relative';
    this.container.style.overflow = 'auto';
    
    const totalHeight = this.items.length * this.itemHeight;
    const spacer = document.createElement('div');
    spacer.style.height = `${totalHeight}px`;
    this.container.appendChild(spacer);
    
    this.container.addEventListener('scroll', () => this.handleScroll());
    this.render();
  }
  
  handleScroll() {
    this.scrollTop = this.container.scrollTop;
    this.render();
  }
  
  render() {
    const startIndex = Math.floor(this.scrollTop / this.itemHeight);
    const endIndex = Math.min(startIndex + this.visibleItems, this.items.length);
    
    // Clear existing items
    const existingItems = this.container.querySelectorAll('.virtual-item');
    existingItems.forEach(item => item.remove());
    
    // Render visible items
    for (let i = startIndex; i < endIndex; i++) {
      const item = this.renderItem(this.items[i]);
      item.classList.add('virtual-item');
      item.style.position = 'absolute';
      item.style.top = `${i * this.itemHeight}px`;
      item.style.height = `${this.itemHeight}px`;
      this.container.appendChild(item);
    }
  }
}
```

## Accessibility Features

### ARIA Labels and Keyboard Navigation

```javascript
class AccessibilityManager {
  static enhanceTable(table) {
    table.setAttribute('role', 'table');
    table.setAttribute('aria-label', 'League standings');
    
    const headers = table.querySelectorAll('th');
    headers.forEach((header, index) => {
      header.setAttribute('scope', 'col');
      header.setAttribute('tabindex', '0');
      header.setAttribute('aria-sort', 'none');
      
      // Add keyboard sorting
      header.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          header.click();
        }
      });
    });
  }
  
  static enhanceForm(form) {
    const inputs = form.querySelectorAll('input, select, textarea');
    
    inputs.forEach(input => {
      const label = form.querySelector(`label[for="${input.id}"]`);
      if (!label && input.id) {
        console.warn(`Missing label for input: ${input.id}`);
      }
      
      // Add aria-required for required fields
      if (input.hasAttribute('required')) {
        input.setAttribute('aria-required', 'true');
      }
      
      // Add aria-invalid for validation
      input.addEventListener('invalid', () => {
        input.setAttribute('aria-invalid', 'true');
      });
      
      input.addEventListener('input', () => {
        if (input.validity.valid) {
          input.removeAttribute('aria-invalid');
        }
      });
    });
  }
  
  static announceUpdate(message) {
    const announcer = document.getElementById('aria-announcer') || 
      this.createAnnouncer();
    
    announcer.textContent = message;
    
    // Clear after announcement
    setTimeout(() => {
      announcer.textContent = '';
    }, 1000);
  }
  
  static createAnnouncer() {
    const announcer = document.createElement('div');
    announcer.id = 'aria-announcer';
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    announcer.style.position = 'absolute';
    announcer.style.left = '-10000px';
    announcer.style.width = '1px';
    announcer.style.height = '1px';
    announcer.style.overflow = 'hidden';
    document.body.appendChild(announcer);
    return announcer;
  }
}
```

## Testing Utilities

### Test Data Generator

```javascript
class TestDataGenerator {
  static generateLeague(playerCount = 8, roundsCompleted = 0) {
    const league = {
      id: this.generateId(),
      name: 'Test League',
      format: 'swiss',
      bestOfFrames: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentRound: roundsCompleted + 1,
      totalRounds: 7
    };
    
    const players = [];
    for (let i = 1; i <= playerCount; i++) {
      players.push({
        id: this.generateId(),
        name: `Player ${i}`,
        active: true,
        stats: {
          matchesPlayed: 0,
          matchesWon: 0,
          matchesLost: 0,
          framesWon: 0,
          framesLost: 0,
          points: 0,
          frameDifference: 0,
          byesReceived: 0
        }
      });
    }
    
    const rounds = [];
    const pairingHistory = [];
    
    // Generate completed rounds with random results
    for (let r = 1; r <= roundsCompleted; r++) {
      const round = this.generateRound(r, players, pairingHistory, league.bestOfFrames);
      rounds.push(round);
    }
    
    return {
      league,
      players,
      rounds,
      pairingHistory
    };
  }
  
  static generateRound(roundNumber, players, pairingHistory, bestOfFrames) {
    const matches = [];
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        const match = this.generateMatch(
          shuffled[i],
          shuffled[i + 1],
          bestOfFrames
        );
        matches.push(match);
        pairingHistory.push([shuffled[i].id, shuffled[i + 1].id]);
      }
    }
    
    return {
      roundNumber,
      status: 'completed',
      matches,
      generatedAt: new Date().toISOString()
    };
  }
  
  static generateMatch(player1, player2, bestOfFrames) {
    const framesToWin = Math.ceil(bestOfFrames / 2);
    const frames = [];
    let p1Frames = 0;
    let p2Frames = 0;
    
    while (p1Frames < framesToWin && p2Frames < framesToWin) {
      const p1Score = Math.floor(Math.random() * 100);
      const p2Score = Math.floor(Math.random() * 100);
      const winnerId = p1Score > p2Score ? player1.id : player2.id;
      
      frames.push({
        frameNumber: frames.length + 1,
        player1Score: p1Score,
        player2Score: p2Score,
        winnerId
      });
      
      if (winnerId === player1.id) p1Frames++;
      else p2Frames++;
    }
    
    return {
      id: this.generateId(),
      player1Id: player1.id,
      player2Id: player2.id,
      status: 'completed',
      frames,
      player1FramesWon: p1Frames,
      player2FramesWon: p2Frames,
      winnerId: p1Frames > p2Frames ? player1.id : player2.id,
      isBye: false,
      completedAt: new Date().toISOString()
    };
  }
  
  static generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {