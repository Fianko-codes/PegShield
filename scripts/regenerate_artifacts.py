#!/usr/bin/env python3
"""Regenerate all committed PegShield protocol artifacts from checked-in inputs."""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORE_ENGINE_DIR = ROOT / "core-engine"
if str(CORE_ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(CORE_ENGINE_DIR))

from pipeline import build_risk_payload  # noqa: E402
from sync_artifacts import build_oracle_snapshot, build_simulation_snapshot  # noqa: E402

BRIDGE_DIR = ROOT / "bridge" / "data"
ENGINE_OUTPUT_DIR = ROOT / "core-engine" / "output"
ARTIFACTS_DIR = ROOT / "artifacts"
ENV_INPUT = ROOT / ".env"

ASSETS = ("mSOL-v2", "jitoSOL-v1", "bSOL-v1")
DEFAULT_LST_ID = "mSOL-v2"


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def regenerate_asset(lst_id: str) -> None:
    bridge_input = BRIDGE_DIR / f"latest_raw.{lst_id}.json"
    if not bridge_input.exists():
        raise FileNotFoundError(f"missing bridge input: {bridge_input}")

    bridge_payload = json.loads(bridge_input.read_text(encoding="utf-8"))
    risk_payload = build_risk_payload(bridge_payload, lst_id=lst_id)

    engine_output = ENGINE_OUTPUT_DIR / f"latest.{lst_id}.json"
    write_json(engine_output, risk_payload)

    snapshot = build_oracle_snapshot(engine_output, bridge_input, ENV_INPUT)
    artifact_output = ARTIFACTS_DIR / f"oracle_state.{lst_id}.json"
    write_json(artifact_output, snapshot)

    bridge_cache_output = ARTIFACTS_DIR / f"bridge_cache.{lst_id}.json"
    shutil.copyfile(bridge_input, bridge_cache_output)

    if lst_id == DEFAULT_LST_ID:
        write_json(ENGINE_OUTPUT_DIR / "latest.json", risk_payload)
        shutil.copyfile(bridge_input, BRIDGE_DIR / "latest_raw.json")
        write_json(ARTIFACTS_DIR / "oracle_state.json", snapshot)

    print(f"Regenerated {lst_id}: {artifact_output.relative_to(ROOT)}")


def main() -> None:
    for lst_id in ASSETS:
        regenerate_asset(lst_id)

    stress_output = ARTIFACTS_DIR / "stress_scenario.json"
    write_json(stress_output, build_simulation_snapshot())
    print(f"Regenerated {stress_output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
