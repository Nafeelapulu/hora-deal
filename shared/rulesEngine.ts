import { getCardById, ALL_CARDS, CardDef } from './cards';

// ============ TYPES ============

export interface Player {
  seat: number;
  name: string;
  sessionId: string;
  hand: string[];
  campaignFund: string[];
  powerCards: string[];
  completedSets: string[][];
  rank: 0 | 1 | 2 | 3;
  skipTurns: number;
  isConnected: boolean;
}

// Pending state — what the game is waiting for
export type Pending =
  | { type: 'none' }
  | { type: 'action-choice'; seat: number; cardId: string }
  | { type: 'hand-trim'; seat: number }
  | { type: 'select-target'; seat: number; cardId: string; purpose: string }
  | { type: 'payment'; payerSeat: number; payee: number | 'bank'; amount: number }
  | { type: 'wild-choice'; seat: number; cardId: string }
  | { type: 'wild-reorder'; seat: number; wildId: string }
  | { type: 'coalition-mine'; seat: number; cardId: string; targetSeat: number }
  | { type: 'coalition-theirs'; seat: number; cardId: string; targetSeat: number; myCardId: string }
  | { type: 'pick-power-card'; seat: number; targetSeat: number }
  | { type: 'pick-set'; seat: number; targetSeat: number }
  | { type: 'epa-window'; winningSeat: number; nextPlayerSeat: number }
  | { type: 'epa-react'; winningSeat: number; epaPlayerSeat: number }
  | { type: 'reaction';
      actingCardId: string;
      actingPlayerSeat: number;
      targetSeat: number;
      purpose: string;
      pendingEffect:
        | { kind: 'target-action'; purpose: string; targetSeat: number }
        | { kind: 'doctorate' }
        | { kind: 'prorogued' };
    };

export interface GameState {
  phase: 'waiting' | 'playing' | 'ended';
  players: Player[];
  drawPile: string[];
  commonDiscard: string[];
  centralBank: string[];
  currentTurn: number;
  cardsPlayedThisTurn: number;
  turnStarted: boolean;
  winnerSeat: number; // -1 = no winner
  pending: Pending;
  log: string[];
  maxPlaysPerTurn: number;
}

// Result of any action
export interface ActionResult {
  state: GameState;
  ok: boolean;
  error?: string;
  log: string[];
}

// ============ CONSTANTS ============
const MAX_PLAYS = 3;

// ============ HELPERS ============

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clone(g: GameState): GameState {
  return {
    ...g,
    players: g.players.map(p => ({
      ...p,
      hand: [...p.hand],
      campaignFund: [...p.campaignFund],
      powerCards: [...p.powerCards],
      completedSets: p.completedSets.map(s => [...s]),
    })),
    drawPile: [...g.drawPile],
    commonDiscard: [...g.commonDiscard],
    centralBank: [...g.centralBank],
    log: [...g.log],
  };
}

function ok(state: GameState, logLine?: string): ActionResult {
  const log = logLine ? [logLine] : [];
  if (logLine) state.log.push(logLine);
  return { state, ok: true, log };
}

function fail(state: GameState, error: string): ActionResult {
  return { state, ok: false, error, log: [] };
}

// ============ SETUP ============

export function createGame(playerNames: string[]): GameState {
  const deck = shuffle(ALL_CARDS.map(c => c.id));
  const players: Player[] = playerNames.map((name, seat) => ({
    seat,
    name,
    sessionId: '',
    hand: deck.splice(0, 5),
    campaignFund: [],
    powerCards: [],
    completedSets: [],
    rank: 0,
    skipTurns: 0,
    isConnected: true,
  }));
  return {
    phase: 'playing',
    players,
    drawPile: deck,
    commonDiscard: [],
    centralBank: [],
    currentTurn: 0,
    cardsPlayedThisTurn: 0,
    turnStarted: false,
    winnerSeat: -1,
    pending: { type: 'none' },
    log: ['Game started.'],
    maxPlaysPerTurn: MAX_PLAYS,
  };
}

// ============ CORE UTILITIES ============

function drawN(g: GameState, seat: number, count: number) {
  const p = g.players[seat];
  for (let i = 0; i < count; i++) {
    if (g.drawPile.length === 0) {
      g.drawPile = shuffle(g.commonDiscard);
      g.commonDiscard = [];
      g.log.push('Draw pile empty — reshuffled discard.');
    }
    if (g.drawPile.length === 0) break;
    p.hand.push(g.drawPile.pop()!);
  }
}

function recalcRank(p: Player) {
  p.rank = Math.min(p.completedSets.length, 3) as 0 | 1 | 2 | 3;
}

