import crypto from 'node:crypto';
import express from 'express';
import type { ScenarioName } from '../../shared/types.js';
import {
  assessHealthQuality,
  assessRadiationQuality,
  isValidIsoTimestamp,
} from '../analytics/engine.js';
import {
  chunkMarkdownDocument,
  queryOllamaGrounded,
  retrieveTopChunks,
} from '../copilot/retrieval.js';
import { loadEnvConfig } from '../config/env.js';
import { getDb } from '../db/database.js';
import {
  appendSimulatedTelemetryStep,
  buildTimelineEvents,
  explicitlyRecalculateBaseline,
  getAstronautOverview,
  getSystemStatusReport,
  listAlerts,
  listAstronauts,
  listAuditLogs,
  listBaselines,
  listCognitiveChecks,
  listDevices,
  listEnvironmentalReadings,
  listHealthReadings,
  listKnowledgeChunks,
  listKnowledgeDocuments,
  listMissions,
  listOutboxEntries,
  listRadiationReadings,
  listReports,
  listSymptoms,
  logAudit,
  runAnalyticsForCrew,
} from '../db/queries.js';
import {
  clearTelemetryData,
  getSettingsFromDb,
  loadScenarioSeed,
  updateSettingInDb,
} from '../db/seed.js';
import { parseCsvText, validateImportRecords } from '../ingestion/validator.js';
import { generateHandoverPdfBuffer, type HandoverReportPayload } from '../reports/pdfGenerator.js';

