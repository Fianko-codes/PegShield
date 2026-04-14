import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import RootLayout from './layouts/RootLayout';
import Home from './pages/Home';
import AppPage from './pages/AppPage';
import SimPage from './pages/SimPage';
import type { OracleSnapshot, RiskState } from './types';
import { fetchOracleSnapshot, getFallbackRiskState } from './lib/data';

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
      <Routes>
        <Route element={<RootLayout riskState={riskState} />}>
          <Route path="/" element={<Home />} />
          <Route 
            path="/app" 
            element={<AppPage globalState={riskState} oracleSnapshot={oracleSnapshot} />} 
          />
          <Route path="/sim" element={<SimPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
