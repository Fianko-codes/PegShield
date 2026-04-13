import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
CORE_ENGINE = ROOT / "core-engine"
SIMULATION = ROOT / "simulation"

for path in (str(CORE_ENGINE), str(SIMULATION)):
    if path not in sys.path:
        sys.path.insert(0, path)

from ou_model import estimate_ou_params
from regime_detector import detect_regime
from pipeline import build_risk_payload
from stress_test import evaluate_oracle, generate_stress_scenario


class CoreEngineMicroTests(unittest.TestCase):
    def test_estimate_ou_params_returns_positive_theta_and_sigma(self) -> None:
        rng = np.random.default_rng(7)
        values = [0.36]
        for _ in range(79):
            values.append(values[-1] + 0.08 * (0.365 - values[-1]) + rng.normal(0, 0.001))

        spread = pd.Series(values)
        params = estimate_ou_params(spread, dt_seconds=180)

        self.assertGreater(params["theta"], 0)
        self.assertGreater(params["sigma"], 0)

    def test_detect_regime_flags_nonstationary_extreme_series(self) -> None:
        trend = np.linspace(0.35, 0.47, 80)
        trend[-1] += 0.08
        result = detect_regime(pd.Series(trend))

        self.assertEqual(result["regime_flag"], 1)
        self.assertGreater(abs(result["z_score"]), 2.5)

    def test_pipeline_build_risk_payload_contract(self) -> None:
        history = []
        for idx in range(40):
            sol = 80.0 + idx * 0.02
            spread = 0.365 + np.sin(idx / 5) * 0.002
            msol = sol * (1 + spread)
            history.append(
                {
                    "timestamp": 1_700_000_000 + idx * 180,
                    "msol_usd_price": msol,
                    "sol_usd_price": sol,
                    "msol_confidence": 0.04,
                    "sol_confidence": 0.03,
                    "msol_sol_ratio": msol / sol,
                    "msol_sol_spread_pct": spread,
                }
            )

        bridge_payload = {
            "source": "test",
            "bridge_timestamp": "2026-01-01T00:00:00+00:00",
            "history": history,
        }

        payload = build_risk_payload(bridge_payload)

        self.assertEqual(payload["lst_id"], "mSOL")
        self.assertIn("theta", payload)
        self.assertIn("sigma", payload)
        self.assertIn("z_score", payload)
        self.assertGreaterEqual(payload["suggested_ltv"], 0.4)
        self.assertLessEqual(payload["suggested_ltv"], 0.8)

    def test_stress_simulation_outputs_expected_columns(self) -> None:
        bridge_payload = {
            "history": [
                {
                    "timestamp": 1_700_000_000 + idx * 180,
                    "msol_usd_price": (80 + idx * 0.01) * 1.365,
                    "sol_usd_price": 80 + idx * 0.01,
                    "msol_confidence": 0.05,
                    "sol_confidence": 0.03,
                    "msol_sol_ratio": 1.365,
                    "msol_sol_spread_pct": 0.365 + np.sin(idx / 8) * 0.001,
                }
                for idx in range(45)
            ]
        }

        scenario = generate_stress_scenario(bridge_payload, periods=18)
        evaluated = evaluate_oracle(scenario, bridge_payload)

        for column in [
            "ltv_with_oracle",
            "ltv_no_oracle",
            "bad_debt_with_oracle",
            "bad_debt_no_oracle",
            "regime_flag",
        ]:
            self.assertIn(column, evaluated.columns)


if __name__ == "__main__":
    unittest.main()
