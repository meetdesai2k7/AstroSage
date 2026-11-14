import 'dotenv/config';

export interface RuntimeEnvVarInfo {
  key: string;
  value: string;
  source: 'process.env' | 'default';
  description: string;
}

export interface AstrosageEnvConfig {
  port: number;
  host: string;
  nodeEnv: string;
  dbPath: string;
  appUrl: string | null;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaTimeoutMs: number;
}

export function loadEnvConfig(envSource: NodeJS.ProcessEnv = process.env): AstrosageEnvConfig {
  const portRaw = envSource.PORT?.trim();
  const parsedPort = portRaw ? Number(portRaw) : 3000;
  const timeoutRaw = envSource.OLLAMA_TIMEOUT_MS?.trim();
  const parsedTimeout = timeoutRaw ? Number(timeoutRaw) : 25000;

  return {
    port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000,
    host: envSource.ASTROSAGE_HOST?.trim() || '0.0.0.0',
    nodeEnv: envSource.NODE_ENV?.trim() || 'development',
    dbPath: envSource.ASTROSAGE_DB_PATH?.trim() || 'data/astrosage.db',
    appUrl: envSource.APP_URL?.trim() || null,
    ollamaBaseUrl: envSource.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434',
    ollamaModel: envSource.OLLAMA_MODEL?.trim() || 'qwen2.5:3b',
    ollamaTimeoutMs: Number.isFinite(parsedTimeout) && parsedTimeout >= 1000 ? parsedTimeout : 25000,
  };
}

export function getPublicEnvSummary(
  envSource: NodeJS.ProcessEnv = process.env
): RuntimeEnvVarInfo[] {
  const cfg = loadEnvConfig(envSource);
  const src = (k: string): 'process.env' | 'default' =>
    envSource[k] && envSource[k]!.trim() !== '' ? 'process.env' : 'default';

  return [
    {
      key: 'ASTROSAGE_HOST',
      value: cfg.host,
      source: src('ASTROSAGE_HOST'),
      description: 'HTTP server bind host (use 127.0.0.1 for strict localhost offline mode)',
    },
    {
      key: 'PORT',
      value: String(cfg.port),
      source: src('PORT'),
      description: 'Local HTTP listening port',
    },
    {
      key: 'ASTROSAGE_DB_PATH',
      value: cfg.dbPath,
      source: src('ASTROSAGE_DB_PATH'),
      description: 'SQLite database file path',
    },
    {
      key: 'OLLAMA_BASE_URL',
      value: cfg.ollamaBaseUrl,
      source: src('OLLAMA_BASE_URL'),
      description: 'Local Ollama inference daemon URL',
    },
    {
      key: 'OLLAMA_MODEL',
      value: cfg.ollamaModel,
      source: src('OLLAMA_MODEL'),
      description: 'Default local LLM model identifier',
    },
    {
      key: 'OLLAMA_TIMEOUT_MS',
      value: String(cfg.ollamaTimeoutMs),
      source: src('OLLAMA_TIMEOUT_MS'),
      description: 'Local LLM request timeout before falling back to deterministic retrieval',
    },
    {
      key: 'NODE_ENV',
      value: cfg.nodeEnv,
      source: src('NODE_ENV'),
      description: 'Runtime execution environment',
    },
    {
      key: 'APP_URL',
      value: cfg.appUrl ?? '(not set — using local origin)',
      source: src('APP_URL'),
      description: 'Optional hosted or local application URL',
    },
  ];
}
