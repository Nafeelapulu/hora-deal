import { useState, useEffect, useRef } from 'react';
import { Client, Room } from 'colyseus.js';
import { getCardById } from '../../shared/cards';

// 🔁 CHANGE THIS TO wss://hora-deal-server.onrender.com WHEN DEPLOYED
const SERVER_URL = 'ws://localhost:2567';

// ============ COLOR PALETTE ============
const C = {
  navyDeep: '#0A0A0A',
  navyMid: '#141414',
  black: '#0A0A0A',
  charcoal: '#2E2E2E',
  grey: '#4A4A4A',
  greyLight: '#C0C0C0',
  greenMuted: '#8A8A8A',
  white: '#E8E8E8',
};

// ============ TYPES ============
interface ServerPlayer {
  seat: number;
  name: string;
  hand: string[];
  handCount: number;
  campaignFund: string[];
  fundTotal: number;
  powerCards: string[];
  completedSets: string[][];
  rank: 0 | 1 | 2 | 3;
  skipTurns: number;
  isConnected: boolean;
}

interface ServerGameState {
  phase: 'waiting' | 'playing' | 'ended';
  players: ServerPlayer[];
  drawPile: string[];
  commonDiscard: string[];
  centralBank: string[];
  currentTurn: number;
  cardsPlayedThisTurn: number;
  turnStarted: boolean;
  winnerSeat: number;
  pending: any;
  log: string[];
  maxPlaysPerTurn: number;
  viewerSeat: number;
}

type Screen = 'connect' | 'lobby' | 'waiting' | 'game';

