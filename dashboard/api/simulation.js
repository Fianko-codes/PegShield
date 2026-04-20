import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function handler(_req, res) {
  try {
    // Try multiple paths for compatibility with Vercel and local dev
    const candidates = [
      path.join(__dirname, '..', 'public', 'data', 'stress_scenario.json'),
      path.join(process.cwd(), 'public', 'data', 'stress_scenario.json'),
      path.join(process.cwd(), 'dashboard', 'public', 'data', 'stress_scenario.json'),
    ];

    let raw = null;
    let usedPath = null;
    for (const candidate of candidates) {
      try {
        raw = await fs.readFile(candidate, 'utf8');
        usedPath = candidate;
        break;
      } catch {
        // Try next path
      }
    }

    if (!raw) {
      throw new Error(`File not found in any of: ${candidates.join(', ')}`);
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json(JSON.parse(raw));
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load simulation snapshot',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

