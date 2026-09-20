export type CardType = 'MONEY' | 'POWER' | 'ACTION';

export interface CardDef {
  id: string;
  type: CardType;
  name: string;
  bankValue: number;
  setKey?: string;
  setSize?: number;
  isWild?: boolean;
  effectKey?: string;
  isReaction?: boolean;
  cancels?: ('miss_turn' | 'any')[];
}

export const MONEY_CARDS: CardDef[] = [
  ...Array(6).fill(0).map((_, i) => ({ id: `money_1_${i}`, type: 'MONEY' as const, name: '1 BN', bankValue: 1 })),
  ...Array(5).fill(0).map((_, i) => ({ id: `money_2_${i}`, type: 'MONEY' as const, name: '2 BN', bankValue: 2 })),
  ...Array(3).fill(0).map((_, i) => ({ id: `money_3_${i}`, type: 'MONEY' as const, name: '3 BN', bankValue: 3 })),
  ...Array(3).fill(0).map((_, i) => ({ id: `money_4_${i}`, type: 'MONEY' as const, name: '4 BN', bankValue: 4 })),
  ...Array(2).fill(0).map((_, i) => ({ id: `money_5_${i}`, type: 'MONEY' as const, name: '5 BN', bankValue: 5 })),
  { id: 'money_10_0', type: 'MONEY', name: '10 BN', bankValue: 10 },
];

export const POWER_CARDS: CardDef[] = [
  ...Array(2).fill(0).map((_, i) => ({ id: `constitutional_${i}`, type: 'POWER' as const, name: 'Constitutional Violations', bankValue: 4, setKey: 'constitutional', setSize: 2 })),
  ...Array(2).fill(0).map((_, i) => ({ id: `prado_${i}`, type: 'POWER' as const, name: 'Prado', bankValue: 4, setKey: 'prado', setSize: 2 })),
  ...Array(2).fill(0).map((_, i) => ({ id: `mistress_${i}`, type: 'POWER' as const, name: 'Mistress', bankValue: 4, setKey: 'mistress', setSize: 2 })),
  ...Array(3).fill(0).map((_, i) => ({ id: `promises_${i}`, type: 'POWER' as const, name: 'Broken Campaign Promises', bankValue: 3, setKey: 'promises', setSize: 3 })),
  ...Array(3).fill(0).map((_, i) => ({ id: `ballot_boxes_${i}`, type: 'POWER' as const, name: 'Stolen Ballot Boxes', bankValue: 3, setKey: 'ballot_boxes', setSize: 3 })),
  ...Array(3).fill(0).map((_, i) => ({ id: `thugs_${i}`, type: 'POWER' as const, name: 'Thugs', bankValue: 3, setKey: 'thugs', setSize: 3 })),
  ...Array(3).fill(0).map((_, i) => ({ id: `crossovers_${i}`, type: 'POWER' as const, name: 'Crossovers', bankValue: 3, setKey: 'crossovers', setSize: 3 })),
  ...Array(3).fill(0).map((_, i) => ({ id: `brawls_${i}`, type: 'POWER' as const, name: 'Parliament Brawls', bankValue: 3, setKey: 'brawls', setSize: 3 })),
  ...Array(3).fill(0).map((_, i) => ({ id: `offshore_${i}`, type: 'POWER' as const, name: 'Offshore Accounts', bankValue: 3, setKey: 'offshore', setSize: 3 })),
  ...Array(4).fill(0).map((_, i) => ({ id: `relations_${i}`, type: 'POWER' as const, name: 'Relations in Power', bankValue: 2, setKey: 'relations', setSize: 4 })),
  ...Array(5).fill(0).map((_, i) => ({ id: `common_${i}`, type: 'POWER' as const, name: 'Common Candidate', bankValue: 5, isWild: true })),
];

