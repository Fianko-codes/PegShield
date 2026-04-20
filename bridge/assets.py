from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AssetConfig:
    key: str
    lst_id: str
    asset_symbol: str
    asset_name: str
    market_feed_id: str
    reference_rate_kind: str
    reference_rate_fallback: float
    reference_rate_label: str
    base_symbol: str = "SOL"


MSOL = AssetConfig(
    key="msol",
    lst_id="mSOL-v2",
    asset_symbol="mSOL",
    asset_name="Marinade Staked SOL",
    market_feed_id="0xc2289a6a43d2ce91c6f55caec370f4acc38a2ed477f58813334c6d03749ff2a4",
    reference_rate_kind="marinade",
    reference_rate_fallback=1.17,
    reference_rate_label="Marinade exchange rate",
)

JITOSOL = AssetConfig(
    key="jitosol",
    lst_id="jitoSOL-v1",
    asset_symbol="jitoSOL",
    asset_name="Jito Staked SOL",
    market_feed_id="0x67be9f519b95cf24338801051f9a808eff0a578ccb388db73b7f6fe1de019ffb",
    reference_rate_kind="jito",
    reference_rate_fallback=1.27,
    reference_rate_label="Jito stake-pool exchange rate",
)

BSOL = AssetConfig(
    key="bsol",
    lst_id="bSOL-v1",
    asset_symbol="bSOL",
    asset_name="BlazeStake Staked SOL",
    market_feed_id="0x89875379e70f8fbadc17aef315adf3a8d5d160b811435537e03c97e8aac97d9c",
    reference_rate_kind="solblaze",
    reference_rate_fallback=1.18,
    reference_rate_label="BlazeStake stake-pool exchange rate",
)

SUPPORTED_ASSETS = {
    MSOL.key: MSOL,
    JITOSOL.key: JITOSOL,
    BSOL.key: BSOL,
}


def resolve_asset_config(asset: str | None = None, lst_id: str | None = None) -> AssetConfig:
    candidates = [asset, lst_id]
    for candidate in candidates:
        if not candidate:
            continue

        normalized = candidate.strip().lower()
        if normalized in SUPPORTED_ASSETS:
            return SUPPORTED_ASSETS[normalized]

        for config in SUPPORTED_ASSETS.values():
            if normalized == config.lst_id.lower():
                return config
            if normalized == config.asset_symbol.lower():
                return config
            if normalized.startswith(config.asset_symbol.lower()):
                return config

    return MSOL
