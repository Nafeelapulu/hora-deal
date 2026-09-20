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
  cardsPlayedThisTurn: number;   // ← NEW
  turnStarted: boolean;           // ← NEW: track if we've drawn this turn
  winnerSeat: number | null;
  log: string[];
}

type PendingChoice =
  | { type: 'action-choice'; cardId: string }
  | { type: 'hand-trim' }
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

  player.powerCards = [...Object.values(bySet).flat(), ...wilds];
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

// Draw N cards, reshuffling discard if the draw pile runs dry
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

// ============ MAIN APP ============
function App() {
  const [game, setGame] = useState<GameState>(() => dealCards());
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [pendingChoice, setPendingChoice] = useState<PendingChoice>(null);

  const currentPlayer = game.players[game.currentTurn];
  const playsRemaining = MAX_PLAYS_PER_TURN - game.cardsPlayedThisTurn;
  const canPlay = playsRemaining > 0 && game.turnStarted;

  // ============ ACTIONS ============

  function startTurn() {
    setGame(g => {
      if (g.turnStarted) return g;
      const newGame = cloneGame(g);
      const p = newGame.players[g.currentTurn];

      // Skip?
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

      // --- Real effects for Action Cards played as Action ---
      if (card.effectKey === 'recount') {
        drawN(newGame, newGame.currentTurn, 2);
        newGame.log.push(`${p.name} played Ballot Recount — drew 2 extra cards.`);
      } else {
        newGame.log.push(`${p.name} played ${card.name} as Action. (Effect coming soon)`);
      }
      return newGame;
    });
    setSelectedCard(null);
    setPendingChoice(null);
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

      const newSets = regroupPowerCards(p);
      if (newSets.length > 0) {
        p.completedSets = [...p.completedSets, ...newSets];
        recalcRank(p);
        newGame.log.push(`${p.name} completed a set! Rank ${p.rank}.`);
        if (p.completedSets.length >= 3) {
          newGame.winnerSeat = p.seat;
          newGame.log.push(`🏆 ${p.name} is PRESIDENT!`);
        }
      } else {
        newGame.log.push(`${p.name} played ${card.name} to their table.`);
      }
      return newGame;
    });
    setSelectedCard(null);
    setPendingChoice(null);
  }

  function handleCardClick(cardId: string) {
    if (!canPlay) return;
    const card = getCardById(cardId);

    if (card.type === 'MONEY') {
      playAsFund(cardId);
    } else if (card.type === 'POWER') {
      playPower(cardId);
    } else if (card.type === 'ACTION') {
      setPendingChoice({ type: 'action-choice', cardId });
    }
  }

  function endTurn() {
    setGame(g => {
      const newGame = cloneGame(g);
      const p = newGame.players[newGame.currentTurn];

      // Hand trim if needed
      if (p.hand.length > 7) {
        setTimeout(() => setPendingChoice({ type: 'hand-trim' }), 0);
        return newGame; // don't advance yet
      }

      // Advance turn
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
      newGame.log.push(`${p.name} discarded ${discarded.length} cards to the bottom of the deck.`);

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

  // ============ RENDER ============
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
      {/* Opponent */}
      <PlayerArea player={game.players[1 - game.currentTurn]} isOpponent />

      {/* Middle: Center piles */}
      <div className="middle">
        <div className="pile-info">Draw: {game.drawPile.length}</div>
        <div className="pile-info">Bank: {game.centralBank.length}</div>
        <div className="turn-indicator">{currentPlayer.name}'s turn</div>
        <div className="pile-info">
          Plays: {playsRemaining}/{MAX_PLAYS_PER_TURN}
        </div>
        <div className="pile-info">Discard: {game.commonDiscard.length}</div>
      </div>

      {/* Discard pile visualization */}
      {game.commonDiscard.length > 0 && (
        <div className="discard-pile">
          <div className="discard-label">🗑 Common Discard Pile (Action Cards)</div>
          <div className="discard-cards">
            {game.commonDiscard.map(id => (
              <MiniCard key={id} cardId={id} small />
            ))}
          </div>
        </div>
      )}

      {/* Current Player */}
      <PlayerArea
        player={currentPlayer}
        isOpponent={false}
        onCardClick={handleCardClick}
        selectedCard={selectedCard}
        setSelectedCard={setSelectedCard}
        canPlay={canPlay}
      />

      {/* Controls */}
      <div className="controls">
        {!game.turnStarted && (
          <button onClick={startTurn}>Start Turn (Draw)</button>
        )}
        <button onClick={endTurn} disabled={pendingChoice !== null}>
          End Turn
        </button>
        <button onClick={resetGame} className="secondary">Restart</button>
      </div>

      {/* Log */}
      <div className="log">
        {game.log.slice(-8).map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>

      {/* Modals */}
      {pendingChoice?.type === 'action-choice' && (
        <ActionChoiceModal
          cardId={pendingChoice.cardId}
          onFund={() => playAsFund(pendingChoice.cardId)}
          onAction={() => playAsAction(pendingChoice.cardId)}
          onCancel={() => setPendingChoice(null)}
        />
      )}

      {pendingChoice?.type === 'hand-trim' && (
        <HandTrimModal
          hand={currentPlayer.hand}
          onSubmit={confirmHandTrim}
        />
      )}
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
  canPlay,
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

// ============ MODALS ============
function ActionChoiceModal({
  cardId,
  onFund,
  onAction,
  onCancel,
}: {
  cardId: string;
  onFund: () => void;
  onAction: () => void;
  onCancel: () => void;
}) {
  const card = getCardById(cardId);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{card.name}</h2>
        <p className="modal-subtitle">
          {card.bankValue} BN value · Choose how to play
        </p>
        <div className="modal-buttons">
          <button className="btn-fund" onClick={onFund}>
            💰 Play as Fund
            <span className="btn-sub">{card.bankValue} BN</span>
          </button>
          <button className="btn-action" onClick={onAction}>
            ⚡ Play as Action
            <span className="btn-sub">Resolve effect</span>
          </button>
        </div>
        <button className="btn-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function HandTrimModal({
  hand,
  onSubmit,
}: {
  hand: string[];
  onSubmit: (keepIds: string[]) => void;
}) {
  const [keep, setKeep] = useState<string[]>(hand.slice(0, 7));

  function toggle(id: string) {
    if (keep.includes(id)) {
      setKeep(keep.filter(k => k !== id));
    } else {
      if (keep.length < 7) {
        setKeep([...keep, id]);
      }
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-wide">
        <h2>Discard Down to 7</h2>
        <p className="modal-subtitle">
          Your hand has {hand.length} cards. Select {hand.length - 7} to discard.
          Currently keeping {keep.length}/7.
        </p>
        <div className="trim-cards">
          {hand.map(id => {
            const card = getCardById(id);
            const colors: Record<string, string> = {
              MONEY: '#2d8f4e',
              POWER: '#c9a227',
              ACTION: '#c73650',
            };
            const isKept = keep.includes(id);
            return (
              <div
                key={id}
                className={`mini-card ${isKept ? 'selected' : ''}`}
                style={{ background: colors[card.type], opacity: isKept ? 1 : 0.4 }}
                onClick={() => toggle(id)}
              >
                <div className="card-type">{card.type}</div>
                <div className="card-name">{card.name}</div>
                <div className="card-value">{card.bankValue} BN</div>
              </div>
            );
          })}
        </div>
        <button
          className="btn-confirm"
          onClick={() => onSubmit(keep)}
          disabled={keep.length !== 7}
        >
          Confirm Discard ({hand.length - keep.length} discarded)
        </button>
      </div>
    </div>
  );
}

export default App;