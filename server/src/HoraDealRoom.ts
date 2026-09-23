import { Room, Client } from '@colyseus/core';
import * as Engine from '../../shared/rulesEngine';

interface PlayerJoinOptions {
  name?: string;
}

export class HoraDealRoom extends Room {
  maxClients = 5;

  // Server-side game state (not Colyseus Schema yet — using plain objects)
  // We'll serialize manually for now; can upgrade to Schema later
  private game: Engine.GameState | null = null;

  // Map session IDs to seats
  private sessionToSeat: Map<string, number> = new Map();

  onCreate(options: any) {
    console.log('🎮 HoraDealRoom created:', this.roomId);

    // Start game — host triggers this
    this.onMessage('start_game', (client, message) => {
      const seat = this.sessionToSeat.get(client.sessionId);
      if (seat === undefined) return;
      if (seat !== 0) {
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

            if (this.clients.length < 2) {
        client.send('error', { message: 'Need at least 2 players' });
        return;
      }

      // Build names from session order
      const names: string[] = [];
      for (let i = 0; i < this.clients.length; i++) {
        const c = this.clients[i];
        const opts = (c.userData as any) ?? {};
        names.push(opts.name || `Player ${i + 1}`);
      }

      console.log('Starting game with players:', names);
      this.game = Engine.createGame(names);

      this.broadcastState();
      this.broadcast('game_started', { seats: names.length });
    });

    // Start turn
    this.onMessage('start_turn', (client) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        const seat = this.getSeat(client);
        if (seat !== this.game.currentTurn) {
          return { state: this.game, ok: false, error: 'Not your turn', log: [] };
        }
        return Engine.startTurn(this.game);
      });
    });

    // End turn
    this.onMessage('end_turn', (client) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        const seat = this.getSeat(client);
        if (seat !== this.game.currentTurn) {
          return { state: this.game, ok: false, error: 'Not your turn', log: [] };
        }
        return Engine.endTurn(this.game);
      });
    });

    // Play as Fund
    this.onMessage('play_as_fund', (client, message: { cardId: string }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        const seat = this.getSeat(client);
        return Engine.playAsFund(this.game, seat, message.cardId);
      });
    });

    // Play as Power
    this.onMessage('play_as_power', (client, message: { cardId: string }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        const seat = this.getSeat(client);
        return Engine.playAsPower(this.game, seat, message.cardId);
      });
    });

    // Play as Action
    this.onMessage('play_as_action', (client, message: { cardId: string }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        const seat = this.getSeat(client);
        return Engine.playAsAction(this.game, seat, message.cardId);
      });
    });

    // Select target for an action
    this.onMessage('select_target', (client, message: { targetSeat: number }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        return Engine.selectTarget(this.game, message.targetSeat);
      });
    });

    // Confirm payment
    this.onMessage('confirm_payment', (client, message: { cardIds: string[] }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        return Engine.confirmPayment(this.game, message.cardIds);
      });
    });

    // Play reaction
    this.onMessage('play_reaction', (client, message: { effectKey: string }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        return Engine.playReaction(this.game, message.effectKey);
      });
    });

    // Accept reaction (skip)
    this.onMessage('accept_reaction', (client) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        return Engine.acceptReaction(this.game);
      });
    });

    // Resolve wild choice
    this.onMessage('resolve_wild_choice', (client, message: { setKey: string }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        return Engine.resolveWildChoice(this.game, message.setKey);
      });
    });

    // Pick power card (No Confidence Motion)
    this.onMessage('pick_power_card', (client, message: { cardId: string }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        return Engine.pickPowerCard(this.game, message.cardId);
      });
    });

    // Pick set (Cabinet Reshuffle)
    this.onMessage('pick_set', (client, message: { setIndex: number }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        return Engine.pickSet(this.game, message.setIndex);
      });
    });

    // Coalition steps
    this.onMessage('coalition_mine', (client, message: { cardId: string }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        return Engine.coalitionChooseMine(this.game, message.cardId);
      });
    });

    this.onMessage('coalition_theirs', (client, message: { cardId: string }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        return Engine.coalitionChooseTheirs(this.game, message.cardId);
      });
    });

    // EPA flows
    this.onMessage('play_epa', (client) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        return Engine.playEpa(this.game);
      });
    });
    this.onMessage('skip_epa', (client) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        return Engine.skipEpa(this.game);
      });
    });
    this.onMessage('epa_react', (client, message: { effectKey: 'father' | 'protest' }) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        return Engine.epaReact(this.game, message.effectKey);
      });
    });
    this.onMessage('epa_accept', (client) => {
      this.handleAction(client, () => {
        if (!this.game) return { state: this.game!, ok: false, error: 'No game', log: [] };
        return Engine.epaAccept(this.game);
      });
    });
  }

  onJoin(client: Client, options: PlayerJoinOptions) {
    const seat = this.clients.length - 1; // 0-indexed
    this.sessionToSeat.set(client.sessionId, seat);
    (client as any).userData = { name: options.name || `Player ${seat + 1}` };

    console.log(`👤 ${client.sessionId} joined as seat ${seat}, name: ${(client as any).userData.name}`);

    this.broadcast('player_joined', {
      sessionId: client.sessionId,
      seat,
      totalPlayers: this.clients.length,
    });
  }

  onLeave(client: Client, code?: number) {
    const seat = this.sessionToSeat.get(client.sessionId);
    console.log(`👋 ${client.sessionId} (seat ${seat}) left`);
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
  }

  // ============ HELPERS ============

  private getSeat(client: Client): number {
    const seat = this.sessionToSeat.get(client.sessionId);
    return seat !== undefined ? seat : -1;
  }

  private handleAction(
    client: Client,
    action: () => Engine.ActionResult
  ) {
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
    // Send each client a personalized state (their own hand is visible; others hidden)
    for (const client of this.clients) {
      const seat = this.getSeat(client);
      const view = this.serializeForSeat(seat);
      client.send('state', view);
    }
  }

  // Serialize game state — hides other players' hands
  private serializeForSeat(viewerSeat: number): any {
    if (!this.game) return null;
    return {
      ...this.game,
      players: this.game.players.map(p => ({
        ...p,
        // Viewer sees own hand; others see empty array (count only)
        hand: p.seat === viewerSeat ? p.hand : [],
        handCount: p.hand.length,
        // Hide others' fund cards too — just show the total (your UI rule)
        campaignFund: p.seat === viewerSeat ? p.campaignFund : [],
        fundTotal: p.campaignFund.reduce((sum, id) => {
          const card = require('../../shared/cards').getCardById(id);
          return sum + card.bankValue;
        }, 0),
      })),
      // Viewer's seat for UI
      viewerSeat,
    };
  }
}