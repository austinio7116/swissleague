#!/usr/bin/env node
/**
 * End-to-end test of the tiered round-robin league system using the actual JS modules.
 *
 * Creates a 3-tier league with 18 players (6 per tier), plays out a full
 * season of round-robin matches, applies promotion/relegation, plays some
 * matches in season 2, and displays results at each stage.
 *
 * Run: node test_tiered_league.mjs
 */

// Seed Math.random for reproducible results
let _seed = 42;
function seededRandom() {
  _seed = (_seed * 16807 + 0) % 2147483647;
  return (_seed - 1) / 2147483646;
}
const originalRandom = Math.random;
Math.random = seededRandom;

// ── Import actual modules ───────────────────────────────────────────────
import { LeagueManager } from './modules/league.js';
import { PlayerManager } from './modules/players.js';
import { RoundManager } from './modules/rounds.js';
import { TierManager } from './modules/tier-manager.js';
import { RoundRobinPairing } from './modules/round-robin-pairing.js';
import { LEAGUE_FORMATS, POINTS } from '../shared/constants.js';
import { sortByTierStandings, getPlayerById } from './utils/helpers.js';

// ── Constants ───────────────────────────────────────────────────────────

const TIERS = ['Diamond', 'Gold', 'Silver'];
const PLAYERS_PER_TIER = 6;
const BEST_OF_FRAMES = 3;

const PLAYER_NAMES = [
  // Diamond (top 6)
  "Ronnie O'Sullivan", "Judd Trump", "Mark Selby",
  "John Higgins", "Neil Robertson", "Kyren Wilson",
  // Gold (middle 6)
  "Mark Allen", "Shaun Murphy", "Barry Hawkins",
  "Mark Williams", "Luca Brecel", "Zhao Xintong",
  // Silver (bottom 6)
  "Jack Lisowski", "Stuart Bingham", "Yan Bingtao",
  "Anthony McGill", "Hossein Vafaei", "Tom Ford",
];

// ── ANSI Colors ─────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[92m';
const RED = '\x1b[91m';
const TIER_COLORS = {
  Diamond: '\x1b[96m',
  Gold: '\x1b[93m',
  Silver: '\x1b[37m',
};

function colored(text, tier) {
  return `${TIER_COLORS[tier] || ''}${text}${RESET}`;
}

// ── Test Assertions ─────────────────────────────────────────────────────

let assertCount = 0;
let assertPassed = 0;

function assert(condition, message) {
  assertCount++;
  if (!condition) {
    console.error(`  ${RED}✗ ASSERTION FAILED: ${message}${RESET}`);
    process.exitCode = 1;
  } else {
    assertPassed++;
  }
}

function assertEqual(actual, expected, message) {
  assertCount++;
  if (actual !== expected) {
    console.error(`  ${RED}✗ ASSERTION FAILED: ${message} (expected ${expected}, got ${actual})${RESET}`);
    process.exitCode = 1;
  } else {
    assertPassed++;
  }
}

// ── Match Simulation ────────────────────────────────────────────────────

function simulateFrame() {
  const winnerScore = Math.floor(seededRandom() * 91) + 50; // 50-140
  const loserScore = Math.floor(seededRandom() * winnerScore);
  return { winnerScore, loserScore };
}

function simulateMatchScores(bestOf) {
  const framesToWin = Math.floor(bestOf / 2) + 1;
  let p1Wins = 0;
  let p2Wins = 0;
  const frames = [];

  while (p1Wins < framesToWin && p2Wins < framesToWin) {
    const { winnerScore, loserScore } = simulateFrame();
    if (seededRandom() < 0.5) {
      frames.push({ player1Score: winnerScore, player2Score: loserScore });
      p1Wins++;
    } else {
      frames.push({ player1Score: loserScore, player2Score: winnerScore });
      p2Wins++;
    }
  }

  return frames;
}

