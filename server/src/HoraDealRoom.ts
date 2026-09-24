import { Room, Client } from 'colyseus';
import * as Engine from '../../shared/rulesEngine';
import { getCardById } from '../../shared/cards';

interface PlayerJoinOptions {
  name?: string;
  customCode?: string;
}

// Global registry of room codes → room IDs
// This allows players to look up rooms by their display code
const CODE_REGISTRY: Map<string, string> = new Map();

export class HoraDealRoom extends Room {
  maxClients = 5;

  private game: Engine.GameState | null = null;
  private sessionToSeat: Map<string, number> = new Map();

  // Host management
  private hostSeat: number = 0;
  private isLocked: boolean = true;   // 🔒 LOCKED BY DEFAULT
  private displayCode: string = '';   // Custom code like "HORA"

  onAuth(client: Client, options: any) {
    console.log('🔐 onAuth called');
    console.log('   sessionId:', client.sessionId);
    if (this.isLocked && this.clients.length > 0) {
      console.log('🚫 Rejected: room is locked');
      throw new Error('Room is locked');
    }
    return true;
  }

  onCreate(options: any) {
    console.log('🎮 onCreate — START');
    console.log('   roomId:', this.roomId);
    console.log('   options:', JSON.stringify(options));

    // Handle custom room code
    const requestedCode = (options?.customCode || '').trim().toUpperCase();
    if (requestedCode) {
      if (CODE_REGISTRY.has(requestedCode)) {
        console.log(`❌ Code ${requestedCode} already taken`);
        throw new Error(`Code "${requestedCode}" is already taken`);
      }
      this.displayCode = requestedCode;
      CODE_REGISTRY.set(requestedCode, this.roomId);
      console.log(`✅ Room code set to: ${requestedCode}`);
    } else {
      // Fallback: use auto-generated room ID as display code
      this.displayCode = this.roomId;
      CODE_REGISTRY.set(this.displayCode, this.roomId);
    }

    // Send the code back to the host immediately
    this.broadcast('room_code_set', { displayCode: this.displayCode });

    // ============ HOST MESSAGES ============
    this.onMessage('kick_player', (client, message: { targetSeat: number }) => {
      const mySeat = this.sessionToSeat.get(client.sessionId);
      if (mySeat !== this.hostSeat) {
        client.send('error', { message: 'Only the host can kick players' });
        return;
      }
      const targetSeat = message.targetSeat;
      if (targetSeat === this.hostSeat) {
        client.send('error', { message: 'Cannot kick yourself' });
        return;
      }
      const targetClient = this.clients.find(c => this.sessionToSeat.get(c.sessionId) === targetSeat);
      if (targetClient) {
        console.log(`👢 Host kicking seat ${targetSeat}`);
        targetClient.send('kicked', { reason: 'Removed by host' });
        setTimeout(() => targetClient.leave(4000), 100);
      }
    });

    this.onMessage('toggle_lock', (client) => {
      const mySeat = this.sessionToSeat.get(client.sessionId);
      if (mySeat !== this.hostSeat) {
        client.send('error', { message: 'Only the host can lock the room' });
        return;
      }
      this.isLocked = !this.isLocked;
      console.log(`🔒 Room lock: ${this.isLocked}`);
      this.broadcast('room_lock_changed', { isLocked: this.isLocked });
    });

    // ============ SETUP MESSAGES ============
    this.onMessage('set_name', (client, message) => {
      const name = message?.name || 'Player';
      (client as any).userData = { name };
      const seat = this.sessionToSeat.get(client.sessionId);
      console.log(`📝 ${client.sessionId} set name to: ${name} (seat ${seat})`);
      this.broadcast('player_joined', {
        sessionId: client.sessionId,
        seat,
        name,
        totalPlayers: this.clients.length,
        hostSeat: this.hostSeat,
        isLocked: this.isLocked,
      });
    });

    this.onMessage('start_game', (client) => {
      const seat = this.sessionToSeat.get(client.sessionId);
      if (seat === undefined) return;
      if (seat !== this.hostSeat) {
        client.send('error', { message: 'Only the host can start the game' });
        return;
      }
      if (this.game) {
        client.send('error', { message: 'Game already started' });
        return;
      }
      if (this.clients.length < 2) {
        client.send('error', { message: 'Need at least 2 players' });
        return;
      }

      const names: string[] = [];
      for (let i = 0; i < this.clients.length; i++) {
        const c = this.clients[i];
        const opts = (c as any).userData ?? {};
        names.push(opts.name || `Player ${i + 1}`);
      }

      console.log('Starting game with players:', names);
      this.game = Engine.createGame(names);

      this.broadcastState();
      this.broadcast('game_started', { seats: names.length });
    });

    // ============ GAME ACTIONS ============
    this.onMessage('start_turn', (client) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        const seat = this.getSeat(client);
        if (seat !== this.game.currentTurn) {
          return { state: this.game, ok: false, error: 'Not your turn', log: [] };
        }
        return Engine.startTurn(this.game);
      });
    });

    this.onMessage('end_turn', (client) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        const seat = this.getSeat(client);
        if (seat !== this.game.currentTurn) {
          return { state: this.game, ok: false, error: 'Not your turn', log: [] };
        }
        return Engine.endTurn(this.game);
      });
    });

    this.onMessage('play_as_fund', (client, message: { cardId: string }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        const seat = this.getSeat(client);
        return Engine.playAsFund(this.game, seat, message.cardId);
      });
    });

    this.onMessage('play_as_power', (client, message: { cardId: string }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        const seat = this.getSeat(client);
        return Engine.playAsPower(this.game, seat, message.cardId);
      });
    });

    this.onMessage('play_as_action', (client, message: { cardId: string }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        const seat = this.getSeat(client);
        return Engine.playAsAction(this.game, seat, message.cardId);
      });
    });

    this.onMessage('select_target', (client, message: { targetSeat: number }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        return Engine.selectTarget(this.game, message.targetSeat);
      });
    });

    this.onMessage('confirm_payment', (client, message: { cardIds: string[] }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        return Engine.confirmPayment(this.game, message.cardIds);
      });
    });

    this.onMessage('play_reaction', (client, message: { effectKey: string }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        return Engine.playReaction(this.game, message.effectKey);
      });
    });

    this.onMessage('accept_reaction', (client) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        return Engine.acceptReaction(this.game);
      });
    });

    this.onMessage('resolve_wild_choice', (client, message: { setKey: string }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        return Engine.resolveWildChoice(this.game, message.setKey);
      });
    });

    this.onMessage('pick_power_card', (client, message: { cardId: string }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        return Engine.pickPowerCard(this.game, message.cardId);
      });
    });

    this.onMessage('pick_set', (client, message: { setIndex: number }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        return Engine.pickSet(this.game, message.setIndex);
      });
    });

    this.onMessage('coalition_mine', (client, message: { cardId: string }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        return Engine.coalitionChooseMine(this.game, message.cardId);
      });
    });

    this.onMessage('coalition_theirs', (client, message: { cardId: string }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        return Engine.coalitionChooseTheirs(this.game, message.cardId);
      });
    });

    this.onMessage('play_epa', (client) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        return Engine.playEpa(this.game);
      });
    });

    this.onMessage('skip_epa', (client) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        return Engine.skipEpa(this.game);
      });
    });

    this.onMessage('epa_react', (client, message: { effectKey: 'father' | 'protest' }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        return Engine.epaReact(this.game, message.effectKey);
      });
    });

    this.onMessage('epa_accept', (client) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: null as any, ok: false, error: 'No game', log: [] };
        return Engine.epaAccept(this.game);
      });
    });

    console.log('✅ onCreate — COMPLETE');
  }

  onJoin(client: Client, options: PlayerJoinOptions) {
    console.log('🚀 onJoin — START');
    const seat = this.clients.length - 1;
    this.sessionToSeat.set(client.sessionId, seat);

    const name = options?.name || `Player ${seat + 1}`;
    (client as any).userData = { name };

    console.log(`👤 ${client.sessionId} joined as seat ${seat}, name: ${name}`);

    if (seat === 0) {
      this.hostSeat = 0;
      console.log(`👑 Seat 0 is the host`);
    }

    this.broadcast('player_joined', {
      sessionId: client.sessionId,
      seat,
      name,
      totalPlayers: this.clients.length,
      hostSeat: this.hostSeat,
      isLocked: this.isLocked,
    });

    // Also send the display code + lock status to the new joiner
    client.send('room_code_set', {
      displayCode: this.displayCode,
      isLocked: this.isLocked,
    });

    console.log('✅ onJoin — COMPLETE');
  }

  onLeave(client: Client, consented?: boolean) {
    const seat = this.sessionToSeat.get(client.sessionId);
    console.log(`👋 ${client.sessionId} (seat ${seat}) left, consented: ${consented}`);
    this.sessionToSeat.delete(client.sessionId);

    if (this.game && seat !== undefined) {
      this.game.players[seat].isConnected = false;
      this.broadcastState();
    }

    this.broadcast('player_left', {
      sessionId: client.sessionId,
      totalPlayers: this.clients.length,
    });
  }

  onDispose() {
    console.log('🗑 Room disposing:', this.roomId);
    // Remove the code from the registry so it can be reused
    if (this.displayCode && CODE_REGISTRY.get(this.displayCode) === this.roomId) {
      CODE_REGISTRY.delete(this.displayCode);
      console.log(`🔓 Code ${this.displayCode} freed`);
    }
  }

  private getSeat(client: Client): number {
    const seat = this.sessionToSeat.get(client.sessionId);
    return seat !== undefined ? seat : -1;
  }

  private handleAction(client: Client, action: () => Engine.ActionResult) {
    try {
      const result = action();
      if (!result.ok) {
        client.send('error', { message: result.error });
        return;
      }
      this.game = result.state;
      this.broadcastState();
    } catch (e: any) {
      console.error('Action error:', e);
      client.send('error', { message: e.message });
    }
  }

  private broadcastState() {
    if (!this.game) return;
    for (const client of this.clients) {
      const seat = this.getSeat(client);
      const view = this.serializeForSeat(seat);
      client.send('state', view);
    }
  }

  private serializeForSeat(viewerSeat: number): any {
    if (!this.game) return null;
    return {
      ...this.game,
      players: this.game.players.map(p => ({
        ...p,
        hand: p.seat === viewerSeat ? p.hand : [],
        handCount: p.hand.length,
        campaignFund: p.seat === viewerSeat ? p.campaignFund : [],
        fundTotal: p.campaignFund.reduce((sum, id) => sum + getCardById(id).bankValue, 0),
      })),
      viewerSeat,
    };
  }
}