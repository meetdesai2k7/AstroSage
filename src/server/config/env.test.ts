import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublicEnvSummary, loadEnvConfig } from './env';

test('loadEnvConfig fetches custom environment variables and falls back safely on empty/invalid values', () => {
  const custom = loadEnvConfig({
    PORT: '4100',
    ASTROSAGE_HOST: '127.0.0.1',
    ASTROSAGE_DB_PATH: '/tmp/test.db',
    OLLAMA_BASE_URL: 'http://127.0.0.1:11435',
    OLLAMA_MODEL: 'llama3.2:3b',
    OLLAMA_TIMEOUT_MS: '12000',
    NODE_ENV: 'production',
    APP_URL: 'http://localhost:4100',
  });

  assert.equal(custom.port, 4100);
  assert.equal(custom.host, '127.0.0.1');
  assert.equal(custom.dbPath, '/tmp/test.db');
  assert.equal(custom.ollamaBaseUrl, 'http://127.0.0.1:11435');
  assert.equal(custom.ollamaModel, 'llama3.2:3b');
  assert.equal(custom.ollamaTimeoutMs, 12000);
  assert.equal(custom.nodeEnv, 'production');
  assert.equal(custom.appUrl, 'http://localhost:4100');

  const fallback = loadEnvConfig({ PORT: 'invalid', OLLAMA_TIMEOUT_MS: '50' });
  assert.equal(fallback.port, 3000);
  assert.equal(fallback.ollamaTimeoutMs, 25000);
});

test('getPublicEnvSummary marks process.env vs default sources cleanly without leaking secrets', () => {
  const summary = getPublicEnvSummary({ OLLAMA_MODEL: 'qwen2.5:7b', GEMINI_API_KEY: 'super-secret' });
  const modelEntry = summary.find((s) => s.key === 'OLLAMA_MODEL');
  const hostEntry = summary.find((s) => s.key === 'ASTROSAGE_HOST');

  assert.equal(modelEntry?.value, 'qwen2.5:7b');
  assert.equal(modelEntry?.source, 'process.env');
  assert.equal(hostEntry?.source, 'default');
  assert.equal(summary.some((s) => s.key === 'GEMINI_API_KEY'), false);
});
