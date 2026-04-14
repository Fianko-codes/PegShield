import fs from 'node:fs/promises';
import path from 'node:path';

export default async function handler(_req, res) {
  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'stress_scenario.json');
    const raw = await fs.readFile(filePath, 'utf8');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json(JSON.parse(raw));
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load simulation snapshot',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

