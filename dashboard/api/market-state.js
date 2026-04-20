import { resolveSupportedAsset } from './_lib/assets.js';

const DEFAULT_PYTH_HTTP_URL = 'https://hermes.pyth.network';
const SOL_USD_FEED_ID =
  '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';

function canonicalFeedId(feedId) {
  return String(feedId).toLowerCase().replace(/^0x/, '');
}

function normalizePrice(rawPrice) {
  return Number(rawPrice.price) * 10 ** Number(rawPrice.expo);
}

export default async function handler(req, res) {
  try {
    const asset = resolveSupportedAsset(req?.query?.lst_id ?? req?.query?.lst);
    const baseUrl = process.env.PYTH_HTTP_URL || DEFAULT_PYTH_HTTP_URL;
    const url = new URL('/api/latest_price_feeds', baseUrl);
    url.searchParams.set('ids[]', asset.marketFeedId);
    url.searchParams.append('ids[]', SOL_USD_FEED_ID);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Hermes request failed with ${response.status}`);
    }

    const feeds = await response.json();
    if (!Array.isArray(feeds)) {
      throw new Error('Unexpected Hermes response shape');
    }

    const byFeedId = new Map(
      feeds.map((feed) => [canonicalFeedId(feed.id), feed]),
    );
    const assetFeed = byFeedId.get(canonicalFeedId(asset.marketFeedId));
    const solFeed = byFeedId.get(canonicalFeedId(SOL_USD_FEED_ID));
    if (!assetFeed?.price || !solFeed?.price) {
      throw new Error('Missing price feed payload');
    }

    const assetPrice = normalizePrice(assetFeed.price);
    const solPrice = normalizePrice(solFeed.price);
    const spreadPct = assetPrice / solPrice - 1;

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    res.status(200).json({
      lst_id: asset.lstId,
      asset_symbol: asset.symbol,
      asset_price: Number(assetPrice.toFixed(8)),
      msol_price: Number(assetPrice.toFixed(8)),
      sol_price: Number(solPrice.toFixed(8)),
      spread_pct: Number(spreadPct.toFixed(8)),
      publish_time: Math.max(
        Number(assetFeed.price.publish_time ?? 0),
        Number(solFeed.price.publish_time ?? 0),
      ),
      source: 'pyth-hermes',
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch market state',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
