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
  need_file artifacts/stress_scenario.json
  need_dir solana-program/programs/mock-lender
  need_dir cli
  need_dir sdk
}

security_scan

if [[ "$SECURITY_ONLY" -eq 1 ]]; then
  exit 0
fi

need_file .venv/bin/python
need_file sdk/package.json
need_file cli/package.json
need_file solana-program/Cargo.toml
need_file demo.sh

run "engine micro-tests" "$ROOT_DIR/.venv/bin/python" -m unittest tests.test_core_engine -v
run "sdk tests" npm --prefix sdk test
run "sdk build" npm --prefix sdk run build
run "cli build" npm --prefix cli run build
run "rust program check" bash -lc "cd solana-program && cargo check"
run "demo dry-run wiring" ./demo.sh --dry-run
check_artifacts

printf '\nSubmission validation passed.\n'
