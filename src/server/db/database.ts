import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadEnvConfig } from '../config/env.js';

let dbInstance: DatabaseSync | null = null;
let resolvedDbPath = loadEnvConfig().dbPath;

export function getDbPath(): string {
  return resolvedDbPath;
}

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  const dbPath = loadEnvConfig().dbPath;
  const absPath = path.resolve(process.cwd(), dbPath);
  resolvedDbPath = absPath;
  fs.mkdirSync(path.dirname(absPath), { recursive: true });

  const db = new DatabaseSync(absPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  runMigrations(db);
  dbInstance = db;
  return db;
}

function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set<number>(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map(
      (r) => r.version
    )
  );

  if (!applied.has(1)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        phase TEXT NOT NULL,
        start_timestamp TEXT NOT NULL,
        simulated_elapsed_hours REAL NOT NULL,
        comms_status TEXT NOT NULL,
        is_simulated INTEGER NOT NULL DEFAULT 1,
        description TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS astronauts (
        id TEXT PRIMARY KEY,
        mission_id TEXT NOT NULL,
        callsign TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        age_group TEXT NOT NULL,
        notes TEXT NOT NULL,
        is_simulated INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        calibration_status TEXT NOT NULL,
        calibration_ref TEXT NOT NULL,
        last_calibrated_at TEXT NOT NULL,
        firmware_version TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS health_readings (
        id TEXT PRIMARY KEY,
        astronaut_id TEXT NOT NULL,
        mission_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        metric TEXT NOT NULL,
        value REAL,
        unit TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        quality_status TEXT NOT NULL,
        quality_notes TEXT NOT NULL,
        provenance TEXT NOT NULL,
        is_simulated INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS radiation_readings (
        id TEXT PRIMARY KEY,
        mission_id TEXT NOT NULL,
        astronaut_id TEXT,
        device_id TEXT NOT NULL,
        quantity TEXT NOT NULL,
        value REAL,
        unit TEXT NOT NULL,
        dose_rate REAL,
        dose_rate_unit TEXT,
        uncertainty REAL,
        calibration_ref TEXT NOT NULL,
        calibration_status TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        quality_status TEXT NOT NULL,
        quality_notes TEXT NOT NULL,
        provenance TEXT NOT NULL,
        is_simulated INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS environmental_readings (
        id TEXT PRIMARY KEY,
        mission_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        location TEXT NOT NULL,
        metric TEXT NOT NULL,
        value REAL,
        unit TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        quality_status TEXT NOT NULL,
        quality_notes TEXT NOT NULL,
        provenance TEXT NOT NULL,
        is_simulated INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS symptom_logs (
        id TEXT PRIMARY KEY,
        astronaut_id TEXT NOT NULL,
        mission_id TEXT NOT NULL,
        symptom TEXT NOT NULL,
        severity_rating INTEGER NOT NULL,
        duration_minutes INTEGER NOT NULL,
        notes TEXT NOT NULL,
        reported_at TEXT NOT NULL,
        provenance TEXT NOT NULL,
        is_simulated INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS cognitive_checks (
        id TEXT PRIMARY KEY,
        astronaut_id TEXT NOT NULL,
        mission_id TEXT NOT NULL,
        task_name TEXT NOT NULL,
        reaction_time_ms REAL NOT NULL,
        accuracy_pct REAL NOT NULL,
        fatigue_rating INTEGER NOT NULL,
        recorded_at TEXT NOT NULL,
        quality_status TEXT NOT NULL,
        provenance TEXT NOT NULL,
        is_simulated INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS baselines (
        id TEXT PRIMARY KEY,
        astronaut_id TEXT NOT NULL,
        metric TEXT NOT NULL,
        unit TEXT NOT NULL,
        mean REAL,
        median REAL,
        std_dev REAL,
        iqr REAL,
        sample_count INTEGER NOT NULL,
        observation_period_start TEXT NOT NULL,
        observation_period_end TEXT NOT NULL,
        baseline_version INTEGER NOT NULL,
        context_label TEXT NOT NULL,
        is_sufficient INTEGER NOT NULL,
        approved_by TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        astronaut_id TEXT NOT NULL,
        mission_id TEXT NOT NULL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        created_at TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        rule_version TEXT NOT NULL,
        title TEXT NOT NULL,
        what_happened TEXT NOT NULL,
        triggering_record_ids TEXT NOT NULL,
        measured_summary TEXT NOT NULL,
        baseline_summary TEXT NOT NULL,
        comparison_performed TEXT NOT NULL,
        missing_information TEXT NOT NULL,
        human_review_reason TEXT NOT NULL,
        data_quality_limitations TEXT NOT NULL,
        acknowledged INTEGER NOT NULL DEFAULT 0,
        acknowledged_by TEXT,
        acknowledged_at TEXT,
        acknowledgement_note TEXT,
        is_simulated INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source_name TEXT NOT NULL,
        version TEXT NOT NULL,
        published_date TEXT NOT NULL,
        category TEXT NOT NULL,
        chunk_count INTEGER NOT NULL,
        is_builtin INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        source_title TEXT NOT NULL,
        source_name TEXT NOT NULL,
        version TEXT NOT NULL,
        section TEXT NOT NULL,
        page_number INTEGER,
        content TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        mission_id TEXT NOT NULL,
        astronaut_id TEXT NOT NULL,
        title TEXT NOT NULL,
        window_hours INTEGER NOT NULL,
        generated_at TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        included_sections TEXT NOT NULL,
        summary_json TEXT NOT NULL,
        is_simulated INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        details TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS offline_outbox (
        id TEXT PRIMARY KEY,
        operation_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload_summary TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
      1,
      'initial_astrosage_schema',
      new Date().toISOString()
    );
  }

  if (!applied.has(2)) {
    db.prepare("UPDATE app_settings SET value = '\"light\"' WHERE key = 'theme'").run();
    db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
      2,
      'set_light_instrument_default_theme',
      new Date().toISOString()
    );
  }
}
