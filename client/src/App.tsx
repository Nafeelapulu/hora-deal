import { useState } from 'react';
import { ALL_CARDS, getCardById } from '../../shared/cards';
import './App.css';

// ============ TYPES ============
interface Player {
  seat: number;
  name: string;
  hand: string[];
  campaignFund: string[];
  powerCards: string[];
  completedSets: string[][];
  rank: 0 | 1 | 2 | 3;
  skipTurns: number;
}

interface GameState {
  players: Player[];
  drawPile: string[];
  commonDiscard: string[];
  centralBank: string[];
  currentTurn: number;
  cardsPlayedThisTurn: number;
  turnStarted: boolean;
  winnerSeat: number | null;
  log: string[];
}

type PendingChoice =
  | { type: 'action-choice'; cardId: string }
  | { type: 'hand-trim' }
  | { type: 'select-target'; cardId: string; purpose: string }
  | { type: 'payment'; payer: number; payee: number | 'bank'; amount: number }
  | { type: 'wild-choice'; cardId: string }
  | { type: 'coalition-mine'; cardId: string; targetSeat: number }
  | { type: 'coalition-theirs'; cardId: string; targetSeat: number; myCardId: string }
  | { type: 'wild-reorder'; wildId: string }
  | { type: 'reaction';
      actingCardId: string;
      actingPlayerSeat: number;
      targetSeat: number;
      purpose: string;
      pendingEffect:
        | { kind: 'target-action'; purpose: string; targetSeat: number }
        | { kind: 'doctorate' }
        | { kind: 'prorogued' };
    }
  | null;

const MAX_PLAYS_PER_TURN = 3;

// ============ HELPERS ============
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dealCards(): GameState {
  const deck = shuffle(ALL_CARDS.map(c => c.id));
  const players: Player[] = [0, 1].map(seat => ({
    seat,
    name: seat === 0 ? 'Player 1' : 'Player 2',
    hand: deck.splice(0, 5),
    campaignFund: [],
    powerCards: [],
    completedSets: [],
    rank: 0,
    skipTurns: 0,
  }));
  return {
    players,
    drawPile: deck,
    commonDiscard: [],
    centralBank: [],
    currentTurn: 0,
    cardsPlayedThisTurn: 0,
    turnStarted: false,
    winnerSeat: null,
    log: ['Game started. Player 1: click "Start Turn" to begin.'],
  };
}

function findWildTargets(player: Player): { setKey: string; setSize: number; existing: string[] }[] {
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
    const realCount = cards.length;
    const needed = setSize - realCount;
    if (needed > 0 && realCount >= 1) {
      targets.push({ setKey: key, setSize, existing: cards });
    }
  }
  return targets;
}

function regroupPowerCards(player: Player): string[][] {
  const loose = [...player.powerCards];
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
    const card = getCardById(cards[0]);
    const size = card.setSize!;
    if (cards.length >= size) {
      sets.push(cards.slice(0, size));
      remaining.push(...cards.slice(size));
    } else {
      remaining.push(...cards);
    }
  }
  for (const id of player.powerCards) {
    if (getCardById(id).isWild) remaining.push(id);
  }
  player.powerCards = remaining;
  return sets;
}

function recalcRank(player: Player) {
  player.rank = Math.min(player.completedSets.length, 3) as 0 | 1 | 2 | 3;
}

