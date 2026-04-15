/**
 * Re-export of the Anchor IDL for the `risk_oracle` program.
 *
 * Shipped alongside the SDK so consumers can initialise an `anchor.Program`
 * without pinning a separate IDL artifact.
 *
 * The IDL JSON is kept in sync with `solana-program/idl/risk_oracle.json`.
 */
import idlJson from "../idl/risk_oracle.json";

export const RISK_ORACLE_IDL = idlJson;
export type RiskOracleIdl = typeof idlJson;

export default RISK_ORACLE_IDL;
