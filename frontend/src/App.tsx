import React, { useState, useEffect } from 'react';
import { HomeView } from './views/HomeView';
import { HostView } from './views/HostView';
import { PlayerView } from './views/PlayerView';
import { TvView } from './views/TvView';
import { BuilderView } from './views/BuilderView';

export function App() {
  const [currentView, setCurrentView] = useState<string>('home');
  const [params, setParams] = useState<Record<string, string>>({});

  // Parse URL query on initial load (allows direct links e.g. /?view=tv&code=JEOP-99)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const view = searchParams.get('view') || 'home';
    const code = searchParams.get('code') || '';
    const playerId = searchParams.get('playerId') || '';
    const playerName = searchParams.get('playerName') || '';
    const colorHex = searchParams.get('colorHex') || '';

    setCurrentView(view);
    setParams({ code, playerId, playerName, colorHex });
  }, []);

  const handleNavigate = (view: string, newParams: Record<string, string> = {}) => {
    setCurrentView(view);
    setParams(newParams);

    const searchParams = new URLSearchParams();
    searchParams.set('view', view);
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) searchParams.set(k, v);
    });

    const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
    window.history.pushState(null, '', newUrl);
  };

  const handleBackHome = () => {
    handleNavigate('home');
  };

  if (currentView === 'host') {
    return <HostView roomCode={params.code || 'JEOP-DEMO'} onLeave={handleBackHome} />;
  }

  if (currentView === 'player') {
    return (
      <PlayerView
        roomCode={params.code || 'JEOP-DEMO'}
        playerId={params.playerId || 'local-player'}
        playerName={params.playerName || 'Contestant'}
        colorHex={params.colorHex || '#3B82F6'}
        onLeave={handleBackHome}
      />
    );
  }

  if (currentView === 'tv') {
    return <TvView roomCode={params.code || 'JEOP-DEMO'} onLeave={handleBackHome} />;
  }

  if (currentView === 'builder') {
    return <BuilderView onBack={handleBackHome} />;
  }

  return <HomeView onNavigate={handleNavigate} />;
}

export default App;