// Pull any newly-completable sets out of loose power cards
// (Only real cards — wilds stay loose unless placed explicitly)
function regroupPowerCards(p: Player): string[][] {
  const loose = [...p.powerCards];
  const sets: string[][] = [];
  const bySet: Record<string, string[]> = {};

  for (const id of loose) {
    const card = getCardById(id);
    if (card.isWild || !card.setKey) continue;
    bySet[card.setKey] = bySet[card.setKey] || [];
    bySet[card.setKey].push(id);
  }

  const remaining: string[] = [];
  for (const [key, cards] of Object.entries(bySet)) {
    const sample = getCardById(cards[0]);
    const size = sample.setSize!;
    if (cards.length >= size) {
      sets.push(cards.slice(0, size));
      remaining.push(...cards.slice(size));
    } else {
      remaining.push(...cards);
    }
  }
  // Wilds always stay loose unless explicitly placed
  for (const id of p.powerCards) {
    if (getCardById(id).isWild) remaining.push(id);
  }
  p.powerCards = remaining;
  return sets;
}

// Full reassembly check — used after complex operations
function reassembleAndCheckWin(g: GameState, seat: number) {
  const p = g.players[seat];
  const newSets = regroupPowerCards(p);
  if (newSets.length > 0) {
    p.completedSets = [...p.completedSets, ...newSets];
    recalcRank(p);
    g.log.push(`${p.name} completed ${newSets.length} set(s)! Rank ${p.rank}.`);
    if (p.completedSets.length >= 3) {
      g.winnerSeat = seat;
      g.log.push(`🏆 ${p.name} reached 3 sets!`);
    }
  }
}

// ============ WILD CARD LOGIC ============

export function findWildTargets(player: Player): { setKey: string; setSize: number; existing: string[] }[] {
  const groups: Record<string, string[]> = {};
  for (const id of player.powerCards) {
    const c = getCardById(id);
    if (c.isWild || !c.setKey) continue;
    groups[c.setKey] = groups[c.setKey] || [];
    groups[c.setKey].push(id);
  }
  const targets: { setKey: string; setSize: number; existing: string[] }[] = [];
  for (const [key, cards] of Object.entries(groups)) {
    const sample = getCardById(cards[0]);
    const setSize = sample.setSize!;
    if (cards.length < setSize) {
      targets.push({ setKey: key, setSize, existing: cards });
    }
  }
  return targets;
}

// ============ REACTIONS ============

export function getAvailableReactions(target: Player, purpose: string): string[] {
  const options: string[] = [];
  const hasMathaka = target.hand.some(id => getCardById(id).effectKey === 'mathaka');
  const hasFather = target.hand.some(id => getCardById(id).effectKey === 'father');
  const hasProtest = target.hand.some(id => getCardById(id).effectKey === 'protest');

  const missTurnCards = ['fcid', 'white_van', 'injunction', 'prorogued'];
  if (missTurnCards.includes(purpose) && hasMathaka) options.push('mathaka');
  if (hasFather) options.push('father');
  if (hasProtest) options.push('protest');
  return options;
}

// ============ EPA (Executive Presidency Abolished) ============

function findNextEpaHolder(g: GameState, winningSeat: number, startFrom: number): number | null {
  const total = g.players.length;
  for (let offset = 0; offset < total; offset++) {
    const seat = (startFrom + offset) % total;
    if (seat === winningSeat) continue;
    const player = g.players[seat];
    if (player.hand.some(id => getCardById(id).effectKey === 'abolished')) return seat;
  }
  return null;
}

function triggerWinCheck(g: GameState, seat: number) {
  if (g.winnerSeat !== seat) return;
  const epaHolder = findNextEpaHolder(g, seat, (seat + 1) % g.players.length);
  if (epaHolder !== null) {
    g.winnerSeat = -1;
    g.pending = { type: 'epa-window', winningSeat: seat, nextPlayerSeat: epaHolder };
  }
}

// ============ TURN FLOW ============

export function startTurn(state: GameState): ActionResult {
  if (state.turnStarted) return fail(state, 'Turn already started');
  const g = clone(state);
  const p = g.players[g.currentTurn];

  if (p.skipTurns > 0) {
    p.skipTurns--;
    g.log.push(`${p.name} misses a turn (${p.skipTurns} remaining).`);
    g.currentTurn = (g.currentTurn + 1) % g.players.length;
    g.cardsPlayedThisTurn = 0;
    g.turnStarted = false;
    g.log.push(`--- ${g.players[g.currentTurn].name}'s turn ---`);
    return ok(g);
  }

  const drawCount = p.hand.length <= 2 ? 5 : 2;
  drawN(g, g.currentTurn, drawCount);
  g.log.push(`${p.name} drew ${drawCount} card${drawCount > 1 ? 's' : ''}.`);
  g.turnStarted = true;
  g.cardsPlayedThisTurn = 0;

  // Defensive reassembly
  reassembleAndCheckWin(g, g.currentTurn);
  triggerWinCheck(g, g.currentTurn);

  return ok(g);
}

