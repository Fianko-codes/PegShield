.PHONY: help install verify-offline verify-devnet test-engine test-sdk test-gate build-sdk build-cli check-program frontier-proof multi-attester-demo scenario-lab demo-dry-run demo artifacts anchor-test security-scan

help:
	@printf '%s\n' "PegShield operator targets"
	@printf '%s\n' ""
	@printf '%s\n' "  make install         Install Python, SDK, CLI, updater, and Anchor test deps"
	@printf '%s\n' "  make verify-offline Verify code paths that do not require live Solana writes"
	@printf '%s\n' "  make verify-devnet  Run offline checks plus Anchor devnet tests"
	@printf '%s\n' "  make test-gate      Run PegShield Gate policy unit tests"
	@printf '%s\n' "  make frontier-proof Print the judge-facing proof that static LTV fails and PegShield tightens"
	@printf '%s\n' "  make multi-attester-demo Print the 2-of-3 bonded attester finalization proof"
	@printf '%s\n' "  make scenario-lab    Print all historical/synthetic stress scenario outcomes"
	@printf '%s\n' "  make demo-dry-run   Validate the seven-step demo command wiring"
	@printf '%s\n' "  make demo           Run the live demo path, including devnet submit"
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
	@./scripts/validate_submission.sh

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

frontier-proof:
	@npm --prefix cli run start -- frontier-proof

multi-attester-demo:
	@npm --prefix cli run start -- multi-attester-proof

scenario-lab:
	@npm --prefix cli run start -- scenario-lab

anchor-test:
	@npm --prefix solana-program test

demo-dry-run:
	@./demo.sh --dry-run

demo:
	@./demo.sh

artifacts:
	@.venv/bin/python scripts/regenerate_artifacts.py
	@.venv/bin/python scripts/build_steth_case_study.py

security-scan:
	@./scripts/validate_submission.sh --security-only
