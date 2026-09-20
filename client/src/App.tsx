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
}

interface GameState {
  players: Player[];
  drawPile: string[];
  currentTurn: number;
  winnerSeat: number | null;
  log: string[];
}

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
  }));
  return {
    players,
    drawPile: deck,
    currentTurn: 0,
    winnerSeat: null,
    log: ['Game started. Player 1 goes first.'],
  };
}

// Try to form complete sets from loose power cards
function regroupPowerCards(player: Player): string[][] {
  const loose = [...player.powerCards];
  const sets: string[][] = [];

  const bySet: Record<string, string[]> = {};
  const wilds: string[] = [];

  for (const id of loose) {
    const card = getCardById(id);
    if (card.isWild) {
      wilds.push(id);
    } else if (card.setKey) {
      bySet[card.setKey] = bySet[card.setKey] || [];
      bySet[card.setKey].push(id);
    }
  }

  for (const [key, cards] of Object.entries(bySet)) {
    const card = getCardById(cards[0]);
    const needed = card.setSize! - cards.length;
    if (needed <= 0) {
      sets.push(cards.slice(0, card.setSize!));
      bySet[key] = cards.slice(card.setSize!);
    } else if (wilds.length >= needed) {
      const setCards = [...cards, ...wilds.splice(0, needed)];
      sets.push(setCards);
      bySet[key] = [];
    }
  }

  const remaining = [
    ...Object.values(bySet).flat(),
    ...wilds,
  ];

  player.powerCards = remaining;
  return sets;
}

function recalcRank(player: Player) {
  player.rank = Math.min(player.completedSets.length, 3) as 0 | 1 | 2 | 3;
}