export function endTurn(state: GameState): ActionResult {
  const g = clone(state);
  const p = g.players[g.currentTurn];

  if (p.hand.length > 7) {
    g.pending = { type: 'hand-trim', seat: g.currentTurn };
    return ok(g, 'Hand trim required');
  }

  g.currentTurn = (g.currentTurn + 1) % g.players.length;
  g.cardsPlayedThisTurn = 0;
  g.turnStarted = false;
  g.pending = { type: 'none' };
  g.log.push(`--- ${g.players[g.currentTurn].name}'s turn ---`);
  return ok(g);
}

export function confirmHandTrim(state: GameState, keepIds: string[]): ActionResult {
  if (state.pending.type !== 'hand-trim') return fail(state, 'No hand trim pending');
  if (keepIds.length !== 7) return fail(state, 'Must keep exactly 7');

  const g = clone(state);
  const p = g.players[g.currentTurn];
  const discarded = p.hand.filter(id => !keepIds.includes(id));
  p.hand = keepIds;
  g.drawPile = [...discarded, ...g.drawPile];
  g.log.push(`${p.name} discarded ${discarded.length} cards.`);
  g.currentTurn = (g.currentTurn + 1) % g.players.length;
  g.cardsPlayedThisTurn = 0;
  g.turnStarted = false;
  g.pending = { type: 'none' };
  g.log.push(`--- ${g.players[g.currentTurn].name}'s turn ---`);
  return ok(g);
}

// ============ CARD PLAYS ============

export function playAsFund(state: GameState, seat: number, cardId: string): ActionResult {
  if (seat !== state.currentTurn) return fail(state, 'Not your turn');
  if (!state.turnStarted) return fail(state, 'Turn not started');
  if (state.cardsPlayedThisTurn >= state.maxPlaysPerTurn) return fail(state, 'Max plays reached');

  const g = clone(state);
  const p = g.players[seat];
  if (!p.hand.includes(cardId)) return fail(state, 'Card not in hand');

  p.hand = p.hand.filter(id => id !== cardId);
  p.campaignFund.push(cardId);
  g.cardsPlayedThisTurn++;
  const card = getCardById(cardId);
  g.log.push(`${p.name} banked ${card.name} as Fund (${card.bankValue} BN).`);
  return ok(g);
}

export function playAsPower(state: GameState, seat: number, cardId: string): ActionResult {
  if (seat !== state.currentTurn) return fail(state, 'Not your turn');
  if (!state.turnStarted) return fail(state, 'Turn not started');
  if (state.cardsPlayedThisTurn >= state.maxPlaysPerTurn) return fail(state, 'Max plays reached');

  const g = clone(state);
  const p = g.players[seat];
  if (!p.hand.includes(cardId)) return fail(state, 'Card not in hand');

  const card = getCardById(cardId);
  if (card.type !== 'POWER') return fail(state, 'Not a power card');

  p.hand = p.hand.filter(id => id !== cardId);
  p.powerCards.push(cardId);
  g.cardsPlayedThisTurn++;

  if (card.isWild) {
    g.pending = { type: 'wild-choice', seat, cardId };
    g.log.push(`${p.name} played Common Candidate — choose set.`);
    return ok(g);
  }

  reassembleAndCheckWin(g, seat);
  triggerWinCheck(g, seat);
  return ok(g);
}

export function resolveWildChoice(state: GameState, setKey: string | 'loose'): ActionResult {
  if (state.pending.type !== 'wild-choice') return fail(state, 'No wild choice pending');
  const g = clone(state);
  const wildId = state.pending.cardId;
  const seat = state.pending.seat;
  const p = g.players[seat];

  g.pending = { type: 'none' };

  if (setKey === 'loose') {
    g.log.push(`${p.name}'s Common Candidate stays loose.`);
    return ok(g);
  }

  const group = p.powerCards.filter(id => {
    const c = getCardById(id);
    return !c.isWild && c.setKey === setKey;
  });
  if (group.length === 0) {
    g.log.push(`${p.name}'s Common Candidate stays loose (no matching set).`);
    return ok(g);
  }

  const sample = getCardById(group[0]);
  const setSize = sample.setSize!;
  p.powerCards = p.powerCards.filter(id => id !== wildId);
  const combined = [...group, wildId];

  if (combined.length >= setSize) {
    p.powerCards = p.powerCards.filter(id => !combined.includes(id));
    p.completedSets.push(combined.slice(0, setSize));
    recalcRank(p);
    g.log.push(`${p.name} completed a set with Common Candidate! Rank ${p.rank}.`);
    if (p.completedSets.length >= 3) {
      g.winnerSeat = seat;
      g.log.push(`🏆 ${p.name} reached 3 sets!`);
    }
  } else {
    p.powerCards.push(wildId);
    g.log.push(`${p.name} added Common Candidate to ${sample.name} (${combined.length}/${setSize}).`);
  }

  triggerWinCheck(g, seat);
  return ok(g);
}

