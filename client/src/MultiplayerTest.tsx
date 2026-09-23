import { useState } from 'react';
import { Client, Room } from 'colyseus.js';

const SERVER_URL = 'ws://localhost:2567';

export default function MultiplayerTest() {
  const [client, setClient] = useState<Client | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<string>('Not connected');
  const [playerName, setPlayerName] = useState('Player');
  const [roomCode, setRoomCode] = useState('');
  const [players, setPlayers] = useState<string[]>([]);
  const [gameState, setGameState] = useState<any>(null);
  const [error, setError] = useState<string>('');

  // ============ CONNECT ============
  function connect() {
    try {
      const c = new Client(SERVER_URL);
      setClient(c);
      setStatus('Connected to server ✅');
      setError('');
    } catch (e: any) {
      setError(`Connection failed: ${e.message}`);
    }
  }

  // ============ CREATE ROOM ============
  async function createRoom() {
    if (!client) {
      setError('Connect first');
      return;
    }
    try {
const r = await client.create('hora_deal');
r.send('set_name', { name: playerName });console.log('Room created:', r.roomId);      setRoom(r);
      setRoomCode(r.roomId);
      setStatus(`Room created: ${r.roomId}`);
      wireRoomEvents(r);
    } catch (e: any) {
      setError(`Create failed: ${e.message}`);
    }
  }

  // ============ JOIN ROOM ============
  async function joinRoom() {
    if (!client) {
      setError('Connect first');
      return;
    }
    if (!roomCode) {
      setError('Enter a room code');
      return;
    }
    try {
const r = await client.joinById(roomCode);
r.send('set_name', { name: playerName });console.log('Joined room:', r.roomId);      setRoom(r);
      setStatus(`Joined room: ${r.roomId}`);
      wireRoomEvents(r);
    } catch (e: any) {
      setError(`Join failed: ${e.message}`);
    }
  }

  // ============ WIRE ROOM EVENTS ============
  function wireRoomEvents(r: Room) {
    r.onMessage('state', (state: any) => {
      setGameState(state);
    });

    r.onMessage('player_joined', (msg: any) => {
      console.log('Player joined:', msg);
    });

    r.onMessage('player_left', (msg: any) => {
      console.log('Player left:', msg);
    });

    r.onMessage('game_started', (msg: any) => {
      setStatus(`Game started with ${msg.seats} players`);
    });

    r.onMessage('error', (msg: any) => {
      setError(msg.message);
    });

    r.onLeave(() => {
      setStatus('Disconnected from room');
      setRoom(null);
    });

    // Update player list periodically
    setInterval(() => {
      // Colyseus room doesn't expose client list directly; use gameState
      if (gameState?.players) {
        setPlayers(gameState.players.map((p: any) => p.name));
      }
    }, 500);
  }

  // ============ START GAME ============
  function startGame() {
    if (!room) return;
    room.send('start_game', {});
  }

  // ============ ACTIONS ============
  function startTurn() {
    room?.send('start_turn', {});
  }

  function endTurn() {
    room?.send('end_turn', {});
  }

  function playFirstCard() {
    if (!gameState?.players || !room) return;
    const me = gameState.players[gameState.viewerSeat];
    if (!me || me.hand.length === 0) {
      setError('No cards in hand');
      return;
    }
    const cardId = me.hand[0];
    room.send('play_as_fund', { cardId });
  }

  // ============ RENDER ============
  return (
    <div style={{ padding: 20, color: '#eee', background: '#1a1a2e', minHeight: '100vh' }}>
      <h1>🎮 Multiplayer Test</h1>
      <p style={{ color: '#aaa' }}>Server: {SERVER_URL}</p>

      {error && (
        <div style={{ background: '#c73650', padding: 10, borderRadius: 8, marginBottom: 16 }}>
          ⚠️ {error}
          <button onClick={() => setError('')} style={{ marginLeft: 12 }}>Dismiss</button>
        </div>
      )}

      <div style={{ background: '#252547', padding: 16, borderRadius: 8, marginBottom: 16 }}>
        <h3>Status: {status}</h3>
        {room && <p>Room Code: <strong>{room.roomId}</strong></p>}
      </div>

      {/* Setup */}
      {!client && (
        <div style={{ background: '#252547', padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <h3>1. Connect</h3>
          <button onClick={connect}>Connect to Server</button>
        </div>
      )}

      {/* Lobby */}
      {client && !room && (
        <div style={{ background: '#252547', padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <h3>2. Create or Join a Room</h3>
          <div style={{ marginBottom: 12 }}>
            <label>Your name: </label>
            <input
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              style={{ padding: 6, marginLeft: 8, background: '#1a1a2e', color: '#eee', border: '1px solid #444', borderRadius: 4 }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <button onClick={createRoom}>Create Room (Host)</button>
          </div>
          <div>
            <input
              placeholder="Room code"
              value={roomCode}
              onChange={e => setRoomCode(e.target.value)}
              style={{ padding: 6, marginRight: 8, background: '#1a1a2e', color: '#eee', border: '1px solid #444', borderRadius: 4 }}
            />
            <button onClick={joinRoom}>Join Room</button>
          </div>
        </div>
      )}

      {/* Room Controls */}
      {room && !gameState && (
        <div style={{ background: '#252547', padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <h3>3. Waiting for Players</h3>
          <p>Share this code: <strong style={{ fontSize: 24 }}>{room.roomId}</strong></p>
          <p>Connected players: {players.length || 1}</p>
          <button onClick={startGame}>Start Game (Host only)</button>
        </div>
      )}

      {/* Game Controls */}
      {room && gameState && (
        <div style={{ background: '#252547', padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <h3>4. Game Controls</h3>
          <p>Current turn: Player {gameState.currentTurn + 1}</p>
          <p>Your seat: {gameState.viewerSeat + 1}</p>
          <p>Winner: {gameState.winnerSeat >= 0 ? `Player ${gameState.winnerSeat + 1}` : 'None'}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button onClick={startTurn}>Start Turn</button>
            <button onClick={playFirstCard}>Play First Card as Fund</button>
            <button onClick={endTurn}>End Turn</button>
          </div>
        </div>
      )}

      {/* Players */}
      {players.length > 0 && (
        <div style={{ background: '#252547', padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <h3>Players in Room</h3>
          <ul>{players.map((name, i) => <li key={i}>{name}</li>)}</ul>
        </div>
      )}

      {/* Game State */}
      {gameState && (
        <div style={{ background: '#252547', padding: 16, borderRadius: 8 }}>
          <h3>Game State (raw JSON)</h3>
          <pre style={{
            background: '#1a1a2e',
            padding: 12,
            borderRadius: 4,
            maxHeight: 400,
            overflow: 'auto',
            fontSize: 12,
          }}>
            {JSON.stringify(gameState, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}