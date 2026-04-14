const DEFAULT_PYTH_HTTP_URL = 'https://hermes.pyth.network';
const MSOL_USD_FEED_ID =
  '0xc2289a6a43d2ce91c6f55caec370f4acc38a2ed477f58813334c6d03749ff2a4';
const SOL_USD_FEED_ID =
  '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';

function decodePrice(price) {
  return Number(price.price) * 10 ** Number(price.expo);
}

export default async function handler(_req, res) {
  try {
    const baseUrl = process.env.PYTH_HTTP_URL || DEFAULT_PYTH_HTTP_URL;
    const url = new URL('/v2/updates/price/latest', baseUrl);
    url.searchParams.set('ids[]', MSOL_USD_FEED_ID);
    url.searchParams.set('ids[]', SOL_USD_FEED_ID);
    url.searchParams.set('parsed', 'true');

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Hermes request failed with ${response.status}`);
    }

    const payload = await response.json();
    const feeds = payload.parsed ?? [];

    const msolFeed = feeds.find((feed) => feed.id === MSOL_USD_FEED_ID);
    const solFeed = feeds.find((feed) => feed.id === SOL_USD_FEED_ID);
    if (!msolFeed?.price || !solFeed?.price) {
      throw new Error('Missing price feed payload');
    }

    const msolPrice = decodePrice(msolFeed.price);
    const solPrice = decodePrice(solFeed.price);
    const spreadPct = msolPrice / solPrice - 1;

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    res.status(200).json({
      msol_price: Number(msolPrice.toFixed(8)),
      sol_price: Number(solPrice.toFixed(8)),
      spread_pct: Number(spreadPct.toFixed(8)),
      publish_time: Math.max(
        Number(msolFeed.price.publish_time ?? 0),
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

