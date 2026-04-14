import { fetchOracleState } from './_lib/oracle.js';

export default async function handler(_req, res) {
  try {
    const payload = await fetchOracleState();
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch oracle state',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

