import { useState } from 'react';
import CardGallery from './CardGallery';
import './App.css';

function App() {
  const [page, setPage] = useState<'lobby' | 'gallery'>('lobby');

  return (
    <div className="app">
      {page === 'lobby' && (
        <>
          <h1>🃏 Hora Deal</h1>
          <p>A political satire card game for 2–5 players</p>
          <button onClick={() => setPage('gallery')}>See All Cards</button>
        </>
      )}
      {page === 'gallery' && (
        <>
          <div style={{ width: '100%', padding: '10px 20px', textAlign: 'left' }}>
            <button onClick={() => setPage('lobby')}>← Back to Lobby</button>
          </div>
          <CardGallery />
        </>
      )}
    </div>
  );
}

export default App;