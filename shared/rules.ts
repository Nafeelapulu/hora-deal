import { getCardById, ALL_CARDS } from './cards';

export interface Player {
  id: string;
  seat: number;
  hand: string[];
  campaignFund: string[];
  powerCards: string[];
  completedSets: string[][];
  rank: 0 | 1 | 2 | 3;
  skipTurns: number;
  isConnected: boolean;
}

export interface GameState {
  phase: 'WAITING' | 'PLAYING' | 'AWAITING_REACTION' | 'ENDED';
  players: Player[];
  drawPile: string[];
  discardPile: string[];
  centralBank: string[];
  currentTurn: number;
  cardsPlayedThisTurn: number;
  winnerSeat?: number;
}

const ALL_CARD_IDS = ALL_CARDS.map(c => c.id);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createGame(playerIds: string[]): GameState {
  const deck = shuffle([...ALL_CARD_IDS]);
  const players: Player[] = playerIds.map((id, i) => ({
    id, seat: i,
    hand: deck.splice(0, 5),
    campaignFund: [], powerCards: [], completedSets: [],
    rank: 0, skipTurns: 0, isConnected: true,
  }));
  return {
    phase: 'PLAYING', players, drawPile: deck,
    discardPile: [], centralBank: [],
    currentTurn: 0, cardsPlayedThisTurn: 0,
  };
}

export function drawCards(state: GameState, seat: number, count: number) {
  const p = state.players[seat];
  for (let i = 0; i < count; i++) {
    if (state.drawPile.length === 0) {
      state.drawPile = shuffle(state.discardPile);
      state.discardPile = [];
    }
    if (state.drawPile.length === 0) break;
    p.hand.push(state.drawPile.pop()!);
  }
}

export function recalcRank(p: Player) {
  p.rank = Math.min(p.completedSets.length, 3) as 0 | 1 | 2 | 3;
}

export function checkWin(state: GameState, seat: number): boolean {
  const p = state.players[seat];
  const distinct = new Set(p.completedSets.map(s => getCardById(s[0]).setKey ?? getCardById(s[0]).id));
  if (distinct.size >= 3) {
    state.winnerSeat = seat;
    state.phase = 'ENDED';
    return true;
  }
  return false;
}

