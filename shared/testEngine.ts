import {
  createGame,
  startTurn,
  endTurn,
  playAsFund,
  playAsPower,
  playAsAction,
  selectTarget,
  confirmPayment,
  regroupPowerCards,
  playReaction,
  resolveWildChoice,
  GameState,
  ActionResult,
} from './rulesEngine';
import { getCardById } from './cards';

// ============ TEST UTILITIES ============

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    testsPassed++;
  } else {
    console.log(`  ❌ FAILED: ${message}`);
    testsFailed++;
  }
}

function describe(name: string, fn: () => void) {
  console.log(`\n📋 ${name}`);
  fn();
}

function applyAction(state: GameState, result: ActionResult): GameState {
  if (!result.ok) {
    console.log(`    ⚠️  Action failed: ${result.error}`);
  }
  return result.state;
}

function findCardInHand(state: GameState, seat: number, predicate: (id: string) => boolean): string | null {
  const p = state.players[seat];
  const id = p.hand.find(predicate);
  return id ?? null;
}

// ============ TESTS ============

console.log('🧪 Testing Hora Deal Rules Engine\n');
console.log('='.repeat(50));

// -------- TEST 1: Game Creation --------
describe('Game Creation', () => {
  const game = createGame(['Alice', 'Bob', 'Carol']);

  assert(game.players.length === 3, 'Creates 3 players');
  assert(game.players[0].name === 'Alice', 'First player is Alice');
  assert(game.players[0].hand.length === 5, 'Alice starts with 5 cards');
  assert(game.players[1].hand.length === 5, 'Bob starts with 5 cards');
  assert(game.drawPile.length === 108 - 15, 'Draw pile has 108 - 15 = 93 cards');
  assert(game.currentTurn === 0, 'First turn goes to Alice');
  assert(game.winnerSeat === -1, 'No winner yet');
  assert(game.phase === 'playing', 'Phase is playing');
});

// -------- TEST 2: Turn Start & Draw --------
describe('Start Turn', () => {
  let game = createGame(['Alice', 'Bob']);
  const initialHand = game.players[0].hand.length;

  const result = startTurn(game);
  game = applyAction(game, result);

  assert(result.ok, 'Start turn succeeds');
  assert(game.players[0].hand.length === initialHand + 2, 'Alice drew 2 cards');
  assert(game.turnStarted === true, 'turnStarted flag is true');
  assert(game.cardsPlayedThisTurn === 0, '0 cards played this turn');
});

// -------- TEST 3: Low Hand Draw Rule --------
describe('Low Hand Draw (<=2 cards -> draw 5)', () => {
  let game = createGame(['Alice', 'Bob']);
  game = JSON.parse(JSON.stringify(game));
  game.players[0].hand = game.players[0].hand.slice(0, 2);

  const result = startTurn(game);
  game = applyAction(game, result);

  assert(game.players[0].hand.length === 7, 'Alice drew 5 (2 + 5 = 7)');
});

// -------- TEST 4: Play Money as Fund --------
describe('Play Money as Fund', () => {
  let game = createGame(['Alice', 'Bob']);
  game = applyAction(game, startTurn(game));

  const moneyCard = findCardInHand(game, 0, id => getCardById(id).type === 'MONEY');
  if (!moneyCard) {
    console.log('    ⚠️  No money card in hand -- skipping');
    return;
  }

  const result = playAsFund(game, 0, moneyCard);
  game = applyAction(game, result);

  assert(result.ok, 'Play money succeeds');
  assert(!game.players[0].hand.includes(moneyCard), 'Card left hand');
  assert(game.players[0].campaignFund.includes(moneyCard), 'Card is in Fund');
  assert(game.cardsPlayedThisTurn === 1, 'Play counter incremented');
});

// -------- TEST 5: Play Power Card --------
describe('Play Power Card', () => {
  let game = createGame(['Alice', 'Bob']);
  game = applyAction(game, startTurn(game));

  const powerCard = findCardInHand(game, 0, id => getCardById(id).type === 'POWER');
  if (!powerCard) {
    console.log('    ⚠️  No power card in hand -- skipping');
    return;
  }

  const result = playAsPower(game, 0, powerCard);
  game = applyAction(game, result);

  assert(result.ok, 'Play power succeeds');
  assert(game.players[0].powerCards.includes(powerCard), 'Card is on table');
  assert(game.cardsPlayedThisTurn === 1, 'Play counter incremented');
});

// -------- TEST 6: Auto Set Formation --------
describe('Set Auto-Formation', () => {
  const game = createGame(['Alice', 'Bob']);
  const gameClone = JSON.parse(JSON.stringify(game)) as GameState;

  gameClone.players[0].powerCards = ['prado_0', 'prado_1'];
  regroupPowerCards(gameClone.players[0]);
  // Note: regroupPowerCards returns sets but does not auto-add them to completedSets
  // Check that the function returns a valid set

  // Instead, test via the full flow: play both Prados
  const game2 = applyAction(game, startTurn(game));
  const g3 = JSON.parse(JSON.stringify(game2)) as GameState;
  g3.players[0].hand = ['prado_0', 'prado_1'];

  let r = playAsPower(g3, 0, 'prado_0');
  let g4 = applyAction(g3, r);
  assert(r.ok, 'First Prado played');

  r = playAsPower(g4, 0, 'prado_1');
  let g5 = applyAction(g4, r);
  assert(r.ok, 'Second Prado played');
  assert(g5.players[0].completedSets.length === 1, 'Prado set forms after 2nd Prado');
  assert(g5.players[0].rank === 1, 'Rank updated to 1');
});