export const ACTION_CARDS: CardDef[] = [
  ...Array(8).fill(0).map((_, i) => ({ id: `bond_scam_${i}`, type: 'ACTION' as const, name: 'Bond Scam', bankValue: 3, effectKey: 'bond_scam' })),
  ...Array(8).fill(0).map((_, i) => ({ id: `bribe_${i}`, type: 'ACTION' as const, name: 'Bribe', bankValue: 5, effectKey: 'bribe' })),
  ...Array(5).fill(0).map((_, i) => ({ id: `recount_${i}`, type: 'ACTION' as const, name: 'Ballot Recount', bankValue: 1, effectKey: 'recount' })),
  ...Array(4).fill(0).map((_, i) => ({ id: `coalition_${i}`, type: 'ACTION' as const, name: 'Coalition', bankValue: 3, effectKey: 'coalition' })),
  ...Array(3).fill(0).map((_, i) => ({ id: `mathaka_${i}`, type: 'ACTION' as const, name: 'Mathaka Na', bankValue: 4, effectKey: 'mathaka', isReaction: true, cancels: ['miss_turn' as const] })),
  ...Array(3).fill(0).map((_, i) => ({ id: `father_${i}`, type: 'ACTION' as const, name: 'Do You Know My Father', bankValue: 5, effectKey: 'father', isReaction: true, cancels: ['any' as const] })),
  ...Array(3).fill(0).map((_, i) => ({ id: `no_confidence_${i}`, type: 'ACTION' as const, name: 'No Confidence Motion', bankValue: 5, effectKey: 'no_confidence' })),
  ...Array(3).fill(0).map((_, i) => ({ id: `doctorate_${i}`, type: 'ACTION' as const, name: 'Honorary Doctorate', bankValue: 4, effectKey: 'doctorate' })),
  ...Array(2).fill(0).map((_, i) => ({ id: `reshuffle_${i}`, type: 'ACTION' as const, name: 'Cabinet Reshuffle', bankValue: 5, effectKey: 'reshuffle' })),
  ...Array(2).fill(0).map((_, i) => ({ id: `fcid_${i}`, type: 'ACTION' as const, name: 'FCID', bankValue: 4, effectKey: 'fcid' })),
  ...Array(2).fill(0).map((_, i) => ({ id: `white_van_${i}`, type: 'ACTION' as const, name: 'White Van', bankValue: 3, effectKey: 'white_van' })),
  ...Array(2).fill(0).map((_, i) => ({ id: `mahanayake_${i}`, type: 'ACTION' as const, name: 'Mahanayake Protest', bankValue: 4, effectKey: 'mahanayake' })),
  ...Array(2).fill(0).map((_, i) => ({ id: `strike_${i}`, type: 'ACTION' as const, name: 'Strike', bankValue: 2, effectKey: 'strike' })),
  { id: 'double_cross_0', type: 'ACTION', name: 'Double Crossover', bankValue: 3, effectKey: 'double_crossover' },
  { id: 'injunction_0', type: 'ACTION', name: 'Supreme Court Injunction', bankValue: 3, effectKey: 'injunction' },
  { id: 'abolished_0', type: 'ACTION', name: 'Executive Presidency Abolished', bankValue: 10, effectKey: 'abolished' },
  { id: 'prorogued_0', type: 'ACTION', name: 'Parliament Prorogued', bankValue: 5, effectKey: 'prorogued' },
  { id: 'coup_0', type: 'ACTION', name: 'CoupLK', bankValue: 5, effectKey: 'coup' },
  { id: 'protest_0', type: 'ACTION', name: 'Public Protest', bankValue: 5, effectKey: 'protest', isReaction: true, cancels: ['any'] },
];

export const ALL_CARDS = [...MONEY_CARDS, ...POWER_CARDS, ...ACTION_CARDS];

export function getCardById(id: string): CardDef {
  const card = ALL_CARDS.find(c => c.id === id);
  if (!card) throw new Error(`Card not found: ${id}`);
  return card;
}