// ============ WILD REORDER ============

export function resolveWildReorder(state: GameState, destinationSetKey: string | 'loose'): ActionResult {
  if (state.pending.type !== 'wild-reorder') return fail(state, 'No wild reorder pending');
  if (state.cardsPlayedThisTurn >= state.maxPlaysPerTurn) return fail(state, 'Max plays reached');

  const g = clone(state);
  const wildId = state.pending.wildId;
  const seat = state.pending.seat;
  const p = g.players[seat];

  g.pending = { type: 'none' };

  // Find the wild
  let setIdx = -1;
  for (let i = 0; i < p.completedSets.length; i++) {
    if (p.completedSets[i].includes(wildId)) { setIdx = i; break; }
  }
  const wasInSet = setIdx >= 0;
  const isLoose = p.powerCards.includes(wildId);
  if (!wasInSet && !isLoose) return fail(state, 'Wild not found');

  const wildCard = getCardById(wildId);
  if (!wildCard.isWild) return fail(state, 'Not a wild');

  let brokeSet: string[] = [];
  if (wasInSet) {
    const oldSet = p.completedSets[setIdx];
    const remaining = oldSet.filter(id => id !== wildId);
    p.completedSets = p.completedSets.filter((_, i) => i !== setIdx);
    p.powerCards.push(...remaining);
    brokeSet = remaining;
    recalcRank(p);
  } else {
    p.powerCards = p.powerCards.filter(id => id !== wildId);
  }

  if (destinationSetKey === 'loose') {
    p.powerCards.push(wildId);
    g.log.push(`${p.name} moved Common Candidate to loose Power.`);
    if (brokeSet.length > 0) g.log.push(`(A set was broken.)`);
  } else {
    const group = p.powerCards.filter(id => {
      const c = getCardById(id);
      return !c.isWild && c.setKey === destinationSetKey;
    });
    if (group.length === 0) {
      p.powerCards.push(wildId);
      g.log.push(`${p.name} moved Common Candidate to loose Power (no matching set).`);
      return ok(g);
    }
    const sample = getCardById(group[0]);
    const setSize = sample.setSize!;
    const combined = [...group, wildId];

    if (combined.length >= setSize) {
      p.powerCards = p.powerCards.filter(id => !group.includes(id) && id !== wildId);
      p.completedSets.push(combined.slice(0, setSize));
      recalcRank(p);
      g.log.push(`${p.name} completed a set with Common Candidate! Rank ${p.rank}.`);
      if (p.completedSets.length >= 3) {
        g.winnerSeat = seat;
        g.log.push(`🏆 ${p.name} reached 3 sets!`);
      }
    } else {
      p.powerCards.push(wildId);
      g.log.push(`${p.name} added Common Candidate to ${sample.name} (${combined.length}/${setSize}).`);
    }
    if (brokeSet.length > 0) g.log.push(`(A previous set was broken.)`);
  }

  g.cardsPlayedThisTurn++;

  // FIX: reassemble remaining loose cards
  reassembleAndCheckWin(g, seat);
  triggerWinCheck(g, seat);
  return ok(g);
}

// ============ PAYMENT HELPERS ============

export function getPayableCards(player: Player): string[] {
  return [...player.campaignFund, ...player.powerCards, ...player.completedSets.flat()];
}

export function getPayableValue(player: Player): number {
  return getPayableCards(player).reduce((sum, id) => sum + getCardById(id).bankValue, 0);
}

function removePaidCards(player: Player, cardIds: string[]) {
  const idSet = new Set(cardIds);
  player.campaignFund = player.campaignFund.filter(id => !idSet.has(id));
  player.powerCards = player.powerCards.filter(id => !idSet.has(id));
  player.completedSets = player.completedSets
    .map(set => set.filter(id => !idSet.has(id)))
    .filter(set => set.length > 0);
  recalcRank(player);
}

export function confirmPayment(state: GameState, cardIds: string[]): ActionResult {
  if (state.pending.type !== 'payment') return fail(state, 'No payment pending');
  const g = clone(state);
  const { payerSeat, payee } = state.pending;
  const payer = g.players[payerSeat];

  removePaidCards(payer, cardIds);
  const value = cardIds.reduce((s, id) => s + getCardById(id).bankValue, 0);

  if (payee === 'bank') {
    g.centralBank.push(...cardIds);
    g.log.push(`${payer.name} paid ${value} BN to Central Bank.`);
  } else {
    const receiver = g.players[payee];
    for (const id of cardIds) {
      const card = getCardById(id);
      if (card.type === 'POWER') receiver.powerCards.push(id);
      else receiver.campaignFund.push(id);
    }
    reassembleAndCheckWin(g, payee);
    g.log.push(`${payer.name} paid ${value} BN to ${receiver.name}.`);
    triggerWinCheck(g, payee);
  }

  g.pending = { type: 'none' };
  return ok(g);
}

