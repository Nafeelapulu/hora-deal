import { useState } from 'react';
import { ALL_CARDS, getCardById } from '../../shared/cards';
import './App.css';

// ============ TYPES ============
interface Player {
  seat: number;
  name: string;
  hand: string[];
  campaignFund: string[];
  powerCards: string[];     // loose power cards (not yet in a set)
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

// Returns count of wilds currently in a set array
function countWildsIn(cardIds: string[]): number {
  return cardIds.filter(id => getCardById(id).isWild).length;
}

// Returns count of non-wild cards matching a given set key
function countRealFor(cardIds: string[], setKey: string): number {
  return cardIds.filter(id => {
    const c = getCardById(id);
    return !c.isWild && c.setKey === setKey;
  }).length;
}

// Find valid incomplete sets on a player's table that a wild could join
// A "target set" is defined by (setKey, setSize). Wild joins a set group.
// The player's powerCards may contain multiple partial sets of different keys.
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
    const wildsHere = 0; // wilds are kept loose, not in this group
    const maxWilds = key === 'relations' ? 2 : 1;
    const realCount = cards.length;
    const needed = setSize - realCount;
    // Wild can join if there's still room AND real count >= 1
    if (needed > 0 && realCount >= 1 && wildsHere < maxWilds) {
      targets.push({ setKey: key, setSize, existing: cards });
    }
  }
  return targets;
}

// Try to auto-form sets from loose power cards (NO auto-wild-joining)
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
    // Only form a set if we have enough real cards (no wilds in sets unless explicitly added)
    // For "auto-form on play", we form sets when real cards alone reach setSize
    if (cards.length >= size) {
      sets.push(cards.slice(0, size));
      remaining.push(...cards.slice(size));
    } else {
      remaining.push(...cards);
    }
  }
  // Add back wilds (they stay loose)
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

