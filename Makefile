.PHONY: help install verify-offline verify-devnet test-engine test-sdk test-gate build-sdk build-cli check-program policy-proof attester-proof scenario-lab cycle-dry-run run-cycle artifacts anchor-test security-scan

help:
	@printf '%s\n' "PegShield operator targets"
	@printf '%s\n' ""
	@printf '%s\n' "  make install         Install Python, SDK, CLI, updater, and Anchor test deps"
	@printf '%s\n' "  make verify-offline Verify code paths that do not require live Solana writes"
	@printf '%s\n' "  make verify-devnet  Run offline checks plus Anchor devnet tests"
	@printf '%s\n' "  make test-gate      Run PegShield Gate policy unit tests"
	@printf '%s\n' "  make policy-proof   Print the borrow-policy proof that static LTV fails and PegShield tightens"
	@printf '%s\n' "  make attester-proof Print the 2-of-3 bonded attester finalization proof"
	@printf '%s\n' "  make scenario-lab    Print all historical/synthetic stress scenario outcomes"
	@printf '%s\n' "  make cycle-dry-run  Validate the oracle update cycle wiring"
	@printf '%s\n' "  make run-cycle      Run the live oracle update cycle, including devnet submit"
	@printf '%s\n' "  make artifacts      Regenerate the committed oracle/stress artifacts"
	@printf '%s\n' "  make security-scan  Check for common local-only or secret files"

install:
	@test -d .venv || python -m venv .venv
	@.venv/bin/pip install -r requirements.txt
	@npm --prefix sdk install
	@npm --prefix cli install
	@npm --prefix updater install
	@npm --prefix solana-program install

verify-offline:
	@./scripts/validate_protocol.sh

verify-devnet: verify-offline anchor-test

test-engine:
	@.venv/bin/python -m unittest tests.test_core_engine -v

test-sdk:
	@npm --prefix sdk test

test-gate:
	@cd solana-program && cargo test -p mock-lender

build-sdk:
	@npm --prefix sdk run build

build-cli:
	@npm --prefix cli run build

check-program:
	@cd solana-program && cargo check

policy-proof:
	@npm --prefix cli run start -- policy-proof

attester-proof:
	@npm --prefix cli run start -- multi-attester-proof

scenario-lab:
	@npm --prefix cli run start -- scenario-lab

anchor-test:
	@npm --prefix solana-program test

cycle-dry-run:
	@./scripts/run_oracle_cycle.sh --dry-run

run-cycle:
	@./scripts/run_oracle_cycle.sh

artifacts:
	@.venv/bin/python scripts/regenerate_artifacts.py
	@.venv/bin/python scripts/build_steth_case_study.py

security-scan:
	@./scripts/validate_protocol.sh --security-only
