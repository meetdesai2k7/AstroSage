import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type {
  AppSettings,
  BaselineProfile,
  EnvironmentalReading,
  HealthReading,
  RadiationReading,
  ScenarioName,
  SymptomLog,
} from '../../shared/types.js';
import {
  computeBaselineStatistics,
  evaluateDeterministicAlerts,
} from '../analytics/engine.js';
import { loadEnvConfig } from '../config/env.js';
import { chunkMarkdownDocument } from '../copilot/retrieval.js';

// Fixed deterministic reference clock for consistent demo scenarios
export const DEMO_REFERENCE_NOW_ISO = '2026-11-13T12:00:00.000Z';

function isoHoursAgo(hoursAgo: number, baseIso = DEMO_REFERENCE_NOW_ISO): string {
  const baseMs = Date.parse(baseIso);
  return new Date(baseMs - hoursAgo * 3600 * 1000).toISOString();
}

export function indexBuiltinKnowledgeDocuments(db: DatabaseSync): void {
  const knowledgeDir = path.resolve(process.cwd(), 'data/knowledge');
  if (!fs.existsSync(knowledgeDir)) return;

  const files = fs.readdirSync(knowledgeDir).filter((f) => f.endsWith('.md')).sort();
  const insertDoc = db.prepare(`
    INSERT OR REPLACE INTO knowledge_documents
    (id, title, source_name, version, published_date, category, chunk_count, is_builtin, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  const deleteOldChunks = db.prepare('DELETE FROM knowledge_chunks WHERE document_id = ?');
  const insertChunk = db.prepare(`
    INSERT INTO knowledge_chunks
    (id, document_id, source_title, source_name, version, section, page_number, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  files.forEach((filename, idx) => {
    const raw = fs.readFileSync(path.join(knowledgeDir, filename), 'utf8');
    const docId = `DOC-BUILTIN-${String(idx + 1).padStart(2, '0')}`;
    const { docMeta, chunks } = chunkMarkdownDocument(docId, filename, raw);

    insertDoc.run(
      docMeta.id,
      docMeta.title,
      docMeta.sourceName,
      docMeta.version,
      docMeta.publishedDate,
      docMeta.category,
      chunks.length,
      now
    );
    deleteOldChunks.run(docMeta.id);
    for (const c of chunks) {
      insertChunk.run(
        c.id,
        c.documentId,
        c.sourceTitle,
        c.sourceName,
        c.version,
        c.section,
        c.pageNumber,
        c.content
      );
    }
  });
}

export function ensureDefaultSettings(db: DatabaseSync): void {
  const env = loadEnvConfig();
  const defaults: AppSettings = {
    theme: 'light',
    activeMissionId: 'MIS-LUNAR-04',
    activeAstronautId: 'AST-VANCE',
    activeScenario: 'NORMAL_MISSION',
    ollamaBaseUrl: env.ollamaBaseUrl,
    ollamaModel: env.ollamaModel,
    preferredTempUnit: 'C',
    defaultTimelineHours: 72,
    strictDuplicateRejection: true,
    auditCopilotQueries: true,
    liveTelemetryEnabled: false,
  };

  const upsert = db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaults)) {
    upsert.run(k, JSON.stringify(v));
  }
}

export function getSettingsFromDb(db: DatabaseSync): AppSettings {
  ensureDefaultSettings(db);
  const env = loadEnvConfig();
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const map: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      map[r.key] = JSON.parse(r.value);
    } catch {
      map[r.key] = r.value;
    }
  }
  return {
    theme: (map.theme as 'dark' | 'light') || 'light',
    activeMissionId: String(map.activeMissionId || 'MIS-LUNAR-04'),
    activeAstronautId: String(map.activeAstronautId || 'AST-VANCE'),
    activeScenario: (map.activeScenario as ScenarioName) || 'NORMAL_MISSION',
    ollamaBaseUrl: String(map.ollamaBaseUrl || env.ollamaBaseUrl),
    ollamaModel: String(map.ollamaModel || env.ollamaModel),
    preferredTempUnit: (map.preferredTempUnit as 'C' | 'F') || 'C',
    defaultTimelineHours: Number(map.defaultTimelineHours || 72),
    strictDuplicateRejection: Boolean(map.strictDuplicateRejection ?? true),
    auditCopilotQueries: Boolean(map.auditCopilotQueries ?? true),
    liveTelemetryEnabled: Boolean(map.liveTelemetryEnabled ?? false),
  };
}

export function updateSettingInDb(db: DatabaseSync, key: string, value: unknown): void {
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
    key,
    JSON.stringify(value)
  );
}

export function initializeDatabaseIfEmpty(db: DatabaseSync): void {
  indexBuiltinKnowledgeDocuments(db);
  ensureDefaultSettings(db);
  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM missions').get() as { cnt: number };
  if (countRow.cnt === 0) {
    loadScenarioSeed(db, 'NORMAL_MISSION');
  }
}