function cloneGame(g: GameState): GameState {
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

function getPayableCards(player: Player): string[] {
  return [...player.campaignFund, ...player.powerCards, ...player.completedSets.flat()];
}

function getPayableValue(player: Player): number {
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

function checkWinAndSets(newGame: GameState, seat: number) {
  const p = newGame.players[seat];
  const newSets = regroupPowerCards(p);
  if (newSets.length > 0) {
    p.completedSets = [...p.completedSets, ...newSets];
    recalcRank(p);
    newGame.log.push(`${p.name} completed a set! Rank ${p.rank}.`);
    if (p.completedSets.length >= 3) {
      newGame.winnerSeat = p.seat;
      newGame.log.push(`🏆 ${p.name} is PRESIDENT!`);
    }
  }
}

function getAvailableReactions(target: Player, purpose: string): string[] {
  const options: string[] = [];
  const hasMathaka = target.hand.some(id => getCardById(id).effectKey === 'mathaka');
  const hasFather = target.hand.some(id => getCardById(id).effectKey === 'father');
  const hasProtest = target.hand.some(id => getCardById(id).effectKey === 'protest');

  const missTurnCards = ['fcid', 'white_van', 'injunction', 'prorogued'];
  if (missTurnCards.includes(purpose) && hasMathaka) {
    options.push('mathaka');
  }
  if (hasFather) options.push('father');
  if (hasProtest) options.push('protest');
  return options;
}

// ============ MAIN APP ============
function App() {
  const [game, setGame] = useState<GameState>(() => dealCards());
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [pendingChoice, setPendingChoice] = useState<PendingChoice>(null);

  const currentPlayer = game.players[game.currentTurn];
  const playsRemaining = MAX_PLAYS_PER_TURN - game.cardsPlayedThisTurn;
  const canPlay = playsRemaining > 0 && game.turnStarted && pendingChoice === null;

  function startTurn() {
    setGame(g => {
      if (g.turnStarted) return g;
      const newGame = cloneGame(g);
      const p = newGame.players[g.currentTurn];
      if (p.skipTurns > 0) {
        p.skipTurns--;
        newGame.log.push(`${p.name} misses a turn (${p.skipTurns} remaining).`);
        newGame.currentTurn = (g.currentTurn + 1) % newGame.players.length;
        newGame.cardsPlayedThisTurn = 0;
        newGame.turnStarted = false;
        newGame.log.push(`--- ${newGame.players[newGame.currentTurn].name}'s turn ---`);
        return newGame;
      }
      const drawCount = p.hand.length <= 2 ? 5 : 2;
      drawN(newGame, g.currentTurn, drawCount);
      newGame.log.push(`${p.name} drew ${drawCount} card${drawCount > 1 ? 's' : ''}.`);
      newGame.turnStarted = true;
      newGame.cardsPlayedThisTurn = 0;
      return newGame;
    });
  }

  function playAsFund(cardId: string) {
    setGame(g => {
      if (g.cardsPlayedThisTurn >= MAX_PLAYS_PER_TURN) return g;
      const newGame = cloneGame(g);
      const p = newGame.players[newGame.currentTurn];
      p.hand = p.hand.filter(id => id !== cardId);
      p.campaignFund.push(cardId);
      const card = getCardById(cardId);
      newGame.log.push(`${p.name} banked ${card.name} as Fund (${card.bankValue} BN).`);
      newGame.cardsPlayedThisTurn++;
      return newGame;
    });
    setSelectedCard(null);
    setPendingChoice(null);
  }

  function requestPayment(g: GameState, payerSeat: number, payee: number | 'bank', amount: number) {
    const payer = g.players[payerSeat];
    const available = getPayableValue(payer);
    const actualAmount = Math.min(amount, available);
    if (actualAmount === 0) {
      g.log.push(`${payer.name} has nothing to pay.`);
      return;
    }
    setTimeout(() => setPendingChoice({
      type: 'payment',
      payer: payerSeat,
      payee,
      amount: actualAmount,
    }), 0);
  }

  function resolveTargetAction(newGame: GameState, purpose: string, targetSeat: number) {
    const me = newGame.players[newGame.currentTurn];
    const target = newGame.players[targetSeat];

    switch (purpose) {
      case 'strike':
        requestPayment(newGame, targetSeat, 'bank', 2);
        break;
      case 'mahanayake':
        requestPayment(newGame, targetSeat, 'bank', 4);
        break;
      case 'bribe': {
        if (me.rank === 2) {
          for (const other of newGame.players) {
            if (other.seat === me.seat) continue;
            requestPayment(newGame, other.seat, me.seat, 5);
          }
        } else {
          const amount = me.rank === 0 ? 2 : 3;
          requestPayment(newGame, targetSeat, me.seat, amount);
        }
        break;
      }
      case 'no_confidence': {
        if (target.powerCards.length === 0) {
          newGame.log.push(`${target.name} has no loose Power Cards.`);
        } else {
          const stolen = target.powerCards[0];
          target.powerCards = target.powerCards.filter(id => id !== stolen);
          me.powerCards.push(stolen);
          newGame.log.push(`${me.name} stole ${getCardById(stolen).name} from ${target.name}.`);
          checkWinAndSets(newGame, me.seat);
        }
        break;
      }
      case 'reshuffle': {
        if (target.completedSets.length === 0) {
          newGame.log.push(`${target.name} has no complete sets.`);
        } else if (target.completedSets.length >= 3) {
          newGame.log.push(`${target.name} has 3 sets — cannot target.`);
        } else {
          const stolenSet = target.completedSets[0];
          target.completedSets = target.completedSets.slice(1);
          recalcRank(target);
          me.powerCards.push(...stolenSet);
          newGame.log.push(`${me.name} stole a complete set from ${target.name}.`);
          checkWinAndSets(newGame, me.seat);
        }
        break;
      }
      case 'coup': {
        if (target.completedSets.length >= 3) {
          newGame.log.push(`${target.name} has 3 sets — cannot target.`);
        } else if (target.completedSets.length === 0) {
          newGame.log.push(`${target.name} has no complete sets.`);
        } else {
          const stolen = target.completedSets.flat();
          target.completedSets = [];
          recalcRank(target);
          me.powerCards.push(...stolen);
          newGame.log.push(`${me.name} CoupLK'd ${target.name} — stole all sets!`);
          checkWinAndSets(newGame, me.seat);
        }
        break;
      }
      case 'double_crossover': {
        for (const other of newGame.players) {
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
            newGame.log.push(`${me.name} stole ${stolenLoose.length + stolenSets.length} Crossovers from ${other.name}.`);
          }
        }
        checkWinAndSets(newGame, me.seat);
        break;
      }
      case 'fcid':
      case 'white_van':
      case 'injunction':
        target.skipTurns += 1;
        newGame.log.push(`${target.name} will miss ${target.skipTurns} turn(s).`);
        break;
      case 'abolished': {
        if (target.completedSets.length === 0) {
          newGame.log.push(`${target.name} has no complete sets.`);
        } else {
          const stolen = target.completedSets[0];
          target.completedSets = target.completedSets.slice(1);
          recalcRank(target);
          newGame.drawPile = [...stolen, ...newGame.drawPile];
          newGame.log.push(`${me.name} abolished ${target.name}'s set — cards to bottom of deck.`);
        }
        break;
      }
      case 'parliament_prorogued': {
        for (const other of newGame.players) {
          if (other.seat === me.seat) continue;
          other.skipTurns += 1;
          newGame.log.push(`${other.name} will miss their next turn.`);
        }
        newGame.cardsPlayedThisTurn = 0;
        newGame.log.push(`${me.name} takes an extra turn immediately!`);
        break;
      }
    }
  }

  function playAsAction(cardId: string) {
    setGame(g => {
      if (g.cardsPlayedThisTurn >= MAX_PLAYS_PER_TURN) return g;
      const newGame = cloneGame(g);
      const p = newGame.players[newGame.currentTurn];
      const card = getCardById(cardId);
      p.hand = p.hand.filter(id => id !== cardId);
      newGame.commonDiscard.push(cardId);
      newGame.cardsPlayedThisTurn++;

      switch (card.effectKey) {
        case 'recount':
          drawN(newGame, newGame.currentTurn, 2);
          newGame.log.push(`${p.name} played Ballot Recount — drew 2 extra cards.`);
          break;

        case 'bond_scam': {
          const count = p.rank === 0 ? 1 : p.rank === 1 ? 2 : 3;
          const taken: string[] = [];
          for (let i = 0; i < count; i++) {
            if (newGame.centralBank.length === 0) break;
            taken.push(newGame.centralBank.shift()!);
          }
          p.hand.push(...taken);
          newGame.log.push(`${p.name} played Bond Scam (rank ${p.rank}) — took ${taken.length} from Central Bank.`);
          break;
        }

        case 'doctorate':
          newGame.log.push(`${p.name} played Honorary Doctorate — others pay 2 BN.`);
          {
            const target = newGame.players.find(pl => pl.seat !== newGame.currentTurn);
            if (target) {
              const reactions = getAvailableReactions(target, 'doctorate');
              if (reactions.length > 0) {
                setTimeout(() => setPendingChoice({
                  type: 'reaction',
                  actingCardId: cardId,
                  actingPlayerSeat: newGame.currentTurn,
                  targetSeat: target.seat,
                  purpose: 'doctorate',
                  pendingEffect: { kind: 'doctorate' },
                }), 0);
              } else {
                requestPayment(newGame, target.seat, newGame.currentTurn, 2);
              }
            }
          }
          break;

        case 'prorogued': {
          newGame.log.push(`${p.name} played Parliament Prorogued.`);
          const target = newGame.players.find(pl => pl.seat !== newGame.currentTurn);
          if (target) {
            const reactions = getAvailableReactions(target, 'prorogued');
            if (reactions.length > 0) {
              setTimeout(() => setPendingChoice({
                type: 'reaction',
                actingCardId: cardId,
                actingPlayerSeat: newGame.currentTurn,
                targetSeat: target.seat,
                purpose: 'prorogued',
                pendingEffect: { kind: 'prorogued' },
              }), 0);
            } else {
              resolveTargetAction(newGame, 'parliament_prorogued', target.seat);
            }
          }
          break;
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
          setTimeout(() => setPendingChoice({
            type: 'select-target',
            cardId,
            purpose: card.effectKey!,
          }), 0);
          break;

        default:
          newGame.log.push(`${p.name} played ${card.name} as Action. (Effect coming soon)`);
      }

      return newGame;
    });
    setSelectedCard(null);
    if (pendingChoice?.type !== 'select-target' && pendingChoice?.type !== 'payment' && pendingChoice?.type !== 'reaction') {
      setPendingChoice(null);
    }
  }

  function playPower(cardId: string) {
    setGame(g => {
      if (g.cardsPlayedThisTurn >= MAX_PLAYS_PER_TURN) return g;
      const newGame = cloneGame(g);
      const p = newGame.players[newGame.currentTurn];
      const card = getCardById(cardId);
      p.hand = p.hand.filter(id => id !== cardId);
      p.powerCards.push(cardId);
      newGame.cardsPlayedThisTurn++;

      if (card.isWild) {
        setTimeout(() => setPendingChoice({ type: 'wild-choice', cardId }), 0);
        newGame.log.push(`${p.name} played Common Candidate — choose which set.`);
        return newGame;
      }

      checkWinAndSets(newGame, newGame.currentTurn);
      return newGame;
    });
    setSelectedCard(null);
    if (pendingChoice?.type !== 'wild-choice') setPendingChoice(null);
  }

  // ===== WILD REORDER =====
  function startWildReorder(wildId: string) {
    if (!canPlay) return;
    setPendingChoice({ type: 'wild-reorder', wildId });
  }

  function resolveWildReorder(destinationSetKey: string | 'loose') {
    if (pendingChoice?.type !== 'wild-reorder') return;
    const wildId = pendingChoice.wildId;

    setGame(g => {
      if (g.cardsPlayedThisTurn >= MAX_PLAYS_PER_TURN) return g;
      const newGame = cloneGame(g);
      const p = newGame.players[newGame.currentTurn];

      // Find where the wild currently is
      let setIdx = -1;
      for (let i = 0; i < p.completedSets.length; i++) {
        if (p.completedSets[i].includes(wildId)) { setIdx = i; break; }
      }
      const wasInSet = setIdx >= 0;
      const isLoose = p.powerCards.includes(wildId);
      if (!wasInSet && !isLoose) return newGame;

      const wildCard = getCardById(wildId);
      if (!wildCard.isWild) return newGame;

      // 1. Remove wild from current location
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

      // 2. Handle destination
      if (destinationSetKey === 'loose') {
        p.powerCards.push(wildId);
        newGame.log.push(`${p.name} moved Common Candidate to loose Power.`);
        if (brokeSet.length > 0) newGame.log.push(`(A set was broken — cards went loose.)`);
      } else {
        const group = p.powerCards.filter(id => {
          const c = getCardById(id);
          return !c.isWild && c.setKey === destinationSetKey;
        });
        if (group.length === 0) {
          p.powerCards.push(wildId);
          newGame.log.push(`${p.name} moved Common Candidate to loose Power.`);
          return newGame;
        }
        const sample = getCardById(group[0]);
        const setSize = sample.setSize!;
        const combined = [...group, wildId];

        if (combined.length >= setSize) {
          p.powerCards = p.powerCards.filter(id => !group.includes(id) && id !== wildId);
          p.completedSets.push(combined.slice(0, setSize));
          recalcRank(p);
          newGame.log.push(`${p.name} completed a set with Common Candidate! Rank ${p.rank}.`);
          if (p.completedSets.length >= 3) {
            newGame.winnerSeat = p.seat;
            newGame.log.push(`🏆 ${p.name} is PRESIDENT!`);
          }
        } else {
          p.powerCards.push(wildId);
          newGame.log.push(`${p.name} added Common Candidate to ${sample.name} (${combined.length}/${setSize}).`);
        }
        if (brokeSet.length > 0) newGame.log.push(`(A previous set was broken — its cards went loose.)`);
      }

      newGame.cardsPlayedThisTurn++;
      return newGame;
    });

    setPendingChoice(null);
  }

  function resolveWildChoice(setKey: string | 'loose') {
    if (pendingChoice?.type !== 'wild-choice') return;
    const wildId = pendingChoice.cardId;
    setGame(g => {
      const newGame = cloneGame(g);
      const p = newGame.players[newGame.currentTurn];
      if (setKey === 'loose') {
        newGame.log.push(`${p.name}'s Common Candidate stays loose.`);
        return newGame;
      }
      const group = p.powerCards.filter(id => {
        const c = getCardById(id);
        return !c.isWild && c.setKey === setKey;
      });
      if (group.length === 0) return newGame;
      const sample = getCardById(group[0]);
      const setSize = sample.setSize!;
      p.powerCards = p.powerCards.filter(id => id !== wildId);
      const combined = [...group, wildId];
      if (combined.length >= setSize) {
        p.powerCards = p.powerCards.filter(id => !combined.includes(id));
        p.completedSets = [...p.completedSets, combined.slice(0, setSize)];
        recalcRank(p);
        newGame.log.push(`${p.name} completed a set with Common Candidate! Rank ${p.rank}.`);
        if (p.completedSets.length >= 3) {
          newGame.winnerSeat = p.seat;
          newGame.log.push(`🏆 ${p.name} is PRESIDENT!`);
        }
      } else {
        p.powerCards.push(wildId);
        newGame.log.push(`${p.name} added Common Candidate to ${sample.name} (${combined.length}/${setSize}).`);
      }
      return newGame;
    });
    setPendingChoice(null);
  }

  function handleCardClick(cardId: string) {
    if (!canPlay) return;
    const card = getCardById(cardId);
    if (card.type === 'MONEY') playAsFund(cardId);
    else if (card.type === 'POWER') playPower(cardId);
    else if (card.type === 'ACTION') setPendingChoice({ type: 'action-choice', cardId });
  }

  function selectTarget(targetSeat: number) {
    if (pendingChoice?.type !== 'select-target') return;
    const { purpose, cardId } = pendingChoice;

    if (purpose === 'coalition') {
      const target = game.players[targetSeat];
      const reactions = getAvailableReactions(target, 'coalition');
      if (reactions.length > 0) {
        setPendingChoice({
          type: 'reaction',
          actingCardId: cardId,
          actingPlayerSeat: game.currentTurn,
          targetSeat,
          purpose: 'coalition',
          pendingEffect: { kind: 'target-action', purpose: 'coalition', targetSeat },
        });
        return;
      }
      setPendingChoice({ type: 'coalition-mine', cardId, targetSeat });
      return;
    }

    const target = game.players[targetSeat];
    const reactions = getAvailableReactions(target, purpose);

    if (reactions.length > 0) {
      setPendingChoice({
        type: 'reaction',
        actingCardId: cardId,
        actingPlayerSeat: game.currentTurn,
        targetSeat,
        purpose,
        pendingEffect: { kind: 'target-action', purpose, targetSeat },
      });
      return;
    }

    setGame(g => {
      const newGame = cloneGame(g);
      resolveTargetAction(newGame, purpose, targetSeat);
      return newGame;
    });
    setPendingChoice(null);
  }

  function acceptReaction() {
    if (pendingChoice?.type !== 'reaction') return;
    const { pendingEffect } = pendingChoice;

    setGame(g => {
      const newGame = cloneGame(g);
      if (pendingEffect.kind === 'target-action') {
        if (pendingEffect.purpose === 'coalition') {
          setTimeout(() => setPendingChoice({
            type: 'coalition-mine',
            cardId: pendingChoice.actingCardId,
            targetSeat: pendingEffect.targetSeat,
          }), 0);
        } else {
          resolveTargetAction(newGame, pendingEffect.purpose, pendingEffect.targetSeat);
        }
      } else if (pendingEffect.kind === 'doctorate') {
        const me = newGame.players[newGame.currentTurn];
        const target = newGame.players[pendingChoice.targetSeat];
        requestPayment(newGame, target.seat, me.seat, 2);
      } else if (pendingEffect.kind === 'prorogued') {
        resolveTargetAction(newGame, 'parliament_prorogued', pendingChoice.targetSeat);
      }
      return newGame;
    });
    if (pendingChoice.pendingEffect.kind !== 'target-action' ||
        pendingChoice.pendingEffect.purpose !== 'coalition') {
      setPendingChoice(null);
    }
  }

  function playReaction(reactionEffectKey: string) {
    if (pendingChoice?.type !== 'reaction') return;
    const { actingCardId, targetSeat, actingPlayerSeat } = pendingChoice;

    setGame(g => {
      const newGame = cloneGame(g);
      const target = newGame.players[targetSeat];
      const acting = newGame.players[actingPlayerSeat];

      const reactionCardId = target.hand.find(id => getCardById(id).effectKey === reactionEffectKey);
      if (!reactionCardId) return newGame;
      target.hand = target.hand.filter(id => id !== reactionCardId);
      newGame.commonDiscard.push(reactionCardId);

      const reactingCard = getCardById(reactionCardId);
      const actingCard = getCardById(actingCardId);
      newGame.log.push(`🛡 ${target.name} played ${reactingCard.name} — cancelled ${acting.name}!`);
      return newGame;
    });
    setPendingChoice(null);
  }

  function coalitionChooseMine(myCardId: string) {
    if (pendingChoice?.type !== 'coalition-mine') return;
    setPendingChoice({
      type: 'coalition-theirs',
      cardId: pendingChoice.cardId,
      targetSeat: pendingChoice.targetSeat,
      myCardId,
    });
  }

  function coalitionChooseTheirs(theirCardId: string) {
    if (pendingChoice?.type !== 'coalition-theirs') return;
    const { targetSeat, myCardId } = pendingChoice;
    setGame(g => {
      const newGame = cloneGame(g);
      const me = newGame.players[g.currentTurn];
      const target = newGame.players[targetSeat];
      me.powerCards = me.powerCards.filter(id => id !== myCardId);
      target.powerCards = target.powerCards.filter(id => id !== theirCardId);
      me.powerCards.push(theirCardId);
      target.powerCards.push(myCardId);
      newGame.log.push(`${me.name} swapped ${getCardById(myCardId).name} ↔ ${getCardById(theirCardId).name} with ${target.name}.`);
      checkWinAndSets(newGame, me.seat);
      checkWinAndSets(newGame, target.seat);
      return newGame;
    });
    setPendingChoice(null);
  }

  function confirmPayment(cardIds: string[]) {
    if (pendingChoice?.type !== 'payment') return;
    const { payer, payee } = pendingChoice;
    setGame(g => {
      const newGame = cloneGame(g);
      const payerP = newGame.players[payer];
      removePaidCards(payerP, cardIds);
      const value = cardIds.reduce((s, id) => s + getCardById(id).bankValue, 0);
      if (payee === 'bank') {
        newGame.centralBank.push(...cardIds);
        newGame.log.push(`${payerP.name} paid ${value} BN to Central Bank.`);
      } else {
        const receiver = newGame.players[payee];
        for (const id of cardIds) {
          const card = getCardById(id);
          if (card.type === 'POWER') {
            receiver.powerCards.push(id);
          } else {
            receiver.campaignFund.push(id);
          }
        }
        const newSets = regroupPowerCards(receiver);
        if (newSets.length > 0) {
          receiver.completedSets = [...receiver.completedSets, ...newSets];
          recalcRank(receiver);
          newGame.log.push(`${receiver.name} completed a set from payment! Rank ${receiver.rank}.`);
          if (receiver.completedSets.length >= 3) {
            newGame.winnerSeat = receiver.seat;
            newGame.log.push(`🏆 ${receiver.name} is PRESIDENT!`);
          }
        }
        newGame.log.push(`${payerP.name} paid ${value} BN to ${receiver.name}.`);
      }
      return newGame;
    });
    setPendingChoice(null);
  }

  function endTurn() {
    setGame(g => {
      const newGame = cloneGame(g);
      const p = newGame.players[newGame.currentTurn];
      if (p.hand.length > 7) {
        setTimeout(() => setPendingChoice({ type: 'hand-trim' }), 0);
        return newGame;
      }
      newGame.currentTurn = (newGame.currentTurn + 1) % newGame.players.length;
      newGame.cardsPlayedThisTurn = 0;
      newGame.turnStarted = false;
      newGame.log.push(`--- ${newGame.players[newGame.currentTurn].name}'s turn ---`);
      return newGame;
    });
    setSelectedCard(null);
  }

  function confirmHandTrim(keepIds: string[]) {
    setGame(g => {
      const newGame = cloneGame(g);
      const p = newGame.players[newGame.currentTurn];
      const discarded = p.hand.filter(id => !keepIds.includes(id));
      p.hand = keepIds;
      newGame.drawPile = [...discarded, ...newGame.drawPile];
      newGame.log.push(`${p.name} discarded ${discarded.length} cards.`);
      newGame.currentTurn = (newGame.currentTurn + 1) % newGame.players.length;
      newGame.cardsPlayedThisTurn = 0;
      newGame.turnStarted = false;
      newGame.log.push(`--- ${newGame.players[newGame.currentTurn].name}'s turn ---`);
      return newGame;
    });
    setPendingChoice(null);
  }

  function resetGame() {
    setGame(dealCards());
    setSelectedCard(null);
    setPendingChoice(null);
  }

  if (game.winnerSeat !== null) {
    return (
      <div className="app">
        <h1>🏆 {game.players[game.winnerSeat].name} is President!</h1>
        <button onClick={resetGame}>Play Again</button>
      </div>
    );
  }

  const wildTargets = pendingChoice?.type === 'wild-choice'
    ? findWildTargets(currentPlayer)
    : [];

  const reactionOptions = pendingChoice?.type === 'reaction'
    ? getAvailableReactions(game.players[pendingChoice.targetSeat], pendingChoice.purpose)
    : [];

  return (
    <div className="game-board">
      <PlayerArea player={game.players[1 - game.currentTurn]} isOpponent />

      <div className="middle">
        <div className="pile-info">Draw: {game.drawPile.length}</div>
        <div className="pile-info">Bank: {game.centralBank.length}</div>
        <div className="turn-indicator">{currentPlayer.name}'s turn</div>
        <div className="pile-info">Plays: {playsRemaining}/{MAX_PLAYS_PER_TURN}</div>
        <div className="pile-info">Discard: {game.commonDiscard.length}</div>
      </div>

      {game.commonDiscard.length > 0 && (
        <div className="discard-pile">
          <div className="discard-label">🗑 Common Discard Pile</div>
          <div className="discard-cards">
            {game.commonDiscard.slice(-10).map(id => <MiniCard key={id} cardId={id} small />)}
          </div>
        </div>
      )}

      {game.centralBank.length > 0 && (
        <div className="discard-pile bank-pile">
          <div className="discard-label">
            🏦 Central Bank ({game.centralBank.reduce((s, id) => s + getCardById(id).bankValue, 0)} BN)
          </div>
          <div className="discard-cards">
            {game.centralBank.slice(-10).map(id => <MiniCard key={id} cardId={id} small />)}
          </div>
        </div>
      )}

      <PlayerArea
        player={currentPlayer}
        isOpponent={false}
        onCardClick={handleCardClick}
        selectedCard={selectedCard}
        setSelectedCard={setSelectedCard}
        canPlay={canPlay}
        onWildClick={startWildReorder}
      />

      <div className="controls">
        {!game.turnStarted && <button onClick={startTurn}>Start Turn (Draw)</button>}
        <button onClick={endTurn} disabled={pendingChoice !== null}>End Turn</button>
        <button onClick={resetGame} className="secondary">Restart</button>
      </div>

      <div className="log">
        {game.log.slice(-8).map((line, i) => <div key={i}>{line}</div>)}
      </div>

      {pendingChoice?.type === 'action-choice' && (
        <ActionChoiceModal
          cardId={pendingChoice.cardId}
          onFund={() => playAsFund(pendingChoice.cardId)}
          onAction={() => playAsAction(pendingChoice.cardId)}
          onCancel={() => setPendingChoice(null)}
        />
      )}

      {pendingChoice?.type === 'hand-trim' && (
        <HandTrimModal hand={currentPlayer.hand} onSubmit={confirmHandTrim} />
      )}

      {pendingChoice?.type === 'select-target' && (
        <TargetModal
          game={game}
          purpose={pendingChoice.purpose}
          onSelect={selectTarget}
          onCancel={() => setPendingChoice(null)}
        />
      )}

      {pendingChoice?.type === 'payment' && (
        <PaymentModal
          payer={game.players[pendingChoice.payer]}
          amount={pendingChoice.amount}
          onConfirm={confirmPayment}
        />
      )}

      {pendingChoice?.type === 'wild-choice' && (
        <WildChoiceModal targets={wildTargets} onChoose={resolveWildChoice} />
      )}

      {pendingChoice?.type === 'coalition-mine' && (
        <CoalitionPickCardModal
          cards={currentPlayer.powerCards}
          title="Coalition — Pick YOUR Card to Give"
          onPick={coalitionChooseMine}
          onCancel={() => setPendingChoice(null)}
        />
      )}

      {pendingChoice?.type === 'coalition-theirs' && (
        <CoalitionPickCardModal
          cards={game.players[pendingChoice.targetSeat].powerCards}
          title={`Coalition — Pick ${game.players[pendingChoice.targetSeat].name}'s Card to Take`}
          onPick={coalitionChooseTheirs}
          onCancel={() => setPendingChoice(null)}
        />
      )}

      {pendingChoice?.type === 'wild-reorder' && (
        <WildReorderModal
          player={currentPlayer}
          wildId={pendingChoice.wildId}
          onChoose={resolveWildReorder}
          onCancel={() => setPendingChoice(null)}
        />
      )}

      {pendingChoice?.type === 'reaction' && (
        <ReactionModal
          actingPlayer={game.players[pendingChoice.actingPlayerSeat]}
          targetPlayer={game.players[pendingChoice.targetSeat]}
          actingCardName={getCardById(pendingChoice.actingCardId).name}
          availableReactions={reactionOptions}
          onReact={playReaction}
          onAccept={acceptReaction}
        />
      )}
    </div>
  );
}

// ============ PLAYER AREA ============
function PlayerArea({
  player, isOpponent, onCardClick, selectedCard, setSelectedCard, canPlay, onWildClick,
}: {
  player: Player;
  isOpponent: boolean;
  onCardClick?: (id: string) => void;
  selectedCard?: string | null;
  setSelectedCard?: (id: string | null) => void;
  canPlay?: boolean;
  onWildClick?: (id: string) => void;
}) {
  const fundValue = player.campaignFund.reduce((s, id) => s + getCardById(id).bankValue, 0);

  return (
    <div className={`player-area ${isOpponent ? 'opponent' : 'current'}`}>
      <div className="player-header">
        <strong>{player.name}</strong>
        <span className="rank-badge">Rank {player.rank}</span>
        <span>Hand: {player.hand.length}</span>
        <span>Fund: {fundValue} BN</span>
        <span>Sets: {player.completedSets.length}/3</span>
        {player.skipTurns > 0 && <span className="skip-badge">Skip: {player.skipTurns}</span>}
      </div>

      {player.completedSets.length > 0 && (
        <div className="sets-row">
          {player.completedSets.map((set, i) => (
            <div key={i} className="completed-set">
              {set.map(id => {
                const card = getCardById(id);
                const clickable = !isOpponent && card.isWild && onWildClick && canPlay;
                return (
                  <MiniCard
                    key={id}
                    cardId={id}
                    wildClickable={!!clickable}
                    onClick={clickable ? () => onWildClick!(id) : undefined}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}

      {player.powerCards.length > 0 && (
        <div className="power-row">
          {player.powerCards.map(id => {
            const card = getCardById(id);
            const clickable = !isOpponent && card.isWild && onWildClick && canPlay;
            return (
              <MiniCard
                key={id}
                cardId={id}
                wildClickable={!!clickable}
                onClick={clickable ? () => onWildClick!(id) : undefined}
              />
            );
          })}
        </div>
      )}

      {player.campaignFund.length > 0 && (
        <div className="fund-row">
          {player.campaignFund.map(id => <MiniCard key={id} cardId={id} small />)}
        </div>
      )}

      <div className={`hand-row ${!canPlay && !isOpponent ? 'disabled' : ''}`}>
        {player.hand.map(id => (
          <MiniCard
            key={id} cardId={id}
            hidden={isOpponent}
            selected={selectedCard === id}
            onClick={!isOpponent && onCardClick ? () => {
              if (selectedCard === id) onCardClick(id);
              else if (setSelectedCard) setSelectedCard(id);
            } : undefined}
          />
        ))}
      </div>
    </div>
  );
}

// ============ CARD ============
function MiniCard({ cardId, small, hidden, selected, onClick, wildClickable }: {
  cardId: string;
  small?: boolean;
  hidden?: boolean;
  selected?: boolean;
  onClick?: () => void;
  wildClickable?: boolean;
}) {
  const card = getCardById(cardId);

  // Convert card id (e.g., "money_1_0") to image filename (e.g., "money_1")
  const baseKey = cardId.replace(/_\d+$/, '');
  const imagePath = `/cards/${baseKey}.png`;

  if (hidden) {
    return (
      <div
        className={`card-back ${small ? 'small' : ''} ${selected ? 'selected' : ''}`}
        onClick={onClick}
      >
        <img
          src="/cards/card_back.png"
          alt="Card back"
          className="card-img"
          onError={e => {
            // Fallback if image missing
            (e.target as HTMLImageElement).style.display = 'none';
            const parent = (e.target as HTMLImageElement).parentElement;
            if (parent && !parent.querySelector('.fallback-text')) {
              const fb = document.createElement('div');
              fb.className = 'fallback-text card-back-logo';
              fb.innerHTML = 'හොර<br />DEAL';
              parent.appendChild(fb);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`mini-card ${small ? 'small' : ''} ${selected ? 'selected' : ''} ${wildClickable ? 'wild-clickable' : ''}`}
      onClick={onClick}
      title={wildClickable ? `${card.name} — click to move` : card.name}
    >
      <img
        src={imagePath}
        alt={card.name}
        className="card-img"
        onError={e => {
          // Fallback: hide broken image, show colored rectangle with text
          const parent = (e.target as HTMLImageElement).parentElement;
          if (!parent) return;
          (e.target as HTMLImageElement).style.display = 'none';
          if (!parent.querySelector('.fallback-text')) {
            const colors: Record<string, string> = { MONEY: '#2d8f4e', POWER: '#c9a227', ACTION: '#c73650' };
            parent.style.background = colors[card.type];
            const fb = document.createElement('div');
            fb.className = 'fallback-text';
            fb.innerHTML = `<div class="card-type">${card.type}</div><div class="card-name">${card.name}</div><div class="card-value">${card.bankValue} BN</div>`;
            parent.appendChild(fb);
          }
        }}
      />
    </div>
  );
}

// ============ MODALS ============
function ActionChoiceModal({ cardId, onFund, onAction, onCancel }: {
  cardId: string; onFund: () => void; onAction: () => void; onCancel: () => void;
}) {
  const card = getCardById(cardId);
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{card.name}</h2>
        <p className="modal-subtitle">{card.bankValue} BN value</p>
        <div className="modal-buttons">
          <button className="btn-fund" onClick={onFund}>
            💰 Play as Fund<span className="btn-sub">{card.bankValue} BN</span>
          </button>
          <button className="btn-action" onClick={onAction}>
            ⚡ Play as Action<span className="btn-sub">Resolve effect</span>
          </button>
        </div>
        <button className="btn-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function HandTrimModal({ hand, onSubmit }: {
  hand: string[]; onSubmit: (keepIds: string[]) => void;
}) {
  const [keep, setKeep] = useState<string[]>(hand.slice(0, 7));
  function toggle(id: string) {
    if (keep.includes(id)) setKeep(keep.filter(k => k !== id));
    else if (keep.length < 7) setKeep([...keep, id]);
  }
  return (
    <div className="modal-overlay">
      <div className="modal modal-wide">
        <h2>Discard Down to 7</h2>
        <p className="modal-subtitle">Hand: {hand.length}. Discard {hand.length - 7}. Keeping {keep.length}/7.</p>
        <div className="trim-cards">
          {hand.map(id => {
            const card = getCardById(id);
            const colors: Record<string, string> = { MONEY: '#2d8f4e', POWER: '#c9a227', ACTION: '#c73650' };
            const isKept = keep.includes(id);
            return (
              <div key={id} className={`mini-card ${isKept ? 'selected' : ''}`}
                style={{ background: colors[card.type], opacity: isKept ? 1 : 0.4 }}
                onClick={() => toggle(id)}>
                <div className="card-type">{card.type}</div>
                <div className="card-name">{card.name}</div>
                <div className="card-value">{card.bankValue} BN</div>
              </div>
            );
          })}
        </div>
        <button className="btn-confirm" onClick={() => onSubmit(keep)} disabled={keep.length !== 7}>
          Confirm Discard ({hand.length - keep.length} discarded)
        </button>
      </div>
    </div>
  );
}

const PURPOSE_PROMPTS: Record<string, string> = {
  strike: 'Choose a player to pay 2 BN to the Central Bank.',
  mahanayake: 'Choose a player to pay 4 BN to the Central Bank.',
  coalition: 'Choose a player to swap one loose Power Card with.',
  bribe: 'Choose a player to steal money from.',
  no_confidence: 'Choose a player to steal a loose Power Card from.',
  reshuffle: 'Choose a player to steal a complete set from.',
  coup: 'Choose a player to steal ALL complete sets from.',
  double_crossover: 'Choose a player to steal all Crossovers from.',
  fcid: 'Choose a player to skip their next turn.',
  white_van: 'Choose a player to skip their next turn.',
  injunction: 'Choose a player to skip their next turn.',
  abolished: 'Choose a player to break their set.',
};

function TargetModal({ game, purpose, onSelect, onCancel }: {
  game: GameState; purpose: string; onSelect: (seat: number) => void; onCancel: () => void;
}) {
  const others = game.players.filter(p => p.seat !== game.currentTurn);
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Select Target</h2>
        <p className="modal-subtitle">{PURPOSE_PROMPTS[purpose] ?? 'Choose a target.'}</p>
        <div className="modal-buttons">
          {others.map(p => (
            <button key={p.seat} className="btn-action" onClick={() => onSelect(p.seat)}>
              🎯 {p.name}
              <span className="btn-sub">
                {p.powerCards.length} loose · {p.completedSets.length} sets
              </span>
            </button>
          ))}
        </div>
        <button className="btn-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function PaymentModal({ payer, amount, onConfirm }: {
  payer: Player; amount: number; onConfirm: (cardIds: string[]) => void;
}) {
  const payable = getPayableCards(payer);
  const totalAvailable = payable.reduce((s, id) => s + getCardById(id).bankValue, 0);
  const mustPayAll = totalAvailable <= amount;
  const [selected, setSelected] = useState<string[]>(mustPayAll ? payable : []);
  const total = selected.reduce((s, id) => s + getCardById(id).bankValue, 0);
  const enough = total >= amount || mustPayAll;

  function toggle(id: string) {
    if (selected.includes(id)) setSelected(selected.filter(s => s !== id));
    else setSelected([...selected, id]);
  }
  function autoFill() {
    const sorted = [...payable].sort((a, b) => getCardById(a).bankValue - getCardById(b).bankValue);
    const picked: string[] = [];
    let sum = 0;
    for (const id of sorted) {
      if (sum >= amount) break;
      picked.push(id);
      sum += getCardById(id).bankValue;
    }
    setSelected(picked);
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-wide">
        <h2>{payer.name} Must Pay {amount} BN</h2>
        <p className="modal-subtitle">
          {mustPayAll ? `Not enough — must give everything (${totalAvailable} BN).`
            : `Select cards totaling at least ${amount} BN. No change given.`}
          <br />Selected: <strong>{total} BN</strong> · {enough ? '✅ Enough' : '❌ Not enough'}
        </p>
        <div className="trim-cards">
          {payable.map(id => {
            const card = getCardById(id);
            const colors: Record<string, string> = { MONEY: '#2d8f4e', POWER: '#c9a227', ACTION: '#c73650' };
            const isSelected = selected.includes(id);
            const inSet = payer.completedSets.some(set => set.includes(id));
            return (
              <div key={id} className={`mini-card ${isSelected ? 'selected' : ''}`}
                style={{
                  background: colors[card.type],
                  opacity: isSelected ? 1 : 0.7,
                  border: inSet ? '3px solid #c9a227' : undefined,
                }}
                onClick={() => toggle(id)}
                title={inSet ? `${card.name} (in a completed set)` : card.name}>
                <div className="card-type">{card.type}</div>
                <div className="card-name">{card.name}</div>
                <div className="card-value">{card.bankValue} BN</div>
              </div>
            );
          })}
        </div>
        <div className="modal-buttons" style={{ marginTop: 16 }}>
          {!mustPayAll && <button className="btn-fund" onClick={autoFill}>🪄 Auto-Pick</button>}
        </div>
        <button className="btn-confirm" onClick={() => onConfirm(selected)} disabled={!enough}>
          Confirm Payment ({total} BN)
        </button>
      </div>
    </div>
  );
}

function WildChoiceModal({ targets, onChoose }: {
  targets: { setKey: string; setSize: number; existing: string[] }[];
  onChoose: (setKey: string | 'loose') => void;
}) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Common Candidate — Choose a Set</h2>
        <p className="modal-subtitle">
          Wild joins an incomplete set. Each set can hold max 1 wild (2 for Relations in Power).
        </p>
        <div className="modal-buttons">
          {targets.length === 0 && (
            <p style={{ color: '#aaa' }}>No incomplete sets — Common Candidate stays loose.</p>
          )}
          {targets.map(t => {
            const sample = getCardById(t.existing[0]);
            return (
              <button key={t.setKey} className="btn-action" onClick={() => onChoose(t.setKey)}>
                {sample.name}
                <span className="btn-sub">{t.existing.length}/{t.setSize} existing</span>
              </button>
            );
          })}
        </div>
        <button className="btn-cancel" onClick={() => onChoose('loose')}>
          Keep Loose
        </button>
      </div>
    </div>
  );
}

function CoalitionPickCardModal({ cards, title, onPick, onCancel }: {
  cards: string[];
  title: string;
  onPick: (cardId: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-overlay">
      <div className="modal modal-wide">
        <h2>{title}</h2>
        {cards.length === 0 ? (
          <>
            <p className="modal-subtitle">No loose Power Cards available to swap.</p>
            <button className="btn-cancel" onClick={onCancel}>Cancel</button>
          </>
        ) : (
          <>
            <p className="modal-subtitle">Click a card to select it.</p>
            <div className="trim-cards">
              {cards.map(id => {
                const card = getCardById(id);
                return (
                  <div key={id} className="mini-card"
                    style={{ background: '#c9a227' }} onClick={() => onPick(id)}>
                    <div className="card-type">{card.type}</div>
                    <div className="card-name">{card.name}</div>
                    <div className="card-value">{card.bankValue} BN</div>
                  </div>
                );
              })}
            </div>
            <button className="btn-cancel" onClick={onCancel}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}

// ============ WILD REORDER MODAL ============
function WildReorderModal({ player, wildId, onChoose, onCancel }: {
  player: Player;
  wildId: string;
  onChoose: (destinationSetKey: string | 'loose') => void;
  onCancel: () => void;
}) {
  const destinations: { setKey: string; setSize: number; existing: string[] }[] = [];
  const groups: Record<string, string[]> = {};
  for (const id of player.powerCards) {
    const c = getCardById(id);
    if (c.isWild || !c.setKey) continue;
    groups[c.setKey] = groups[c.setKey] || [];
    groups[c.setKey].push(id);
  }
  for (const [key, cards] of Object.entries(groups)) {
    const sample = getCardById(cards[0]);
    const setSize = sample.setSize!;
    const realCount = cards.length;
    const needed = setSize - realCount;
    if (needed > 0 && realCount >= 1) {
      destinations.push({ setKey: key, setSize, existing: cards });
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-wide">
        <h2>Move Common Candidate</h2>
        <p className="modal-subtitle">
          Choose a destination. Costs 1 play. Pulling from a completed set will break it.
        </p>
        <div className="modal-buttons">
          {destinations.map(t => {
            const sample = getCardById(t.existing[0]);
            return (
              <button key={t.setKey} className="btn-action" onClick={() => onChoose(t.setKey)}>
                📦 {sample.name}
                <span className="btn-sub">{t.existing.length}/{t.setSize} existing</span>
              </button>
            );
          })}
          <button className="btn-fund" onClick={() => onChoose('loose')}>
            🃏 Keep as Loose
            <span className="btn-sub">No set assignment</span>
          </button>
        </div>
        <button className="btn-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ============ REACTION MODAL ============
function ReactionModal({
  actingPlayer, targetPlayer, actingCardName, availableReactions, onReact, onAccept,
}: {
  actingPlayer: Player;
  targetPlayer: Player;
  actingCardName: string;
  availableReactions: string[];
  onReact: (effectKey: string) => void;
  onAccept: () => void;
}) {
  const REACT_LABELS: Record<string, string> = {
    mathaka: '🧠 Mathaka Na',
    father: '👨 Do You Know My Father',
    protest: '📢 Public Protest',
  };
  const REACT_SUBS: Record<string, string> = {
    mathaka: 'Cancels miss-turn cards only',
    father: 'Cancels any Action Card',
    protest: 'Cancels any Action Card',
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>⚠️ {actingPlayer.name} played {actingCardName}</h2>
        <p className="modal-subtitle">
          {targetPlayer.name}, do you want to react? ({availableReactions.length} option{availableReactions.length > 1 ? 's' : ''} available)
        </p>
        <div className="modal-buttons">
          {availableReactions.map(key => (
            <button key={key} className="btn-action" onClick={() => onReact(key)}>
              {REACT_LABELS[key]}
              <span className="btn-sub">{REACT_SUBS[key]}</span>
            </button>
          ))}
        </div>
        <button className="btn-cancel" onClick={onAccept}>Accept (let it happen)</button>
      </div>
    </div>
  );
}

export default App;