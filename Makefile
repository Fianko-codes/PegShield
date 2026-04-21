.PHONY: help install verify-offline verify-devnet test-engine test-sdk build-sdk build-cli check-program demo-dry-run demo artifacts anchor-test security-scan

help:
	@printf '%s\n' "PegShield operator targets"
	@printf '%s\n' ""
	@printf '%s\n' "  make install         Install Python, SDK, CLI, updater, and Anchor test deps"
	@printf '%s\n' "  make verify-offline Verify code paths that do not require live Solana writes"
	@printf '%s\n' "  make verify-devnet  Run offline checks plus Anchor devnet tests"
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

build-sdk:
	@npm --prefix sdk run build

build-cli:
	@npm --prefix cli run build

check-program:
	@cd solana-program && cargo check

anchor-test:
	@npm --prefix solana-program test

demo-dry-run:
	@./demo.sh --dry-run

demo:
	@./demo.sh

artifacts:
	@.venv/bin/python simulation/stress_test.py
	@.venv/bin/python scripts/sync_artifacts.py
	@.venv/bin/python scripts/build_steth_case_study.py

security-scan:
	@./scripts/validate_submission.sh --security-only