export function clearTelemetryData(db: DatabaseSync, includeKnowledge = false): void {
  db.exec(`
    DELETE FROM health_readings;
    DELETE FROM radiation_readings;
    DELETE FROM environmental_readings;
    DELETE FROM symptom_logs;
    DELETE FROM cognitive_checks;
    DELETE FROM baselines;
    DELETE FROM alerts;
    DELETE FROM offline_outbox;
  `);
  if (includeKnowledge) {
    db.exec('DELETE FROM knowledge_chunks; DELETE FROM knowledge_documents;');
  }
}

export function loadScenarioSeed(db: DatabaseSync, scenario: ScenarioName): {
  scenario: ScenarioName;
  insertedCounts: Record<string, number>;
  description: string;
  expectedBehaviour: string;
} {
  clearTelemetryData(db, false);

  const isBlackout = scenario === 'COMMUNICATION_BLACKOUT';
  const commsStatus = isBlackout ? 'BLACKOUT' : 'CONNECTED';

  // Seed Missions
  db.exec('DELETE FROM missions; DELETE FROM astronauts; DELETE FROM devices;');
  const insertMission = db.prepare(`
    INSERT INTO missions (id, name, code, phase, start_timestamp, simulated_elapsed_hours, comms_status, is_simulated, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  insertMission.run(
    'MIS-LUNAR-04',
    'Selene Transit Sim-04',
    'SLN-04',
    isBlackout ? 'Far-Side Comms Blackout (Simulated)' : 'Translunar Coast (Simulated)',
    isoHoursAgo(342),
    342.4,
    commsStatus,
    'Simulated deep-space transit habitat mission demonstrating offline-first crew health intelligence.'
  );
  insertMission.run(
    'MIS-ORBIT-02',
    'Orbital Lab Sim-02',
    'ORB-02',
    'Microgravity Station Operations (Simulated)',
    isoHoursAgo(510),
    510.8,
    commsStatus,
    'Secondary simulated orbital station crew profile for multi-mission comparison.'
  );

  // Seed Crew Profiles
  const insertCrew = db.prepare(`
    INSERT INTO astronauts (id, mission_id, callsign, name, role, age_group, notes, is_simulated)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  insertCrew.run(
    'AST-VANCE',
    'MIS-LUNAR-04',
    'CDR-VANCE',
    'Elena Vance',
    'Mission Commander',
    '35–44',
    'Simulated primary demonstration profile. Nominal resting HR ~66 bpm.'
  );
  insertCrew.run(
    'AST-CHEN',
    'MIS-LUNAR-04',
    'FE1-CHEN',
    'Marcus Chen',
    'Flight Engineer',
    '30–39',
    'Simulated secondary crew profile. Nominal resting HR ~61 bpm.'
  );
  insertCrew.run(
    'AST-NAIR',
    'MIS-ORBIT-02',
    'MS2-NAIR',
    'Priya Nair',
    'Payload Specialist',
    '35–44',
    'Simulated orbital lab crew profile. Nominal resting HR ~70 bpm.'
  );

  // Seed Devices
  const insertDevice = db.prepare(`
    INSERT INTO devices (id, name, category, calibration_status, calibration_ref, last_calibrated_at, firmware_version)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertDevice.run('DEV-BIO-HARNESS-01', 'BioHarness Wearable Node A', 'BIOMETRIC', 'CALIBRATED', 'CAL-BH-2026-10', isoHoursAgo(480), '4.2.1');
  insertDevice.run(
    'DEV-BIO-WRIST-02',
    'Wrist Pulse-Ox Sensor B',
    'BIOMETRIC',
    scenario === 'SENSOR_FAULT' ? 'UNCALIBRATED' : 'CALIBRATED',
    scenario === 'SENSOR_FAULT' ? 'CAL-EXPIRED-2026-01' : 'CAL-WO-2026-09',
    isoHoursAgo(scenario === 'SENSOR_FAULT' ? 2400 : 320),
    '2.9.4'
  );
  insertDevice.run('DEV-DOS-SIL-01', 'Silicon Absorbed Dosimeter A', 'DOSIMETRY', 'CALIBRATED', 'NIST-SIM-GY-26', isoHoursAgo(240), '3.1.0');
  insertDevice.run('DEV-DOS-TEPC-02', 'Tissue-Equivalent Proportional Counter B', 'DOSIMETRY', 'CALIBRATED', 'NIST-SIM-SV-26', isoHoursAgo(240), '3.4.2');
  insertDevice.run('DEV-ENV-CABIN-01', 'Habitat Environmental Rack Node 1', 'ENVIRONMENT', 'CALIBRATED', 'ENV-CAL-2026-11', isoHoursAgo(180), '5.0.0');
  insertDevice.run('DEV-COG-TAB-01', 'Crew Cognitive PVT Tablet', 'COGNITIVE', 'CALIBRATED', 'COG-CAL-2026-10', isoHoursAgo(300), '1.8.0');

  // Helper to seed personal baselines (v1, n=16 for primary metrics, n=5 insufficient for exercise_minutes)
  const insertBaseline = db.prepare(`
    INSERT INTO baselines
    (id, astronaut_id, metric, unit, mean, median, std_dev, iqr, sample_count, observation_period_start, observation_period_end, baseline_version, context_label, is_sufficient, approved_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seedBaselinesForCrew = (astronautId: string, hrMean: number, spo2Mean: number, tempMean: number, rrMean: number) => {
    const metrics: Array<{ metric: string; unit: string; vals: number[] }> = [
      {
        metric: 'heart_rate',
        unit: 'bpm',
        vals: Array.from({ length: 16 }, (_, i) => Number((hrMean + Math.sin(i * 0.9) * 2.5).toFixed(1))),
      },
      {
        metric: 'spo2',
        unit: '%',
        vals: Array.from({ length: 16 }, (_, i) => Number((spo2Mean + Math.cos(i * 0.7) * 0.6).toFixed(1))),
      },
      {
        metric: 'body_temp',
        unit: '°C',
        vals: Array.from({ length: 16 }, (_, i) => Number((tempMean + Math.sin(i * 0.6) * 0.15).toFixed(2))),
      },
      {
        metric: 'respiratory_rate',
        unit: 'br/min',
        vals: Array.from({ length: 16 }, (_, i) => Number((rrMean + Math.cos(i * 0.8) * 0.9).toFixed(1))),
      },
      {
        metric: 'sleep_hours',
        unit: 'h',
        vals: Array.from({ length: 12 }, (_, i) => Number((7.2 + Math.sin(i * 0.5) * 0.4).toFixed(1))),
      },
      {
        // Deliberately < 8 samples to demonstrate safe handling of insufficient baselines
        metric: 'exercise_minutes',
        unit: 'min',
        vals: [40, 45, 35, 50, 42],
      },
    ];

    const list: BaselineProfile[] = [];
    for (const m of metrics) {
      const stats = computeBaselineStatistics(m.vals);
      const bp: BaselineProfile = {
        id: `BL-${astronautId}-${m.metric}`,
        astronautId,
        metric: m.metric,
        unit: m.unit,
        mean: stats.mean,
        median: stats.median,
        stdDev: stats.stdDev,
        iqr: stats.iqr,
        sampleCount: stats.sampleCount,
        observationPeriodStart: isoHoursAgo(240),
        observationPeriodEnd: isoHoursAgo(72),
        baselineVersion: 1,
        contextLabel: 'Simulated Pre-Window Resting Nominal',
        isSufficient: stats.isSufficient,
        approvedBy: 'Flight Medical Officer (Simulated)',
        updatedAt: isoHoursAgo(72),
      };
      list.push(bp);
      insertBaseline.run(
        bp.id,
        bp.astronautId,
        bp.metric,
        bp.unit,
        bp.mean,
        bp.median,
        bp.stdDev,
        bp.iqr,
        bp.sampleCount,
        bp.observationPeriodStart,
        bp.observationPeriodEnd,
        bp.baselineVersion,
        bp.contextLabel,
        bp.isSufficient ? 1 : 0,
        bp.approvedBy,
        bp.updatedAt
      );
    }
    return list;
  };

  const baselinesVance = seedBaselinesForCrew('AST-VANCE', 66, 98.4, 36.7, 14.5);
  const baselinesChen = seedBaselinesForCrew('AST-CHEN', 61, 98.7, 36.6, 13.8);
  const baselinesNair = seedBaselinesForCrew('AST-NAIR', 70, 98.1, 36.8, 15.1);
  const allBaselines = [...baselinesVance, ...baselinesChen, ...baselinesNair];

  const insertHealth = db.prepare(`
    INSERT INTO health_readings
    (id, astronaut_id, mission_id, device_id, metric, value, unit, recorded_at, received_at, quality_status, quality_notes, provenance, is_simulated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const healthList: HealthReading[] = [];
  const addHealth = (r: Omit<HealthReading, 'isSimulated'>) => {
    const rec: HealthReading = { ...r, isSimulated: true };
    healthList.push(rec);
    insertHealth.run(
      rec.id,
      rec.astronautId,
      rec.missionId,
      rec.deviceId,
      rec.metric,
      rec.value,
      rec.unit,
      rec.recordedAt,
      rec.receivedAt,
      rec.qualityStatus,
      rec.qualityNotes,
      rec.provenance
    );
  };

  // Generate 72h points every 4 hours (19 time steps: 72h ago -> 0h ago)
  const steps = Array.from({ length: 19 }, (_, idx) => 72 - idx * 4);

  steps.forEach((hAgo, idx) => {
    const ts = isoHoursAgo(hAgo);
    const rxTs = isoHoursAgo(Math.max(0, hAgo - 0.05));

    // VANCE
    let vanceHr = Number((66 + Math.sin(idx * 0.7) * 2.2).toFixed(1));
    let vanceSpo2 = Number((98.4 + Math.cos(idx * 0.5) * 0.4).toFixed(1));
    let vanceTemp = Number((36.7 + Math.sin(idx * 0.4) * 0.12).toFixed(2));
    let vanceRr = Number((14.5 + Math.cos(idx * 0.6) * 0.7).toFixed(1));
    let vanceBpSys = Math.round(116 + Math.sin(idx * 0.5) * 3);
    let vanceBpDia = Math.round(74 + Math.cos(idx * 0.5) * 2);

    if (scenario === 'GRADUAL_HEALTH_DRIFT' && idx >= 11) {
      // Progressive drift over last 32h
      const driftStep = idx - 10; // 1..8
      vanceHr = Number((67 + driftStep * 3.4).toFixed(1)); // reaches ~94.2 bpm
      vanceTemp = Number((36.7 + driftStep * 0.09).toFixed(2)); // reaches 37.42 °C
      vanceRr = Number((14.8 + driftStep * 0.55).toFixed(1)); // reaches 19.2 br/min
      vanceSpo2 = Number((98.3 - driftStep * 0.16).toFixed(1)); // reaches 97.0 %
    } else if (scenario === 'EXPOSURE_CONTEXT' && idx >= 14) {
      // Subtle mild variation overlapping time window (non-causal)
      vanceHr = Number((68.5 + (idx - 14) * 0.6).toFixed(1));
    }

    // Handle SENSOR_FAULT scenario anomalies on AST-VANCE
    let hrQuality: HealthReading['qualityStatus'] = 'VALID';
    let hrNotes = 'Passed schema, unit, calibration, and freshness checks.';
    let hrVal: number | null = vanceHr;
    let hrDevice = 'DEV-BIO-HARNESS-01';
    let hrTs = ts;

    if (scenario === 'SENSOR_FAULT') {
      if (idx === 15) {
        hrQuality = 'MISSING';
        hrVal = null;
        hrNotes = 'Telemetry packet dropped; measurement value is null.';
      } else if (idx === 16) {
        hrQuality = 'INVALID';
        hrVal = -18;
        hrNotes = 'Value -18 bpm outside physical plausibility bounds [25, 230].';
      } else if (idx === 17) {
        hrQuality = 'DUPLICATE';
        hrVal = 66.5;
        hrNotes = 'Duplicate timestamp/metric/value packet received from buffer replay.';
      } else if (idx === 18) {
        hrQuality = 'STALE';
        hrVal = 65.0;
        hrTs = isoHoursAgo(28);
        hrNotes = 'Latest reading timestamp is 28.0h old (exceeds 18h freshness window).';
        hrDevice = 'DEV-BIO-WRIST-02';
      }
    }

    addHealth({
      id: `HR-VANCE-${String(idx + 1).padStart(2, '0')}`,
      astronautId: 'AST-VANCE',
      missionId: 'MIS-LUNAR-04',
      deviceId: hrDevice,
      metric: 'heart_rate',
      value: hrVal,
      unit: 'bpm',
      recordedAt: hrTs,
      receivedAt: rxTs,
      qualityStatus: hrQuality,
      qualityNotes: hrNotes,
      provenance: 'Simulated BioHarness Telemetry',
    });

    addHealth({
      id: `SPO2-VANCE-${String(idx + 1).padStart(2, '0')}`,
      astronautId: 'AST-VANCE',
      missionId: 'MIS-LUNAR-04',
      deviceId: scenario === 'SENSOR_FAULT' && idx >= 16 ? 'DEV-BIO-WRIST-02' : 'DEV-BIO-HARNESS-01',
      metric: 'spo2',
      value: scenario === 'SENSOR_FAULT' && idx === 17 ? 104.2 : vanceSpo2,
      unit: '%',
      recordedAt: ts,
      receivedAt: rxTs,
      qualityStatus:
        scenario === 'SENSOR_FAULT' && idx === 17
          ? 'INVALID'
          : scenario === 'SENSOR_FAULT' && idx === 18
            ? 'UNCERTAIN'
            : 'VALID',
      qualityNotes:
        scenario === 'SENSOR_FAULT' && idx === 17
          ? 'Value 104.2 % exceeds 100% physical maximum.'
          : scenario === 'SENSOR_FAULT' && idx === 18
            ? 'Source device DEV-BIO-WRIST-02 is UNCALIBRATED.'
            : 'Passed quality validation.',
      provenance: 'Simulated Pulse-Ox Telemetry',
    });

    if (idx % 2 === 0) {
      addHealth({
        id: `TEMP-VANCE-${String(idx + 1).padStart(2, '0')}`,
        astronautId: 'AST-VANCE',
        missionId: 'MIS-LUNAR-04',
        deviceId: 'DEV-BIO-HARNESS-01',
        metric: 'body_temp',
        value: vanceTemp,
        unit: '°C',
        recordedAt: ts,
        receivedAt: rxTs,
        qualityStatus: 'VALID',
        qualityNotes: 'Passed quality validation.',
        provenance: 'Simulated Dermal Thermistor',
      });

      addHealth({
        id: `RR-VANCE-${String(idx + 1).padStart(2, '0')}`,
        astronautId: 'AST-VANCE',
        missionId: 'MIS-LUNAR-04',
        deviceId: 'DEV-BIO-HARNESS-01',
        metric: 'respiratory_rate',
        value: vanceRr,
        unit: 'br/min',
        recordedAt: ts,
        receivedAt: rxTs,
        qualityStatus: 'VALID',
        qualityNotes: 'Passed quality validation.',
        provenance: 'Simulated Impedance Pneumography',
      });
    }

    if (idx % 3 === 0) {
      addHealth({
        id: `SBP-VANCE-${String(idx + 1).padStart(2, '0')}`,
        astronautId: 'AST-VANCE',
        missionId: 'MIS-LUNAR-04',
        deviceId: 'DEV-BIO-HARNESS-01',
        metric: 'systolic_bp',
        value: vanceBpSys,
        unit: 'mmHg',
        recordedAt: ts,
        receivedAt: rxTs,
        qualityStatus: 'VALID',
        qualityNotes: 'Passed quality validation.',
        provenance: 'Simulated Cuff Monitor',
      });
      addHealth({
        id: `DBP-VANCE-${String(idx + 1).padStart(2, '0')}`,
        astronautId: 'AST-VANCE',
        missionId: 'MIS-LUNAR-04',
        deviceId: 'DEV-BIO-HARNESS-01',
        metric: 'diastolic_bp',
        value: vanceBpDia,
        unit: 'mmHg',
        recordedAt: ts,
        receivedAt: rxTs,
        qualityStatus: 'VALID',
        qualityNotes: 'Passed quality validation.',
        provenance: 'Simulated Cuff Monitor',
      });
    }

    if (idx === 3 || idx === 9 || idx === 15) {
      addHealth({
        id: `SLP-VANCE-${String(idx + 1).padStart(2, '0')}`,
        astronautId: 'AST-VANCE',
        missionId: 'MIS-LUNAR-04',
        deviceId: 'DEV-BIO-HARNESS-01',
        metric: 'sleep_hours',
        value: scenario === 'GRADUAL_HEALTH_DRIFT' && idx === 15 ? 4.8 : Number((7.2 + (idx % 2) * 0.3).toFixed(1)),
        unit: 'h',
        recordedAt: ts,
        receivedAt: rxTs,
        qualityStatus: 'VALID',
        qualityNotes: 'Passed quality validation.',
        provenance: 'Simulated Sleep Actigraphy',
      });
    }

    // CHEN & NAIR nominal telemetry so crew switcher has complete live data
    if (idx % 2 === 0) {
      addHealth({
        id: `HR-CHEN-${String(idx + 1).padStart(2, '0')}`,
        astronautId: 'AST-CHEN',
        missionId: 'MIS-LUNAR-04',
        deviceId: 'DEV-BIO-HARNESS-01',
        metric: 'heart_rate',
        value: Number((61 + Math.cos(idx * 0.6) * 2.0).toFixed(1)),
        unit: 'bpm',
        recordedAt: ts,
        receivedAt: rxTs,
        qualityStatus: 'VALID',
        qualityNotes: 'Passed quality validation.',
        provenance: 'Simulated BioHarness Telemetry',
      });
      addHealth({
        id: `SPO2-CHEN-${String(idx + 1).padStart(2, '0')}`,
        astronautId: 'AST-CHEN',
        missionId: 'MIS-LUNAR-04',
        deviceId: 'DEV-BIO-HARNESS-01',
        metric: 'spo2',
        value: Number((98.7 + Math.sin(idx * 0.5) * 0.3).toFixed(1)),
        unit: '%',
        recordedAt: ts,
        receivedAt: rxTs,
        qualityStatus: 'VALID',
        qualityNotes: 'Passed quality validation.',
        provenance: 'Simulated Pulse-Ox Telemetry',
      });
      addHealth({
        id: `HR-NAIR-${String(idx + 1).padStart(2, '0')}`,
        astronautId: 'AST-NAIR',
        missionId: 'MIS-ORBIT-02',
        deviceId: 'DEV-BIO-HARNESS-01',
        metric: 'heart_rate',
        value: Number((70 + Math.sin(idx * 0.8) * 2.4).toFixed(1)),
        unit: 'bpm',
        recordedAt: ts,
        receivedAt: rxTs,
        qualityStatus: 'VALID',
        qualityNotes: 'Passed quality validation.',
        provenance: 'Simulated BioHarness Telemetry',
      });
    }
  });

  // Seed Radiation Readings (Keeping Gy and Sv strictly distinct!)
  const insertRad = db.prepare(`
    INSERT INTO radiation_readings
    (id, mission_id, astronaut_id, device_id, quantity, value, unit, dose_rate, dose_rate_unit, uncertainty, calibration_ref, calibration_status, recorded_at, received_at, quality_status, quality_notes, provenance, is_simulated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const radList: RadiationReading[] = [];
  const addRad = (r: Omit<RadiationReading, 'isSimulated'>) => {
    const rec: RadiationReading = { ...r, isSimulated: true };
    radList.push(rec);
    insertRad.run(
      rec.id,
      rec.missionId,
      rec.astronautId,
      rec.deviceId,
      rec.quantity,
      rec.value,
      rec.unit,
      rec.doseRate,
      rec.doseRateUnit,
      rec.uncertainty,
      rec.calibrationRef,
      rec.calibrationStatus,
      rec.recordedAt,
      rec.receivedAt,
      rec.qualityStatus,
      rec.qualityNotes,
      rec.provenance
    );
  };

  [64, 48, 32, 16, 10, 4].forEach((hAgo, idx) => {
    const isExposureEvent = scenario === 'EXPOSURE_CONTEXT' && (hAgo === 16 || hAgo === 10 || hAgo === 4);
    const isRadFault = scenario === 'SENSOR_FAULT' && hAgo === 4;

    addRad({
      id: `RAD-GY-${String(idx + 1).padStart(2, '0')}`,
      missionId: 'MIS-LUNAR-04',
      astronautId: 'AST-VANCE',
      deviceId: 'DEV-DOS-SIL-01',
      quantity: 'ABSORBED_DOSE',
      value: isExposureEvent ? Number((1.65 + idx * 0.22).toFixed(2)) : Number((0.28 + (idx % 3) * 0.04).toFixed(2)),
      unit: 'mGy',
      doseRate: isExposureEvent ? 0.52 : 0.08,
      doseRateUnit: 'mGy/h',
      uncertainty: isExposureEvent ? 0.18 : 0.03,
      calibrationRef: 'NIST-SIM-GY-26',
      calibrationStatus: isRadFault ? 'UNCALIBRATED' : 'CALIBRATED',
      recordedAt: isoHoursAgo(hAgo),
      receivedAt: isoHoursAgo(hAgo - 0.02),
      qualityStatus: isRadFault ? 'UNCERTAIN' : 'VALID',
      qualityNotes: isRadFault ? 'Calibration verification overdue for Silicon Dosimeter.' : 'Absorbed dose verified in mGy.',
      provenance: 'Simulated Silicon Absorbed Dosimeter',
    });

    addRad({
      id: `RAD-SV-${String(idx + 1).padStart(2, '0')}`,
      missionId: 'MIS-LUNAR-04',
      astronautId: 'AST-VANCE',
      deviceId: 'DEV-DOS-TEPC-02',
      quantity: 'EFFECTIVE_DOSE',
      value: isExposureEvent ? Number((2.35 + idx * 0.28).toFixed(2)) : Number((0.46 + (idx % 2) * 0.05).toFixed(2)),
      unit: 'mSv',
      doseRate: isExposureEvent ? 0.74 : 0.12,
      doseRateUnit: 'mSv/h',
      uncertainty: isExposureEvent ? 0.31 : 0.05,
      calibrationRef: 'NIST-SIM-SV-26',
      calibrationStatus: 'CALIBRATED',
      recordedAt: isoHoursAgo(hAgo - 0.5),
      receivedAt: isoHoursAgo(hAgo - 0.52),
      qualityStatus: 'VALID',
      qualityNotes: 'Effective dose preserved separately in mSv; never auto-converted from Gy.',
      provenance: 'Simulated TEPC Personal Dosimeter',
    });
  });

  // Seed Environmental Readings
  const insertEnv = db.prepare(`
    INSERT INTO environmental_readings
    (id, mission_id, device_id, location, metric, value, unit, recorded_at, received_at, quality_status, quality_notes, provenance, is_simulated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const envList: EnvironmentalReading[] = [];
  const addEnv = (e: Omit<EnvironmentalReading, 'isSimulated'>) => {
    const rec: EnvironmentalReading = { ...e, isSimulated: true };
    envList.push(rec);
    insertEnv.run(
      rec.id,
      rec.missionId,
      rec.deviceId,
      rec.location,
      rec.metric,
      rec.value,
      rec.unit,
      rec.recordedAt,
      rec.receivedAt,
      rec.qualityStatus,
      rec.qualityNotes,
      rec.provenance
    );
  };

  [68, 56, 44, 32, 20, 12, 6, 2].forEach((hAgo, idx) => {
    const co2High =
      (scenario === 'GRADUAL_HEALTH_DRIFT' || scenario === 'EXPOSURE_CONTEXT') && hAgo <= 12;
    addEnv({
      id: `ENV-CO2-${String(idx + 1).padStart(2, '0')}`,
      missionId: 'MIS-LUNAR-04',
      deviceId: 'DEV-ENV-CABIN-01',
      location: 'Crew Hab Node 1',
      metric: 'co2_mmhg',
      value: co2High ? Number((4.1 + (12 - hAgo) * 0.05).toFixed(2)) : Number((2.3 + (idx % 3) * 0.15).toFixed(2)),
      unit: 'mmHg',
      recordedAt: isoHoursAgo(hAgo),
      receivedAt: isoHoursAgo(hAgo - 0.02),
      qualityStatus: 'VALID',
      qualityNotes: 'Cabin trace gas analyzer verified.',
      provenance: 'Simulated ECLSS Sensor Bus',
    });
    addEnv({
      id: `ENV-TEMP-${String(idx + 1).padStart(2, '0')}`,
      missionId: 'MIS-LUNAR-04',
      deviceId: 'DEV-ENV-CABIN-01',
      location: 'Crew Hab Node 1',
      metric: 'cabin_temp',
      value: Number((22.1 + Math.sin(idx * 0.5) * 0.6).toFixed(1)),
      unit: '°C',
      recordedAt: isoHoursAgo(hAgo),
      receivedAt: isoHoursAgo(hAgo - 0.02),
      qualityStatus: 'VALID',
      qualityNotes: 'Cabin thermistor verified.',
      provenance: 'Simulated ECLSS Sensor Bus',
    });
    addEnv({
      id: `ENV-HUM-${String(idx + 1).padStart(2, '0')}`,
      missionId: 'MIS-LUNAR-04',
      deviceId: 'DEV-ENV-CABIN-01',
      location: 'Crew Hab Node 1',
      metric: 'humidity',
      value: Number((43.5 + Math.cos(idx * 0.4) * 2.2).toFixed(1)),
      unit: '%RH',
      recordedAt: isoHoursAgo(hAgo),
      receivedAt: isoHoursAgo(hAgo - 0.02),
      qualityStatus: 'VALID',
      qualityNotes: 'Humidity sensor verified.',
      provenance: 'Simulated ECLSS Sensor Bus',
    });
    addEnv({
      id: `ENV-PRES-${String(idx + 1).padStart(2, '0')}`,
      missionId: 'MIS-LUNAR-04',
      deviceId: 'DEV-ENV-CABIN-01',
      location: 'Crew Hab Node 1',
      metric: 'cabin_pressure',
      value: Number((101.2 + Math.sin(idx * 0.3) * 0.1).toFixed(2)),
      unit: 'kPa',
      recordedAt: isoHoursAgo(hAgo),
      receivedAt: isoHoursAgo(hAgo - 0.02),
      qualityStatus: 'VALID',
      qualityNotes: 'Barometric transducer verified.',
      provenance: 'Simulated ECLSS Sensor Bus',
    });
  });

  // Seed Symptoms & Cognitive checks
  const insertSym = db.prepare(`
    INSERT INTO symptom_logs
    (id, astronaut_id, mission_id, symptom, severity_rating, duration_minutes, notes, reported_at, provenance, is_simulated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const symList: SymptomLog[] = [];
  const addSym = (s: Omit<SymptomLog, 'isSimulated'>) => {
    const rec: SymptomLog = { ...s, isSimulated: true };
    symList.push(rec);
    insertSym.run(
      rec.id,
      rec.astronautId,
      rec.missionId,
      rec.symptom,
      rec.severityRating,
      rec.durationMinutes,
      rec.notes,
      rec.reportedAt,
      rec.provenance
    );
  };

  if (scenario === 'GRADUAL_HEALTH_DRIFT') {
    addSym({
      id: 'SYM-DRIFT-01',
      astronautId: 'AST-VANCE',
      missionId: 'MIS-LUNAR-04',
      symptom: 'Persistent fatigue & elevated perceived exertion',
      severityRating: 3,
      durationMinutes: 240,
      notes: 'Crew member noted sluggish recovery post-ergometer session and fragmented sleep.',
      reportedAt: isoHoursAgo(8),
      provenance: 'Simulated Crew Self-Report Log',
    });
  } else if (scenario === 'EXPOSURE_CONTEXT') {
    addSym({
      id: 'SYM-EXP-01',
      astronautId: 'AST-VANCE',
      missionId: 'MIS-LUNAR-04',
      symptom: 'Mild frontal headache',
      severityRating: 2,
      durationMinutes: 90,
      notes: 'Logged during overlapping solar flux & elevated CO2 interval. Temporal overlap only; causation undetermined.',
      reportedAt: isoHoursAgo(9),
      provenance: 'Simulated Crew Self-Report Log',
    });
  } else if (scenario === 'COMMUNICATION_BLACKOUT') {
    addSym({
      id: 'SYM-BLK-01',
      astronautId: 'AST-VANCE',
      missionId: 'MIS-LUNAR-04',
      symptom: 'Mild sleep latency',
      severityRating: 2,
      durationMinutes: 45,
      notes: 'Logged locally during Earth link blackout; queued in offline outbox.',
      reportedAt: isoHoursAgo(6),
      provenance: 'Simulated Local Offline Log',
    });
  }

  const insertCog = db.prepare(`
    INSERT INTO cognitive_checks
    (id, astronaut_id, mission_id, task_name, reaction_time_ms, accuracy_pct, fatigue_rating, recorded_at, quality_status, provenance, is_simulated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  insertCog.run(
    'COG-01',
    'AST-VANCE',
    'MIS-LUNAR-04',
    '3-min Psychomotor Vigilance Task (PVT)',
    scenario === 'GRADUAL_HEALTH_DRIFT' ? 318 : 244,
    scenario === 'GRADUAL_HEALTH_DRIFT' ? 93.5 : 98.2,
    scenario === 'GRADUAL_HEALTH_DRIFT' ? 6 : 2,
    isoHoursAgo(5),
    'VALID',
    'Simulated PVT Tablet Assessment',
  );

  // Evaluate deterministic alerts and persist
  const alerts = evaluateDeterministicAlerts({
    missionId: 'MIS-LUNAR-04',
    astronautId: 'AST-VANCE',
    referenceNowIso: DEMO_REFERENCE_NOW_ISO,
    healthReadings: healthList,
    radiationReadings: radList,
    environmentalReadings: envList,
    symptoms: symList,
    baselines: allBaselines,
  });

  const insertAlert = db.prepare(`
    INSERT INTO alerts
    (id, astronaut_id, mission_id, category, severity, created_at, rule_id, rule_version, title, what_happened, triggering_record_ids, measured_summary, baseline_summary, comparison_performed, missing_information, human_review_reason, data_quality_limitations, acknowledged, acknowledged_by, acknowledged_at, acknowledgement_note, is_simulated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  for (const a of alerts) {
    insertAlert.run(
      a.id,
      a.astronautId,
      a.missionId,
      a.category,
      a.severity,
      a.createdAt,
      a.ruleId,
      a.ruleVersion,
      a.title,
      a.whatHappened,
      JSON.stringify(a.triggeringRecordIds),
      a.measuredSummary,
      a.baselineSummary,
      a.comparisonPerformed,
      a.missingInformation,
      a.humanReviewReason,
      a.dataQualityLimitations,
      a.acknowledged ? 1 : 0,
      a.acknowledgedBy,
      a.acknowledgedAt,
      a.acknowledgementNote
    );
  }

  // If COMMUNICATION_BLACKOUT, seed realistic pending outbox entries
  if (isBlackout) {
    const insertOutbox = db.prepare(`
      INSERT INTO offline_outbox (id, operation_type, entity_type, entity_id, payload_summary, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertOutbox.run(
      'OBX-01',
      'SYNC_TELEMETRY_BATCH',
      'health_reading',
      'HR-VANCE-19',
      'Latest 4h biometric batch buffered locally during lunar far-side blackout',
      'BLOCKED_OFFLINE',
      isoHoursAgo(2)
    );
    insertOutbox.run(
      'OBX-02',
      'SYNC_SYMPTOM_LOG',
      'symptom_log',
      'SYM-BLK-01',
      'Crew sleep latency report queued for Earth downlink restoration',
      'PENDING',
      isoHoursAgo(1)
    );
  }

  updateSettingInDb(db, 'activeScenario', scenario);
  updateSettingInDb(db, 'activeMissionId', 'MIS-LUNAR-04');
  updateSettingInDb(db, 'activeAstronautId', 'AST-VANCE');

  db.prepare(
    'INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    `AUD-${Date.now()}`,
    'SYSTEM_SEEDER',
    'SCENARIO_LOADED',
    'scenario',
    scenario,
    `Loaded deterministic synthetic scenario ${scenario} (${healthList.length} health, ${radList.length} radiation, ${envList.length} environment, ${alerts.length} alerts).`,
    new Date().toISOString()
  );

  const metaByScenario: Record<ScenarioName, { description: string; expectedBehaviour: string }> = {
    NORMAL_MISSION: {
      description: 'Nominal 72-hour simulated transit telemetry with stable personal baselines, calibrated devices, and complete records.',
      expectedBehaviour: 'All metrics remain within 1.5 SD of locked v1 baselines. Zero health deviation or sensor fault flags.',
    },
    GRADUAL_HEALTH_DRIFT: {
      description: 'Progressive upward drift in resting heart rate (~66 to 94 bpm), mild temperature elevation, higher respiratory rate, reduced sleep, and fatigue symptom.',
      expectedBehaviour: 'Deterministic rules DEMO-RULE-DEV-02 / DEV-01 trigger transparent review flags showing exact readings and v1 baseline comparisons.',
    },
    EXPOSURE_CONTEXT: {
      description: 'Elevated absorbed dose (mGy) and effective dose (mSv) records overlapping in time with mild CO2 rise and a mild headache report.',
      expectedBehaviour: 'Gy and Sv stay strictly separate without conversion; timeline shows temporal overlap with explicit non-causation notice.',
    },
    SENSOR_FAULT: {
      description: 'Injects MISSING (null), INVALID (-18 bpm, 104.2% SpO2), DUPLICATE, STALE (28h old), and UNCALIBRATED device readings.',
      expectedBehaviour: 'Ingestion quality gates quarantine faulty rows from baseline math and raise SENSOR_FAULT / DATA_GAP review alerts.',
    },
    COMMUNICATION_BLACKOUT: {
      description: 'Simulates disconnected Earth telemetry link with local SQLite persistence, pending outbox entries, local retrieval, and PDF report readiness.',
      expectedBehaviour: 'Comms indicator switches to BLACKOUT; outbox queues pending sync items honestly without fabricating transmission.',
    },
  };

  return {
    scenario,
    insertedCounts: {
      healthReadings: healthList.length,
      radiationReadings: radList.length,
      environmentalReadings: envList.length,
      symptoms: symList.length,
      alerts: alerts.length,
    },
    ...metaByScenario[scenario],
  };
}
