import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvConfig } from './src/server/config/env.js';
import { getDb } from './src/server/db/database.js';
import { initializeDatabaseIfEmpty } from './src/server/db/seed.js';
import { createApiRouter } from './src/server/routes/api.js';

async function startServer() {
  const env = loadEnvConfig();
  const db = getDb();
  initializeDatabaseIfEmpty(db);

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.use('/api/v1', createApiRouter());

  const isProd = env.nodeEnv === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (isProd && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(env.port, env.host, () => {
    console.log(`ASTROSAGE server listening on http://${env.host}:${env.port} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ASTROSAGE server:', err);
  process.exit(1);
});