function findExactMatch(payer: Player, amount: number): string[] | null {
  const cards = getPayableCards(payer);
  const target = amount;
  const result: string[] = [];
  function search(idx: number, sum: number): boolean {
    if (sum === target) return true;
    if (sum > target) return false;
    if (idx >= cards.length) return false;
    result.push(cards[idx]);
    if (search(idx + 1, sum + getCardById(cards[idx]).bankValue)) return true;
    result.pop();
    return search(idx + 1, sum);
  }
  if (search(0, 0)) return [...result];
  return null;
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

// Check if a player completed a full set after adding to power area, and if so win
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

        case 'doctorate': {
          newGame.log.push(`${p.name} played Honorary Doctorate — others pay 2 BN.`);
          const target = newGame.players.find(pl => pl.seat !== newGame.currentTurn);
          if (target) {
            const available = getPayableValue(target);
            const amt = Math.min(2, available);
            if (amt === 0) {
              newGame.log.push(`${target.name} has nothing to pay.`);
            } else {
              const exact = findExactMatch(target, amt);
              if (exact) {
                removePaidCards(target, exact);
                p.campaignFund.push(...exact);
                newGame.log.push(`${target.name} paid 2 BN (auto-matched).`);
              } else {
                setTimeout(() => setPendingChoice({
                  type: 'payment', payer: target.seat, payee: newGame.currentTurn, amount: amt,
                }), 0);
              }
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
    if (pendingChoice?.type !== 'select-target' && pendingChoice?.type !== 'payment') {
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

      // Wild cards get their own flow
      if (card.isWild) {
        setTimeout(() => setPendingChoice({ type: 'wild-choice', cardId }), 0);
        newGame.log.push(`${p.name} played Common Candidate — choose which set.`);
        return newGame;
      }

      checkWinAndSets(newGame, newGame.currentTurn);
      if (!newGame.log[newGame.log.length - 1].includes('completed')) {
        newGame.log.push(`${p.name} played ${card.name} to their table.`);
      }
      return newGame;
    });
    setSelectedCard(null);
    if (pendingChoice?.type !== 'wild-choice') setPendingChoice(null);
  }

  // Handle wild card choice
  function resolveWildChoice(setKey: string | 'loose') {
    if (pendingChoice?.type !== 'wild-choice') return;
    const wildId = pendingChoice.cardId;

    setGame(g => {
      const newGame = cloneGame(g);
      const p = newGame.players[newGame.currentTurn];

      if (setKey === 'loose') {
        // Wild stays as loose card
        newGame.log.push(`${p.name}'s Common Candidate stays loose (no set chosen).`);
        return newGame;
      }

      // Find the incomplete set group in powerCards with this key
      const group = p.powerCards.filter(id => {
        const c = getCardById(id);
        return !c.isWild && c.setKey === setKey;
      });
      if (group.length === 0) return newGame;

      const sample = getCardById(group[0]);
      const setSize = sample.setSize!;
      const maxWilds = setKey === 'relations' ? 2 : 1;
      const existingWildsInThisSet = 0; // wilds are loose currently

      // Move wild from loose into this set
      p.powerCards = p.powerCards.filter(id => id !== wildId);

      // Combine group + wild, check if full
      const combined = [...group, wildId];
      if (combined.length >= setSize && existingWildsInThisSet < maxWilds) {
        // Set complete — pull group + wild out of powerCards into completedSets
        p.powerCards = p.powerCards.filter(id => !combined.includes(id));
        p.completedSets = [...p.completedSets, combined.slice(0, setSize)];
        recalcRank(p);
        newGame.log.push(`${p.name} completed a set with Common Candidate! Rank ${p.rank}.`);
        if (p.completedSets.length >= 3) {
          newGame.winnerSeat = p.seat;
          newGame.log.push(`🏆 ${p.name} is PRESIDENT!`);
        }
      } else {
        // Not complete — but we need the wild associated with this set
        // We'll keep wild loose but log which set it's assigned to.
        // For simplicity, just put it back as loose for now — a proper implementation
        // would track "wild assigned to X" state.
        p.powerCards.push(wildId);
        newGame.log.push(`${p.name} added Common Candidate to ${sample.name} set (${combined.length}/${setSize}).`);
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

  // ============ TARGET EFFECTS ============
  function selectTarget(targetSeat: number) {
    if (pendingChoice?.type !== 'select-target') return;
    const { purpose } = pendingChoice;

    setGame(g => {
      const newGame = cloneGame(g);
      const me = newGame.players[g.currentTurn];
      const target = newGame.players[targetSeat];

      switch (purpose) {
        case 'strike': {
          const amt = Math.min(2, getPayableValue(target));
          if (amt > 0) {
            const exact = findExactMatch(target, amt);
            if (exact) {
              removePaidCards(target, exact);
              newGame.centralBank.push(...exact);
              newGame.log.push(`${target.name} paid ${amt} BN to Central Bank (auto).`);
            } else {
              setTimeout(() => setPendingChoice({
                type: 'payment', payer: targetSeat, payee: 'bank', amount: amt,
              }), 0);
            }
          }
          break;
        }
        case 'mahanayake': {
          const amt = Math.min(4, getPayableValue(target));
          if (amt > 0) {
            const exact = findExactMatch(target, amt);
            if (exact) {
              removePaidCards(target, exact);
              newGame.centralBank.push(...exact);
              newGame.log.push(`${target.name} paid ${amt} BN to Central Bank (auto).`);
            } else {
              setTimeout(() => setPendingChoice({
                type: 'payment', payer: targetSeat, payee: 'bank', amount: amt,
              }), 0);
            }
          }
          break;
        }
        case 'bribe': {
          if (me.rank === 2) {
            // Take 5 from all others
            for (const other of newGame.players) {
              if (other.seat === me.seat) continue;
              const amt = Math.min(5, getPayableValue(other));
              if (amt === 0) {
                newGame.log.push(`${other.name} has nothing to pay.`);
                continue;
              }
              const exact = findExactMatch(other, amt);
              if (exact) {
                removePaidCards(other, exact);
                me.campaignFund.push(...exact);
                newGame.log.push(`${other.name} paid ${amt} BN (auto).`);
              } else {
                setTimeout(() => setPendingChoice({
                  type: 'payment', payer: other.seat, payee: me.seat, amount: amt,
                }), 0);
              }
            }
          } else {
            const amount = me.rank === 0 ? 2 : 3;
            const amt = Math.min(amount, getPayableValue(target));
            if (amt === 0) {
              newGame.log.push(`${target.name} has nothing to pay.`);
            } else {
              const exact = findExactMatch(target, amt);
              if (exact) {
                removePaidCards(target, exact);
                me.campaignFund.push(...exact);
                newGame.log.push(`${target.name} paid ${amt} BN to ${me.name} (auto).`);
              } else {
                setTimeout(() => setPendingChoice({
                  type: 'payment', payer: targetSeat, payee: me.seat, amount: amt,
                }), 0);
              }
            }
          }
          break;
        }
        case 'no_confidence': {
          // Steal 1 loose power card (not from completed set)
          if (target.powerCards.length === 0) {
            newGame.log.push(`${target.name} has no loose Power Cards to steal.`);
          } else {
            const stolen = target.powerCards[0];
            target.powerCards = target.powerCards.filter(id => id !== stolen);
            // Stolen card goes to my Power area (not hand)
            me.powerCards.push(stolen);
            newGame.log.push(`${me.name} stole ${getCardById(stolen).name} from ${target.name}.`);
            checkWinAndSets(newGame, me.seat);
          }
          break;
        }
        case 'reshuffle': {
          // Steal 1 complete set from target (can't target 3-set holder)
          if (target.completedSets.length === 0) {
            newGame.log.push(`${target.name} has no complete sets to steal.`);
          } else if (target.completedSets.length >= 3) {
            newGame.log.push(`${target.name} already has 3 sets — cannot target.`);
          } else {
            const stolenSet = target.completedSets[0];
            target.completedSets = target.completedSets.slice(1);
            recalcRank(target);
            // Add to my power area (not directly a completed set)
            me.powerCards.push(...stolenSet);
            newGame.log.push(`${me.name} stole a complete set from ${target.name}.`);
            checkWinAndSets(newGame, me.seat);
          }
          break;
        }
        case 'coup': {
          // Steal all complete sets (can't target 3-set holder)
          if (target.completedSets.length >= 3) {
            newGame.log.push(`${target.name} already has 3 sets — cannot target.`);
          } else if (target.completedSets.length === 0) {
            newGame.log.push(`${target.name} has no complete sets to steal.`);
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
          // Steal all Crossovers from every player (loose + sets)
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
        case 'injunction': {
          target.skipTurns += 1;
          newGame.log.push(`${target.name} will miss their next turn (${target.skipTurns} pending).`);
          break;
        }
        case 'abolished': {
          // Steal a complete set, put cards at bottom of draw pile
          // Can target 3-set holder (only card that can)
          if (target.completedSets.length === 0) {
            newGame.log.push(`${target.name} has no complete sets.`);
          } else {
            const stolen = target.completedSets[0];
            target.completedSets = target.completedSets.slice(1);
            recalcRank(target);
            newGame.drawPile = [...stolen, ...newGame.drawPile];
            newGame.log.push(`${me.name} played Executive Presidency Abolished — ${target.name}'s set went to bottom of deck.`);
          }
          break;
        }
        case 'coalition': {
          if (me.powerCards.length === 0 || target.powerCards.length === 0) {
            newGame.log.push(`Coalition — no loose power cards to swap.`);
          } else {
            const mine = me.powerCards[0];
            const theirs = target.powerCards[0];
            me.powerCards = me.powerCards.filter(id => id !== mine);
            target.powerCards = target.powerCards.filter(id => id !== theirs);
            me.powerCards.push(theirs);
            target.powerCards.push(mine);
            newGame.log.push(`${me.name} swapped ${getCardById(mine).name} ↔ ${getCardById(theirs).name}.`);
            checkWinAndSets(newGame, me.seat);
            checkWinAndSets(newGame, target.seat);
          }
          break;
        }
      }
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
        receiver.campaignFund.push(...cardIds);
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
        <WildChoiceModal
          targets={wildTargets}
          onChoose={resolveWildChoice}
        />
      )}
    </div>
  );
}

// ============ PLAYER AREA ============
function PlayerArea({
  player, isOpponent, onCardClick, selectedCard, setSelectedCard, canPlay,
}: {
  player: Player;
  isOpponent: boolean;
  onCardClick?: (id: string) => void;
  selectedCard?: string | null;
  setSelectedCard?: (id: string | null) => void;
  canPlay?: boolean;
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
              {set.map(id => <MiniCard key={id} cardId={id} />)}
            </div>
          ))}
        </div>
      )}

      {player.powerCards.length > 0 && (
        <div className="power-row">
          {player.powerCards.map(id => <MiniCard key={id} cardId={id} />)}
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
function MiniCard({ cardId, small, hidden, selected, onClick }: {
  cardId: string; small?: boolean; hidden?: boolean; selected?: boolean; onClick?: () => void;
}) {
  const card = getCardById(cardId);
  const colors: Record<string, string> = { MONEY: '#2d8f4e', POWER: '#c9a227', ACTION: '#c73650' };
  if (hidden) {
    return (
      <div className={`card-back ${small ? 'small' : ''}`} onClick={onClick}>
        <div className="card-back-logo">හෝරා<br />DEAL</div>
      </div>
    );
  }
  return (
    <div className={`mini-card ${small ? 'small' : ''} ${selected ? 'selected' : ''}`}
      style={{ background: colors[card.type] }} onClick={onClick} title={card.name}>
      <div className="card-type">{card.type}</div>
      <div className="card-name">{card.name}</div>
      <div className="card-value">{card.bankValue} BN</div>
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
  reshuffle: 'Choose a player to steal a complete set from (not 3-set holders).',
  coup: 'Choose a player to steal ALL complete sets from (not 3-set holders).',
  double_crossover: 'Choose a player to steal all Crossovers from.',
  fcid: 'Choose a player to skip their next turn.',
  white_van: 'Choose a player to skip their next turn.',
  injunction: 'Choose a player to skip their next turn.',
  abolished: 'Choose a player to break their set (only card that can target a President).',
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
  const [selected, setSelected] = useState<string[]>([]);
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
            return (
              <div key={id} className={`mini-card ${isSelected ? 'selected' : ''}`}
                style={{ background: colors[card.type], opacity: isSelected ? 1 : 0.7 }}
                onClick={() => toggle(id)}>
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

export default App;