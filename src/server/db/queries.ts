import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  AlertRecord,
  AstronautOverview,
  AstronautProfile,
  AuditLogEntry,
  BaselineProfile,
  CognitiveCheck,
  DeviceRecord,
  EnvironmentalReading,
  HealthReading,
  KnowledgeDocument,
  Mission,
  OutboxEntry,
  RadiationReading,
  ReportRecord,
  SymptomLog,
  SystemStatusReport,
  TimelineEvent,
} from '../../shared/types.js';
import {
  assessHealthQuality,
  computeBaselineStatistics,
  computeExperimentalZScore,
  evaluateDeterministicAlerts,
  getMetricLabel,
} from '../analytics/engine.js';
import { checkOllamaAvailability, type IndexedChunk } from '../copilot/retrieval.js';
import { getPublicEnvSummary } from '../config/env.js';
import { getDbPath } from './database.js';
import { DEMO_REFERENCE_NOW_ISO, getSettingsFromDb } from './seed.js';

type Row = Record<string, unknown>;

export function listMissions(db: DatabaseSync): Mission[] {
  const rows = db.prepare('SELECT * FROM missions ORDER BY id').all() as Row[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    code: String(r.code),
    phase: String(r.phase),
    startTimestamp: String(r.start_timestamp),
    simulatedElapsedHours: Number(r.simulated_elapsed_hours),
    commsStatus: String(r.comms_status) as Mission['commsStatus'],
    isSimulated: Boolean(r.is_simulated),
    description: String(r.description),
  }));
}

export function listAstronauts(db: DatabaseSync): AstronautProfile[] {
  const rows = db.prepare('SELECT * FROM astronauts ORDER BY id').all() as Row[];
  return rows.map((r) => ({
    id: String(r.id),
    missionId: String(r.mission_id),
    callsign: String(r.callsign),
    name: String(r.name),
    role: String(r.role),
    ageGroup: String(r.age_group),
    notes: String(r.notes),
    isSimulated: Boolean(r.is_simulated),
  }));
}

export function listDevices(db: DatabaseSync): DeviceRecord[] {
  const rows = db.prepare('SELECT * FROM devices ORDER BY id').all() as Row[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    category: String(r.category) as DeviceRecord['category'],
    calibrationStatus: String(r.calibration_status) as DeviceRecord['calibrationStatus'],
    calibrationRef: String(r.calibration_ref),
    lastCalibratedAt: String(r.last_calibrated_at),
    firmwareVersion: String(r.firmware_version),
  }));
}

