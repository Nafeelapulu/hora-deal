import { Server } from 'colyseus';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { monitor } from '@colyseus/monitor';
import { HoraDealRoom, getRoomIdByCode, getAllActiveCodes } from './HoraDealRoom';

const port = Number(process.env.PORT) || 2567;

const app = express();

// ============ CORS — Allow ALL origins ============
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));

// Health check
app.get('/', (_req, res) => {
  res.send('🃏 Hora Deal server is running');
});

// 🔑 Room lookup by custom code
app.get('/lookup', (req, res) => {
  const code = String(req.query.code || '').trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ error: 'Missing code parameter' });
  }
  const roomId = getRoomIdByCode(code);
  if (!roomId) {
    return res.status(404).json({ error: `Room "${code}" not found` });
  }
  res.json({ roomId, code });
});

// Debug: list all active codes
app.get('/active-codes', (_req, res) => {
  res.json({ codes: getAllActiveCodes() });
});

app.use('/colyseus', monitor());

const httpServer = createServer(app);

const gameServer = new Server({
  server: httpServer,
});

gameServer.define('hora_deal', HoraDealRoom);

gameServer.listen(port).then(() => {
  console.log(`🃏 Hora Deal server listening on ws://localhost:${port}`);
  console.log(`📊 Monitor dashboard: http://localhost:${port}/colyseus`);
  console.log(`🔍 Room lookup endpoint: http://localhost:${port}/lookup?code=HORA`);
});