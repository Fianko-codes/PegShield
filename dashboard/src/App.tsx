import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import RootLayout from './layouts/RootLayout';
import ScrollToTop from './components/ScrollToTop';
import type { OracleSnapshot, RiskState } from './types';
import { fetchOracleSnapshot, getFallbackRiskState } from './lib/data';
import { DEFAULT_LST_ID, normalizeLstId } from './lib/assets';

const Home = lazy(() => import('./pages/Home'));
const AppPage = lazy(() => import('./pages/AppPage'));
const SimPage = lazy(() => import('./pages/SimPage'));

function RouteFallback() {
  return (
    <div className="py-12">
      <div className="border border-zinc-800 bg-black p-6 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
        Loading route…
      </div>
    </div>
  );
}

export default function App() {
  const [selectedLstId, setSelectedLstId] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_LST_ID;
    }
    return normalizeLstId(new URLSearchParams(window.location.search).get('lst'));
  });
  const [oracleSnapshot, setOracleSnapshot] = useState<OracleSnapshot | null>(null);
  const [riskState, setRiskState] = useState<RiskState>(getFallbackRiskState(selectedLstId));
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set('lst', selectedLstId);
    window.history.replaceState({}, '', url);
  }, [selectedLstId]);

  useEffect(() => {
    let cancelled = false;
    setOracleSnapshot(null);
    setRiskState(getFallbackRiskState(selectedLstId));
    setApiError(null);

    const load = async () => {
      console.log(`[App] Fetching oracle data for ${selectedLstId}...`);
      const snapshot = await fetchOracleSnapshot(selectedLstId);
      setLastFetchTime(Date.now());

      if (cancelled) {
        return;
      }

      if (!snapshot) {
        setApiError('API returned null - check console for errors');
        console.error('[App] fetchOracleSnapshot returned null');
        return;
      }

      console.log('[App] Got live data:', {
        source: snapshot.source,
        timestamp: snapshot.timestamp,
        theta: snapshot.theta,
        suggested_ltv: snapshot.suggested_ltv
      });

      setApiError(null);
      setOracleSnapshot(snapshot);
      setRiskState({
        lst_id: snapshot.lst_id,
        theta: snapshot.theta,
        sigma: snapshot.sigma,
        regime_flag: snapshot.regime_flag,
        suggested_ltv: snapshot.suggested_ltv,
        z_score: snapshot.z_score,
        spread: snapshot.spread_pct,
        timestamp: snapshot.timestamp,
      });
    };

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [selectedLstId]);

  // Show prominent error banner if API fails
  const errorBanner = apiError ? (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-900 border-b-2 border-red-500 px-4 py-3 text-center">
      <span className="font-mono text-sm text-white">
        API ERROR: {apiError} | Last attempt: {lastFetchTime ? new Date(lastFetchTime).toLocaleTimeString() : 'never'}
      </span>
    </div>
  ) : null;

  return (
    <BrowserRouter>
      {errorBanner}
      <ScrollToTop />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<RootLayout riskState={riskState} />}>
            <Route
              path="/"
              element={<Home riskState={riskState} oracleSnapshot={oracleSnapshot} />}
            />
            <Route
              path="/app"
              element={
                <AppPage
                  globalState={riskState}
                  oracleSnapshot={oracleSnapshot}
                  selectedLstId={selectedLstId}
                  onSelectLstId={setSelectedLstId}
                />
              }
            />
            <Route path="/sim" element={<SimPage />} />
          </Route>
        </Routes>
      </Suspense>
      <Analytics />
    </BrowserRouter>
  );
}
