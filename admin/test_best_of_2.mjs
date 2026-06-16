// Tests for the Best-of-2 tiered league format (admin JS modules).
//
// Best of 2 plays a fixed 2 frames per match and may end in a draw (1-1).
// Scoring: win = 2 points, draw = 1 point, loss = 0 points (bye = 2).

import { ScoringManager } from './modules/scoring.js';
import { ScoreValidator } from './utils/validation.js';
import { LeagueManager } from './modules/league.js';
import { getMatchPoints, allowsDraws } from '../shared/constants.js';

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  passed++;
}

function makeLeague(bestOf = 2) {
  return {
    league: { format: 'tiered-round-robin', bestOfFrames: bestOf },
    players: [
      { id: 'a', name: 'A', active: true, tier: 'Gold', stats: {} },
      { id: 'b', name: 'B', active: true, tier: 'Gold', stats: {} },
    ],
    rounds: [{
      roundNumber: 1, status: 'pending',
      matches: [{
        id: 'm1', player1Id: 'a', player2Id: 'b', status: 'pending',
        frames: [], player1FramesWon: 0, player2FramesWon: 0, winnerId: null, isBye: false,
      }],
    }],
  };
}
const statsOf = (d, id) => d.players.find(p => p.id === id).stats;

// Points scheme + options
assert(allowsDraws(2) && !allowsDraws(3), 'allowsDraws');
assert(getMatchPoints(2).WIN === 2 && getMatchPoints(2).DRAW === 1, 'bo2 points');
assert(getMatchPoints(3).WIN === 1 && getMatchPoints(3).DRAW === 0, 'bo3 points');
assert(LeagueManager.getBestOfOptions('tiered-round-robin').includes(2), 'tiered offers 2');
assert(!LeagueManager.getBestOfOptions('swiss').includes(2), 'swiss excludes 2');
assert(ScoreValidator.validateBestOfFrames(2).valid, 'bo2 valid');
assert(!ScoreValidator.validateBestOfFrames(4).valid, 'bo4 invalid');

// Win 2-0
let d = ScoringManager.submitMatchResult(makeLeague(2), 'm1', 2, 0);
let m = d.rounds[0].matches[0];
assert(m.winnerId === 'a' && m.status === 'completed', 'win completed');
assert(statsOf(d, 'a').points === 2 && statsOf(d, 'a').matchesWon === 1, 'win points');
assert(statsOf(d, 'b').points === 0 && statsOf(d, 'b').matchesLost === 1, 'loss points');

// Draw 1-1
d = ScoringManager.submitMatchResult(makeLeague(2), 'm1', 1, 1);
m = d.rounds[0].matches[0];
assert(m.winnerId === null && m.status === 'completed', 'draw completed null winner');
assert(statsOf(d, 'a').points === 1 && statsOf(d, 'a').matchesDrawn === 1, 'draw a');
assert(statsOf(d, 'b').points === 1 && statsOf(d, 'b').matchesDrawn === 1, 'draw b');

// Frame-by-frame draw
d = makeLeague(2);
d = ScoringManager.addFrame(d, 'm1', 60, 40);
assert(d.rounds[0].matches[0].status === 'in-progress', 'one frame in progress');
d = ScoringManager.addFrame(d, 'm1', 30, 70);
assert(d.rounds[0].matches[0].winnerId === null && d.rounds[0].matches[0].status === 'completed', 'frame draw');

// Reject extra frame and invalid totals
let threw = false;
try { ScoringManager.addFrame(d, 'm1', 50, 10); } catch { threw = true; }
assert(threw, 'reject 3rd frame');
threw = false;
try { ScoringManager.submitMatchResult(makeLeague(2), 'm1', 2, 1); } catch { threw = true; }
assert(threw, 'reject 2-1 in bo2');
threw = false;
try { ScoringManager.submitMatchResult(makeLeague(3), 'm1', 1, 1); } catch { threw = true; }
assert(threw, 'reject draw in bo3');

// Regression: submitMatchResult must handle ANY valid score (frames-only mode) without
// completing the match early. Previously adding all of player1's frames first threw
// "Match is already completed" for non-whitewash home wins (e.g. bo3 2-1, bo5 3-2).
for (const [bo, p1, p2] of [[3, 2, 1], [3, 1, 2], [5, 3, 1], [5, 3, 2], [7, 4, 3], [9, 5, 4]]) {
  const res = ScoringManager.submitMatchResult(makeLeague(bo), 'm1', p1, p2);
  const rm = res.rounds[0].matches[0];
  const expWinner = p1 > p2 ? 'a' : 'b';
  assert(rm.status === 'completed', `bo${bo} ${p1}-${p2} completed`);
  assert(rm.winnerId === expWinner, `bo${bo} ${p1}-${p2} winner`);
  assert(rm.player1FramesWon === p1 && rm.player2FramesWon === p2, `bo${bo} ${p1}-${p2} counts`);
  assert(rm.frames.length === p1 + p2, `bo${bo} ${p1}-${p2} frame count`);
}

console.log(`\n  All best-of-2 tests passed! (${passed} assertions)\n`);
