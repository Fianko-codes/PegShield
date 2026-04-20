import { fetchOracleState } from './_lib/oracle.js';

export default async function handler(req, res) {
  try {
    const lstId = req?.query?.lst_id ?? req?.query?.lst ?? undefined;
    const payload = await fetchOracleState({ lstId });
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch oracle state',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