// ============ MAIN COMPONENT ============
export default function MultiplayerGame({ onBack }: { onBack: () => void }) {
  const [screen, setScreen] = useState<Screen>('connect');
  const [playerName, setPlayerName] = useState('Player');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Not connected');
  const [gameState, setGameState] = useState<ServerGameState | null>(null);
  const [connectedPlayers, setConnectedPlayers] = useState<any[]>([]);
  const [hostSeat, setHostSeat] = useState<number>(0);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [mySeat, setMySeat] = useState<number>(-1);
  const [kickedMsg, setKickedMsg] = useState<string>('');

  const clientRef = useRef<Client | null>(null);
  const roomRef = useRef<Room | null>(null);
  const latestGameStateRef = useRef<ServerGameState | null>(null);

  useEffect(() => {
    latestGameStateRef.current = gameState;
  }, [gameState]);

  function connect() {
    try {
      const c = new Client(SERVER_URL);
      clientRef.current = c;
      setStatus('Connected to server');
      setScreen('lobby');
      setError('');
    } catch (e: any) {
      setError(`Connection failed: ${e.message}`);
    }
  }

  async function createRoom() {
    const client = clientRef.current;
    if (!client) { setError('Not connected'); return; }
    try {
      const room = await client.create('hora_deal');
      roomRef.current = room;
      setRoomCode(room.roomId);
      setStatus(`Room created`);
      setMySeat(0);
      setHostSeat(0);
      wireRoomEvents(room);
      room.send('set_name', { name: playerName });
      setScreen('waiting');
    } catch (e: any) {
      setError(`Create failed: ${e.message}`);
    }
  }

  async function joinRoom() {
    const client = clientRef.current;
    if (!client) { setError('Not connected'); return; }
    if (!roomCode) { setError('Enter a room code'); return; }
    try {
      const room = await client.joinById(roomCode);
      roomRef.current = room;
      setStatus(`Joined room`);
      setMySeat(-1);
      wireRoomEvents(room);
      room.send('set_name', { name: playerName });
      setScreen('waiting');
    } catch (e: any) {
      setError(`Join failed: ${e.message}`);
    }
  }

  function wireRoomEvents(room: Room) {
    room.onMessage('state', (state: ServerGameState) => {
      setGameState(state);
      if (state?.viewerSeat !== undefined) {
        setMySeat(state.viewerSeat);
      }
      if (state?.phase === 'playing') setScreen('game');
    });
    room.onMessage('game_started', () => setScreen('game'));
    room.onMessage('player_joined', (msg: any) => {
      setConnectedPlayers(prev => {
        const withoutDup = prev.filter(p => p.sessionId !== msg.sessionId);
        return [...withoutDup, msg];
      });
      if (typeof msg.hostSeat === 'number') setHostSeat(msg.hostSeat);
      if (typeof msg.isLocked === 'boolean') setIsLocked(msg.isLocked);

      // 🔑 KEY FIX: match my sessionId to identify my seat
      if (msg.sessionId === room.sessionId) {
        setMySeat(msg.seat);
      }
    });
    room.onMessage('room_lock_changed', (msg: any) => {
      setIsLocked(msg.isLocked);
    });
    room.onMessage('kicked', (msg: any) => {
      setKickedMsg(msg.reason || 'You were removed from the room');
      setTimeout(() => {
        roomRef.current?.leave();
      }, 500);
    });
    room.onMessage('player_left', (msg: any) => {
      setConnectedPlayers(prev => prev.filter(p => p.sessionId !== msg.sessionId));
    });
    room.onMessage('error', (msg: any) => setError(msg.message));
    room.onLeave(() => {
      setStatus('Disconnected');
      roomRef.current = null;
      setGameState(null);
      setScreen('lobby');
      setHostSeat(0);
      setMySeat(-1);
      setIsLocked(false);
      setConnectedPlayers([]);
    });
  }

  function disconnect() {
    roomRef.current?.leave();
    roomRef.current = null;
    setGameState(null);
    setConnectedPlayers([]);
    setScreen('lobby');
    setRoomCode('');
    setHostSeat(0);
    setMySeat(-1);
    setIsLocked(false);
  }

  function handleBack() {
    roomRef.current?.leave();
    roomRef.current = null;
    onBack();
  }

  // ============ RENDER ============
  return (
    <div style={{ padding: 20, color: C.white, background: C.black, minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <button onClick={handleBack} style={backButtonStyle}>← Back</button>
        <img
          src="/cards/logo.png"
          alt="හොර DEAL"
          style={{
            height: 60,
            width: 'auto',
            filter: 'drop-shadow(0 4px 16px rgba(232,232,232,0.35))',
          }}
        />
        <div style={{ width: 80 }} />
      </div>

      {kickedMsg && (
        <div style={{
          background: C.charcoal,
          border: `1px solid ${C.greyLight}`,
          color: C.white,
          padding: 12,
          borderRadius: 8,
          marginBottom: 16,
          maxWidth: 500,
          margin: '0 auto 16px auto',
          textAlign: 'center',
        }}>
          🚪 {kickedMsg}
        </div>
      )}

      {error && (
        <div style={errorStyle}>
          ⚠️ {error}
          <button onClick={() => setError('')} style={dismissButtonStyle}>Dismiss</button>
        </div>
      )}

      {screen === 'connect' && (
        <div style={cardStyle}>
          <h3>1. Connect to Server</h3>
          <p style={{ color: C.greyLight }}>Server: {SERVER_URL}</p>
          <button onClick={connect} style={primaryButtonStyle}>Connect</button>
        </div>
      )}

      {screen === 'lobby' && (
        <div style={cardStyle}>
          <h3>2. Create or Join Room</h3>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6 }}>Your name:</label>
            <input
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              style={inputStyle}
              placeholder="Player"
            />
          </div>
          <button onClick={createRoom} style={{ ...primaryButtonStyle, marginBottom: 20 }}>
            Create Room (Host)
          </button>
          <div style={{ borderTop: `1px solid ${C.grey}`, paddingTop: 20 }}>
            <label style={{ display: 'block', marginBottom: 6 }}>Or join an existing room:</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={roomCode}
                onChange={e => setRoomCode(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                placeholder="Room code"
              />
              <button onClick={joinRoom} style={primaryButtonStyle}>Join</button>
            </div>
          </div>
        </div>
      )}

      {screen === 'waiting' && (
        <div style={cardStyle}>
          <h3>3. Waiting for Players</h3>
          <p style={{ fontSize: 18 }}>Room Code: <strong style={{ color: C.white }}>{roomCode}</strong></p>
          <p style={{ color: C.greyLight }}>Share this code with your friends.</p>
          {isLocked && (
            <p style={{ color: C.greyLight, fontSize: 13 }}>
              🔒 Room is locked — no new joins until unlocked
            </p>
          )}

          <p style={{ marginTop: 20 }}>
            Connected: {connectedPlayers.length || 1} player(s)
          </p>
          <ul style={{ paddingLeft: 0, listStyle: 'none', marginTop: 8 }}>
            {connectedPlayers.map((p, i) => {
              const isHost = p.seat === hostSeat;
              const isMe = p.seat === mySeat;
              return (
                <li key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  marginBottom: 4,
                  background: isHost ? C.charcoal : C.black,
                  border: `1px solid ${C.grey}`,
                  borderRadius: 6,
                }}>
                  <span>
                    {isHost && '👑 '}
                    Seat {p.seat + 1}: {p.name || 'Unnamed'}
                    {isMe && ' (you)'}
                  </span>
                  {mySeat === hostSeat && !isHost && (
                    <button
                      onClick={() => {
                        console.log('🥾 Kicking seat', p.seat);
                        roomRef.current?.send('kick_player', { targetSeat: p.seat });
                      }}
                      style={{
                        background: 'transparent',
                        color: C.greyLight,
                        border: `1px solid ${C.grey}`,
                        padding: '4px 10px',
                        fontSize: 11,
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                    >
                      Kick
                    </button>
                  )}
                </li>
              );
            })}
            {connectedPlayers.length === 0 && (
              <li style={{
                padding: '8px 12px',
                background: C.black,
                border: `1px solid ${C.grey}`,
                borderRadius: 6,
                color: C.greyLight,
                fontSize: 13,
              }}>
                You are in the room. Waiting for others...
              </li>
            )}
          </ul>

          {mySeat === hostSeat && (
            <div style={{
              marginTop: 16,
              padding: 12,
              background: C.black,
              border: `1px solid ${C.grey}`,
              borderRadius: 8,
              textAlign: 'left',
            }}>
              <p style={{ fontSize: 12, color: C.greyLight, marginBottom: 8 }}>
                👑 HOST CONTROLS
              </p>
              <button
                onClick={() => roomRef.current?.send('toggle_lock', {})}
                style={{
                  ...secondaryButtonStyle,
                  width: '100%',
                }}
              >
                {isLocked ? '🔓 Unlock Room' : '🔒 Lock Room'}
              </button>
            </div>
          )}

          <button
            onClick={() => roomRef.current?.send('start_game', {})}
            style={{
              ...primaryButtonStyle,
              marginTop: 20,
              width: '100%',
              display: mySeat === hostSeat ? 'block' : 'none',
            }}
          >
            Start Game
          </button>
          {mySeat !== hostSeat && (
            <p style={{ color: C.greyLight, fontSize: 13, marginTop: 20 }}>
              Waiting for the host to start the game...
            </p>
          )}

          <button onClick={disconnect} style={{ ...secondaryButtonStyle, marginTop: 12, width: '100%' }}>
            Leave Room
          </button>
        </div>
      )}

      {screen === 'game' && gameState && (
        <GameBoard
          gameState={gameState}
          room={roomRef.current}
          onLeave={handleBack}
          onError={setError}
        />
      )}
    </div>
  );
}

// ============ GAME BOARD ============
function GameBoard({
  gameState, room, onLeave, onError,
}: {
  gameState: ServerGameState;
  room: Room | null;
  onLeave: () => void;
  onError: (msg: string) => void;
}) {
  const mySeat = gameState.viewerSeat;
  const me = gameState.players[mySeat];
  const opponents = gameState.players.filter(p => p.seat !== mySeat);
  const isMyTurn = gameState.currentTurn === mySeat;
  const playsRemaining = gameState.maxPlaysPerTurn - gameState.cardsPlayedThisTurn;
  const canAct = isMyTurn && gameState.turnStarted && playsRemaining > 0;

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ cardId: string } | null>(null);

  const send = (type: string, payload: any = {}) => room?.send(type, payload);

  function handleCardClick(cardId: string) {
    if (!canAct) return;
    if (selectedCardId === cardId) {
      const card = getCardById(cardId);
      if (card.type === 'MONEY') send('play_as_fund', { cardId });
      else if (card.type === 'POWER') send('play_as_power', { cardId });
      else if (card.type === 'ACTION') setPendingAction({ cardId });
      setSelectedCardId(null);
    } else {
      setSelectedCardId(cardId);
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: 10, background: C.navyDeep, borderRadius: 10, marginBottom: 12,
        border: `1px solid ${C.grey}`,
      }}>
        <button onClick={onLeave} style={{ ...backButtonStyle, fontSize: 12 }}>← Leave</button>
        <div style={{ textAlign: 'center', fontSize: 13 }}>
          <div><strong>{me.name}</strong> (Seat {mySeat + 1})</div>
          <div style={{ color: C.greyLight, fontSize: 11 }}>
            Rank {me.rank} · Hand {me.handCount} · Fund {me.fundTotal} BN
          </div>
        </div>
        <div style={{ width: 80 }} />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(opponents.length, 4)}, 1fr)`,
        gap: 8, marginBottom: 12,
      }}>
        {opponents.map(opp => (
          <OpponentTile
            key={opp.seat}
            player={opp}
            isActiveTurn={gameState.currentTurn === opp.seat}
          />
        ))}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '8px 16px', background: C.navyDeep, borderRadius: 10,
        marginBottom: 12, fontSize: 13, border: `1px solid ${C.grey}`, flexWrap: 'wrap', gap: 8,
      }}>
        <div>Draw: {gameState.drawPile.length}</div>
        <div>Bank: {gameState.centralBank.length}</div>
        <div style={{ color: isMyTurn ? C.white : C.greyLight, fontWeight: 'bold' }}>
          {isMyTurn ? 'YOUR TURN' : `${gameState.players[gameState.currentTurn].name}'s turn`}
        </div>
        <div>Plays: {playsRemaining}/{gameState.maxPlaysPerTurn}</div>
        <div>Discard: {gameState.commonDiscard.length}</div>
      </div>

      {me.completedSets.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: C.greyLight, marginBottom: 4 }}>YOUR COMPLETED SETS</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {me.completedSets.map((set, i) => (
              <div key={i} style={{
                display: 'flex', gap: 3, padding: 6,
                background: C.navyMid, border: `2px solid ${C.grey}`, borderRadius: 8,
              }}>
                {set.map(id => <MiniCard key={id} cardId={id} />)}
              </div>
            ))}
          </div>
        </div>
      )}

      {me.powerCards.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: C.greyLight, marginBottom: 4 }}>YOUR LOOSE POWER</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {me.powerCards.map(id => <MiniCard key={id} cardId={id} />)}
          </div>
        </div>
      )}

      {me.campaignFund.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: C.greenMuted, marginBottom: 4 }}>
            YOUR FUND ({me.fundTotal} BN)
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {me.campaignFund.map(id => <MiniCard key={id} cardId={id} small />)}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: C.greyLight, marginBottom: 4 }}>
          YOUR HAND ({me.hand.length}){selectedCardId && ' — click again to play'}
        </div>
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap',
          opacity: canAct ? 1 : 0.5,
        }}>
          {me.hand.map(id => (
            <div
              key={id}
              onClick={() => handleCardClick(id)}
              style={{ cursor: canAct ? 'pointer' : 'not-allowed' }}
            >
              <MiniCard cardId={id} selected={selectedCardId === id} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        {isMyTurn && !gameState.turnStarted && (
          <button onClick={() => send('start_turn')} style={primaryButtonStyle}>
            Start Turn (Draw)
          </button>
        )}
        {isMyTurn && (
          <button onClick={() => send('end_turn')} style={secondaryButtonStyle}>
            End Turn
          </button>
        )}
      </div>

      <div style={{
        marginTop: 12, padding: 10, background: C.navyDeep,
        border: `1px solid ${C.grey}`,
        borderRadius: 8, fontSize: 11, fontFamily: 'monospace',
        color: C.greyLight, maxHeight: 100, overflowY: 'auto',
      }}>
        {gameState.log.slice(-6).map((line, i) => <div key={i}>{line}</div>)}
      </div>

      {pendingAction && (
        <ActionChoiceModal
          cardId={pendingAction.cardId}
          onFund={() => { send('play_as_fund', { cardId: pendingAction.cardId }); setPendingAction(null); }}
          onAction={() => { send('play_as_action', { cardId: pendingAction.cardId }); setPendingAction(null); }}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {gameState.pending && gameState.pending.type !== 'none' && (
        <PendingModal
          gameState={gameState}
          send={send}
          onError={onError}
        />
      )}
    </div>
  );
}

// ============ OPPONENT TILE ============
function OpponentTile({ player, isActiveTurn }: { player: ServerPlayer; isActiveTurn: boolean }) {
  return (
    <div style={{
      background: isActiveTurn ? C.navyMid : C.navyDeep,
      border: isActiveTurn ? `2px solid ${C.greyLight}` : `2px solid ${C.grey}`,
      borderRadius: 10, padding: 8,
    }}>
      <div style={{ fontSize: 12, fontWeight: 'bold' }}>{player.name}</div>
      <div style={{ fontSize: 10, color: C.greyLight }}>
        Rank {player.rank} · Hand {player.handCount} · Fund {player.fundTotal} BN · Sets {player.completedSets.length}/3
      </div>
      {player.skipTurns > 0 && (
        <div style={{
          fontSize: 10, background: C.charcoal, padding: '2px 6px',
          borderRadius: 4, display: 'inline-block', marginTop: 4,
          border: `1px solid ${C.grey}`, color: C.white,
        }}>
          Skip: {player.skipTurns}
        </div>
      )}
      {player.completedSets.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {player.completedSets.map((set, i) => (
            <div key={i} style={{
              display: 'flex', gap: 2, padding: 3,
              background: C.navyMid,
              border: `1px solid ${C.grey}`, borderRadius: 4,
            }}>
              {set.map(id => <MiniCard key={id} cardId={id} small />)}
            </div>
          ))}
        </div>
      )}
      {player.powerCards.length > 0 && (
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>
          {player.powerCards.map(id => <MiniCard key={id} cardId={id} small />)}
        </div>
      )}
    </div>
  );
}

// ============ MINI CARD ============
function MiniCard({ cardId, small, selected, onClick }: {
  cardId: string; small?: boolean; selected?: boolean; onClick?: () => void;
}) {
  const card = getCardById(cardId);
  const baseKey = cardId.replace(/_\d+$/, '');
  const imagePath = `/cards/${baseKey}.png`;
  const width = small ? 40 : 70;
  const height = small ? 56 : 98;

  return (
    <div
      onClick={onClick}
      title={card.name}
      style={{
        width, height, borderRadius: 6, overflow: 'hidden',
        border: selected ? `2px solid ${C.white}` : `1px solid ${C.grey}`,
        boxShadow: selected ? `0 0 0 2px ${C.white}` : undefined,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <img src={imagePath} alt={card.name}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </div>
  );
}

// ============ ACTION CHOICE MODAL ============
function ActionChoiceModal({ cardId, onFund, onAction, onCancel }: {
  cardId: string;
  onFund: () => void;
  onAction: () => void;
  onCancel: () => void;
}) {
  const card = getCardById(cardId);
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3>{card.name}</h3>
        <p style={{ color: C.greyLight }}>{card.bankValue} BN value</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <button onClick={onFund} style={{ ...primaryButtonStyle }}>
            💰 Fund ({card.bankValue} BN)
          </button>
          <button onClick={onAction} style={{ ...primaryButtonStyle }}>
            ⚡ Action
          </button>
        </div>
        <button onClick={onCancel} style={secondaryButtonStyle}>Cancel</button>
      </div>
    </div>
  );
}

// ============ PENDING MODAL (dispatcher) ============
function PendingModal({
  gameState, send, onError,
}: {
  gameState: ServerGameState;
  send: (type: string, payload?: any) => void;
  onError: (msg: string) => void;
}) {
  const pending = gameState.pending;
  const mySeat = gameState.viewerSeat;

  if (pending.type === 'select-target') {
    if (pending.seat !== mySeat) return <WaitingBanner text={`${gameState.players[pending.seat].name} is choosing a target...`} />;
    return (
      <SelectTargetModal
        gameState={gameState}
        purpose={pending.purpose}
        onSelect={(seat) => send('select_target', { targetSeat: seat })}
      />
    );
  }

  if (pending.type === 'payment') {
    if (pending.payerSeat !== mySeat) {
      return <WaitingBanner text={`${gameState.players[pending.payerSeat].name} must pay ${pending.amount} BN...`} />;
    }
    const payer = gameState.players[mySeat];
    return (
      <PaymentModal
        payer={payer}
        amount={pending.amount}
        onConfirm={(cardIds) => send('confirm_payment', { cardIds })}
      />
    );
  }

  if (pending.type === 'reaction') {
    if (pending.targetSeat !== mySeat) {
      return <WaitingBanner text={`${gameState.players[pending.targetSeat].name} is deciding whether to react...`} />;
    }
    const target = gameState.players[mySeat];
    const actingPlayer = gameState.players[pending.actingPlayerSeat];
    const actingCardName = getCardById(pending.actingCardId).name;
    const options = getAvailableReactionsFor(target, pending.purpose);
    return (
      <ReactionModal
        actingPlayer={actingPlayer}
        targetPlayer={target}
        actingCardName={actingCardName}
        availableReactions={options}
        onReact={(key) => send('play_reaction', { effectKey: key })}
        onAccept={() => send('accept_reaction')}
      />
    );
  }

  if (pending.type === 'wild-choice') {
    if (pending.seat !== mySeat) return null;
    return (
      <WildChoiceModal
        me={gameState.players[mySeat]}
        onChoose={(setKey) => send('resolve_wild_choice', { setKey })}
      />
    );
  }

  if (pending.type === 'pick-power-card') {
    if (pending.seat !== mySeat) return null;
    return (
      <PickPowerCardModal
        target={gameState.players[pending.targetSeat]}
        onPick={(cardId) => send('pick_power_card', { cardId })}
        onCancel={() => onError('Cannot cancel')}
      />
    );
  }

  if (pending.type === 'pick-set') {
    if (pending.seat !== mySeat) return null;
    return (
      <PickSetModal
        target={gameState.players[pending.targetSeat]}
        onPick={(setIndex) => send('pick_set', { setIndex })}
        onCancel={() => onError('Cannot cancel')}
      />
    );
  }

  if (pending.type === 'coalition-mine') {
    if (pending.seat !== mySeat) return null;
    return (
      <CoalitionPickModal
        cards={gameState.players[mySeat].powerCards}
        title="Coalition — Pick YOUR Card to Give"
        onPick={(cardId) => send('coalition_mine', { cardId })}
        onCancel={() => onError('Cannot cancel')}
      />
    );
  }

  if (pending.type === 'coalition-theirs') {
    if (pending.seat !== mySeat) return null;
    const target = gameState.players[pending.targetSeat];
    return (
      <CoalitionPickModal
        cards={target.powerCards}
        title={`Coalition — Pick ${target.name}'s Card`}
        onPick={(cardId) => send('coalition_theirs', { cardId })}
        onCancel={() => onError('Cannot cancel')}
      />
    );
  }

  if (pending.type === 'epa-window') {
    if (pending.nextPlayerSeat !== mySeat) return null;
    return (
      <EpaWindowModal
        epaPlayer={gameState.players[mySeat]}
        winningPlayer={gameState.players[pending.winningSeat]}
        onPlay={() => send('play_epa')}
        onSkip={() => send('skip_epa')}
      />
    );
  }

  if (pending.type === 'epa-react') {
    if (pending.winningSeat !== mySeat) return null;
    const winningPlayer = gameState.players[mySeat];
    return (
      <EpaReactModal
        winningPlayer={winningPlayer}
        epaPlayer={gameState.players[pending.epaPlayerSeat]}
        winningHand={winningPlayer.hand}
        onReact={(key) => send('epa_react', { effectKey: key })}
        onAccept={() => send('epa_accept')}
      />
    );
  }

  return null;
}

function WaitingBanner({ text }: { text: string }) {
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3>⏳ Waiting...</h3>
        <p style={{ color: C.greyLight }}>{text}</p>
      </div>
    </div>
  );
}

// ============ SUB-MODALS ============
function getAvailableReactionsFor(player: ServerPlayer, purpose: string): string[] {
  const options: string[] = [];
  const hasMathaka = player.hand.some(id => getCardById(id).effectKey === 'mathaka');
  const hasFather = player.hand.some(id => getCardById(id).effectKey === 'father');
  const hasProtest = player.hand.some(id => getCardById(id).effectKey === 'protest');
  const missTurnCards = ['fcid', 'white_van', 'injunction', 'prorogued'];
  if (missTurnCards.includes(purpose) && hasMathaka) options.push('mathaka');
  if (hasFather) options.push('father');
  if (hasProtest) options.push('protest');
  return options;
}

const PURPOSE_PROMPTS: Record<string, string> = {
  strike: 'Pay 2 BN to Central Bank.',
  mahanayake: 'Pay 4 BN to Central Bank.',
  coalition: 'Swap one loose Power Card with.',
  bribe: 'Steal money from.',
  no_confidence: 'Steal a Power Card from.',
  reshuffle: 'Steal a complete set from.',
  coup: 'Steal ALL complete sets from.',
  double_crossover: 'Steal all Crossovers from.',
  fcid: 'Skip their next turn.',
  white_van: 'Skip their next turn.',
  injunction: 'Skip their next turn.',
  abolished: 'Break their set.',
};

function SelectTargetModal({ gameState, purpose, onSelect }: {
  gameState: ServerGameState;
  purpose: string;
  onSelect: (seat: number) => void;
}) {
  const others = gameState.players.filter((p: ServerPlayer) => p.seat !== gameState.viewerSeat);
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3>Select Target</h3>
        <p style={{ color: C.greyLight }}>{PURPOSE_PROMPTS[purpose] || 'Choose a target.'}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {others.map((p: ServerPlayer) => (
            <button
              key={p.seat}
              onClick={() => onSelect(p.seat)}
              style={{
                ...primaryButtonStyle,
                display: 'flex', justifyContent: 'space-between',
              }}
            >
              <span>🎯 {p.name}</span>
              <span style={{ fontSize: 11, opacity: 0.85 }}>
                {p.powerCards.length} loose · {p.completedSets.length} sets · {p.fundTotal} BN
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PaymentModal({ payer, amount, onConfirm }: {
  payer: ServerPlayer;
  amount: number;
  onConfirm: (cardIds: string[]) => void;
}) {
  const payable = [...payer.campaignFund, ...payer.powerCards, ...payer.completedSets.flat()];
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
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 800 }}>
        <h3>{payer.name} Must Pay {amount} BN</h3>
        <p style={{ color: C.greyLight, fontSize: 13 }}>
          {mustPayAll
            ? `Not enough — must give everything (${totalAvailable} BN).`
            : `Select cards totaling at least ${amount} BN. No change given.`}
          <br />Selected: <strong>{total} BN</strong> · {enough ? '✅ Enough' : '❌ Not enough'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxHeight: 400, overflow: 'auto', padding: 10 }}>
          {payable.map(id => {
            const inSet = payer.completedSets.some(set => set.includes(id));
            return (
              <div key={id} onClick={() => toggle(id)} style={{
                opacity: selected.includes(id) ? 1 : 0.7,
                border: inSet ? `2px solid ${C.greyLight}` : undefined,
                borderRadius: 6, cursor: 'pointer',
              }}>
                <MiniCard cardId={id} />
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12 }}>
          {!mustPayAll && (
            <button onClick={autoFill} style={{ ...primaryButtonStyle, marginRight: 8 }}>
              🪄 Auto-Pick
            </button>
          )}
          <button
            onClick={() => onConfirm(selected)}
            disabled={!enough}
            style={{ ...primaryButtonStyle, opacity: enough ? 1 : 0.4 }}
          >
            Confirm Payment ({total} BN)
          </button>
        </div>
      </div>
    </div>
  );
}

function WildChoiceModal({ me, onChoose }: {
  me: ServerPlayer;
  onChoose: (setKey: string) => void;
}) {
  const targets: { setKey: string; setSize: number; existing: string[] }[] = [];
  const groups: Record<string, string[]> = {};
  for (const id of me.powerCards) {
    const c = getCardById(id);
    if (c.isWild || !c.setKey) continue;
    groups[c.setKey] = groups[c.setKey] || [];
    groups[c.setKey].push(id);
  }
  for (const [key, cards] of Object.entries(groups)) {
    const sample = getCardById(cards[0]);
    if (cards.length < sample.setSize!) {
      targets.push({ setKey: key, setSize: sample.setSize!, existing: cards });
    }
  }
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3>Common Candidate — Choose a Set</h3>
        {targets.length === 0 ? (
          <>
            <p style={{ color: C.greyLight }}>No incomplete sets.</p>
            <button onClick={() => onChoose('loose')} style={secondaryButtonStyle}>Keep Loose</button>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {targets.map(t => (
              <button
                key={t.setKey}
                onClick={() => onChoose(t.setKey)}
                style={{ ...primaryButtonStyle }}
              >
                {getCardById(t.existing[0]).name} ({t.existing.length}/{t.setSize})
              </button>
            ))}
            <button onClick={() => onChoose('loose')} style={secondaryButtonStyle}>Keep Loose</button>
          </div>
        )}
      </div>
    </div>
  );
}

function PickPowerCardModal({ target, onPick, onCancel }: {
  target: ServerPlayer;
  onPick: (cardId: string) => void;
  onCancel: () => void;
}) {
  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 700 }}>
        <h3>No Confidence Motion</h3>
        <p style={{ color: C.greyLight }}>Choose which Power Card to steal from {target.name}.</p>
        {target.powerCards.length === 0 ? (
          <>
            <p>No loose Power Cards to steal.</p>
            <button onClick={onCancel} style={secondaryButtonStyle}>Cancel</button>
          </>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {target.powerCards.map(id => (
              <div key={id} onClick={() => onPick(id)} style={{ cursor: 'pointer' }}>
                <MiniCard cardId={id} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PickSetModal({ target, onPick, onCancel }: {
  target: ServerPlayer;
  onPick: (idx: number) => void;
  onCancel: () => void;
}) {
  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 700 }}>
        <h3>Cabinet Reshuffle</h3>
        <p style={{ color: C.greyLight }}>Choose which set to steal from {target.name}.</p>
        {target.completedSets.length === 0 ? (
          <>
            <p>No complete sets to steal.</p>
            <button onClick={onCancel} style={secondaryButtonStyle}>Cancel</button>
          </>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {target.completedSets.map((set, i) => (
              <div key={i} onClick={() => onPick(i)} style={{
                cursor: 'pointer', padding: 6,
                background: C.navyMid, borderRadius: 8,
                border: `1px solid ${C.grey}`,
              }}>
                <div style={{ display: 'flex', gap: 3 }}>
                  {set.map(id => <MiniCard key={id} cardId={id} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CoalitionPickModal({ cards, title, onPick, onCancel }: {
  cards: string[];
  title: string;
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 700 }}>
        <h3>{title}</h3>
        {cards.length === 0 ? (
          <>
            <p>No loose Power Cards available.</p>
            <button onClick={onCancel} style={secondaryButtonStyle}>Cancel</button>
          </>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {cards.map(id => (
              <div key={id} onClick={() => onPick(id)} style={{ cursor: 'pointer' }}>
                <MiniCard cardId={id} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReactionModal({ actingPlayer, targetPlayer, actingCardName, availableReactions, onReact, onAccept }: {
  actingPlayer: ServerPlayer;
  targetPlayer: ServerPlayer;
  actingCardName: string;
  availableReactions: string[];
  onReact: (key: string) => void;
  onAccept: () => void;
}) {
  const labels: Record<string, string> = {
    mathaka: '🧠 Mathaka Na',
    father: '👨 Do You Know My Father',
    protest: '📢 Public Protest',
  };
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3>⚠️ {actingPlayer.name} played {actingCardName}</h3>
        <p style={{ color: C.greyLight }}>{targetPlayer.name}, react?</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {availableReactions.map((key: string) => (
            <button key={key} onClick={() => onReact(key)} style={{ ...primaryButtonStyle }}>
              {labels[key]}
            </button>
          ))}
        </div>
        <button onClick={onAccept} style={{ ...secondaryButtonStyle, marginTop: 12 }}>Accept</button>
      </div>
    </div>
  );
}

function EpaWindowModal({ epaPlayer, winningPlayer, onPlay, onSkip }: {
  epaPlayer: ServerPlayer;
  winningPlayer: ServerPlayer;
  onPlay: () => void;
  onSkip: () => void;
}) {
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3>⚠️ {winningPlayer.name} is about to win!</h3>
        <p style={{ color: C.greyLight }}>
          {epaPlayer.name}, play Executive Presidency Abolished to destroy their last set?
        </p>
        <button onClick={onPlay} style={{ ...primaryButtonStyle }}>
          ⚡ Play E.P.A.
        </button>
        <button onClick={onSkip} style={{ ...secondaryButtonStyle, marginTop: 12 }}>Let them win</button>
      </div>
    </div>
  );
}

function EpaReactModal({ winningPlayer, epaPlayer, winningHand, onReact, onAccept }: {
  winningPlayer: ServerPlayer;
  epaPlayer: ServerPlayer;
  winningHand: string[];
  onReact: (key: 'father' | 'protest') => void;
  onAccept: () => void;
}) {
  const reactions: ('father' | 'protest')[] = [];
  if (winningHand.some((id: string) => getCardById(id).effectKey === 'father')) reactions.push('father');
  if (winningHand.some((id: string) => getCardById(id).effectKey === 'protest')) reactions.push('protest');
  const labels: Record<string, string> = {
    father: '👨 Do You Know My Father',
    protest: '📢 Public Protest',
  };
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3>⚠️ {epaPlayer.name} played E.P.A.!</h3>
        <p style={{ color: C.greyLight }}>{winningPlayer.name}, react to save your victory?</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reactions.map(k => (
            <button key={k} onClick={() => onReact(k)} style={{ ...primaryButtonStyle }}>
              🛡 {labels[k]}
            </button>
          ))}
        </div>
        <button onClick={onAccept} style={{ ...secondaryButtonStyle, marginTop: 12 }}>Accept</button>
      </div>
    </div>
  );
}

// ============ STYLES ============
const cardStyle: React.CSSProperties = {
  background: C.navyDeep,
  border: `1px solid ${C.grey}`,
  padding: 20,
  borderRadius: 12,
  marginBottom: 16,
  maxWidth: 500,
  margin: '0 auto',
  color: C.white,
};

const backButtonStyle: React.CSSProperties = {
  background: C.charcoal,
  color: C.white,
  padding: '8px 16px',
  border: `1px solid ${C.grey}`,
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 'bold',
};

const primaryButtonStyle: React.CSSProperties = {
  background: C.navyMid,
  color: C.white,
  padding: '10px 24px',
  border: `1px solid ${C.grey}`,
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: 14,
};

const secondaryButtonStyle: React.CSSProperties = {
  background: C.charcoal,
  color: C.white,
  padding: '10px 24px',
  border: `1px solid ${C.grey}`,
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
};

const inputStyle: React.CSSProperties = {
  padding: 10,
  background: C.black,
  color: C.white,
  border: `1px solid ${C.grey}`,
  borderRadius: 6,
  fontSize: 14,
  width: '100%',
};

const errorStyle: React.CSSProperties = {
  background: C.charcoal,
  border: `1px solid ${C.grey}`,
  color: C.white,
  padding: 12,
  borderRadius: 8,
  marginBottom: 16,
  maxWidth: 500,
  margin: '0 auto 16px auto',
  textAlign: 'center',
};

const dismissButtonStyle: React.CSSProperties = {
  marginLeft: 12,
  background: 'transparent',
  color: C.white,
  border: `1px solid ${C.greyLight}`,
  borderRadius: 4,
  padding: '2px 8px',
  cursor: 'pointer',
  fontSize: 12,
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(4, 6, 11, 0.88)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 20,
};

const modalStyle: React.CSSProperties = {
  background: C.navyDeep,
  border: `2px solid ${C.grey}`,
  borderRadius: 14,
  padding: 24,
  maxWidth: 500,
  width: '100%',
  textAlign: 'center',
  color: C.white,
};