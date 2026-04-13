/**
 * IBD CDS mock API server
 *
 * Serves the same mock fixtures that the frontend uses when VITE_CDS_API_URL is
 * absent, but over HTTP so you can point a real VITE_CDS_API_URL at it and test
 * network-path code paths (error handling, loading states, throttle behavior).
 *
 * ── Configuration (environment variables) ───────────────────────────────────
 *
 *   PORT          Listening port.                        Default: 3001
 *   CDS_DELAY_MS  Base response delay in milliseconds.   Default: 0
 *   CDS_JITTER_MS Additional random delay (0..N ms).     Default: 0
 *                 Total delay = CDS_DELAY_MS + rand(0, CDS_JITTER_MS)
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   # Install once
 *   cd server && npm install
 *
 *   # Start with defaults (no delay)
 *   npm start
 *
 *   # Simulate a slow network: 800 ms base + up to 400 ms jitter
 *   CDS_DELAY_MS=800 CDS_JITTER_MS=400 npm start
 *
 *   # In your Vite project:
 *   VITE_CDS_API_URL=http://localhost:3001 npm run dev
 */

import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

// Load .env from the project root (one level above this server/ directory).
// Must run before any process.env reads.
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

import express, { type Request, type Response, type NextFunction } from 'express';
import { readFileSync } from 'fs';

// ── Config ───────────────────────────────────────────────────────────────────

const PORT      = parseInt(process.env.PORT          ?? '3003', 10);
const DELAY_MS  = parseInt(process.env.CDS_DELAY_MS  ?? '0',    10);
const JITTER_MS = parseInt(process.env.CDS_JITTER_MS ?? '0',    10);

// ── Fixtures ─────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_DIR  = join(__dirname, '../src/modules/ibd/mock');

function loadJson(filename: string): unknown {
    return JSON.parse(readFileSync(join(MOCK_DIR, filename), 'utf8'));
}

const fixtures = {
    cohortEpisode:   loadJson('cohort-episode.json'),
    cohortAggregate: loadJson('cohort-aggregate.json'),
    patientNote:     loadJson('patient-note.json'),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function computeDelay(): number {
    const jitter = JITTER_MS > 0 ? Math.floor(Math.random() * (JITTER_MS + 1)) : 0;
    return DELAY_MS + jitter;
}

function formatDelay(ms: number): string {
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();

// CORS — allow requests from the Vite dev server on any origin
app.use((_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
});

// Request logger
app.use((req: Request, _res: Response, next: NextFunction): void => {
    process.stdout.write(`  ${req.method} ${req.url}\n`);
    next();
});

// ── Throttle ─────────────────────────────────────────────────────────────────

async function throttle(_req: Request, _res: Response, next: NextFunction): Promise<void> {
    const delay = computeDelay();
    if (delay > 0) {
        process.stdout.write(`    ↳ throttled ${formatDelay(delay)}\n`);
        await sleep(delay);
    }
    next();
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/ibd/cohort', throttle, (req: Request, res: Response): void => {
    const tier = req.query['tier'] === 'aggregate' ? 'aggregate' : 'episode';
    res.json(tier === 'aggregate' ? fixtures.cohortAggregate : fixtures.cohortEpisode);
});

app.get('/ibd/note', throttle, (_req: Request, res: Response): void => {
    res.json(fixtures.patientNote);
});

app.get('/health', (_req: Request, res: Response): void => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, (): void => {
    console.log(`\nIBD CDS mock API  →  http://localhost:${PORT}`);
    console.log('');
    console.log('  Endpoints:');
    console.log(`    GET /ibd/cohort?patient=<id>&tier=episode|aggregate`);
    console.log(`    GET /ibd/note?patient=<id>`);
    console.log(`    GET /health`);
    console.log('');

    if (DELAY_MS > 0 || JITTER_MS > 0) {
        console.log(`  Throttle: ${formatDelay(DELAY_MS)} base + up to ${formatDelay(JITTER_MS)} jitter`);
        console.log('');
    }

    console.log('  Set in your Vite project:');
    console.log(`    VITE_CDS_API_URL=http://localhost:${PORT}`);
    console.log('');
    console.log('  Requests:');
});