// ============ EXPORTS FOR USE BY CLIENT ============

// ============ TARGETED ACTIONS ============

// Called when a target has been chosen for an Action Card
function resolveTargetAction(g: GameState, purpose: string, targetSeat: number): void {
  const me = g.players[g.currentTurn];
  const target = g.players[targetSeat];

  switch (purpose) {
    case 'strike':
      requestPayment(g, targetSeat, 'bank', 2);
      break;

    case 'mahanayake':
      requestPayment(g, targetSeat, 'bank', 4);
      break;

    case 'bribe': {
      if (me.rank === 2) {
        for (const other of g.players) {
          if (other.seat === me.seat) continue;
          requestPayment(g, other.seat, me.seat, 5);
        }
      } else {
        const amount = me.rank === 0 ? 2 : 3;
        requestPayment(g, targetSeat, me.seat, amount);
      }
      break;
    }

    case 'no_confidence': {
      if (target.powerCards.length === 0) {
        g.log.push(`${target.name} has no loose Power Cards.`);
      } else {
        g.pending = { type: 'pick-power-card', seat: me.seat, targetSeat };
      }
      break;
    }

    case 'reshuffle': {
      if (target.completedSets.length === 0) {
        g.log.push(`${target.name} has no complete sets.`);
      } else if (target.completedSets.length >= 3) {
        g.log.push(`${target.name} has 3 sets — cannot target.`);
      } else {
        g.pending = { type: 'pick-set', seat: me.seat, targetSeat };
      }
      break;
    }

    case 'coup': {
      if (target.completedSets.length >= 3) {
        g.log.push(`${target.name} has 3 sets — cannot target.`);
      } else if (target.completedSets.length === 0) {
        g.log.push(`${target.name} has no complete sets.`);
      } else {
        const stolen = target.completedSets.flat();
        target.completedSets = [];
        recalcRank(target);
        me.powerCards.push(...stolen);
        g.log.push(`${me.name} CoupLK'd ${target.name} — stole all sets!`);
        reassembleAndCheckWin(g, me.seat);
        triggerWinCheck(g, me.seat);
      }
      break;
    }

    case 'double_crossover': {
      for (const other of g.players) {
        if (other.seat === me.seat) continue;
        const stolenLoose: string[] = [];
        const stolenSets: string[] = [];
        other.powerCards = other.powerCards.filter(id => {
          if (getCardById(id).setKey === 'crossovers') { stolenLoose.push(id); return false; }
          return true;
        });
        other.completedSets = other.completedSets.filter(set => {
          const isCrossSet = set.length > 0 && getCardById(set[0]).setKey === 'crossovers';
          if (isCrossSet) { stolenSets.push(...set); return false; }
          return true;
        });
        recalcRank(other);
        me.powerCards.push(...stolenLoose, ...stolenSets);
        if (stolenLoose.length + stolenSets.length > 0) {
          g.log.push(`${me.name} stole ${stolenLoose.length + stolenSets.length} Crossovers from ${other.name}.`);
        }
      }
      reassembleAndCheckWin(g, me.seat);
      triggerWinCheck(g, me.seat);
      break;
    }

    case 'fcid':
    case 'white_van':
    case 'injunction':
      target.skipTurns += 1;
      g.log.push(`${target.name} will miss ${target.skipTurns} turn(s).`);
      break;

    case 'abolished': {
      if (target.completedSets.length === 0) {
        g.log.push(`${target.name} has no complete sets.`);
      } else {
        const stolen = target.completedSets[0];
        target.completedSets = target.completedSets.slice(1);
        recalcRank(target);
        g.drawPile = [...stolen, ...g.drawPile];
        g.log.push(`${me.name} abolished ${target.name}'s set — cards to bottom of deck.`);
      }
      break;
    }

    case 'parliament_prorogued': {
      for (const other of g.players) {
        if (other.seat === me.seat) continue;
        other.skipTurns += 1;
        g.log.push(`${other.name} will miss their next turn.`);
      }
      g.cardsPlayedThisTurn = 0;
      g.log.push(`${me.name} takes an extra turn immediately!`);
      break;
    }
  }
}

function requestPayment(g: GameState, payerSeat: number, payee: number | 'bank', amount: number): void {
  const payer = g.players[payerSeat];
  const available = getPayableValue(payer);
  const actualAmount = Math.min(amount, available);
  if (actualAmount === 0) {
    g.log.push(`${payer.name} has nothing to pay.`);
    return;
  }
  g.pending = { type: 'payment', payerSeat, payee, amount: actualAmount };
}

