import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import RootLayout from './layouts/RootLayout';
import ScrollToTop from './components/ScrollToTop';
import type { OracleSnapshot, RiskState } from './types';
import { fetchOracleSnapshot, getFallbackRiskState } from './lib/data';

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
  const [oracleSnapshot, setOracleSnapshot] = useState<OracleSnapshot | null>(null);
  const [riskState, setRiskState] = useState<RiskState>(getFallbackRiskState());

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const snapshot = await fetchOracleSnapshot();
      if (!snapshot || cancelled) {
        return;
      }

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
  }, []);

  return (
    <BrowserRouter>
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
              element={<AppPage globalState={riskState} oracleSnapshot={oracleSnapshot} />}
            />
            <Route path="/sim" element={<SimPage />} />
          </Route>
        </Routes>
      </Suspense>
      <Analytics />
    </BrowserRouter>
  );
}
