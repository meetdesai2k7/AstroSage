import type {
  ImportSummary,
  ImportValidationError,
  RadiationQuantity,
} from '../../shared/types.js';
import {
  isRadiationQuantityUnitCompatible,
  isValidIsoTimestamp,
} from '../analytics/engine.js';

const ALLOWED_HEALTH_METRICS = new Set([
  'heart_rate',
  'spo2',
  'body_temp',
  'respiratory_rate',
  'systolic_bp',
  'diastolic_bp',
  'sleep_hours',
  'exercise_minutes',
]);

const ALLOWED_RADIATION_QUANTITIES = new Set<RadiationQuantity>([
  'ABSORBED_DOSE',
  'EFFECTIVE_DOSE',
  'AMBIENT_DOSE_EQUIVALENT',
]);

const ALLOWED_ENV_METRICS = new Set([
  'cabin_temp',
  'humidity',
  'co2_mmhg',
  'cabin_pressure',
]);

export function parseCsvText(csvText: string): Array<Record<string, string>> {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) return [];

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    out.push(current.trim());
    return out;
  };

  const headers = splitLine(lines[0]).map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

export interface ValidatedImportResult {
  summary: ImportSummary;
  acceptedRows: Array<Record<string, unknown>>;
}

export function validateImportRecords(
  datasetType: 'health' | 'radiation' | 'environment' | 'symptoms',
  rawRows: Array<Record<string, unknown>>,
  existingIds: Set<string>,
  existingSignatures: Set<string>
): ValidatedImportResult {
  const errors: ImportValidationError[] = [];
  const acceptedRows: Array<Record<string, unknown>> = [];
  const seenBatchIds = new Set<string>();
  const seenBatchSigs = new Set<string>();
  let duplicateRows = 0;
  let missingFieldCount = 0;

  const pushError = (
    rowNumber: number,
    recordId: string,
    field: string,
    reason: string,
    rawRow: Record<string, unknown>
  ) => {
    errors.push({ rowNumber, recordId: recordId || `ROW-${rowNumber}`, field, reason, rawRow });
  };

  rawRows.forEach((row, index) => {
    const rowNumber = index + 1;
    const id = String(row.id ?? '').trim();

    if (!id) {
      missingFieldCount++;
      pushError(rowNumber, id, 'id', 'Required record ID is missing.', row);
      return;
    }

    if (existingIds.has(id) || seenBatchIds.has(id)) {
      duplicateRows++;
      pushError(rowNumber, id, 'id', `Duplicate record ID "${id}".`, row);
      return;
    }

    if (datasetType === 'health') {
      const astronautId = String(row.astronautId ?? '').trim();
      const metric = String(row.metric ?? '').trim();
      const unit = String(row.unit ?? '').trim();
      const recordedAt = String(row.recordedAt ?? '').trim();
      const deviceId = String(row.deviceId ?? 'DEV-IMPORT-01').trim();
      const rawVal = row.value;
      const numericVal = rawVal === '' || rawVal === null || rawVal === undefined ? NaN : Number(rawVal);

      if (!astronautId || !metric || !unit || !recordedAt) {
        missingFieldCount++;
        const missing = [!astronautId && 'astronautId', !metric && 'metric', !unit && 'unit', !recordedAt && 'recordedAt']
          .filter(Boolean)
          .join(', ');
        pushError(rowNumber, id, missing, `Missing required field(s): ${missing}.`, row);
        return;
      }
      if (!ALLOWED_HEALTH_METRICS.has(metric)) {
        pushError(rowNumber, id, 'metric', `Unsupported metric "${metric}". Allowed: ${Array.from(ALLOWED_HEALTH_METRICS).join(', ')}.`, row);
        return;
      }
      if (Number.isNaN(numericVal)) {
        pushError(rowNumber, id, 'value', `Non-numeric or missing value "${String(rawVal)}".`, row);
        return;
      }
      if (!isValidIsoTimestamp(recordedAt)) {
        pushError(rowNumber, id, 'recordedAt', `Invalid ISO-8601 timestamp "${recordedAt}".`, row);
        return;
      }

      const sig = `${astronautId}|${metric}|${recordedAt}|${numericVal}`;
      if (existingSignatures.has(sig) || seenBatchSigs.has(sig)) {
        duplicateRows++;
        pushError(rowNumber, id, 'duplicate', 'Duplicate (astronautId, metric, recordedAt, value) reading.', row);
        return;
      }

      seenBatchIds.add(id);
      seenBatchSigs.add(sig);
      acceptedRows.push({
        id,
        astronautId,
        deviceId,
        metric,
        value: numericVal,
        unit,
        recordedAt,
        provenance: String(row.provenance ?? 'CSV/JSON Import (Validated)'),
      });
    } else if (datasetType === 'radiation') {
      const quantity = String(row.quantity ?? '').trim() as RadiationQuantity;
      const unit = String(row.unit ?? '').trim();
      const recordedAt = String(row.recordedAt ?? '').trim();
      const deviceId = String(row.deviceId ?? 'DEV-DOS-IMP').trim();
      const numericVal = row.value === '' || row.value === null || row.value === undefined ? NaN : Number(row.value);

      if (!quantity || !unit || !recordedAt) {
        missingFieldCount++;
        pushError(rowNumber, id, 'required', 'Radiation row missing quantity, unit, or recordedAt.', row);
        return;
      }
      if (!ALLOWED_RADIATION_QUANTITIES.has(quantity)) {
        pushError(rowNumber, id, 'quantity', `Invalid radiation quantity "${quantity}". Must be ABSORBED_DOSE, EFFECTIVE_DOSE, or AMBIENT_DOSE_EQUIVALENT.`, row);
        return;
      }
      if (!isRadiationQuantityUnitCompatible(quantity, unit)) {
        pushError(rowNumber, id, 'unit', `Unit "${unit}" does not match quantity ${quantity}. Gy and Sv cannot be mixed.`, row);
        return;
      }
      if (Number.isNaN(numericVal) || numericVal < 0) {
        pushError(rowNumber, id, 'value', 'Radiation value must be a non-negative number.', row);
        return;
      }
      if (!isValidIsoTimestamp(recordedAt)) {
        pushError(rowNumber, id, 'recordedAt', `Invalid ISO-8601 timestamp "${recordedAt}".`, row);
        return;
      }

      seenBatchIds.add(id);
      acceptedRows.push({
        id,
        deviceId,
        quantity,
        value: numericVal,
        unit,
        doseRate: row.doseRate !== undefined && row.doseRate !== '' ? Number(row.doseRate) : null,
        doseRateUnit: row.doseRateUnit ? String(row.doseRateUnit) : null,
        uncertainty: row.uncertainty !== undefined && row.uncertainty !== '' ? Number(row.uncertainty) : null,
        calibrationRef: String(row.calibrationRef ?? 'CAL-IMPORT-UNVERIFIED'),
        calibrationStatus: String(row.calibrationStatus ?? 'CALIBRATED'),
        recordedAt,
        provenance: String(row.provenance ?? 'CSV/JSON Import (Validated)'),
      });
    } else if (datasetType === 'environment') {
      const metric = String(row.metric ?? '').trim();
      const unit = String(row.unit ?? '').trim();
      const location = String(row.location ?? 'Hab-Node-1').trim();
      const recordedAt = String(row.recordedAt ?? '').trim();
      const numericVal = row.value === '' || row.value === null || row.value === undefined ? NaN : Number(row.value);

      if (!metric || !unit || !recordedAt) {
        missingFieldCount++;
        pushError(rowNumber, id, 'required', 'Environment row missing metric, unit, or recordedAt.', row);
        return;
      }
      if (!ALLOWED_ENV_METRICS.has(metric)) {
        pushError(rowNumber, id, 'metric', `Unsupported environmental metric "${metric}".`, row);
        return;
      }
      if (Number.isNaN(numericVal)) {
        pushError(rowNumber, id, 'value', 'Environmental value must be numeric.', row);
        return;
      }
      if (!isValidIsoTimestamp(recordedAt)) {
        pushError(rowNumber, id, 'recordedAt', `Invalid timestamp "${recordedAt}".`, row);
        return;
      }

      seenBatchIds.add(id);
      acceptedRows.push({
        id,
        location,
        metric,
        value: numericVal,
        unit,
        recordedAt,
        deviceId: String(row.deviceId ?? 'DEV-ENV-IMP'),
        provenance: String(row.provenance ?? 'CSV/JSON Import (Validated)'),
      });
    } else {
      const astronautId = String(row.astronautId ?? '').trim();
      const symptom = String(row.symptom ?? '').trim();
      const reportedAt = String(row.reportedAt ?? '').trim();
      const severity = Number(row.severityRating ?? 1);
      if (!astronautId || !symptom || !reportedAt) {
        missingFieldCount++;
        pushError(rowNumber, id, 'required', 'Symptom log missing astronautId, symptom, or reportedAt.', row);
        return;
      }
      if (!isValidIsoTimestamp(reportedAt)) {
        pushError(rowNumber, id, 'reportedAt', `Invalid timestamp "${reportedAt}".`, row);
        return;
      }
      seenBatchIds.add(id);
      acceptedRows.push({
        id,
        astronautId,
        symptom,
        severityRating: Number.isNaN(severity) ? 1 : Math.min(5, Math.max(1, severity)),
        durationMinutes: Number(row.durationMinutes ?? 30),
        notes: String(row.notes ?? ''),
        reportedAt,
        provenance: String(row.provenance ?? 'CSV/JSON Import (Validated)'),
      });
    }
  });

  return {
    summary: {
      datasetType,
      rowsReceived: rawRows.length,
      rowsAccepted: acceptedRows.length,
      rowsRejected: errors.length,
      duplicateRows,
      missingFieldCount,
      errors,
      acceptedIds: acceptedRows.map((r) => String(r.id)),
    },
    acceptedRows,
  };
}
