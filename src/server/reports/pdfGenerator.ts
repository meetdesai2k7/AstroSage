import PDFDocument from 'pdfkit';
import type {
  AlertRecord,
  AstronautProfile,
  BaselineProfile,
  EnvironmentalReading,
  HealthReading,
  Mission,
  RadiationReading,
  SymptomLog,
} from '../../shared/types.js';
import { getMetricLabel } from '../analytics/engine.js';

export interface HandoverReportPayload {
  reportId: string;
  generatedAt: string;
  contentHash: string;
  windowHours: number;
  mission: Mission;
  astronaut: AstronautProfile;
  includedSections: string[];
  healthReadings: HealthReading[];
  baselines: BaselineProfile[];
  symptoms: SymptomLog[];
  radiationReadings: RadiationReading[];
  environmentalReadings: EnvironmentalReading[];
  alerts: AlertRecord[];
  qualityWarnings: Array<{ id: string; status: string; notes: string; recordedAt: string }>;
  references: Array<{ title: string; section: string; version: string }>;
}

export async function generateHandoverPdfBuffer(payload: HandoverReportPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 46,
      info: {
        Title: `ASTROSAGE Medical Handover Report ${payload.reportId}`,
        Author: 'ASTROSAGE Offline Research Prototype',
        Subject: `Simulated Crew Handover — ${payload.astronaut.callsign}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const ink = '#0F172A';
    const muted = '#475569';
    const border = '#CBD5E1';
    const teal = '#0F766E';
    const amber = '#B45309';

    // Header
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor(ink)
      .text('ASTROSAGE — MEDICAL HANDOVER SUMMARY REPORT', { align: 'left' });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(muted)
      .text(`Report ID: ${payload.reportId}  |  Generated: ${payload.generatedAt}  |  Window: Last ${payload.windowHours}h`);
    doc.text(`SHA-256 Integrity Reference: ${payload.contentHash}`);

    doc.moveDown(0.5);
    doc.moveTo(46, doc.y).lineTo(549, doc.y).strokeColor(border).lineWidth(1).stroke();
    doc.moveDown(0.6);

    // Simulation & Human Review Banner
    const boxY = doc.y;
    doc.rect(46, boxY, 503, 44).fillAndStroke('#F8FAFC', border);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(amber)
      .text('SIMULATION & HUMAN-REVIEW DECLARATION', 56, boxY + 8);
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(ink)
      .text(
        'Prepared to support human medical review. This is not a diagnosis or clinical clearance. All records shown are synthetic demonstration telemetry.',
        56,
        boxY + 21,
        { width: 483 }
      );
    doc.y = boxY + 54;

    const sectionTitle = (num: string, title: string) => {
      if (doc.y > 720) doc.addPage();
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(teal).text(`${num}. ${title}`);
      doc.moveTo(46, doc.y + 2).lineTo(549, doc.y + 2).strokeColor(border).lineWidth(0.5).stroke();
      doc.moveDown(0.4);
      doc.fillColor(ink).font('Helvetica').fontSize(9);
    };

    // Crew & Mission Details
    sectionTitle('1', 'Crew & Mission Details');
    doc.text(`Mission: ${payload.mission.name} (${payload.mission.code}) — Phase: ${payload.mission.phase}`);
    doc.text(`Comms State: ${payload.mission.commsStatus}  |  Simulated Mission Elapsed Time: ${payload.mission.simulatedElapsedHours.toFixed(1)} hrs`);
    doc.text(`Crew Profile: ${payload.astronaut.name} (${payload.astronaut.callsign}) — ${payload.astronaut.role} | Age Group: ${payload.astronaut.ageGroup}`);

    // Health Summary & Baselines
    if (payload.includedSections.includes('health')) {
      sectionTitle('2', 'Health Measurement Summary & Personal Baselines');
      const metrics = Array.from(new Set(payload.healthReadings.map((r) => r.metric)));
      if (metrics.length === 0) {
        doc.text('No health measurements in selected window.');
      } else {
        for (const metric of metrics) {
          const valid = payload.healthReadings.filter(
            (r) => r.metric === metric && r.qualityStatus === 'VALID' && r.value !== null
          );
          const baseline = payload.baselines.find((b) => b.metric === metric);
          if (valid.length > 0) {
            const vals = valid.map((v) => v.value as number);
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            const latest = valid[valid.length - 1];
            const bStr =
              baseline && baseline.isSufficient
                ? `Baseline v${baseline.baselineVersion}: mean ${baseline.mean} ${baseline.unit}, SD ${baseline.stdDev}, IQR ${baseline.iqr} (n=${baseline.sampleCount})`
                : `Baseline: insufficient samples (n=${baseline?.sampleCount ?? 0})`;
            doc
              .font('Helvetica-Bold')
              .text(`${getMetricLabel(metric)}: latest ${latest.value} ${latest.unit} (range ${min}–${max}, valid n=${valid.length})`)
              .font('Helvetica')
              .fillColor(muted)
              .text(`   ${bStr} | Latest timestamp: ${latest.recordedAt}`)
              .fillColor(ink);
          }
        }
      }
    }

    // Symptoms
    if (payload.includedSections.includes('symptoms')) {
      sectionTitle('3', 'Reported Symptoms & Crew Observations');
      if (payload.symptoms.length === 0) {
        doc.text('No symptoms reported in the selected review window.');
      } else {
        for (const s of payload.symptoms) {
          doc.text(`• [${s.reportedAt}] ${s.symptom} — Severity ${s.severityRating}/5 (${s.durationMinutes} min): ${s.notes}`);
        }
      }
    }

    // Radiation & Environment
    if (payload.includedSections.includes('radiation') || payload.includedSections.includes('environment')) {
      sectionTitle('4', 'Radiation & Environmental Context');
      doc
        .font('Helvetica-Oblique')
        .fontSize(8.5)
        .fillColor(muted)
        .text('Scientific Note: Gray (Gy) and Sievert (Sv) represent distinct quantities and are preserved separately. Temporal overlap does not establish causation.')
        .font('Helvetica')
        .fontSize(9)
        .fillColor(ink);
      doc.moveDown(0.25);
      for (const r of payload.radiationReadings.slice(0, 8)) {
        doc.text(
          `• [${r.recordedAt}] ${r.quantity}: ${r.value ?? 'NULL'} ${r.unit} (${r.qualityStatus}) | Device ${r.deviceId} (${r.calibrationStatus})`
        );
      }
      for (const e of payload.environmentalReadings.slice(0, 8)) {
        doc.text(
          `• [${e.recordedAt}] ${e.location} ${e.metric}: ${e.value ?? 'NULL'} ${e.unit} (${e.qualityStatus})`
        );
      }
    }

    // Review Flags
    if (payload.includedSections.includes('alerts')) {
      sectionTitle('5', 'Deterministic Review Flags & Supporting Evidence');
      if (payload.alerts.length === 0) {
        doc.text('No deterministic review flags active.');
      } else {
        for (const a of payload.alerts) {
          if (doc.y > 700) doc.addPage();
          doc.font('Helvetica-Bold').text(`[${a.severity}] ${a.title} (${a.ruleId} v${a.ruleVersion})`);
          doc.font('Helvetica').text(`   What happened: ${a.whatHappened}`);
          doc.text(`   Evidence: ${a.measuredSummary}`);
          doc.text(`   Status: ${a.acknowledged ? `Acknowledged by ${a.acknowledgedBy} at ${a.acknowledgedAt}` : 'Unacknowledged — pending human review'}`);
          doc.moveDown(0.2);
        }
      }
    }

    // Data quality limitations
    if (payload.includedSections.includes('quality')) {
      sectionTitle('6', 'Data-Quality Limitations');
      if (payload.qualityWarnings.length === 0) {
        doc.text('No data-quality anomalies detected in the selected review window.');
      } else {
        for (const q of payload.qualityWarnings) {
          doc.text(`• ${q.id} [${q.status}] @ ${q.recordedAt}: ${q.notes}`);
        }
      }
    }

    // References & Footer
    sectionTitle('7', 'Local Reference Sources & Governance');
    for (const ref of payload.references) {
      doc.text(`• ${ref.title} — ${ref.section} (v${ref.version})`);
    }
    doc.moveDown(0.4);
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(muted)
      .text('Prepared to support human medical review. This is not a diagnosis or clinical clearance.');

    doc.end();
  });
}