function applyMatchResult(leagueData, match, frameData) {
  /**
   * Apply a match result using the same logic as the admin scoring module.
   * We do this directly since the scoring module is UI-coupled.
   */
  let p1FramesWon = 0;
  let p2FramesWon = 0;
  const frames = [];

  for (let i = 0; i < frameData.length; i++) {
    const { player1Score, player2Score } = frameData[i];
    const winnerId = player1Score > player2Score ? match.player1Id : match.player2Id;
    if (player1Score > player2Score) p1FramesWon++;
    else p2FramesWon++;

    frames.push({
      frameNumber: i + 1,
      player1Score,
      player2Score,
      winnerId,
    });
  }

  const matchWinnerId = p1FramesWon > p2FramesWon ? match.player1Id : match.player2Id;

  // Update match in place (matches are objects in the rounds array)
  match.frames = frames;
  match.player1FramesWon = p1FramesWon;
  match.player2FramesWon = p2FramesWon;
  match.status = 'completed';
  match.winnerId = matchWinnerId;
  match.completedAt = new Date().toISOString();

  // Update round status if all matches complete
  for (const round of leagueData.rounds) {
    if (round.matches.includes(match)) {
      const allComplete = round.matches.every(m => m.status === 'completed');
      if (allComplete) round.status = 'completed';
      break;
    }
  }

  // Recalculate stats
  leagueData = PlayerManager.recalculateAllPlayerStats(leagueData);
  return leagueData;
}

function playAllMatchesInRound(leagueData, roundNumber) {
  const round = leagueData.rounds.find(r => r.roundNumber === roundNumber);
  if (!round) throw new Error(`Round ${roundNumber} not found`);

  for (const match of round.matches) {
    if (match.status === 'completed') continue;
    const frameData = simulateMatchScores(BEST_OF_FRAMES);
    leagueData = applyMatchResult(leagueData, match, frameData);
  }

  return leagueData;
}

// ── Display ─────────────────────────────────────────────────────────────

function printHeader(text) {
  console.log();
  console.log(`${BOLD}${'='.repeat(70)}`);
  console.log(`  ${text}`);
  console.log(`${'='.repeat(70)}${RESET}`);
}

function printTierStandings(leagueData, tierName, showZones = true) {
  const standings = TierManager.getTierStandings(leagueData, tierName);
  const promoCount = leagueData.league.tierConfig.promotionCount;
  const tiers = leagueData.league.tierConfig.tiers;
  const tierIdx = tiers.indexOf(tierName);

  console.log(`\n  ${colored(`── ${tierName} Tier ──`, tierName)}`);
  console.log(`  ${'#'.padEnd(3)} ${'Player'.padEnd(22)} ${'P'.padStart(3)} ${'W'.padStart(3)} ${'L'.padStart(3)} ${'FW'.padStart(4)} ${'FL'.padStart(4)} ${'FD'.padStart(5)} ${'Pts'.padStart(4)}`);
  console.log(`  ${'─'.repeat(55)}`);

  standings.forEach((p, i) => {
    const s = p.stats;
    const fd = s.frameDifference;
    const fdStr = fd > 0 ? `+${fd}` : `${fd}`;
    let zone = '';
    if (showZones) {
      if (tierIdx > 0 && i < promoCount) zone = ` ${GREEN}▲${RESET}`;
      else if (tierIdx < tiers.length - 1 && i >= standings.length - promoCount) zone = ` ${RED}▼${RESET}`;
    }
    console.log(
      `  ${String(i + 1).padEnd(3)} ${p.name.padEnd(22)} ${String(s.matchesPlayed).padStart(3)} ` +
      `${String(s.matchesWon).padStart(3)} ${String(s.matchesLost).padStart(3)} ` +
      `${String(s.framesWon).padStart(4)} ${String(s.framesLost).padStart(4)} ` +
      `${fdStr.padStart(5)} ${String(s.points).padStart(4)}${zone}`
    );
  });
}

function printAllStandings(leagueData, showZones = true) {
  for (const tier of leagueData.league.tierConfig.tiers) {
    printTierStandings(leagueData, tier, showZones);
  }
}

