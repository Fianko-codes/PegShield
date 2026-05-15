#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECURITY_ONLY=0

if [[ "${1:-}" == "--security-only" ]]; then
  SECURITY_ONLY=1
fi

need_file() {
  local target="$1"
  if [[ ! -f "$ROOT_DIR/$target" ]]; then
    echo "missing required file: $target" >&2
    exit 1
  fi
}

need_dir() {
  local target="$1"
  if [[ ! -d "$ROOT_DIR/$target" ]]; then
    echo "missing required directory: $target" >&2
    exit 1
  fi
}

run() {
  local label="$1"
  shift
  printf '\n==> %s\n' "$label"
  (cd "$ROOT_DIR" && "$@")
}

security_scan() {
  printf '\n==> security scan\n'

  local leaked=0
  while IFS= read -r tracked; do
    case "$tracked" in
      .env.example)
        ;;
      .env|.env.*|updater/keypair.json|*.pem|*.key)
        echo "tracked secret-like file: $tracked" >&2
        leaked=1
        ;;
    esac
  done < <(cd "$ROOT_DIR" && git ls-files)

  if [[ -f "$ROOT_DIR/updater/keypair.json" ]]; then
    echo "local updater/keypair.json exists; keep it untracked and out of artifacts"
  fi

  if [[ "$leaked" -ne 0 ]]; then
    exit 1
  fi
}

check_artifacts() {
  printf '\n==> artifact presence\n'
  need_file artifacts/oracle_state.json
  need_file artifacts/oracle_state.mSOL-v2.json
  need_file artifacts/oracle_state.jitoSOL-v1.json
  need_file artifacts/oracle_state.bSOL-v1.json
  need_file artifacts/bridge_cache.mSOL-v2.json
  need_file artifacts/bridge_cache.jitoSOL-v1.json
  need_file artifacts/bridge_cache.bSOL-v1.json
  need_file artifacts/stress_scenario.json
  need_file docs/case-studies/steth-june-2022.md
  need_dir solana-program/programs/mock-lender
  need_dir cli
  need_dir sdk

  "$ROOT_DIR/.venv/bin/python" - <<'PY'
import json
from pathlib import Path

root = Path.cwd()
for path in [
    root / "artifacts" / "oracle_state.json",
    root / "artifacts" / "oracle_state.mSOL-v2.json",
    root / "artifacts" / "oracle_state.jitoSOL-v1.json",
    root / "artifacts" / "oracle_state.bSOL-v1.json",
]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    risk = payload.get("data_quality_risk")
    if not isinstance(risk, dict):
        raise SystemExit(f"{path} missing data_quality_risk")
    if "haircut" not in risk or "components" not in risk or "inputs" not in risk:
        raise SystemExit(f"{path} has incomplete data_quality_risk")
PY
}

security_scan

if [[ "$SECURITY_ONLY" -eq 1 ]]; then
  exit 0
fi

need_file .venv/bin/python
need_file sdk/package.json
need_file cli/package.json
need_file solana-program/Cargo.toml
need_file scripts/run_oracle_cycle.sh

run "engine micro-tests" "$ROOT_DIR/.venv/bin/python" -m unittest tests.test_core_engine -v
run "sdk tests" npm --prefix sdk test
run "cli tests" npm --prefix cli test
run "stETH case study build" "$ROOT_DIR/.venv/bin/python" scripts/build_steth_case_study.py --output /tmp/pegshield-steth-case-study.md
run "sdk build" npm --prefix sdk run build
run "cli build" npm --prefix cli run build
run "borrow policy proof command" npm --prefix cli run start -- policy-proof
run "multi-attester proof command" npm --prefix cli run start -- multi-attester-proof
run "scenario lab command" npm --prefix cli run start -- scenario-lab
run "rust program check" bash -lc "cd solana-program && cargo check"
run "PegShield Gate unit tests" bash -lc "cd solana-program && cargo test -p mock-lender"
run "oracle cycle dry-run wiring" ./scripts/run_oracle_cycle.sh --dry-run
check_artifacts

printf '\nProtocol validation passed.\n'
