import { ALL_CARDS } from '@shared/cards';
export default function CardGallery() {
  const money = ALL_CARDS.filter(c => c.type === 'MONEY');
  const power = ALL_CARDS.filter(c => c.type === 'POWER');
  const action = ALL_CARDS.filter(c => c.type === 'ACTION');

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 10 }}>All 108 Cards</h1>
      <p style={{ color: '#aaa', marginBottom: 30 }}>
        Money: {money.length} | Power: {power.length} | Action: {action.length}
      </p>

      <h2 style={{ marginTop: 30, marginBottom: 10 }}>💰 Money Cards ({money.length})</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {money.map(c => <MiniCard key={c.id} card={c} />)}
      </div>

      <h2 style={{ marginTop: 30, marginBottom: 10 }}>👑 Power Cards ({power.length})</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {power.map(c => <MiniCard key={c.id} card={c} />)}
      </div>

      <h2 style={{ marginTop: 30, marginBottom: 10 }}>⚡ Action Cards ({action.length})</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {action.map(c => <MiniCard key={c.id} card={c} />)}
      </div>
    </div>
  );
}

function MiniCard({ card }: { card: any }) {
  const colors: Record<string, string> = {
    MONEY: '#2d8f4e',
    POWER: '#c9a227',
    ACTION: '#c73650',
  };
  return (
    <div style={{
      width: 140,
      height: 200,
      background: colors[card.type],
      borderRadius: 10,
      padding: 10,
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      fontSize: 12,
      boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
    }}>
      <div style={{ fontSize: 9, opacity: 0.8, textTransform: 'uppercase' }}>
        {card.type}
      </div>
      <div style={{ fontWeight: 'bold', lineHeight: 1.2, textAlign: 'center' }}>
        {card.name}
      </div>
      <div style={{ textAlign: 'right', fontSize: 18, fontWeight: 'bold' }}>
        {card.bankValue} BN
      </div>
    </div>
  );
}