function printRoundResults(leagueData, roundNumber) {
  const round = leagueData.rounds.find(r => r.roundNumber === roundNumber);
  if (!round) return;

  console.log(`\n  Round ${roundNumber} Results:`);
  console.log(`  ${'─'.repeat(50)}`);

  // Group matches by tier
  const matchesByTier = {};
  for (const match of round.matches) {
    const p1 = getPlayerById(leagueData, match.player1Id);
    const tier = p1?.tier || 'Unknown';
    if (!matchesByTier[tier]) matchesByTier[tier] = [];
    matchesByTier[tier].push(match);
  }

  for (const tier of leagueData.league.tierConfig.tiers) {
    if (!matchesByTier[tier]) continue;
    console.log(`\n    ${colored(tier, tier)}:`);
    for (const match of matchesByTier[tier]) {
      const p1 = getPlayerById(leagueData, match.player1Id);
      const p2 = getPlayerById(leagueData, match.player2Id);
      const w1 = match.winnerId === p1.id ? ' ★' : '';
      const w2 = match.winnerId === p2.id ? ' ★' : '';
      console.log(`    ${p1.name}${w1} ${match.player1FramesWon}-${match.player2FramesWon} ${p2.name}${w2}`);
    }
  }
}

function printPromotionRelegation(promotions, relegations) {
  console.log(`\n  ${BOLD}Promotions:${RESET}`);
  for (const pr of promotions) {
    console.log(`    ${GREEN}▲${RESET} ${pr.player.name}: ${colored(pr.fromTier, pr.fromTier)} → ${colored(pr.toTier, pr.toTier)}`);
  }
  console.log(`\n  ${BOLD}Relegations:${RESET}`);
  for (const r of relegations) {
    console.log(`    ${RED}▼${RESET} ${r.player.name}: ${colored(r.fromTier, r.fromTier)} → ${colored(r.toTier, r.toTier)}`);
  }
}

function printTierRosters(leagueData) {
  for (const tier of leagueData.league.tierConfig.tiers) {
    const players = TierManager.getTierPlayers(leagueData, tier);
    console.log(`\n  ${colored(`${tier} Tier:`, tier)}`);
    players.forEach(p => console.log(`    ${p.tierRank}. ${p.name}`));
  }
}

function printCareerStats(leagueData) {
  const tierOrder = {};
  leagueData.league.tierConfig.tiers.forEach((t, i) => tierOrder[t] = i);

  const players = [...leagueData.players].sort((a, b) => {
    const ca = a.careerStats || {};
    const cb = b.careerStats || {};
    if ((cb.points || 0) !== (ca.points || 0)) return (cb.points || 0) - (ca.points || 0);
    return (tierOrder[a.tier] || 99) - (tierOrder[b.tier] || 99);
  });

  console.log(`\n  ${'Player'.padEnd(22)} ${'Tier'.padEnd(10)} ${'MP'.padStart(3)} ${'MW'.padStart(3)} ${'ML'.padStart(3)} ${'FW'.padStart(4)} ${'FL'.padStart(4)} ${'Pts'.padStart(4)} ${'Seasons'.padStart(8)}`);
  console.log(`  ${'─'.repeat(68)}`);

  for (const p of players) {
    const c = p.careerStats || {};
    // Tier column with color codes makes padding tricky, so pad the visible text
    const tierStr = colored(p.tier || '?', p.tier);
    console.log(
      `  ${p.name.padEnd(22)} ${tierStr}${' '.repeat(Math.max(0, 10 - (p.tier || '?').length))} ` +
      `${String(c.matchesPlayed || 0).padStart(3)} ${String(c.matchesWon || 0).padStart(3)} ` +
      `${String(c.matchesLost || 0).padStart(3)} ${String(c.framesWon || 0).padStart(4)} ` +
      `${String(c.framesLost || 0).padStart(4)} ${String(c.points || 0).padStart(4)} ` +
      `${String(c.seasonsPlayed || 0).padStart(8)}`
    );
  }
}

// ── Round-Robin Validation ──────────────────────────────────────────────