// -------- TEST 7: Reaction Cancel --------
describe('Reaction Cancels Action', () => {
  let game = createGame(['Alice', 'Bob']);
  game = applyAction(game, startTurn(game));
  game = JSON.parse(JSON.stringify(game));

  game.players[0].hand = ['white_van_0'];
  game.players[1].hand = ['father_0'];

  let result = playAsAction(game, 0, 'white_van_0');
  game = applyAction(game, result);
  assert(result.ok, 'White Van played');
  assert(game.pending.type === 'select-target', 'Target selection pending');

  result = selectTarget(game, 1);
  game = applyAction(game, result);
  assert(game.pending.type === 'reaction', 'Reaction window opened (Bob has father)');

  result = playReaction(game, 'father');
  game = applyAction(game, result);

  assert(result.ok, 'Reaction plays');
  assert(game.players[1].skipTurns === 0, 'Bob does NOT get skipped -- action cancelled');
  assert(game.pending.type === 'none', 'Pending cleared');
});

// -------- TEST 8: Payment Flow --------
describe('Payment Flow', () => {
  let game = createGame(['Alice', 'Bob']);
  game = applyAction(game, startTurn(game));
  game = JSON.parse(JSON.stringify(game));

  game.players[1].campaignFund = ['money_5_0'];
  game.players[0].hand = ['strike_0'];

  let result = playAsAction(game, 0, 'strike_0');
  game = applyAction(game, result);

  result = selectTarget(game, 1);
  game = applyAction(game, result);

  assert(game.pending.type === 'payment', 'Payment pending after Strike');
  if (game.pending.type === 'payment') {
    assert(game.pending.amount === 2, 'Amount is 2 BN');

    result = confirmPayment(game, ['money_5_0']);
    game = applyAction(game, result);

    assert(result.ok, 'Payment succeeds');
    assert(!game.players[1].campaignFund.includes('money_5_0'), 'Bob paid the 5BN card');
    assert(game.centralBank.includes('money_5_0'), 'Card went to Central Bank');
    assert(game.pending.type === 'none', 'Pending cleared');
  }
});

// -------- TEST 9: End Turn Advances --------
describe('End Turn Advances', () => {
  let game = createGame(['Alice', 'Bob']);
  game = applyAction(game, startTurn(game));

  const result = endTurn(game);
  game = applyAction(game, result);

  assert(result.ok, 'End turn succeeds');
  assert(game.currentTurn === 1, 'Turn moved to Bob');
  assert(game.turnStarted === false, 'turnStarted reset');
  assert(game.cardsPlayedThisTurn === 0, 'Play counter reset');
});

// -------- TEST 10: Reject Invalid Actions --------
describe('Reject Invalid Actions', () => {
  const game = createGame(['Alice', 'Bob']);

  const result = playAsFund(game, 0, game.players[0].hand[0]);
  assert(!result.ok, 'Cannot play before Start Turn');
  assert(result.error === 'Turn not started', 'Correct error message');
});

// -------- TEST 11: Max Plays Enforced --------
describe('Max 3 Plays Per Turn', () => {
  let game = createGame(['Alice', 'Bob']);
  game = applyAction(game, startTurn(game));
  game = JSON.parse(JSON.stringify(game));

  game.players[0].hand = ['money_1_0', 'money_1_1', 'money_1_2', 'money_1_3'];

  for (let i = 0; i < 3; i++) {
    const result = playAsFund(game, 0, `money_1_${i}`);
    game = applyAction(game, result);
    assert(result.ok, `Play ${i + 1} succeeds`);
  }

  const fourthResult = playAsFund(game, 0, 'money_1_3');
  assert(!fourthResult.ok, '4th play rejected');
  assert(fourthResult.error === 'Max plays reached', 'Correct error');
});

// -------- TEST 12: Wild Card Choice --------
describe('Wild Card Choice', () => {
  let game = createGame(['Alice', 'Bob']);
  game = applyAction(game, startTurn(game));
  game = JSON.parse(JSON.stringify(game));

  game.players[0].hand = ['prado_0', 'common_0'];

  let result = playAsPower(game, 0, 'prado_0');
  game = applyAction(game, result);
  assert(result.ok, 'Prado played');

  result = playAsPower(game, 0, 'common_0');
  game = applyAction(game, result);
  assert(game.pending.type === 'wild-choice', 'Wild choice pending');

  result = resolveWildChoice(game, 'prado');
  game = applyAction(game, result);

  assert(result.ok, 'Wild choice resolves');
  assert(game.players[0].completedSets.length === 1, 'Set formed with wild');
  assert(game.players[0].rank === 1, 'Rank updated');
});

// ============ SUMMARY ============

console.log('\n' + '='.repeat(50));
console.log(`\n📊 RESULTS: ${testsPassed} passed, ${testsFailed} failed\n`);

if (testsFailed === 0) {
  console.log('🎉 ALL TESTS PASSED');
} else {
  console.log('❌ SOME TESTS FAILED');
}