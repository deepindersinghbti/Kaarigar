import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

import { connectDb, closeDb } from './src/server/db';
import { registerRoutes } from './src/server/routes';

/**
 * Bootstrap only.
 *
 * Route handlers live in src/server/routes/*.ts, one file per Architecture
 * section 5 Tier 3 boundary, mounted by registerRoutes(). Adding an endpoint
 * should never require editing this file - if it seems to, the boundary is
 * probably wrong.
 */

const app = express();
const PORT = 3000;

app.use(express.json());

// Registered before any Vite/SPA handling below, so that root-level public
// routes (/p/:handle, /r/:token) are not shadowed by the SPA fallback.
registerRoutes(app);

async function startServer() {
  // Connect to Atlas before serving. Non-fatal by design: until the Day 3
  // migration the app is still served from localStorage, and the app must
  // remain runnable on every day of the schedule.
  await connectDb();

  // Vite middleware in dev mode
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kaarigar Saathi server running at http://0.0.0.0:${PORT}`);
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await closeDb();
    process.exit(0);
  });
}

startServer();