// ============ ACTION CARD PLAY ============

export function playAsAction(state: GameState, seat: number, cardId: string): ActionResult {
  if (seat !== state.currentTurn) return fail(state, 'Not your turn');
  if (!state.turnStarted) return fail(state, 'Turn not started');
  if (state.cardsPlayedThisTurn >= state.maxPlaysPerTurn) return fail(state, 'Max plays reached');

  const g = clone(state);
  const p = g.players[seat];
  if (!p.hand.includes(cardId)) return fail(state, 'Card not in hand');

  const card = getCardById(cardId);
  if (card.type !== 'ACTION') return fail(state, 'Not an action card');

  p.hand = p.hand.filter(id => id !== cardId);
  g.commonDiscard.push(cardId);
  g.cardsPlayedThisTurn++;

  switch (card.effectKey) {
    case 'recount':
      drawN(g, seat, 2);
      g.log.push(`${p.name} played Ballot Recount — drew 2 extra cards.`);
      return ok(g);

    case 'bond_scam': {
      const count = p.rank === 0 ? 1 : p.rank === 1 ? 2 : 3;
      const taken: string[] = [];
      for (let i = 0; i < count; i++) {
        if (g.centralBank.length === 0) break;
        taken.push(g.centralBank.shift()!);
      }
      p.hand.push(...taken);
      g.log.push(`${p.name} played Bond Scam (rank ${p.rank}) — took ${taken.length} from Bank.`);
      return ok(g);
    }

    case 'doctorate': {
      g.log.push(`${p.name} played Honorary Doctorate — others pay 2 BN.`);
      const target = g.players.find(pl => pl.seat !== seat);
      if (target) {
        const reactions = getAvailableReactions(target, 'doctorate');
        if (reactions.length > 0) {
          g.pending = {
            type: 'reaction',
            actingCardId: cardId,
            actingPlayerSeat: seat,
            targetSeat: target.seat,
            purpose: 'doctorate',
            pendingEffect: { kind: 'doctorate' },
          };
        } else {
          requestPayment(g, target.seat, seat, 2);
        }
      }
      return ok(g);
    }

    case 'prorogued': {
      g.log.push(`${p.name} played Parliament Prorogued.`);
      const target = g.players.find(pl => pl.seat !== seat);
      if (target) {
        const reactions = getAvailableReactions(target, 'prorogued');
        if (reactions.length > 0) {
          g.pending = {
            type: 'reaction',
            actingCardId: cardId,
            actingPlayerSeat: seat,
            targetSeat: target.seat,
            purpose: 'prorogued',
            pendingEffect: { kind: 'prorogued' },
          };
        } else {
          resolveTargetAction(g, 'parliament_prorogued', target.seat);
        }
      }
      return ok(g);
    }

    case 'mahanayake':
    case 'strike':
    case 'coalition':
    case 'bribe':
    case 'no_confidence':
    case 'reshuffle':
    case 'coup':
    case 'double_crossover':
    case 'fcid':
    case 'white_van':
    case 'injunction':
    case 'abolished':
      g.pending = { type: 'select-target', seat, cardId, purpose: card.effectKey! };
      return ok(g);

    default:
      g.log.push(`${p.name} played ${card.name} (no effect yet).`);
      return ok(g);
  }
}

// ============ TARGET SELECTION ============

export function selectTarget(state: GameState, targetSeat: number): ActionResult {
  if (state.pending.type !== 'select-target') return fail(state, 'No target selection pending');
  const { cardId, purpose } = state.pending;
  const g = clone(state);

  // Coalition is special — goes to coalition-mine step after reaction
  if (purpose === 'coalition') {
    const target = g.players[targetSeat];
    const reactions = getAvailableReactions(target, 'coalition');
    if (reactions.length > 0) {
      g.pending = {
        type: 'reaction',
        actingCardId: cardId,
        actingPlayerSeat: g.currentTurn,
        targetSeat,
        purpose: 'coalition',
        pendingEffect: { kind: 'target-action', purpose: 'coalition', targetSeat },
      };
      return ok(g);
    }
    g.pending = { type: 'coalition-mine', seat: g.currentTurn, cardId, targetSeat };
    return ok(g);
  }

  const target = g.players[targetSeat];
  const reactions = getAvailableReactions(target, purpose);

  if (reactions.length > 0) {
    g.pending = {
      type: 'reaction',
      actingCardId: cardId,
      actingPlayerSeat: g.currentTurn,
      targetSeat,
      purpose,
      pendingEffect: { kind: 'target-action', purpose, targetSeat },
    };
    return ok(g);
  }

  // No reactions available — resolve immediately
  g.pending = { type: 'none' };
  resolveTargetAction(g, purpose, targetSeat);
  return ok(g);
}