// ============ MAIN APP ============
function App() {
  const [game, setGame] = useState<GameState>(() => dealCards());
  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  const currentPlayer = game.players[game.currentTurn];

  function drawCards(seat: number, count: number) {
    setGame(g => {
      const newGame = { ...g, players: g.players.map(p => ({ ...p, hand: [...p.hand] })), drawPile: [...g.drawPile], log: [...g.log] };
      const p = newGame.players[seat];
      for (let i = 0; i < count; i++) {
        if (newGame.drawPile.length === 0) break;
        p.hand.push(newGame.drawPile.pop()!);
      }
      newGame.log.push(`${p.name} drew ${count} cards.`);
      return newGame;
    });
  }

  function playCard(cardId: string) {
    setGame(g => {
      const newGame = {
        ...g,
        players: g.players.map(p => ({
          ...p,
          hand: [...p.hand],
          campaignFund: [...p.campaignFund],
          powerCards: [...p.powerCards],
          completedSets: [...p.completedSets],
        })),
        log: [...g.log],
      };
      const p = newGame.players[newGame.currentTurn];
      const card = getCardById(cardId);

      p.hand = p.hand.filter(id => id !== cardId);

      if (card.type === 'MONEY') {
        p.campaignFund.push(cardId);
        newGame.log.push(`${p.name} banked ${card.name} (${card.bankValue} BN).`);
      } else if (card.type === 'POWER') {
        p.powerCards.push(cardId);
        const newSets = regroupPowerCards(p);
        if (newSets.length > 0) {
          p.completedSets = [...p.completedSets, ...newSets];
          recalcRank(p);
          newGame.log.push(`${p.name} completed a set! Now rank ${p.rank}.`);
          if (p.completedSets.length >= 3) {
            newGame.winnerSeat = p.seat;
            newGame.log.push(`🏆 ${p.name} is now PRESIDENT!`);
          }
        } else {
          newGame.log.push(`${p.name} played ${card.name} to their table.`);
        }
      } else {
        p.campaignFund.push(cardId);
        newGame.log.push(`${p.name} played ${card.name} (effect coming next).`);
      }

      return newGame;
    });
    setSelectedCard(null);
  }

  function endTurn() {
    setGame(g => {
      const newGame = { ...g, players: g.players.map(p => ({ ...p, hand: [...p.hand] })), log: [...g.log] };
      const p = newGame.players[newGame.currentTurn];
      while (p.hand.length > 7) {
        p.hand.pop();
      }
      newGame.currentTurn = (newGame.currentTurn + 1) % newGame.players.length;
      newGame.log.push(`--- ${newGame.players[newGame.currentTurn].name}'s turn ---`);
      return newGame;
    });
    setSelectedCard(null);
  }

  function resetGame() {
    setGame(dealCards());
    setSelectedCard(null);
  }

  if (game.winnerSeat !== null) {
    return (
      <div className="app">
        <h1>🏆 {game.players[game.winnerSeat].name} is President!</h1>
        <button onClick={resetGame}>Play Again</button>
      </div>
    );
  }

  return (
    <div className="game-board">
      <PlayerArea player={game.players[1 - game.currentTurn]} isOpponent />
      <div className="middle">
        <div className="deck-info">Draw Pile: {game.drawPile.length} cards</div>
        <div className="turn-indicator">{currentPlayer.name}'s turn</div>
      </div>
      <PlayerArea
        player={currentPlayer}
        isOpponent={false}
        onCardClick={playCard}
        selectedCard={selectedCard}
        setSelectedCard={setSelectedCard}
      />
      <div className="controls">
        <button onClick={() => drawCards(game.currentTurn, 2)}>Draw 2</button>
        <button onClick={endTurn}>End Turn</button>
        <button onClick={resetGame} className="secondary">Restart</button>
      </div>
      <div className="log">
        {game.log.slice(-5).map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}

// ============ PLAYER AREA ============
function PlayerArea({
  player,
  isOpponent,
  onCardClick,
  selectedCard,
  setSelectedCard,
}: {
  player: Player;
  isOpponent: boolean;
  onCardClick?: (id: string) => void;
  selectedCard?: string | null;
  setSelectedCard?: (id: string | null) => void;
}) {
  return (
    <div className={`player-area ${isOpponent ? 'opponent' : 'current'}`}>
      <div className="player-header">
        <strong>{player.name}</strong>
        <span className="rank-badge">Rank {player.rank}</span>
        <span>Hand: {player.hand.length}</span>
        <span>Fund: {player.campaignFund.reduce((s, id) => s + getCardById(id).bankValue, 0)} BN</span>
        <span>Sets: {player.completedSets.length}/3</span>
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

      <div className="hand-row">
        {player.hand.map(id => (
          <MiniCard
            key={id}
            cardId={id}
            hidden={isOpponent}
            selected={selectedCard === id}
            onClick={!isOpponent && onCardClick ? () => {
              if (selectedCard === id) {
                onCardClick(id);
              } else if (setSelectedCard) {
                setSelectedCard(id);
              }
            } : undefined}
          />
        ))}
      </div>
    </div>
  );
}

// ============ CARD COMPONENT ============
function MiniCard({
  cardId,
  small,
  hidden,
  selected,
  onClick,
}: {
  cardId: string;
  small?: boolean;
  hidden?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const card = getCardById(cardId);
  const colors: Record<string, string> = {
    MONEY: '#2d8f4e',
    POWER: '#c9a227',
    ACTION: '#c73650',
  };

  if (hidden) {
    return (
      <div className={`card-back ${small ? 'small' : ''}`} onClick={onClick}>
        <div className="card-back-logo">හෝරා<br />DEAL</div>
      </div>
    );
  }

  return (
    <div
      className={`mini-card ${small ? 'small' : ''} ${selected ? 'selected' : ''}`}
      style={{ background: colors[card.type] }}
      onClick={onClick}
      title={card.name}
    >
      <div className="card-type">{card.type}</div>
      <div className="card-name">{card.name}</div>
      <div className="card-value">{card.bankValue} BN</div>
    </div>
  );
}

export default App;