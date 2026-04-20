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
from stress_test import (
    build_simulation_bundle,
    evaluate_oracle,
    generate_stress_scenario,
    load_historical_replay,
)


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
        marinade_rate = 1.17
        history = []
        for idx in range(40):
            sol = 80.0 + idx * 0.02
            peg_deviation = 0.001 * np.sin(idx / 5)
            market_ratio = marinade_rate * (1 + peg_deviation)
            msol = sol * market_ratio
            history.append(
                {
                    "timestamp": 1_700_000_000 + idx * 180,
                    "msol_usd_price": msol,
                    "sol_usd_price": sol,
                    "msol_confidence": 0.04,
                    "sol_confidence": 0.03,
                    "msol_sol_ratio": market_ratio,
                    "msol_sol_spread_pct": (msol - sol) / sol,
                    "peg_deviation": peg_deviation,
                }
            )

        bridge_payload = {
            "source": "test",
            "bridge_timestamp": "2026-01-01T00:00:00+00:00",
            "marinade_msol_sol_rate": marinade_rate,
            "marinade_rate_source": "test-fixture",
            "history": history,
        }

        payload = build_risk_payload(bridge_payload, lst_id="mSOL-v2")

        self.assertEqual(payload["lst_id"], "mSOL-v2")
        self.assertIn("theta", payload)
        self.assertIn("sigma", payload)
        self.assertIn("z_score", payload)
        self.assertEqual(payload["spread_signal"], "peg_deviation")
        self.assertIsNotNone(payload["peg_deviation_pct"])
        self.assertEqual(payload["marinade_msol_sol_rate"], marinade_rate)
        self.assertGreaterEqual(payload["suggested_ltv"], 0.4)
        self.assertLessEqual(payload["suggested_ltv"], 0.8)
        self.assertEqual(payload["asset_symbol"], "mSOL")
        self.assertEqual(payload["reference_rate_source"], "test-fixture")

    def test_pipeline_build_risk_payload_contract_for_jitosol(self) -> None:
        reference_rate = 1.27363
        history = []
        for idx in range(40):
            sol = 145.0 + idx * 0.05
            peg_deviation = -0.0008 * np.cos(idx / 6)
            market_ratio = reference_rate * (1 + peg_deviation)
            asset = sol * market_ratio
            history.append(
                {
                    "timestamp": 1_700_100_000 + idx * 300,
                    "asset_usd_price": asset,
                    "sol_usd_price": sol,
                    "asset_confidence": 0.05,
                    "sol_confidence": 0.03,
                    "asset_sol_ratio": market_ratio,
                    "asset_sol_spread_pct": (asset - sol) / sol,
                    "peg_deviation": peg_deviation,
                }
            )

        bridge_payload = {
            "source": "test",
            "lst_id": "jitoSOL-v1",
            "asset_symbol": "jitoSOL",
            "asset_display_name": "Jito Staked SOL",
            "base_symbol": "SOL",
            "bridge_timestamp": "2026-01-01T00:00:00+00:00",
            "asset_sol_reference_rate": reference_rate,
            "reference_rate_source": "jito-kobe-api",
            "history": history,
        }

        payload = build_risk_payload(bridge_payload, lst_id="jitoSOL-v1")

        self.assertEqual(payload["lst_id"], "jitoSOL-v1")
        self.assertEqual(payload["asset_symbol"], "jitoSOL")
        self.assertEqual(payload["base_symbol"], "SOL")
        self.assertAlmostEqual(payload["reference_rate"], reference_rate, places=5)
        self.assertEqual(payload["reference_rate_source"], "jito-kobe-api")
        self.assertGreaterEqual(payload["asset_price"], payload["sol_price"])
        self.assertEqual(payload["spread_signal"], "peg_deviation")

    def test_pipeline_build_risk_payload_contract_for_bsol(self) -> None:
        reference_rate = 1.1824
        history = []
        for idx in range(40):
            sol = 132.0 + idx * 0.04
            peg_deviation = 0.0006 * np.sin(idx / 4)
            asset = sol * reference_rate * (1 + peg_deviation)
            history.append(
                {
                    "timestamp": 1_700_200_000 + idx * 300,
                    "asset_usd_price": asset,
                    "sol_usd_price": sol,
                    "asset_confidence": 0.04,
                    "sol_confidence": 0.03,
                    "asset_sol_ratio": reference_rate * (1 + peg_deviation),
                    "asset_sol_spread_pct": (asset - sol) / sol,
                    "peg_deviation": peg_deviation,
                }
            )

        bridge_payload = {
            "source": "test",
            "lst_id": "bSOL-v1",
            "asset_symbol": "bSOL",
            "asset_display_name": "BlazeStake Staked SOL",
            "base_symbol": "SOL",
            "bridge_timestamp": "2026-01-01T00:00:00+00:00",
            "asset_sol_reference_rate": reference_rate,
            "reference_rate_source": "solblaze-stake-pool-rpc",
            "history": history,
        }

        payload = build_risk_payload(bridge_payload, lst_id="bSOL-v1")

        self.assertEqual(payload["lst_id"], "bSOL-v1")
        self.assertEqual(payload["asset_symbol"], "bSOL")
        self.assertEqual(payload["asset_display_name"], "BlazeStake Staked SOL")
        self.assertAlmostEqual(payload["reference_rate"], reference_rate, places=5)
        self.assertEqual(payload["reference_rate_source"], "solblaze-stake-pool-rpc")
        self.assertEqual(payload["spread_signal"], "peg_deviation")

    def test_stress_simulation_outputs_expected_columns(self) -> None:
        marinade_rate = 1.17
        bridge_payload = {
            "marinade_msol_sol_rate": marinade_rate,
            "marinade_rate_source": "test-fixture",
            "history": [
                {
                    "timestamp": 1_700_000_000 + idx * 180,
                    "msol_usd_price": (80 + idx * 0.01)
                    * marinade_rate
                    * (1 + 0.001 * np.sin(idx / 8)),
                    "sol_usd_price": 80 + idx * 0.01,
                    "msol_confidence": 0.05,
                    "sol_confidence": 0.03,
                    "msol_sol_ratio": marinade_rate * (1 + 0.001 * np.sin(idx / 8)),
                    "msol_sol_spread_pct": (
                        marinade_rate * (1 + 0.001 * np.sin(idx / 8)) - 1.0
                    ),
                    "peg_deviation": 0.001 * np.sin(idx / 8),
                }
                for idx in range(45)
            ],
        }

        scenario = generate_stress_scenario(bridge_payload, periods=18)
        evaluated = evaluate_oracle(scenario, bridge_payload)

        for column in [
            "peg_deviation",
            "ltv_with_oracle",
            "ltv_no_oracle",
            "shortfall_dynamic",
            "shortfall_static",
            "bad_debt_with_oracle",
            "bad_debt_no_oracle",
            "regime_flag",
        ]:
            self.assertIn(column, evaluated.columns)

        # Stress phase should push peg_deviation meaningfully negative.
        self.assertLess(evaluated["peg_deviation"].min(), -0.005)

    def test_historical_replay_fixture_evaluates_real_event(self) -> None:
        scenario, bridge_payload, metadata = load_historical_replay()
        evaluated = evaluate_oracle(scenario, bridge_payload)

        self.assertEqual(metadata["kind"], "historical")
        self.assertEqual(metadata["asset_symbol"], "stETH")
        self.assertEqual(metadata["base_symbol"], "ETH")
        self.assertGreater(len(evaluated), 20)
        self.assertLess(evaluated["peg_deviation"].min(), -0.05)
        self.assertGreater(int((evaluated["regime_flag"] == 1).sum()), 0)

    def test_historical_replay_oracle_outperforms_static(self) -> None:
        scenario, bridge_payload, _ = load_historical_replay()
        evaluated = evaluate_oracle(scenario, bridge_payload)
        final_row = evaluated.iloc[-1]

        shortfall_static_final = float(final_row["shortfall_static"])
        shortfall_dynamic_final = float(final_row["shortfall_dynamic"])

        self.assertGreater(shortfall_static_final, 0.0)
        self.assertLessEqual(shortfall_dynamic_final, 0.5 * shortfall_static_final)

    def test_simulation_bundle_contains_multiple_scenarios(self) -> None:
        marinade_rate = 1.17
        history = [
            {
                "timestamp": 1_700_000_000 + idx * 300,
                "asset_usd_price": (85 + idx * 0.02)
                * marinade_rate
                * (1 + 0.0012 * np.sin(idx / 7)),
                "msol_usd_price": (85 + idx * 0.02)
                * marinade_rate
                * (1 + 0.0012 * np.sin(idx / 7)),
                "sol_usd_price": 85 + idx * 0.02,
                "asset_confidence": 0.04,
                "msol_confidence": 0.04,
                "sol_confidence": 0.03,
                "asset_sol_ratio": marinade_rate * (1 + 0.0012 * np.sin(idx / 7)),
                "msol_sol_ratio": marinade_rate * (1 + 0.0012 * np.sin(idx / 7)),
                "asset_sol_spread_pct": marinade_rate * (1 + 0.0012 * np.sin(idx / 7)) - 1.0,
                "msol_sol_spread_pct": marinade_rate * (1 + 0.0012 * np.sin(idx / 7)) - 1.0,
                "peg_deviation": 0.0012 * np.sin(idx / 7),
            }
            for idx in range(48)
        ]
        bridge_payload = {
            "source": "test",
            "asset_symbol": "mSOL",
            "base_symbol": "SOL",
            "asset_sol_reference_rate": marinade_rate,
            "reference_rate_source": "test-fixture",
            "history": history,
        }

        with tempfile.NamedTemporaryFile("w+", suffix=".json") as bridge_file:
            bridge_file.write(json.dumps(bridge_payload))
            bridge_file.flush()

            bundle = build_simulation_bundle(
                input_path=Path(bridge_file.name),
                replay_path=SIMULATION / "data" / "steth_june_2022.json",
            )

        self.assertIn("scenarios", bundle)
        self.assertGreaterEqual(len(bundle["scenarios"]), 4)
        self.assertEqual(bundle["default_scenario_id"], "steth_june_2022")
        self.assertEqual(bundle["scenarios"][0]["id"], "steth_june_2022")
        self.assertIn("tagline", bundle["scenarios"][1])
        self.assertIn("highlights", bundle["scenarios"][2])
        self.assertIn("max_loss_prevented", bundle["scenarios"][0]["summary"])


if __name__ == "__main__":
    unittest.main()