function validateRoundRobin(leagueData) {
  const tiers = leagueData.league.tierConfig.tiers;
  const errors = [];

  for (const tier of tiers) {
    const tierPlayers = leagueData.players.filter(p => p.tier === tier);
    const playerIds = new Set(tierPlayers.map(p => p.id));
    const matchups = {};
    for (const pid of playerIds) matchups[pid] = new Set();

    for (const rd of leagueData.rounds) {
      for (const match of rd.matches) {
        if (playerIds.has(match.player1Id) && playerIds.has(match.player2Id)) {
          matchups[match.player1Id].add(match.player2Id);
          matchups[match.player2Id].add(match.player1Id);
        }
      }
    }

    for (const p of tierPlayers) {
      const expected = new Set([...playerIds].filter(id => id !== p.id));
      const actual = matchups[p.id];
      const missing = [...expected].filter(id => !actual.has(id));
      if (missing.length > 0) {
        const missingNames = missing.map(id => tierPlayers.find(pp => pp.id === id)?.name);
        errors.push(`${tier}: ${p.name} didn't play ${missingNames.join(', ')}`);
      }
    }
  }

  return errors;
}

// ── Validate pairings using the actual RoundRobinPairing.validatePairings ──

function validatePairingsPerTier(leagueData) {
  const tiers = leagueData.league.tierConfig.tiers;
  const errors = [];

  for (const tier of tiers) {
    const tierPlayers = TierManager.getTierPlayers(leagueData, tier);
    const allRounds = RoundRobinPairing.generateAllRounds(tierPlayers);
    const validation = RoundRobinPairing.validatePairings(allRounds, tierPlayers);
    if (!validation.valid) {
      errors.push(...validation.errors.map(e => `${tier}: ${e}`));
    }
  }

  return errors;
}

// ── Main Test ───────────────────────────────────────────────────────────