// ============ REACTIONS ============

export function playReaction(state: GameState, reactionEffectKey: string): ActionResult {
  if (state.pending.type !== 'reaction') return fail(state, 'No reaction pending');
  const g = clone(state);
  const { actingCardId, targetSeat } = state.pending;

  const target = g.players[targetSeat];
  const reactionCardId = target.hand.find(id => getCardById(id).effectKey === reactionEffectKey);
  if (!reactionCardId) return fail(state, 'Reaction card not in hand');

  target.hand = target.hand.filter(id => id !== reactionCardId);
  g.commonDiscard.push(reactionCardId);

  const reactingCard = getCardById(reactionCardId);
  const actingCard = getCardById(actingCardId);
  g.log.push(`🛡 ${target.name} played ${reactingCard.name} — cancelled ${actingCard.name}!`);

  g.pending = { type: 'none' };
  return ok(g);
}

export function acceptReaction(state: GameState): ActionResult {
  if (state.pending.type !== 'reaction') return fail(state, 'No reaction pending');
  const g = clone(state);
  const { pendingEffect, actingCardId, targetSeat } = state.pending;

  g.pending = { type: 'none' };

  if (pendingEffect.kind === 'target-action') {
    if (pendingEffect.purpose === 'coalition') {
      g.pending = { type: 'coalition-mine', seat: g.currentTurn, cardId: actingCardId, targetSeat: pendingEffect.targetSeat };
      return ok(g);
    }
    resolveTargetAction(g, pendingEffect.purpose, pendingEffect.targetSeat);
  } else if (pendingEffect.kind === 'doctorate') {
    requestPayment(g, targetSeat, g.currentTurn, 2);
  } else if (pendingEffect.kind === 'prorogued') {
    resolveTargetAction(g, 'parliament_prorogued', targetSeat);
  }

  return ok(g);
}

// ============ COALITION ============

export function coalitionChooseMine(state: GameState, myCardId: string): ActionResult {
  if (state.pending.type !== 'coalition-mine') return fail(state, 'No coalition pending');
  const { cardId, targetSeat } = state.pending;
  const g = clone(state);
  g.pending = { type: 'coalition-theirs', seat: g.currentTurn, cardId, targetSeat, myCardId };
  return ok(g);
}

export function coalitionChooseTheirs(state: GameState, theirCardId: string): ActionResult {
  if (state.pending.type !== 'coalition-theirs') return fail(state, 'No coalition pending');
  const g = clone(state);
  const { targetSeat, myCardId } = state.pending;

  const me = g.players[g.currentTurn];
  const target = g.players[targetSeat];

  me.powerCards = me.powerCards.filter(id => id !== myCardId);
  target.powerCards = target.powerCards.filter(id => id !== theirCardId);
  me.powerCards.push(theirCardId);
  target.powerCards.push(myCardId);

  g.log.push(`${me.name} swapped ${getCardById(myCardId).name} ↔ ${getCardById(theirCardId).name} with ${target.name}.`);

  reassembleAndCheckWin(g, me.seat);
  reassembleAndCheckWin(g, target.seat);
  triggerWinCheck(g, me.seat);
  triggerWinCheck(g, target.seat);

  g.pending = { type: 'none' };
  return ok(g);
}

// ============ PICKED STEALS ============

export function pickPowerCard(state: GameState, cardId: string): ActionResult {
  if (state.pending.type !== 'pick-power-card') return fail(state, 'No pick pending');
  const g = clone(state);
  const { targetSeat } = state.pending;

  const me = g.players[g.currentTurn];
  const target = g.players[targetSeat];

  target.powerCards = target.powerCards.filter(id => id !== cardId);
  me.powerCards.push(cardId);
  g.log.push(`${me.name} stole ${getCardById(cardId).name} from ${target.name}.`);

  reassembleAndCheckWin(g, me.seat);
  triggerWinCheck(g, me.seat);

  g.pending = { type: 'none' };
  return ok(g);
}

export function pickSet(state: GameState, setIndex: number): ActionResult {
  if (state.pending.type !== 'pick-set') return fail(state, 'No set pick pending');
  const g = clone(state);
  const { targetSeat } = state.pending;

  const me = g.players[g.currentTurn];
  const target = g.players[targetSeat];

  const stolen = target.completedSets[setIndex];
  if (!stolen) return fail(state, 'Invalid set index');

  target.completedSets = target.completedSets.filter((_, i) => i !== setIndex);
  recalcRank(target);
  me.completedSets.push([...stolen]);
  recalcRank(me);
  g.log.push(`${me.name} stole a set from ${target.name}. Rank ${me.rank}.`);

  if (me.completedSets.length >= 3) {
    g.winnerSeat = me.seat;
    g.log.push(`🏆 ${me.name} reached 3 sets!`);
  }
  triggerWinCheck(g, me.seat);

  g.pending = { type: 'none' };
  return ok(g);
}

