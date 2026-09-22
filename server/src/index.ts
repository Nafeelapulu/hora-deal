import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { monitor } from '@colyseus/monitor';
import { HoraDealRoom } from './HoraDealRoom';

const port = Number(process.env.PORT) || 2567;

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (_req, res) => {
  res.send('🃏 Hora Deal server is running');
});

// Colyseus monitoring dashboard
app.use('/colyseus', monitor());

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
  }),
});

gameServer.define('hora_deal', HoraDealRoom);

gameServer.listen(port).then(() => {
  console.log(`🃏 Hora Deal server listening on ws://localhost:${port}`);
  console.log(`📊 Monitor dashboard: http://localhost:${port}/colyseus`);
});