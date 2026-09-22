import { Room, Client } from '@colyseus/core';

export class HoraDealRoom extends Room {
  maxClients = 5;

  onCreate(options: any) {
    console.log('🎮 HoraDealRoom created with options:', options);

    // Ping/pong for testing connection
    this.onMessage('ping', (client, message) => {
      console.log(`🏓 Ping from ${client.sessionId}:`, message);
      client.send('pong', { received: message, serverTime: Date.now() });
    });

    // Simple room info request
    this.onMessage('room_info', (client) => {
      client.send('room_info_response', {
        roomId: this.roomId,
        players: this.clients.length,
        maxClients: this.maxClients,
      });
    });
  }

  onJoin(client: Client, options: any) {
    console.log(`👤 Player joined: ${client.sessionId}`, options);
    this.broadcast('player_joined', {
      sessionId: client.sessionId,
      totalPlayers: this.clients.length,
    });
  }

   onLeave(client: Client, code?: number) {
    console.log(`👋 Player left: ${client.sessionId}, code: ${code}`);
    this.broadcast('player_left', {
      sessionId: client.sessionId,
      totalPlayers: this.clients.length,
    });
  }

  onDispose() {
    console.log('🗑 Room disposing:', this.roomId);
  }
}