export function listHealthReadings(
  db: DatabaseSync,
  filters?: {
    astronautId?: string;
    metric?: string;
    deviceId?: string;
    qualityStatus?: string;
    hours?: number;
  }
): HealthReading[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (filters?.astronautId) {
    clauses.push('astronaut_id = ?');
    params.push(filters.astronautId);
  }
  if (filters?.metric) {
    clauses.push('metric = ?');
    params.push(filters.metric);
  }
  if (filters?.deviceId) {
    clauses.push('device_id = ?');
    params.push(filters.deviceId);
  }
  if (filters?.qualityStatus) {
    clauses.push('quality_status = ?');
    params.push(filters.qualityStatus);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM health_readings ${where} ORDER BY recorded_at ASC`)
    .all(...params) as Row[];

  let list = rows.map((r) => ({
    id: String(r.id),
    astronautId: String(r.astronaut_id),
    missionId: String(r.mission_id),
    deviceId: String(r.device_id),
    metric: String(r.metric),
    value: r.value === null ? null : Number(r.value),
    unit: String(r.unit),
    recordedAt: String(r.recorded_at),
    receivedAt: String(r.received_at),
    qualityStatus: String(r.quality_status) as HealthReading['qualityStatus'],
    qualityNotes: String(r.quality_notes),
    provenance: String(r.provenance),
    isSimulated: Boolean(r.is_simulated),
  }));

  if (filters?.hours && filters.hours > 0) {
    const latestMs =
      list.length > 0
        ? Math.max(...list.map((i) => Date.parse(i.recordedAt) || 0))
        : Date.parse(DEMO_REFERENCE_NOW_ISO);
    const cutoffMs = latestMs - filters.hours * 3600 * 1000;
    list = list.filter((i) => (Date.parse(i.recordedAt) || 0) >= cutoffMs);
  }

  return list;
}

export function listRadiationReadings(db: DatabaseSync, missionId?: string): RadiationReading[] {
  const rows = (
    missionId
      ? db.prepare('SELECT * FROM radiation_readings WHERE mission_id = ? ORDER BY recorded_at ASC').all(missionId)
      : db.prepare('SELECT * FROM radiation_readings ORDER BY recorded_at ASC').all()
  ) as Row[];

  return rows.map((r) => ({
    id: String(r.id),
    missionId: String(r.mission_id),
    astronautId: r.astronaut_id ? String(r.astronaut_id) : null,
    deviceId: String(r.device_id),
    quantity: String(r.quantity) as RadiationReading['quantity'],
    value: r.value === null ? null : Number(r.value),
    unit: String(r.unit),
    doseRate: r.dose_rate === null ? null : Number(r.dose_rate),
    doseRateUnit: r.dose_rate_unit ? String(r.dose_rate_unit) : null,
    uncertainty: r.uncertainty === null ? null : Number(r.uncertainty),
    calibrationRef: String(r.calibration_ref),
    calibrationStatus: String(r.calibration_status) as RadiationReading['calibrationStatus'],
    recordedAt: String(r.recorded_at),
    receivedAt: String(r.received_at),
    qualityStatus: String(r.quality_status) as RadiationReading['qualityStatus'],
    qualityNotes: String(r.quality_notes),
    provenance: String(r.provenance),
    isSimulated: Boolean(r.is_simulated),
  }));
}

export function listEnvironmentalReadings(
  db: DatabaseSync,
  missionId?: string
): EnvironmentalReading[] {
  const rows = (
    missionId
      ? db.prepare('SELECT * FROM environmental_readings WHERE mission_id = ? ORDER BY recorded_at ASC').all(missionId)
      : db.prepare('SELECT * FROM environmental_readings ORDER BY recorded_at ASC').all()
  ) as Row[];

  return rows.map((r) => ({
    id: String(r.id),
    missionId: String(r.mission_id),
    deviceId: String(r.device_id),
    location: String(r.location),
    metric: String(r.metric),
    value: r.value === null ? null : Number(r.value),
    unit: String(r.unit),
    recordedAt: String(r.recorded_at),
    receivedAt: String(r.received_at),
    qualityStatus: String(r.quality_status) as EnvironmentalReading['qualityStatus'],
    qualityNotes: String(r.quality_notes),
    provenance: String(r.provenance),
    isSimulated: Boolean(r.is_simulated),
  }));
}

export function listSymptoms(db: DatabaseSync, astronautId?: string): SymptomLog[] {
  const rows = (
    astronautId
      ? db.prepare('SELECT * FROM symptom_logs WHERE astronaut_id = ? ORDER BY reported_at DESC').all(astronautId)
      : db.prepare('SELECT * FROM symptom_logs ORDER BY reported_at DESC').all()
  ) as Row[];

  return rows.map((r) => ({
    id: String(r.id),
    astronautId: String(r.astronaut_id),
    missionId: String(r.mission_id),
    symptom: String(r.symptom),
    severityRating: Number(r.severity_rating),
    durationMinutes: Number(r.duration_minutes),
    notes: String(r.notes),
    reportedAt: String(r.reported_at),
    provenance: String(r.provenance),
    isSimulated: Boolean(r.is_simulated),
  }));
}

export function listCognitiveChecks(db: DatabaseSync, astronautId?: string): CognitiveCheck[] {
  const rows = (
    astronautId
      ? db.prepare('SELECT * FROM cognitive_checks WHERE astronaut_id = ? ORDER BY recorded_at DESC').all(astronautId)
      : db.prepare('SELECT * FROM cognitive_checks ORDER BY recorded_at DESC').all()
  ) as Row[];

  return rows.map((r) => ({
    id: String(r.id),
    astronautId: String(r.astronaut_id),
    missionId: String(r.mission_id),
    taskName: String(r.task_name),
    reactionTimeMs: Number(r.reaction_time_ms),
    accuracyPct: Number(r.accuracy_pct),
    fatigueRating: Number(r.fatigue_rating),
    recordedAt: String(r.recorded_at),
    qualityStatus: String(r.quality_status) as CognitiveCheck['qualityStatus'],
    provenance: String(r.provenance),
    isSimulated: Boolean(r.is_simulated),
  }));
}

export function listBaselines(db: DatabaseSync, astronautId: string): BaselineProfile[] {
  const rows = db
    .prepare('SELECT * FROM baselines WHERE astronaut_id = ? ORDER BY metric ASC')
    .all(astronautId) as Row[];
  return rows.map((r) => ({
    id: String(r.id),
    astronautId: String(r.astronaut_id),
    metric: String(r.metric),
    unit: String(r.unit),
    mean: r.mean === null ? null : Number(r.mean),
    median: r.median === null ? null : Number(r.median),
    stdDev: r.std_dev === null ? null : Number(r.std_dev),
    iqr: r.iqr === null ? null : Number(r.iqr),
    sampleCount: Number(r.sample_count),
    observationPeriodStart: String(r.observation_period_start),
    observationPeriodEnd: String(r.observation_period_end),
    baselineVersion: Number(r.baseline_version),
    contextLabel: String(r.context_label),
    isSufficient: Boolean(r.is_sufficient),
    approvedBy: String(r.approved_by),
    updatedAt: String(r.updated_at),
  }));
}

export function listAlerts(db: DatabaseSync, astronautId?: string): AlertRecord[] {
  const rows = (
    astronautId
      ? db.prepare('SELECT * FROM alerts WHERE astronaut_id = ? ORDER BY created_at DESC').all(astronautId)
      : db.prepare('SELECT * FROM alerts ORDER BY created_at DESC').all()
  ) as Row[];

  return rows.map((r) => ({
    id: String(r.id),
    astronautId: String(r.astronaut_id),
    missionId: String(r.mission_id),
    category: String(r.category) as AlertRecord['category'],
    severity: String(r.severity) as AlertRecord['severity'],
    createdAt: String(r.created_at),
    ruleId: String(r.rule_id),
    ruleVersion: String(r.rule_version),
    title: String(r.title),
    whatHappened: String(r.what_happened),
    triggeringRecordIds: JSON.parse(String(r.triggering_record_ids || '[]')) as string[],
    measuredSummary: String(r.measured_summary),
    baselineSummary: String(r.baseline_summary),
    comparisonPerformed: String(r.comparison_performed),
    missingInformation: String(r.missing_information),
    humanReviewReason: String(r.human_review_reason),
    dataQualityLimitations: String(r.data_quality_limitations),
    acknowledged: Boolean(r.acknowledged),
    acknowledgedBy: r.acknowledged_by ? String(r.acknowledged_by) : null,
    acknowledgedAt: r.acknowledged_at ? String(r.acknowledged_at) : null,
    acknowledgementNote: r.acknowledgement_note ? String(r.acknowledgement_note) : null,
    isSimulated: Boolean(r.is_simulated),
  }));
}

export function listKnowledgeDocuments(db: DatabaseSync): KnowledgeDocument[] {
  const rows = db.prepare('SELECT * FROM knowledge_documents ORDER BY id ASC').all() as Row[];
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    sourceName: String(r.source_name),
    version: String(r.version),
    publishedDate: String(r.published_date),
    category: String(r.category),
    chunkCount: Number(r.chunk_count),
    isBuiltin: Boolean(r.is_builtin),
    createdAt: String(r.created_at),
  }));
}

export function listKnowledgeChunks(db: DatabaseSync): IndexedChunk[] {
  const rows = db.prepare('SELECT * FROM knowledge_chunks ORDER BY id ASC').all() as Row[];
  return rows.map((r) => ({
    id: String(r.id),
    documentId: String(r.document_id),
    sourceTitle: String(r.source_title),
    sourceName: String(r.source_name),
    version: String(r.version),
    section: String(r.section),
    pageNumber: r.page_number === null ? null : Number(r.page_number),
    content: String(r.content),
  }));
}

export function listReports(db: DatabaseSync): ReportRecord[] {
  const rows = db.prepare('SELECT * FROM reports ORDER BY generated_at DESC').all() as Row[];
  return rows.map((r) => ({
    id: String(r.id),
    missionId: String(r.mission_id),
    astronautId: String(r.astronaut_id),
    title: String(r.title),
    windowHours: Number(r.window_hours),
    generatedAt: String(r.generated_at),
    contentHash: String(r.content_hash),
    includedSections: JSON.parse(String(r.included_sections || '[]')) as string[],
    summaryJson: String(r.summary_json),
    isSimulated: Boolean(r.is_simulated),
  }));
}

export function listOutboxEntries(db: DatabaseSync): OutboxEntry[] {
  const rows = db.prepare('SELECT * FROM offline_outbox ORDER BY created_at DESC').all() as Row[];
  return rows.map((r) => ({
    id: String(r.id),
    operationType: String(r.operation_type),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    payloadSummary: String(r.payload_summary),
    status: String(r.status) as OutboxEntry['status'],
    createdAt: String(r.created_at),
  }));
}

export function listAuditLogs(db: DatabaseSync, limit = 50): AuditLogEntry[] {
  const rows = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Row[];
  return rows.map((r) => ({
    id: String(r.id),
    actor: String(r.actor),
    action: String(r.action),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    details: String(r.details),
    createdAt: String(r.created_at),
  }));
}

export function logAudit(
  db: DatabaseSync,
  actor: string,
  action: string,
  entityType: string,
  entityId: string,
  details: string
): void {
  db.prepare(
    'INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    `AUD-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    actor,
    action,
    entityType,
    entityId,
    details,
    new Date().toISOString()
  );
}

