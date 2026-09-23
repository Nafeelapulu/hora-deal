import { createGame } from './rulesEngine';
import { ALL_CARDS, MONEY_CARDS, POWER_CARDS, ACTION_CARDS } from './cards';

const g = createGame(['A', 'B', 'C']);

console.log('=== CARD COUNT DEBUG ===');
console.log('Money cards:', MONEY_CARDS.length);
console.log('Power cards:', POWER_CARDS.length);
console.log('Action cards:', ACTION_CARDS.length);
console.log('Total cards defined:', ALL_CARDS.length);
console.log('');
console.log('=== GAME STATE AFTER DEAL ===');
console.log('Draw pile:', g.drawPile.length);
console.log('Players:', g.players.length);
console.log('Hands:', g.players.map(p => p.hand.length));
const total = g.drawPile.length + g.players.reduce((s, p) => s + p.hand.length, 0);
console.log('Sum (should equal total):', total);