function main() {
  // ─── Create League ───
  printHeader('CREATING TIERED LEAGUE (JS Modules)');

  let leagueData = LeagueManager.createTieredLeague(
    'Test Tiered Snooker League',
    BEST_OF_FRAMES,
    {
      playersPerTier: PLAYERS_PER_TIER,
      tiers: TIERS,
      promotionCount: 2,
    }
  );

  // Verify league structure
  assert(leagueData.league.format === LEAGUE_FORMATS.TIERED_ROUND_ROBIN, 'League format should be tiered-round-robin');
  assertEqual(leagueData.league.totalRounds, 5, 'Total rounds should be playersPerTier - 1');
  assertEqual(leagueData.league.currentSeason, 1, 'Current season should be 1');
  assert(Array.isArray(leagueData.seasons), 'Should have seasons array');
  assertEqual(leagueData.league.tierConfig.tiers.length, 3, 'Should have 3 tiers');

  console.log(`\n  League: ${leagueData.league.name}`);
  console.log(`  Format: ${leagueData.league.format}`);
  console.log(`  Tiers: ${TIERS.join(', ')}`);
  console.log(`  Players per tier: ${PLAYERS_PER_TIER}`);
  console.log(`  Total rounds per season: ${leagueData.league.totalRounds}`);
  console.log(`  Best of: ${BEST_OF_FRAMES} frames`);
  console.log(`  Promotion/Relegation: ${leagueData.league.tierConfig.promotionCount} per tier boundary`);

  // ─── Add Players ───
  for (let i = 0; i < PLAYER_NAMES.length; i++) {
    const tierIndex = Math.floor(i / PLAYERS_PER_TIER);
    const tierRank = (i % PLAYERS_PER_TIER) + 1;
    const player = PlayerManager.createPlayer(PLAYER_NAMES[i], {
      tier: TIERS[tierIndex],
      tierRank,
      includeCareerStats: true,
    });
    leagueData = {
      ...leagueData,
      players: [...leagueData.players, player],
    };
  }

  assertEqual(leagueData.players.length, 18, 'Should have 18 players');

  // Verify tier distribution
  for (const tier of TIERS) {
    const count = leagueData.players.filter(p => p.tier === tier).length;
    assertEqual(count, PLAYERS_PER_TIER, `${tier} tier should have ${PLAYERS_PER_TIER} players`);
  }

  // Initialize season
  leagueData = TierManager.initializeSeason(leagueData);
  assertEqual(leagueData.seasons.length, 1, 'Should have 1 season');
  assertEqual(leagueData.seasons[0].status, 'active', 'Season 1 should be active');

  // Verify canStartLeague
  const startCheck = LeagueManager.canStartLeague(leagueData);
  assert(startCheck.canStart, `canStartLeague should be true: ${startCheck.errors.join(', ')}`);

  printTierRosters(leagueData);

  // Validate pairing generation for each tier
  const pairingErrors = validatePairingsPerTier(leagueData);
  if (pairingErrors.length > 0) {
    console.log(`\n  ${RED}PAIRING VALIDATION ERRORS:${RESET}`);
    pairingErrors.forEach(e => console.log(`    - ${e}`));
  } else {
    console.log(`\n  ${GREEN}✓ RoundRobinPairing.validatePairings passed for all tiers${RESET}`);
  }
  assert(pairingErrors.length === 0, 'Round-robin pairing validation should pass');

  // ─── Season 1: Play all 5 rounds ───
  printHeader('SEASON 1 - PLAYING ALL ROUNDS');

  const totalRounds = leagueData.league.totalRounds;

  for (let roundNum = 1; roundNum <= totalRounds; roundNum++) {
    // Use the actual RoundManager to generate the round
    leagueData = RoundManager.generateRound(leagueData);

    // Play all matches
    leagueData = playAllMatchesInRound(leagueData, roundNum);

    printRoundResults(leagueData, roundNum);

    // Advance to next round (if not last)
    if (roundNum < totalRounds) {
      leagueData = RoundManager.advanceToNextRound(leagueData);
    }
  }

  // Verify round count
  assertEqual(leagueData.rounds.length, totalRounds, `Should have ${totalRounds} rounds`);

  // Validate round-robin completeness
  const rrErrors = validateRoundRobin(leagueData);
  if (rrErrors.length > 0) {
    console.log(`\n  ${RED}ROUND-ROBIN VALIDATION ERRORS:${RESET}`);
    rrErrors.forEach(e => console.log(`    - ${e}`));
  } else {
    console.log(`\n  ${GREEN}✓ Round-robin validation passed: every player played every opponent in their tier exactly once${RESET}`);
  }
  assert(rrErrors.length === 0, 'Round-robin should be complete');

  // Verify all players played correct number of matches
  for (const p of leagueData.players) {
    assertEqual(p.stats.matchesPlayed, PLAYERS_PER_TIER - 1,
      `${p.name} should have played ${PLAYERS_PER_TIER - 1} matches`);
    assertEqual(p.stats.matchesWon + p.stats.matchesLost, p.stats.matchesPlayed,
      `${p.name} wins + losses should equal matches played`);
    assertEqual(p.stats.frameDifference, p.stats.framesWon - p.stats.framesLost,
      `${p.name} frame difference should equal framesWon - framesLost`);
    assertEqual(p.stats.points, p.stats.matchesWon * POINTS.WIN,
      `${p.name} points should equal matchesWon * WIN_POINTS`);
    // Verify no SOS/Buchholz for tiered
    assertEqual(p.stats.strengthOfSchedule, 0, `${p.name} SOS should be 0 for tiered`);
    assertEqual(p.stats.buchholzScore, 0, `${p.name} Buchholz should be 0 for tiered`);
  }

  // Verify all rounds are completed
  for (const rd of leagueData.rounds) {
    assertEqual(rd.status, 'completed', `Round ${rd.roundNumber} should be completed`);
  }

  // ─── Season 1 Final Standings ───
  printHeader('SEASON 1 - FINAL STANDINGS');
  printAllStandings(leagueData, true);
  console.log(`\n  ${BOLD}Legend:${RESET} ${GREEN}▲${RESET} = Promotion zone   ${RED}▼${RESET} = Relegation zone`);

  // Cross-check: sortByTierStandings from helpers.js should match TierManager
  for (const tier of TIERS) {
    const tmStandings = TierManager.getTierStandings(leagueData, tier);
    const helperStandings = sortByTierStandings(
      leagueData.players.filter(p => p.tier === tier && p.active)
    );
    const tmIds = tmStandings.map(p => p.id);
    const helperIds = helperStandings.map(p => p.id);
    assert(
      JSON.stringify(tmIds) === JSON.stringify(helperIds),
      `${tier}: TierManager.getTierStandings should match sortByTierStandings from helpers.js`
    );
  }
  console.log(`\n  ${GREEN}✓ TierManager standings match helpers.js sortByTierStandings${RESET}`);

  // Verify canStartNewSeason
  const seasonCheck = TierManager.canStartNewSeason(leagueData);
  assert(seasonCheck.canStart, `canStartNewSeason should be true: ${seasonCheck.errors?.join(', ')}`);

  // ─── Promotion / Relegation ───
  printHeader('SEASON 1 → SEASON 2: PROMOTION & RELEGATION');

  const { promotions, relegations } = TierManager.calculatePromotionRelegation(leagueData);

  // Validate promotion/relegation counts
  assertEqual(promotions.length, 4, 'Should have 4 promotions (2 per boundary × 2 boundaries)');
  assertEqual(relegations.length, 4, 'Should have 4 relegations (2 per boundary × 2 boundaries)');

  // Gold top 2 promote to Diamond, Silver top 2 promote to Gold
  const goldPromoted = promotions.filter(pr => pr.fromTier === 'Gold');
  const silverPromoted = promotions.filter(pr => pr.fromTier === 'Silver');
  assertEqual(goldPromoted.length, 2, '2 players should promote from Gold');
  assertEqual(silverPromoted.length, 2, '2 players should promote from Silver');
  assert(goldPromoted.every(pr => pr.toTier === 'Diamond'), 'Gold promotions should go to Diamond');
  assert(silverPromoted.every(pr => pr.toTier === 'Gold'), 'Silver promotions should go to Gold');

  // Diamond bottom 2 relegate to Gold, Gold bottom 2 relegate to Silver
  const diamondRelegated = relegations.filter(r => r.fromTier === 'Diamond');
  const goldRelegated = relegations.filter(r => r.fromTier === 'Gold');
  assertEqual(diamondRelegated.length, 2, '2 players should relegate from Diamond');
  assertEqual(goldRelegated.length, 2, '2 players should relegate from Gold');
  assert(diamondRelegated.every(r => r.toTier === 'Gold'), 'Diamond relegations should go to Gold');
  assert(goldRelegated.every(r => r.toTier === 'Silver'), 'Gold relegations should go to Silver');

  printPromotionRelegation(promotions, relegations);

  // Save pre-transition player data for career stats verification
  const preTransitionStats = {};
  for (const p of leagueData.players) {
    preTransitionStats[p.id] = { ...p.stats, careerStats: { ...p.careerStats } };
  }

  // Apply promotion/relegation using TierManager
  leagueData = TierManager.applyPromotionRelegation(leagueData);

  console.log(`\n  ${BOLD}New Season: ${leagueData.league.currentSeason}${RESET}`);
  printTierRosters(leagueData);

  // Verify season transition
  assertEqual(leagueData.league.currentSeason, 2, 'Current season should be 2');
  assertEqual(leagueData.seasons.length, 2, 'Should have 2 seasons');
  assertEqual(leagueData.seasons[0].status, 'completed', 'Season 1 should be completed');
  assert(leagueData.seasons[0].finalStandings !== null, 'Season 1 should have final standings');
  assert(leagueData.seasons[0].promotions.length > 0, 'Season 1 should have promotion records');
  assert(leagueData.seasons[0].relegations.length > 0, 'Season 1 should have relegation records');
  assertEqual(leagueData.seasons[1].status, 'active', 'Season 2 should be active');
  assertEqual(leagueData.rounds.length, 0, 'Rounds should be reset for new season');
  assertEqual(leagueData.pairingHistory.length, 0, 'Pairing history should be reset');

  // Verify stats reset and career stats accumulated
  for (const p of leagueData.players) {
    assertEqual(p.stats.matchesPlayed, 0, `${p.name}: season stats should be reset`);
    assertEqual(p.stats.points, 0, `${p.name}: season points should be 0`);
    assertEqual(p.careerStats.seasonsPlayed, 1, `${p.name}: career seasonsPlayed should be 1`);

    const pre = preTransitionStats[p.id];
    assertEqual(p.careerStats.matchesPlayed, pre.careerStats.matchesPlayed + pre.matchesPlayed,
      `${p.name}: career matchesPlayed should accumulate`);
    assertEqual(p.careerStats.matchesWon, pre.careerStats.matchesWon + pre.matchesWon,
      `${p.name}: career matchesWon should accumulate`);
    assertEqual(p.careerStats.framesWon, pre.careerStats.framesWon + pre.framesWon,
      `${p.name}: career framesWon should accumulate`);
    assertEqual(p.careerStats.points, pre.careerStats.points + pre.points,
      `${p.name}: career points should accumulate`);
  }

  // Verify tier swaps actually happened
  for (const pr of promotions) {
    const player = leagueData.players.find(p => p.id === pr.player.id);
    assertEqual(player.tier, pr.toTier, `${player.name} should have been promoted to ${pr.toTier}`);
  }
  for (const r of relegations) {
    const player = leagueData.players.find(p => p.id === r.player.id);
    assertEqual(player.tier, r.toTier, `${player.name} should have been relegated to ${r.toTier}`);
  }

  // Each tier should still have exactly PLAYERS_PER_TIER
  for (const tier of TIERS) {
    const count = leagueData.players.filter(p => p.tier === tier && p.active).length;
    assertEqual(count, PLAYERS_PER_TIER, `${tier} should still have ${PLAYERS_PER_TIER} players after transitions`);
  }

  console.log(`\n  ${GREEN}✓ Season transition verified: stats reset, career stats accumulated, tiers swapped${RESET}`);

  // ─── Season 2: Play 3 of 5 rounds ───
  printHeader('SEASON 2 - PLAYING 3 OF 5 ROUNDS');

  for (let roundNum = 1; roundNum <= 3; roundNum++) {
    leagueData = RoundManager.generateRound(leagueData);
    leagueData = playAllMatchesInRound(leagueData, roundNum);
    printRoundResults(leagueData, roundNum);

    if (roundNum < 3) {
      leagueData = RoundManager.advanceToNextRound(leagueData);
    }
  }

  assertEqual(leagueData.rounds.length, 3, 'Should have 3 rounds in season 2');

  // Verify each player has played 3 matches this season
  for (const p of leagueData.players) {
    assertEqual(p.stats.matchesPlayed, 3, `${p.name} should have played 3 matches in season 2`);
  }

  // ─── Season 2 Standings ───
  printHeader('SEASON 2 - MID-SEASON STANDINGS (after 3 rounds)');
  printAllStandings(leagueData, true);

  // ─── Career Stats ───
  printHeader('CAREER STATS (Season 1 + Season 2 so far)');
  printCareerStats(leagueData);

  // ─── canStartNewSeason should fail (not all rounds played) ───
  const prematureSeasonCheck = TierManager.canStartNewSeason(leagueData);
  assert(!prematureSeasonCheck.canStart, 'canStartNewSeason should be false mid-season');
  console.log(`\n  ${GREEN}✓ canStartNewSeason correctly rejects mid-season transition${RESET}`);

  // ─── Final Summary ───
  printHeader('TEST SUMMARY');

  const s2Matches = leagueData.rounds.reduce((sum, rd) => sum + rd.matches.length, 0);

  console.log(`
  League format:          tiered-round-robin
  Tiers:                  ${TIERS.join(', ')}
  Players per tier:       ${PLAYERS_PER_TIER}
  Total players:          ${leagueData.players.length}

  Season 1:
    Rounds played:        ${totalRounds}
    Matches per round:    ${(PLAYERS_PER_TIER / 2) * TIERS.length} (${PLAYERS_PER_TIER / 2} per tier × ${TIERS.length} tiers)
    Total matches:        ${totalRounds * (PLAYERS_PER_TIER / 2) * TIERS.length}
    Promotions:           ${promotions.length}
    Relegations:          ${relegations.length}

  Season 2 (in progress):
    Rounds played:        3 of ${totalRounds}
    Matches played:       ${s2Matches}
    Rounds remaining:     ${totalRounds - 3}

  Seasons in history:     ${leagueData.seasons.length}
  Career stats tracking:  ✓

  Assertions:             ${assertPassed}/${assertCount} passed
`);

  if (assertPassed === assertCount) {
    console.log(`  ${GREEN}${BOLD}All ${assertCount} assertions passed!${RESET}`);
  } else {
    console.log(`  ${RED}${BOLD}${assertCount - assertPassed} assertion(s) FAILED${RESET}`);
  }
  console.log();
}

main();
