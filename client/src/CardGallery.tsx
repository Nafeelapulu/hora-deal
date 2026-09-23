import { ALL_CARDS } from '@shared/cards';

export default function CardGallery() {
  const money = ALL_CARDS.filter(c => c.type === 'MONEY');
  const power = ALL_CARDS.filter(c => c.type === 'POWER');
  const action = ALL_CARDS.filter(c => c.type === 'ACTION');

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 10 }}>All {ALL_CARDS.length} Cards</h1>
      <p style={{ color: '#aaa', marginBottom: 30 }}>
        Money: {money.length} | Power: {power.length} | Action: {action.length}
      </p>

      <h2 style={{ marginTop: 30, marginBottom: 10 }}>💰 Money Cards ({money.length})</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {money.map(c => <CardImage key={c.id} cardId={c.id} />)}
      </div>

      <h2 style={{ marginTop: 30, marginBottom: 10 }}>👑 Power Cards ({power.length})</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {power.map(c => <CardImage key={c.id} cardId={c.id} />)}
      </div>

      <h2 style={{ marginTop: 30, marginBottom: 10 }}>⚡ Action Cards ({action.length})</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {action.map(c => <CardImage key={c.id} cardId={c.id} />)}
      </div>
    </div>
  );
}

function CardImage({ cardId }: { cardId: string }) {
  const baseKey = cardId.replace(/_\d+$/, '');
  const imagePath = `/cards/${baseKey}.png`;

  return (
    <div style={{
      width: 140,
      height: 200,
      borderRadius: 10,
      overflow: 'hidden',
      boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
    }}>
      <img
        src={imagePath}
        alt={cardId}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}