// ============ EPA (EXECUTIVE PRESIDENCY) ============

export function playEpa(state: GameState): ActionResult {
  if (state.pending.type !== 'epa-window') return fail(state, 'No EPA window');
  const g = clone(state);
  const { winningSeat, nextPlayerSeat } = state.pending;

  const epaPlayer = g.players[nextPlayerSeat];
  const epaCardId = epaPlayer.hand.find(id => getCardById(id).effectKey === 'abolished');
  if (!epaCardId) return fail(state, 'No EPA card');

  epaPlayer.hand = epaPlayer.hand.filter(id => id !== epaCardId);
  g.commonDiscard.push(epaCardId);
  g.log.push(`${epaPlayer.name} played Executive Presidency Abolished!`);

  const winner = g.players[winningSeat];
  const reactions = winner.hand.filter(id => {
    const k = getCardById(id).effectKey;
    return k === 'father' || k === 'protest';
  });

  if (reactions.length > 0) {
    g.pending = { type: 'epa-react', winningSeat, epaPlayerSeat: nextPlayerSeat };
  } else {
    // No reaction — EPA resolves
    const lastSet = winner.completedSets[winner.completedSets.length - 1];
    winner.completedSets = winner.completedSets.slice(0, -1);
    recalcRank(winner);
    g.drawPile = [...lastSet, ...g.drawPile];
    g.log.push(`${winner.name}'s last set went to bottom of deck. Back to ${winner.rank} sets.`);
    g.pending = { type: 'none' };
  }
  return ok(g);
}

export function skipEpa(state: GameState): ActionResult {
  if (state.pending.type !== 'epa-window') return fail(state, 'No EPA window');
  const g = clone(state);
  const { winningSeat, nextPlayerSeat } = state.pending;

  const nextEpa = findNextEpaHolder(g, winningSeat, (nextPlayerSeat + 1) % g.players.length);
  if (nextEpa !== null && nextEpa !== nextPlayerSeat) {
    g.pending = { type: 'epa-window', winningSeat, nextPlayerSeat: nextEpa };
  } else {
    g.winnerSeat = winningSeat;
    g.log.push(`🏆 ${g.players[winningSeat].name} is PRESIDENT!`);
    g.pending = { type: 'none' };
    g.phase = 'ended';
  }
  return ok(g);
}

export function epaReact(state: GameState, effectKey: 'father' | 'protest'): ActionResult {
  if (state.pending.type !== 'epa-react') return fail(state, 'No EPA react pending');
  const g = clone(state);
  const { winningSeat } = state.pending;

  const winner = g.players[winningSeat];
  const reactionCardId = winner.hand.find(id => getCardById(id).effectKey === effectKey);
  if (!reactionCardId) return fail(state, 'Reaction not in hand');

  winner.hand = winner.hand.filter(id => id !== reactionCardId);
  g.commonDiscard.push(reactionCardId);
  g.log.push(`🛡 ${winner.name} played ${getCardById(reactionCardId).name} — cancelled E.P.A.!`);

  g.winnerSeat = winningSeat;
  g.log.push(`🏆 ${winner.name} is PRESIDENT!`);
  g.phase = 'ended';
  g.pending = { type: 'none' };
  return ok(g);
}

export function epaAccept(state: GameState): ActionResult {
  if (state.pending.type !== 'epa-react') return fail(state, 'No EPA react pending');
  const g = clone(state);
  const { winningSeat } = state.pending;

  const winner = g.players[winningSeat];
  const lastSet = winner.completedSets[winner.completedSets.length - 1];
  winner.completedSets = winner.completedSets.slice(0, -1);
  recalcRank(winner);
  g.drawPile = [...lastSet, ...g.drawPile];
  g.log.push(`${winner.name}'s last set went to bottom of deck. Back to ${winner.rank} sets.`);

  g.pending = { type: 'none' };
  return ok(g);
}

// ============ WILD REORDER TRIGGER ============

export function requestWildReorder(state: GameState, seat: number, wildId: string): ActionResult {
  if (seat !== state.currentTurn) return fail(state, 'Not your turn');
  if (state.cardsPlayedThisTurn >= state.maxPlaysPerTurn) return fail(state, 'Max plays reached');
  const g = clone(state);
  g.pending = { type: 'wild-reorder', seat, wildId };
  return ok(g);
}

// ============ RE-EXPORT EVERYTHING ============

export {
  getCardById,
  MAX_PLAYS,
  shuffle,
  clone,
  drawN,
  recalcRank,
  regroupPowerCards,
  reassembleAndCheckWin,
  triggerWinCheck,
  findNextEpaHolder,
  removePaidCards,
  resolveTargetAction,
  requestPayment,
};