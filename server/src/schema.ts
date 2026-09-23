import { Schema, type, ArraySchema, MapSchema } from '@colyseus/schema';

// ============ PLAYER ============
export class Player extends Schema {
  @type('number') seat: number = 0;
  @type('string') name: string = '';
  @type('string') sessionId: string = '';

  // Card arrays (store card IDs as strings)
  @type(['string']) hand = new ArraySchema<string>();
  @type(['string']) campaignFund = new ArraySchema<string>();
  @type(['string']) powerCards = new ArraySchema<string>();
  @type([['string']]) completedSets = new ArraySchema<ArraySchema<string>>();

  @type('uint8') rank: 0 | 1 | 2 | 3 = 0;
  @type('uint8') skipTurns: number = 0;
  @type('boolean') isConnected: boolean = true;
}

// ============ GAME STATE ============
export class GameState extends Schema {
  @type([Player]) players = new ArraySchema<Player>();
  @type(['string']) drawPile = new ArraySchema<string>();
  @type(['string']) commonDiscard = new ArraySchema<string>();
  @type(['string']) centralBank = new ArraySchema<string>();

  @type('uint8') currentTurn: number = 0;
  @type('uint8') cardsPlayedThisTurn: number = 0;
  @type('boolean') turnStarted: boolean = false;
  @type('int8') winnerSeat: number = -1; // -1 = no winner yet

  @type('string') phase: string = 'waiting'; // waiting | playing | ended
}