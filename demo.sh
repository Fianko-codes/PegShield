#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=0

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

require_file() {
  local target="$1"
  if [[ ! -f "$ROOT_DIR/$target" ]]; then
    echo "Missing required file: $target" >&2
    exit 1
  fi
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

run_step() {
  local label="$1"
  shift
  echo "$label"
  if (( DRY_RUN )); then
    printf '  [dry-run] '
    printf '%q ' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

require_command npm
require_command node
require_file ".venv/bin/python"
require_file "updater/package.json"

if (( ! DRY_RUN )); then
  require_file ".env"
  require_file "sdk/dist/index.js"
fi

run_step "▶ 1/7  verify engine tests" \
  "$ROOT_DIR/.venv/bin/python" -m unittest tests.test_core_engine -v

run_step "▶ 2/7  fetch live Pyth + Marinade" \
  "$ROOT_DIR/.venv/bin/python" "$ROOT_DIR/bridge/fetch_pyth.py"

run_step "▶ 3/7  run statistical engine" \
  "$ROOT_DIR/.venv/bin/python" "$ROOT_DIR/core-engine/pipeline.py"

run_step "▶ 4/7  push update on-chain (devnet)" \
  npm --prefix "$ROOT_DIR/updater" run submit

run_step "▶ 5/7  read PDA back through SDK" \
  env NODE_PATH="$ROOT_DIR/updater/node_modules" node -e '
const { Connection } = require("@solana/web3.js");
const { fetchRiskState } = require("./sdk/dist");

(async () => {
  const { state, address } = await fetchRiskState(
    new Connection("https://api.devnet.solana.com", "confirmed"),
  );
  console.log(
    JSON.stringify(
      { pda: address.toBase58(), ...state },
      (_, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
'

run_step "▶ 6/7  replay real stETH depeg" \
  "$ROOT_DIR/.venv/bin/python" "$ROOT_DIR/simulation/stress_test.py"

run_step "▶ 7/7  sync oracle artifacts" \
  "$ROOT_DIR/.venv/bin/python" "$ROOT_DIR/scripts/sync_artifacts.py"

echo
if (( DRY_RUN )); then
  echo "✅ dry run passed. oracle artifacts written to ./artifacts/"
else
  echo "✅ done. oracle artifacts written to ./artifacts/"
fi