export function createApiRouter(): express.Router {
  const router = express.Router();

  router.get('/system/status', async (_req, res) => {
    try {
      const db = getDb();
      const status = await getSystemStatusReport(db);
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Status check failed' });
    }
  });

  router.get('/settings', (_req, res) => {
    const db = getDb();
    res.json(getSettingsFromDb(db));
  });

  router.put('/settings', (req, res) => {
    const db = getDb();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const allowedKeys = [
      'theme',
      'activeMissionId',
      'activeAstronautId',
      'ollamaBaseUrl',
      'ollamaModel',
      'preferredTempUnit',
      'defaultTimelineHours',
      'strictDuplicateRejection',
      'auditCopilotQueries',
      'liveTelemetryEnabled',
    ];
    for (const k of allowedKeys) {
      if (body[k] !== undefined) {
        updateSettingInDb(db, k, body[k]);
      }
    }
    logAudit(db, 'OPERATOR', 'SETTINGS_UPDATED', 'settings', 'global', 'Updated local preferences');
    res.json(getSettingsFromDb(db));
  });

  router.post('/settings/sync-env', (_req, res) => {
    const db = getDb();
    const env = loadEnvConfig();
    updateSettingInDb(db, 'ollamaBaseUrl', env.ollamaBaseUrl);
    updateSettingInDb(db, 'ollamaModel', env.ollamaModel);
    logAudit(
      db,
      'OPERATOR',
      'SETTINGS_SYNCED_FROM_ENV',
      'settings',
      'global',
      `Synced AI endpoint (${env.ollamaBaseUrl}) and model (${env.ollamaModel}) from environment variables`
    );
    res.json(getSettingsFromDb(db));
  });

  router.get('/missions', (_req, res) => {
    res.json(listMissions(getDb()));
  });

  router.get('/devices', (_req, res) => {
    res.json(listDevices(getDb()));
  });

  router.get('/astronauts', (_req, res) => {
    res.json(listAstronauts(getDb()));
  });

  router.get('/astronauts/:id/overview', (req, res) => {
    const db = getDb();
    const overview = getAstronautOverview(db, req.params.id);
    if (!overview) {
      return res.status(404).json({ error: `Astronaut ${req.params.id} not found` });
    }
    res.json(overview);
  });

  router.get('/readings/health', (req, res) => {
    const db = getDb();
    const hours = req.query.hours ? Number(req.query.hours) : undefined;
    res.json(
      listHealthReadings(db, {
        astronautId: req.query.astronautId ? String(req.query.astronautId) : undefined,
        metric: req.query.metric ? String(req.query.metric) : undefined,
        deviceId: req.query.deviceId ? String(req.query.deviceId) : undefined,
        qualityStatus: req.query.qualityStatus ? String(req.query.qualityStatus) : undefined,
        hours: hours && !Number.isNaN(hours) ? hours : undefined,
      })
    );
  });

  router.post('/readings/health', (req, res) => {
    const db = getDb();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const astronautId = String(body.astronautId || '').trim();
    const missionId = String(body.missionId || 'MIS-LUNAR-04').trim();
    const deviceId = String(body.deviceId || 'DEV-BIO-HARNESS-01').trim();
    const metric = String(body.metric || '').trim();
    const unit = String(body.unit || '').trim();
    const recordedAt = String(body.recordedAt || new Date().toISOString()).trim();
    const value = body.value === null || body.value === undefined || body.value === '' ? null : Number(body.value);

    if (!astronautId || !metric || !unit) {
      return res.status(400).json({ error: 'astronautId, metric, and unit are required.' });
    }

    const devices = listDevices(db);
    const device = devices.find((d) => d.id === deviceId);
    const existing = listHealthReadings(db, { astronautId, metric });
    const isDuplicate = existing.some(
      (r) => r.recordedAt === recordedAt && r.value === value
    );

    const quality = assessHealthQuality(
      { value, unit, metric, recordedAt, deviceId },
      Date.now(),
      device,
      isDuplicate
    );

    const id = String(body.id || `HR-MAN-${Date.now().toString().slice(-6)}`);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO health_readings
      (id, astronaut_id, mission_id, device_id, metric, value, unit, recorded_at, received_at, quality_status, quality_notes, provenance, is_simulated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      astronautId,
      missionId,
      deviceId,
      metric,
      value,
      unit,
      recordedAt,
      now,
      quality.status,
      quality.notes,
      String(body.provenance || 'Manual Operator Entry (Simulated)')
    );

    const settings = getSettingsFromDb(db);
    if (settings.activeScenario === 'COMMUNICATION_BLACKOUT') {
      db.prepare(
        'INSERT INTO offline_outbox (id, operation_type, entity_type, entity_id, payload_summary, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        `OBX-${Date.now()}`,
        'SYNC_HEALTH_READING',
        'health_reading',
        id,
        `Queued ${metric}=${value ?? 'NULL'} ${unit}`,
        'PENDING',
        now
      );
    }

    runAnalyticsForCrew(db, astronautId);
    logAudit(db, 'OPERATOR', 'HEALTH_READING_ADDED', 'health_reading', id, `${metric}=${value} ${unit} (${quality.status})`);
    res.status(201).json({ id, qualityStatus: quality.status, qualityNotes: quality.notes });
  });

  router.get('/readings/radiation', (req, res) => {
    const db = getDb();
    res.json(
      listRadiationReadings(
        db,
        req.query.missionId ? String(req.query.missionId) : undefined
      )
    );
  });

  router.post('/readings/radiation', (req, res) => {
    const db = getDb();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const missionId = String(body.missionId || 'MIS-LUNAR-04');
    const deviceId = String(body.deviceId || 'DEV-DOS-SIL-01');
    const quantity = String(body.quantity || 'ABSORBED_DOSE') as 'ABSORBED_DOSE' | 'EFFECTIVE_DOSE' | 'AMBIENT_DOSE_EQUIVALENT';
    const unit = String(body.unit || '').trim();
    const value = body.value === null || body.value === '' ? null : Number(body.value);
    const recordedAt = String(body.recordedAt || new Date().toISOString());
    const calibrationStatus = String(body.calibrationStatus || 'CALIBRATED') as 'CALIBRATED' | 'UNCALIBRATED' | 'UNKNOWN';
    const uncertainty = body.uncertainty !== undefined && body.uncertainty !== '' ? Number(body.uncertainty) : null;

    const quality = assessRadiationQuality({
      quantity,
      value,
      unit,
      recordedAt,
      calibrationStatus,
      uncertainty,
    });

    if (quality.status === 'INVALID') {
      return res.status(400).json({ error: quality.notes });
    }

    const id = String(body.id || `RAD-MAN-${Date.now().toString().slice(-6)}`);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO radiation_readings
      (id, mission_id, astronaut_id, device_id, quantity, value, unit, dose_rate, dose_rate_unit, uncertainty, calibration_ref, calibration_status, recorded_at, received_at, quality_status, quality_notes, provenance, is_simulated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      missionId,
      body.astronautId ? String(body.astronautId) : 'AST-VANCE',
      deviceId,
      quantity,
      value,
      unit,
      body.doseRate ? Number(body.doseRate) : null,
      body.doseRateUnit ? String(body.doseRateUnit) : null,
      uncertainty,
      String(body.calibrationRef || 'NIST-SIM-MANUAL'),
      calibrationStatus,
      recordedAt,
      now,
      quality.status,
      quality.notes,
      String(body.provenance || 'Manual Dosimetry Entry (Simulated)')
    );
    logAudit(db, 'OPERATOR', 'RADIATION_READING_ADDED', 'radiation_reading', id, `${quantity} ${value} ${unit}`);
    res.status(201).json({ id, qualityStatus: quality.status });
  });

  router.get('/readings/environment', (req, res) => {
    const db = getDb();
    res.json(
      listEnvironmentalReadings(
        db,
        req.query.missionId ? String(req.query.missionId) : undefined
      )
    );
  });

  router.post('/readings/environment', (req, res) => {
    const db = getDb();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const metric = String(body.metric || '').trim();
    const unit = String(body.unit || '').trim();
    const value = Number(body.value);
    const recordedAt = String(body.recordedAt || new Date().toISOString());

    if (!metric || !unit || Number.isNaN(value) || !isValidIsoTimestamp(recordedAt)) {
      return res.status(400).json({ error: 'Valid metric, unit, numeric value, and ISO timestamp required.' });
    }

    const id = `ENV-MAN-${Date.now().toString().slice(-6)}`;
    db.prepare(`
      INSERT INTO environmental_readings
      (id, mission_id, device_id, location, metric, value, unit, recorded_at, received_at, quality_status, quality_notes, provenance, is_simulated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'VALID', 'Manual habitat log verified.', ?, 1)
    `).run(
      id,
      String(body.missionId || 'MIS-LUNAR-04'),
      String(body.deviceId || 'DEV-ENV-CABIN-01'),
      String(body.location || 'Crew Hab Node 1'),
      metric,
      value,
      unit,
      recordedAt,
      new Date().toISOString(),
      String(body.provenance || 'Manual Habitat Entry (Simulated)')
    );
    res.status(201).json({ id });
  });

  router.get('/symptoms', (req, res) => {
    res.json(
      listSymptoms(
        getDb(),
        req.query.astronautId ? String(req.query.astronautId) : undefined
      )
    );
  });

  router.post('/symptoms', (req, res) => {
    const db = getDb();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const astronautId = String(body.astronautId || '').trim();
    const symptom = String(body.symptom || '').trim();
    const severityRating = Number(body.severityRating ?? 2);
    const durationMinutes = Number(body.durationMinutes ?? 30);
    const notes = String(body.notes || '').trim();
    const reportedAt = String(body.reportedAt || new Date().toISOString());

    if (!astronautId || !symptom) {
      return res.status(400).json({ error: 'astronautId and symptom description are required.' });
    }

    const id = `SYM-MAN-${Date.now().toString().slice(-6)}`;
    const astronauts = listAstronauts(db);
    const crew = astronauts.find((a) => a.id === astronautId);
    const missionId = crew?.missionId || 'MIS-LUNAR-04';

    db.prepare(`
      INSERT INTO symptom_logs
      (id, astronaut_id, mission_id, symptom, severity_rating, duration_minutes, notes, reported_at, provenance, is_simulated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      astronautId,
      missionId,
      symptom,
      Math.min(5, Math.max(1, severityRating)),
      Math.max(1, durationMinutes),
      notes || 'Logged via ASTROSAGE console.',
      reportedAt,
      'Crew Self-Report (Simulated)'
    );

    const settings = getSettingsFromDb(db);
    if (settings.activeScenario === 'COMMUNICATION_BLACKOUT') {
      db.prepare(
        'INSERT INTO offline_outbox (id, operation_type, entity_type, entity_id, payload_summary, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        `OBX-${Date.now()}`,
        'SYNC_SYMPTOM_LOG',
        'symptom_log',
        id,
        `Queued symptom "${symptom}" (${severityRating}/5)`,
        'PENDING',
        new Date().toISOString()
      );
    }

    const alerts = runAnalyticsForCrew(db, astronautId);
    logAudit(db, 'CREW_LOG', 'SYMPTOM_LOGGED', 'symptom_log', id, `${symptom} (${severityRating}/5)`);
    res.status(201).json({ id, alerts });
  });

  router.get('/cognitive', (req, res) => {
    res.json(
      listCognitiveChecks(
        getDb(),
        req.query.astronautId ? String(req.query.astronautId) : undefined
      )
    );
  });

  router.get('/timeline', (req, res) => {
    const db = getDb();
    const settings = getSettingsFromDb(db);
    const astronautId = String(req.query.astronautId || settings.activeAstronautId);
    const hours = Number(req.query.hours || settings.defaultTimelineHours || 72);
    const categoriesParam = req.query.categories ? String(req.query.categories) : '';
    const allowedCats = categoriesParam
      ? new Set(categoriesParam.split(',').map((c) => c.trim().toUpperCase()))
      : null;

    let events = buildTimelineEvents(db, astronautId, Number.isNaN(hours) ? 72 : hours);
    if (allowedCats && allowedCats.size > 0) {
      events = events.filter((e) => allowedCats.has(e.category));
    }
    res.json(events);
  });

  router.get('/baselines/:astronautId', (req, res) => {
    res.json(listBaselines(getDb(), req.params.astronautId));
  });

  router.post('/baselines/:astronautId/recalculate', (req, res) => {
    const db = getDb();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const metric = String(body.metric || '').trim();
    const approvedBy = String(body.approvedBy || 'Flight Surgeon Operator (Simulated)').trim();
    const contextLabel = String(body.contextLabel || 'Explicit Operator Recalculation').trim();
    if (!metric) {
      return res.status(400).json({ error: 'metric is required to recalculate baseline.' });
    }
    const updated = explicitlyRecalculateBaseline(
      db,
      req.params.astronautId,
      metric,
      approvedBy,
      contextLabel
    );
    runAnalyticsForCrew(db, req.params.astronautId);
    res.json(updated);
  });

  router.post('/analytics/run', (req, res) => {
    const db = getDb();
    const settings = getSettingsFromDb(db);
    const astronautId = String((req.body as Record<string, unknown>)?.astronautId || settings.activeAstronautId);
    const alerts = runAnalyticsForCrew(db, astronautId);
    res.json({ astronautId, alertCount: alerts.length, alerts });
  });

  router.get('/alerts', (req, res) => {
    res.json(
      listAlerts(
        getDb(),
        req.query.astronautId ? String(req.query.astronautId) : undefined
      )
    );
  });

  router.post('/alerts/:id/acknowledge', (req, res) => {
    const db = getDb();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const reviewer = String(body.acknowledgedBy || 'Flight Medical Reviewer').trim();
    const note = String(body.note || 'Reviewed supporting telemetry and baseline evidence.').trim();
    const now = new Date().toISOString();

    const existing = db.prepare('SELECT id FROM alerts WHERE id = ?').get(req.params.id) as { id: string } | undefined;
    if (!existing) {
      return res.status(404).json({ error: `Alert ${req.params.id} not found` });
    }

    db.prepare(`
      UPDATE alerts
      SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ?, acknowledgement_note = ?
      WHERE id = ?
    `).run(reviewer, now, note, req.params.id);

    logAudit(db, reviewer, 'ALERT_ACKNOWLEDGED', 'alert', req.params.id, note);
    const updated = listAlerts(db).find((a) => a.id === req.params.id);
    res.json(updated);
  });

  router.get('/knowledge/documents', (_req, res) => {
    res.json(listKnowledgeDocuments(getDb()));
  });

  router.get('/knowledge/search', (req, res) => {
    const db = getDb();
    const q = String(req.query.q || '').trim();
    const chunks = listKnowledgeChunks(db);
    if (!q) {
      return res.json([]);
    }
    const hits = retrieveTopChunks(q, chunks, 6);
    res.json(hits);
  });

  router.post('/knowledge/documents', (req, res) => {
    const db = getDb();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = String(body.title || '').trim();
    const sourceName = String(body.sourceName || 'custom-protocol.md').trim();
    const content = String(body.content || '').trim();
    if (!title || content.length < 30) {
      return res.status(400).json({ error: 'Document title and at least 30 characters of content are required.' });
    }

    const docId = `DOC-USR-${Date.now().toString().slice(-6)}`;
    const { chunks } = chunkMarkdownDocument(docId, sourceName, `# ${title}\n${content}`);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO knowledge_documents
      (id, title, source_name, version, published_date, category, chunk_count, is_builtin, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(docId, title, sourceName, String(body.version || '1.0.0'), now.slice(0, 10), String(body.category || 'User Protocol'), chunks.length, now);

    const insertChunk = db.prepare(`
      INSERT INTO knowledge_chunks
      (id, document_id, source_title, source_name, version, section, page_number, content)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of chunks) {
      insertChunk.run(c.id, c.documentId, title, c.sourceName, c.version, c.section, c.pageNumber, c.content);
    }

    logAudit(db, 'OPERATOR', 'KNOWLEDGE_DOC_INDEXED', 'knowledge_document', docId, `Indexed "${title}" (${chunks.length} chunks)`);
    res.status(201).json({ id: docId, chunkCount: chunks.length });
  });

  router.post('/copilot/ask', async (req, res) => {
    try {
      const db = getDb();
      const settings = getSettingsFromDb(db);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const question = String(body.question || '').trim();
      const astronautId = String(body.astronautId || settings.activeAstronautId);

      if (!question) {
        return res.status(400).json({ error: 'A question is required.' });
      }

      const overview = getAstronautOverview(db, astronautId);
      if (!overview) {
        return res.status(404).json({ error: 'Crew overview unavailable.' });
      }

      const chunks = listKnowledgeChunks(db);
      const citations = retrieveTopChunks(question, chunks, 4);
      const env = loadEnvConfig();

      const response = await queryOllamaGrounded(
        settings.ollamaBaseUrl,
        settings.ollamaModel,
        question,
        overview,
        citations,
        env.ollamaTimeoutMs
      );

      if (settings.auditCopilotQueries) {
        logAudit(
          db,
          'COPILOT',
          'COPILOT_QUERY_ANSWERED',
          'copilot',
          response.id,
          `[${response.mode}] Q="${question.slice(0, 80)}" | Citations=${response.citations.length}`
        );
      }

      res.json(response);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Copilot processing failed' });
    }
  });

  router.get('/reports', (_req, res) => {
    res.json(listReports(getDb()));
  });

  router.post('/reports/generate', (req, res) => {
    const db = getDb();
    const settings = getSettingsFromDb(db);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const astronautId = String(body.astronautId || settings.activeAstronautId);
    const windowHours = Number(body.windowHours || 72);
    const includedSections = Array.isArray(body.includedSections)
      ? body.includedSections.map(String)
      : ['health', 'symptoms', 'radiation', 'environment', 'alerts', 'quality'];

    const overview = getAstronautOverview(db, astronautId);
    if (!overview) {
      return res.status(404).json({ error: 'Astronaut profile not found.' });
    }

    const healthWindow = listHealthReadings(db, { astronautId, hours: windowHours });
    const qualityWarnings = [
      ...healthWindow
        .filter((h) => h.qualityStatus !== 'VALID')
        .map((h) => ({ id: h.id, status: h.qualityStatus, notes: h.qualityNotes, recordedAt: h.recordedAt })),
      ...overview.recentRadiation
        .filter((r) => r.qualityStatus !== 'VALID')
        .map((r) => ({ id: r.id, status: r.qualityStatus, notes: r.qualityNotes, recordedAt: r.recordedAt })),
    ];

    const docs = listKnowledgeDocuments(db);
    const reportId = `RPT-${Date.now().toString().slice(-8)}`;
    const generatedAt = new Date().toISOString();

    const payloadWithoutHash = {
      reportId,
      generatedAt,
      windowHours,
      mission: overview.mission,
      astronaut: overview.astronaut,
      includedSections,
      healthReadings: healthWindow,
      baselines: overview.baselines,
      symptoms: overview.recentSymptoms,
      radiationReadings: overview.recentRadiation,
      environmentalReadings: overview.recentEnvironment,
      alerts: overview.alerts,
      qualityWarnings,
      references: docs.map((d) => ({ title: d.title, section: d.category, version: d.version })),
    };

    const contentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(payloadWithoutHash))
      .digest('hex');

    const fullPayload: HandoverReportPayload = {
      ...payloadWithoutHash,
      contentHash,
    };

    const title = `${overview.astronaut.callsign} Medical Handover (${windowHours}h · ${overview.activeScenario})`;
    db.prepare(`
      INSERT INTO reports
      (id, mission_id, astronaut_id, title, window_hours, generated_at, content_hash, included_sections, summary_json, is_simulated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      reportId,
      overview.mission.id,
      overview.astronaut.id,
      title,
      windowHours,
      generatedAt,
      contentHash,
      JSON.stringify(includedSections),
      JSON.stringify(fullPayload)
    );

    logAudit(db, 'OPERATOR', 'HANDOVER_REPORT_GENERATED', 'report', reportId, `SHA256=${contentHash.slice(0, 16)}...`);
    res.status(201).json({
      id: reportId,
      missionId: overview.mission.id,
      astronautId: overview.astronaut.id,
      title,
      windowHours,
      generatedAt,
      contentHash,
      includedSections,
      summaryJson: JSON.stringify(fullPayload),
      isSimulated: true,
    });
  });

  router.get('/reports/:id/pdf', async (req, res) => {
    try {
      const db = getDb();
      const report = listReports(db).find((r) => r.id === req.params.id);
      if (!report) {
        return res.status(404).json({ error: 'Report not found.' });
      }
      const payload = JSON.parse(report.summaryJson) as HandoverReportPayload;
      const pdfBuffer = await generateHandoverPdfBuffer(payload);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="astrosage-handover-${report.id}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'PDF generation error' });
    }
  });

  router.get('/reports/:id/json', (req, res) => {
    const db = getDb();
    const report = listReports(db).find((r) => r.id === req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found.' });
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="astrosage-handover-${report.id}.json"`);
    res.send(report.summaryJson);
  });

  router.post('/import', (req, res) => {
    const db = getDb();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const datasetType = String(body.datasetType || 'health') as
      | 'health'
      | 'radiation'
      | 'environment'
      | 'symptoms';
    const format = String(body.format || 'csv') as 'csv' | 'json';
    const rawContent = String(body.content || '');

    let parsedRows: Array<Record<string, unknown>> = [];
    try {
      if (format === 'csv') {
        parsedRows = parseCsvText(rawContent);
      } else {
        const json = JSON.parse(rawContent);
        if (!Array.isArray(json)) {
          return res.status(400).json({ error: 'JSON import must be an array of record objects.' });
        }
        parsedRows = json as Array<Record<string, unknown>>;
      }
    } catch (err) {
      return res.status(400).json({
        error: `Failed to parse ${format.toUpperCase()}: ${err instanceof Error ? err.message : 'Syntax error'}`,
      });
    }

    const existingHealth = listHealthReadings(db);
    const existingRad = listRadiationReadings(db);
    const existingEnv = listEnvironmentalReadings(db);
    const existingSym = listSymptoms(db);

    const existingIds = new Set<string>([
      ...existingHealth.map((r) => r.id),
      ...existingRad.map((r) => r.id),
      ...existingEnv.map((r) => r.id),
      ...existingSym.map((r) => r.id),
    ]);

    const existingSigs = new Set<string>(
      existingHealth.map((r) => `${r.astronautId}|${r.metric}|${r.recordedAt}|${r.value}`)
    );

    const { summary, acceptedRows } = validateImportRecords(
      datasetType,
      parsedRows,
      existingIds,
      existingSigs
    );

    const now = new Date().toISOString();
    const devices = listDevices(db);

    if (datasetType === 'health') {
      const stmt = db.prepare(`
        INSERT INTO health_readings
        (id, astronaut_id, mission_id, device_id, metric, value, unit, recorded_at, received_at, quality_status, quality_notes, provenance, is_simulated)
        VALUES (?, ?, 'MIS-LUNAR-04', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      for (const row of acceptedRows) {
        const dev = devices.find((d) => d.id === String(row.deviceId));
        const q = assessHealthQuality(
          {
            value: Number(row.value),
            unit: String(row.unit),
            metric: String(row.metric),
            recordedAt: String(row.recordedAt),
            deviceId: String(row.deviceId),
          },
          Date.now(),
          dev,
          false,
          720 // imported historical rows allowed within 30 days
        );
        stmt.run(
          String(row.id),
          String(row.astronautId),
          String(row.deviceId),
          String(row.metric),
          Number(row.value),
          String(row.unit),
          String(row.recordedAt),
          now,
          q.status,
          q.notes,
          String(row.provenance)
        );
      }
    } else if (datasetType === 'radiation') {
      const stmt = db.prepare(`
        INSERT INTO radiation_readings
        (id, mission_id, astronaut_id, device_id, quantity, value, unit, dose_rate, dose_rate_unit, uncertainty, calibration_ref, calibration_status, recorded_at, received_at, quality_status, quality_notes, provenance, is_simulated)
        VALUES (?, 'MIS-LUNAR-04', 'AST-VANCE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      for (const row of acceptedRows) {
        const q = assessRadiationQuality({
          quantity: row.quantity as 'ABSORBED_DOSE',
          value: Number(row.value),
          unit: String(row.unit),
          recordedAt: String(row.recordedAt),
          calibrationStatus: String(row.calibrationStatus) as 'CALIBRATED',
          uncertainty: row.uncertainty !== null ? Number(row.uncertainty) : null,
        });
        stmt.run(
          String(row.id),
          String(row.deviceId),
          String(row.quantity),
          Number(row.value),
          String(row.unit),
          row.doseRate !== null ? Number(row.doseRate) : null,
          row.doseRateUnit ? String(row.doseRateUnit) : null,
          row.uncertainty !== null ? Number(row.uncertainty) : null,
          String(row.calibrationRef),
          String(row.calibrationStatus),
          String(row.recordedAt),
          now,
          q.status,
          q.notes,
          String(row.provenance)
        );
      }
    } else if (datasetType === 'environment') {
      const stmt = db.prepare(`
        INSERT INTO environmental_readings
        (id, mission_id, device_id, location, metric, value, unit, recorded_at, received_at, quality_status, quality_notes, provenance, is_simulated)
        VALUES (?, 'MIS-LUNAR-04', ?, ?, ?, ?, ?, ?, ?, 'VALID', 'Imported habitat reading verified.', ?, 1)
      `);
      for (const row of acceptedRows) {
        stmt.run(
          String(row.id),
          String(row.deviceId),
          String(row.location),
          String(row.metric),
          Number(row.value),
          String(row.unit),
          String(row.recordedAt),
          now,
          String(row.provenance)
        );
      }
    } else {
      const stmt = db.prepare(`
        INSERT INTO symptom_logs
        (id, astronaut_id, mission_id, symptom, severity_rating, duration_minutes, notes, reported_at, provenance, is_simulated)
        VALUES (?, ?, 'MIS-LUNAR-04', ?, ?, ?, ?, ?, ?, 1)
      `);
      for (const row of acceptedRows) {
        stmt.run(
          String(row.id),
          String(row.astronautId),
          String(row.symptom),
          Number(row.severityRating),
          Number(row.durationMinutes),
          String(row.notes),
          String(row.reportedAt),
          String(row.provenance)
        );
      }
    }

    logAudit(
      db,
      'INGESTION',
      'DATASET_IMPORTED',
      datasetType,
      `BATCH-${Date.now()}`,
      `Received=${summary.rowsReceived}, Accepted=${summary.rowsAccepted}, Rejected=${summary.rowsRejected}`
    );
    res.json(summary);
  });

  router.get('/sync/outbox', (_req, res) => {
    res.json(listOutboxEntries(getDb()));
  });

  router.get('/audit', (_req, res) => {
    res.json(listAuditLogs(getDb(), 60));
  });

  router.post('/demo/scenario/:name', (req, res) => {
    const db = getDb();
    const raw = req.params.name.toUpperCase() as ScenarioName;
    const valid: ScenarioName[] = [
      'NORMAL_MISSION',
      'GRADUAL_HEALTH_DRIFT',
      'EXPOSURE_CONTEXT',
      'SENSOR_FAULT',
      'COMMUNICATION_BLACKOUT',
    ];
    if (!valid.includes(raw)) {
      return res.status(400).json({ error: `Unknown scenario "${req.params.name}"` });
    }
    const result = loadScenarioSeed(db, raw);
    res.json(result);
  });

  router.post('/demo/reset', (_req, res) => {
    const db = getDb();
    const settings = getSettingsFromDb(db);
    const result = loadScenarioSeed(db, settings.activeScenario);
    res.json(result);
  });

  router.post('/demo/clear', (_req, res) => {
    const db = getDb();
    clearTelemetryData(db, false);
    logAudit(db, 'OPERATOR', 'DEMO_DATA_CLEARED', 'database', 'telemetry', 'Cleared all simulated telemetry records.');
    res.json({ cleared: true });
  });

  router.post('/demo/telemetry-step', (req, res) => {
    const db = getDb();
    const settings = getSettingsFromDb(db);
    const astronautId = String((req.body as Record<string, unknown>)?.astronautId || settings.activeAstronautId);
    const result = appendSimulatedTelemetryStep(db, astronautId);
    res.json(result);
  });

  router.get('/backup/export', (_req, res) => {
    const db = getDb();
    const backup = {
      exportedAt: new Date().toISOString(),
      app: 'ASTROSAGE',
      settings: getSettingsFromDb(db),
      missions: listMissions(db),
      astronauts: listAstronauts(db),
      devices: listDevices(db),
      healthReadings: listHealthReadings(db),
      radiationReadings: listRadiationReadings(db),
      environmentalReadings: listEnvironmentalReadings(db),
      symptoms: listSymptoms(db),
      cognitiveChecks: listCognitiveChecks(db),
      alerts: listAlerts(db),
      outbox: listOutboxEntries(db),
      auditLogs: listAuditLogs(db, 100),
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="astrosage-local-backup.json"');
    res.send(JSON.stringify(backup, null, 2));
  });

  return router;
}