export function buildTimelineEvents(
  db: DatabaseSync,
  astronautId: string,
  hours = 72
): TimelineEvent[] {
  const health = listHealthReadings(db, { astronautId });
  const astronauts = listAstronauts(db);
  const crew = astronauts.find((a) => a.id === astronautId);
  const missionId = crew?.missionId || 'MIS-LUNAR-04';
  const radiation = listRadiationReadings(db, missionId);
  const environment = listEnvironmentalReadings(db, missionId);
  const symptoms = listSymptoms(db, astronautId);
  const cognitive = listCognitiveChecks(db, astronautId);
  const alerts = listAlerts(db, astronautId);

  const events: TimelineEvent[] = [];

  for (const h of health) {
    const isFault = h.qualityStatus !== 'VALID';
    events.push({
      id: `TL-${h.id}`,
      timestamp: h.recordedAt,
      category: isFault ? 'QUALITY' : 'HEALTH',
      title: isFault
        ? `${getMetricLabel(h.metric)} ${h.qualityStatus}`
        : `${getMetricLabel(h.metric)}: ${h.value} ${h.unit}`,
      summary: isFault ? h.qualityNotes : `Recorded via ${h.deviceId} (${h.provenance})`,
      severity: isFault ? 'WATCH' : 'NONE',
      qualityStatus: h.qualityStatus,
      sourceId: h.id,
      recordType: 'health_reading',
      metadata: { ...h },
      isSimulated: h.isSimulated,
    });
  }

  for (const r of radiation) {
    events.push({
      id: `TL-${r.id}`,
      timestamp: r.recordedAt,
      category: r.qualityStatus !== 'VALID' ? 'QUALITY' : 'RADIATION',
      title: `${r.quantity}: ${r.value ?? 'NULL'} ${r.unit}`,
      summary: `${r.calibrationStatus} · ${r.deviceId}${r.doseRate !== null ? ` · Rate ${r.doseRate} ${r.doseRateUnit ?? ''}` : ''}`,
      severity: r.qualityStatus !== 'VALID' ? 'WATCH' : r.value !== null && r.value >= 1.5 ? 'WATCH' : 'INFO',
      qualityStatus: r.qualityStatus,
      sourceId: r.id,
      recordType: 'radiation_reading',
      metadata: { ...r },
      isSimulated: r.isSimulated,
    });
  }

  for (const e of environment) {
    events.push({
      id: `TL-${e.id}`,
      timestamp: e.recordedAt,
      category: 'ENVIRONMENT',
      title: `${e.location} ${e.metric}: ${e.value} ${e.unit}`,
      summary: `${e.provenance} (${e.qualityStatus})`,
      severity: e.metric === 'co2_mmhg' && e.value !== null && e.value >= 3.8 ? 'WATCH' : 'NONE',
      qualityStatus: e.qualityStatus,
      sourceId: e.id,
      recordType: 'environmental_reading',
      metadata: { ...e },
      isSimulated: e.isSimulated,
    });
  }

  for (const s of symptoms) {
    events.push({
      id: `TL-${s.id}`,
      timestamp: s.reportedAt,
      category: 'SYMPTOM',
      title: `Symptom: ${s.symptom} (${s.severityRating}/5)`,
      summary: s.notes,
      severity: s.severityRating >= 4 ? 'URGENT REVIEW' : s.severityRating >= 3 ? 'WATCH' : 'INFO',
      qualityStatus: 'VALID',
      sourceId: s.id,
      recordType: 'symptom_log',
      metadata: { ...s },
      isSimulated: s.isSimulated,
    });
  }

  for (const c of cognitive) {
    events.push({
      id: `TL-${c.id}`,
      timestamp: c.recordedAt,
      category: 'COGNITIVE',
      title: `${c.taskName}: ${c.reactionTimeMs} ms (${c.accuracyPct}%)`,
      summary: `Fatigue rating ${c.fatigueRating}/10`,
      severity: 'INFO',
      qualityStatus: c.qualityStatus,
      sourceId: c.id,
      recordType: 'cognitive_check',
      metadata: { ...c },
      isSimulated: c.isSimulated,
    });
  }

  for (const a of alerts) {
    events.push({
      id: `TL-${a.id}`,
      timestamp: a.createdAt,
      category: 'ALERT',
      title: `[${a.severity}] ${a.title}`,
      summary: a.whatHappened,
      severity: a.severity,
      qualityStatus: 'N/A',
      sourceId: a.id,
      recordType: 'alert',
      metadata: { ...a },
      isSimulated: a.isSimulated,
    });
    if (a.acknowledged && a.acknowledgedAt) {
      events.push({
        id: `TL-ACK-${a.id}`,
        timestamp: a.acknowledgedAt,
        category: 'SYSTEM',
        title: `Alert Acknowledged: ${a.id}`,
        summary: `Reviewed by ${a.acknowledgedBy}: ${a.acknowledgementNote || 'Confirmed'}`,
        severity: 'INFO',
        qualityStatus: 'N/A',
        sourceId: a.id,
        recordType: 'alert_acknowledgement',
        metadata: { ...a },
        isSimulated: true,
      });
    }
  }

  const validTimestamps = events
    .map((e) => Date.parse(e.timestamp))
    .filter((ms) => !Number.isNaN(ms));
  const latestMs =
    validTimestamps.length > 0
      ? Math.max(...validTimestamps)
      : Date.parse(DEMO_REFERENCE_NOW_ISO);
  const cutoffMs = latestMs - hours * 3600 * 1000;

  return events
    .filter((e) => {
      const t = Date.parse(e.timestamp);
      return Number.isNaN(t) || t >= cutoffMs;
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

export function getAstronautOverview(
  db: DatabaseSync,
  astronautId: string
): AstronautOverview | null {
  const settings = getSettingsFromDb(db);
  const astronauts = listAstronauts(db);
  const astronaut = astronauts.find((a) => a.id === astronautId) ?? astronauts[0];
  if (!astronaut) return null;

  const missions = listMissions(db);
  const mission = missions.find((m) => m.id === astronaut.missionId) ?? missions[0];
  const healthReadings = listHealthReadings(db, { astronautId: astronaut.id });
  const radiation = listRadiationReadings(db, mission.id);
  const environment = listEnvironmentalReadings(db, mission.id);
  const symptoms = listSymptoms(db, astronaut.id);
  const cognitive = listCognitiveChecks(db, astronaut.id);
  const baselines = listBaselines(db, astronaut.id);
  const alerts = listAlerts(db, astronaut.id);
  const outbox = listOutboxEntries(db);

  const metricsSeen = Array.from(new Set(healthReadings.map((h) => h.metric)));
  const latestMetrics = metricsSeen.map((metric) => {
    const series = healthReadings.filter((h) => h.metric === metric);
    const latest = series[series.length - 1];
    const baseline = baselines.find((b) => b.metric === metric);
    const zScore =
      latest && latest.qualityStatus === 'VALID'
        ? computeExperimentalZScore(latest.value, baseline)
        : null;
    return {
      metric,
      label: getMetricLabel(metric),
      value: latest?.value ?? null,
      unit: latest?.unit ?? baseline?.unit ?? '',
      recordedAt: latest?.recordedAt ?? '',
      qualityStatus: latest?.qualityStatus ?? 'MISSING',
      baselineMean: baseline?.mean ?? null,
      baselineStdDev: baseline?.stdDev ?? null,
      baselineSufficient: baseline?.isSufficient ?? false,
      zScore,
    };
  });

  const hrRows = healthReadings.filter((h) => h.metric === 'heart_rate');
  const latestHr = hrRows[hrRows.length - 1];
  const latestValidHr = [...hrRows].reverse().find((h) => h.qualityStatus === 'VALID' && h.value !== null);

  const validEnv = environment.filter((e) => e.qualityStatus === 'VALID').length;
  const envCoveragePct = environment.length > 0 ? Math.round((validEnv / environment.length) * 100) : 0;

  const qualityWarningsCount =
    healthReadings.filter((h) => h.qualityStatus !== 'VALID').length +
    radiation.filter((r) => r.qualityStatus !== 'VALID').length +
    environment.filter((e) => e.qualityStatus !== 'VALID').length;

  const activeReviewFlags = alerts.filter((a) => !a.acknowledged).length;
  const activityFeed = buildTimelineEvents(db, astronaut.id, 72).slice(0, 20);

  return {
    mission,
    astronaut,
    activeScenario: settings.activeScenario,
    summary: {
      healthRecordCount: healthReadings.length,
      activeReviewFlags,
      radiationRecordCount: radiation.length,
      environmentalCoveragePct: envCoveragePct,
      dataQualityWarnings: qualityWarningsCount,
      latestHealthTimestamp: healthReadings[healthReadings.length - 1]?.recordedAt ?? null,
      latestHeartRate:
        latestHr?.qualityStatus === 'VALID' ? latestHr.value : (latestValidHr?.value ?? null),
      latestHeartRateQuality: latestHr?.qualityStatus ?? null,
      pendingOutboxCount: outbox.length,
    },
    latestMetrics,
    recentHealthSeries: healthReadings,
    baselines,
    alerts,
    recentRadiation: radiation,
    recentEnvironment: environment,
    recentSymptoms: symptoms,
    recentCognitive: cognitive,
    activityFeed,
  };
}

export function runAnalyticsForCrew(db: DatabaseSync, astronautId: string): AlertRecord[] {
  const astronauts = listAstronauts(db);
  const astronaut = astronauts.find((a) => a.id === astronautId);
  if (!astronaut) return [];

  const healthReadings = listHealthReadings(db, { astronautId });
  const radiationReadings = listRadiationReadings(db, astronaut.missionId);
  const environmentalReadings = listEnvironmentalReadings(db, astronaut.missionId);
  const symptoms = listSymptoms(db, astronautId);
  const baselines = listBaselines(db, astronautId);
  const existingAlerts = listAlerts(db, astronautId);

  const evaluated = evaluateDeterministicAlerts({
    missionId: astronaut.missionId,
    astronautId,
    referenceNowIso: new Date().toISOString(),
    healthReadings,
    radiationReadings,
    environmentalReadings,
    symptoms,
    baselines,
    existingAlerts,
  });

  db.prepare('DELETE FROM alerts WHERE astronaut_id = ?').run(astronautId);
  const insertAlert = db.prepare(`
    INSERT INTO alerts
    (id, astronaut_id, mission_id, category, severity, created_at, rule_id, rule_version, title, what_happened, triggering_record_ids, measured_summary, baseline_summary, comparison_performed, missing_information, human_review_reason, data_quality_limitations, acknowledged, acknowledged_by, acknowledged_at, acknowledgement_note, is_simulated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  for (const a of evaluated) {
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

  logAudit(
    db,
    'ANALYTICS_ENGINE',
    'HEALTH_REVIEW_EXECUTED',
    'astronaut',
    astronautId,
    `Deterministic review completed; ${evaluated.length} alert(s) active.`
  );
  return evaluated;
}

export function explicitlyRecalculateBaseline(
  db: DatabaseSync,
  astronautId: string,
  metric: string,
  approvedBy: string,
  contextLabel: string
): BaselineProfile | null {
  const validReadings = listHealthReadings(db, { astronautId, metric, qualityStatus: 'VALID' }).filter(
    (r) => r.value !== null
  );
  const values = validReadings.map((r) => r.value as number);
  const stats = computeBaselineStatistics(values);
  const existing = listBaselines(db, astronautId).find((b) => b.metric === metric);
  const nextVersion = (existing?.baselineVersion ?? 0) + 1;
  const now = new Date().toISOString();
  const unit = validReadings[0]?.unit ?? existing?.unit ?? '';
  const start = validReadings[0]?.recordedAt ?? now;
  const end = validReadings[validReadings.length - 1]?.recordedAt ?? now;

  const updated: BaselineProfile = {
    id: existing?.id ?? `BL-${astronautId}-${metric}`,
    astronautId,
    metric,
    unit,
    mean: stats.mean,
    median: stats.median,
    stdDev: stats.stdDev,
    iqr: stats.iqr,
    sampleCount: stats.sampleCount,
    observationPeriodStart: start,
    observationPeriodEnd: end,
    baselineVersion: nextVersion,
    contextLabel,
    isSufficient: stats.isSufficient,
    approvedBy,
    updatedAt: now,
  };

  db.prepare(`
    INSERT OR REPLACE INTO baselines
    (id, astronaut_id, metric, unit, mean, median, std_dev, iqr, sample_count, observation_period_start, observation_period_end, baseline_version, context_label, is_sufficient, approved_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    updated.id,
    updated.astronautId,
    updated.metric,
    updated.unit,
    updated.mean,
    updated.median,
    updated.stdDev,
    updated.iqr,
    updated.sampleCount,
    updated.observationPeriodStart,
    updated.observationPeriodEnd,
    updated.baselineVersion,
    updated.contextLabel,
    updated.isSufficient ? 1 : 0,
    updated.approvedBy,
    updated.updatedAt
  );

  logAudit(
    db,
    approvedBy,
    'BASELINE_EXPLICITLY_UPDATED',
    'baseline',
    updated.id,
    `Updated ${metric} baseline to v${nextVersion} using n=${stats.sampleCount} VALID readings.`
  );
  return updated;
}

export function appendSimulatedTelemetryStep(
  db: DatabaseSync,
  astronautId: string
): { reading: HealthReading; alerts: AlertRecord[] } {
  const settings = getSettingsFromDb(db);
  const astronauts = listAstronauts(db);
  const crew = astronauts.find((a) => a.id === astronautId) ?? astronauts[0];
  const existingHr = listHealthReadings(db, { astronautId: crew.id, metric: 'heart_rate' });
  const lastValid = [...existingHr].reverse().find((r) => r.qualityStatus === 'VALID' && r.value !== null);
  const lastTsMs = existingHr.length
    ? Math.max(...existingHr.map((r) => Date.parse(r.recordedAt) || Date.parse(DEMO_REFERENCE_NOW_ISO)))
    : Date.parse(DEMO_REFERENCE_NOW_ISO);
  const nextTs = new Date(lastTsMs + 15 * 60 * 1000).toISOString();

  const baseVal = lastValid?.value ?? 66;
  const delta =
    settings.activeScenario === 'GRADUAL_HEALTH_DRIFT'
      ? 1.5 + (Math.random() * 1.2 - 0.3)
      : Math.random() * 4 - 2;
  const nextVal = Number(Math.max(48, Math.min(140, baseVal + delta)).toFixed(1));

  const devices = listDevices(db);
  const dev = devices.find((d) => d.id === 'DEV-BIO-HARNESS-01');
  const q = assessHealthQuality(
    { value: nextVal, unit: 'bpm', metric: 'heart_rate', recordedAt: nextTs, deviceId: 'DEV-BIO-HARNESS-01' },
    Date.parse(nextTs) + 60_000,
    dev,
    false
  );

  const id = `HR-LIVE-${Date.now().toString().slice(-6)}`;
  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO health_readings
    (id, astronaut_id, mission_id, device_id, metric, value, unit, recorded_at, received_at, quality_status, quality_notes, provenance, is_simulated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id,
    crew.id,
    crew.missionId,
    'DEV-BIO-HARNESS-01',
    'heart_rate',
    nextVal,
    'bpm',
    nextTs,
    nowIso,
    q.status,
    q.notes,
    'Simulated Live Telemetry Step'
  );

  if (settings.activeScenario === 'COMMUNICATION_BLACKOUT') {
    db.prepare(
      'INSERT INTO offline_outbox (id, operation_type, entity_type, entity_id, payload_summary, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      `OBX-${Date.now().toString().slice(-6)}`,
      'SYNC_HEALTH_READING',
      'health_reading',
      id,
      `Buffered live HR reading (${nextVal} bpm) while offline`,
      'PENDING',
      nowIso
    );
  }

  const alerts = runAnalyticsForCrew(db, crew.id);
  const created = listHealthReadings(db, { astronautId: crew.id, metric: 'heart_rate' }).find(
    (r) => r.id === id
  )!;
  return { reading: created, alerts };
}

export async function getSystemStatusReport(db: DatabaseSync): Promise<SystemStatusReport> {
  const settings = getSettingsFromDb(db);
  const docs = listKnowledgeDocuments(db);
  const chunks = listKnowledgeChunks(db);
  const outbox = listOutboxEntries(db);
  const reports = listReports(db);
  const missions = listMissions(db);
  const activeMission = missions.find((m) => m.id === settings.activeMissionId) ?? missions[0];

  const isBlackout = settings.activeScenario === 'COMMUNICATION_BLACKOUT';
  const ollama = isBlackout
    ? { available: false, models: [], error: 'Simulated COMMUNICATION_BLACKOUT active (or local daemon offline)' }
    : await checkOllamaAvailability(settings.ollamaBaseUrl, 900);

  let sqliteOk = true;
  try {
    db.prepare('SELECT 1').get();
  } catch {
    sqliteOk = false;
  }

  return {
    checkedAt: new Date().toISOString(),
    serverStatus: 'AVAILABLE',
    sqliteStatus: sqliteOk ? 'AVAILABLE' : 'UNAVAILABLE',
    sqlitePath: getDbPath(),
    ollamaStatus: ollama.available ? 'AVAILABLE' : 'UNAVAILABLE',
    ollamaEndpoint: settings.ollamaBaseUrl,
    configuredModel: settings.ollamaModel,
    availableModels: ollama.models,
    embeddingStatus: 'AVAILABLE',
    embeddingEngine: 'Local TF-IDF + BM25 Hybrid Vector Index (In-Process)',
    faissIndexStatus: 'AVAILABLE',
    indexedDocumentCount: docs.length,
    indexedChunkCount: chunks.length,
    reportServiceStatus: 'AVAILABLE',
    lastSuccessfulReportAt: reports[0]?.generatedAt ?? null,
    pendingOutboxCount: outbox.length,
    activeScenario: settings.activeScenario,
    commsStatus: activeMission?.commsStatus ?? 'CONNECTED',
    explanation: ollama.available
      ? `Local Ollama reachable at ${settings.ollamaBaseUrl} (${ollama.models.length} model(s) detected).`
      : `Local Ollama not detected at ${settings.ollamaBaseUrl}. Deterministic retrieval-only fallback and local document search remain fully operational.`,
    runtimeEnv: getPublicEnvSummary(),
  };
}
