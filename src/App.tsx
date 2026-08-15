import { useState } from 'react';

import { useGeneration } from './hooks/use-generation';
import { HomePage } from './pages/HomePage';
import { HistoryDetailPage } from './pages/HistoryDetailPage';
import { HistoryPage } from './pages/HistoryPage';
import './styles/tokens.css';
import './styles/global.css';

type Route =
  | { name: 'home' }
  | { name: 'history' }
  | { name: 'history-detail'; recordId: string };

export default function App() {
  const generation = useGeneration();
  const [route, setRoute] = useState<Route>({ name: 'home' });

  if (route.name === 'history') {
    return (
      <HistoryPage
        onBack={() => setRoute({ name: 'home' })}
        onSelectRecord={(recordId) => setRoute({ name: 'history-detail', recordId })}
      />
    );
  }

  if (route.name === 'history-detail') {
    return (
      <HistoryDetailPage
        recordId={route.recordId}
        onBack={() => setRoute({ name: 'history' })}
        onRegenerate={(record) => {
          generation.restoreFromHistory(record);
          setRoute({ name: 'home' });
        }}
      />
    );
  }

  return (
    <HomePage
      generationController={generation}
      onOpenHistory={() => setRoute({ name: 'history' })}
    />
  );
}
