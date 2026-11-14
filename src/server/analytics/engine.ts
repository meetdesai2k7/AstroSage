import type {
  AlertRecord,
  BaselineProfile,
  DataQualityStatus,
  DeviceRecord,
  EnvironmentalReading,
  HealthReading,
  RadiationReading,
  SymptomLog,
} from '../../shared/types.js';

export const MIN_BASELINE_SAMPLES = 8;

const METRIC_BOUNDS: Record<
  string,
  { min: number; max: number; units: string[]; label: string }
> = {
  heart_rate: { min: 25, max: 230, units: ['bpm'], label: 'Heart Rate' },
  spo2: { min: 50, max: 100, units: ['%'], label: 'Oxygen Saturation (SpO2)' },
  body_temp: { min: 33.0, max: 42.5, units: ['C', '°C'], label: 'Body Temperature' },
  respiratory_rate: { min: 4, max: 50, units: ['br/min', 'breaths/min'], label: 'Respiratory Rate' },
  systolic_bp: { min: 60, max: 240, units: ['mmHg'], label: 'Systolic Blood Pressure' },
  diastolic_bp: { min: 30, max: 150, units: ['mmHg'], label: 'Diastolic Blood Pressure' },
  sleep_hours: { min: 0, max: 20, units: ['h', 'hr', 'hours'], label: 'Sleep Duration' },
  exercise_minutes: { min: 0, max: 480, units: ['min', 'minutes'], label: 'Exercise Duration' },
};

export function getMetricLabel(metric: string): string {
  return METRIC_BOUNDS[metric]?.label ?? metric.replace(/_/g, ' ');
}

export function isValidIsoTimestamp(ts: string): boolean {
  if (!ts || typeof ts !== 'string') return false;
  const parsed = Date.parse(ts);
  return !Number.isNaN(parsed);
}

export function assessHealthQuality(
  reading: Pick<
    HealthReading,
    'value' | 'unit' | 'metric' | 'recordedAt' | 'deviceId'
  >,
  referenceNowMs: number,
  device?: DeviceRecord,
  isDuplicate = false,
  staleThresholdHours = 18
): { status: DataQualityStatus; notes: string } {
  if (isDuplicate) {
    return {
      status: 'DUPLICATE',
      notes: 'Duplicate reading timestamp/metric/value detected; excluded from baseline.',
    };
  }
  if (!isValidIsoTimestamp(reading.recordedAt)) {
    return {
      status: 'INVALID',
      notes: 'Unparseable or missing ISO-8601 recorded timestamp.',
    };
  }
  if (reading.value === null || reading.value === undefined || Number.isNaN(reading.value)) {
    return {
      status: 'MISSING',
      notes: 'Measurement value is null or absent.',
    };
  }
  if (!reading.unit || reading.unit.trim() === '') {
    return {
      status: 'INVALID',
      notes: 'Missing measurement unit.',
    };
  }

  const bounds = METRIC_BOUNDS[reading.metric];
  if (bounds) {
    if (!bounds.units.includes(reading.unit)) {
      return {
        status: 'INVALID',
        notes: `Unexpected unit "${reading.unit}" for ${bounds.label} (expected ${bounds.units.join(' or ')}).`,
      };
    }
    if (reading.value < bounds.min || reading.value > bounds.max) {
      return {
        status: 'INVALID',
        notes: `Value ${reading.value} ${reading.unit} outside physical plausibility bounds [${bounds.min}, ${bounds.max}].`,
      };
    }
  }

  if (device && device.calibrationStatus === 'UNCALIBRATED') {
    return {
      status: 'UNCERTAIN',
      notes: `Source device ${device.id} is marked UNCALIBRATED (${device.calibrationRef}).`,
    };
  }

  const ageHours = (referenceNowMs - Date.parse(reading.recordedAt)) / (1000 * 3600);
  if (ageHours > staleThresholdHours) {
    return {
      status: 'STALE',
      notes: `Reading age (${ageHours.toFixed(1)}h) exceeds freshness window (${staleThresholdHours}h).`,
    };
  }

  return { status: 'VALID', notes: 'Passed schema, unit, calibration, and freshness checks.' };
}

export function isRadiationQuantityUnitCompatible(
  quantity: RadiationReading['quantity'],
  unit: string
): boolean {
  const normalized = unit.trim();
  if (quantity === 'ABSORBED_DOSE') {
    return ['Gy', 'mGy', 'uGy', 'µGy'].includes(normalized);
  }
  if (quantity === 'EFFECTIVE_DOSE' || quantity === 'AMBIENT_DOSE_EQUIVALENT') {
    return ['Sv', 'mSv', 'uSv', 'µSv'].includes(normalized);
  }
  return false;
}

export function assessRadiationQuality(
  reading: Pick<
    RadiationReading,
    'quantity' | 'value' | 'unit' | 'recordedAt' | 'calibrationStatus' | 'uncertainty'
  >,
  isDuplicate = false
): { status: DataQualityStatus; notes: string } {
  if (isDuplicate) {
    return { status: 'DUPLICATE', notes: 'Duplicate dosimetry entry.' };
  }
  if (!isValidIsoTimestamp(reading.recordedAt)) {
    return { status: 'INVALID', notes: 'Invalid radiation timestamp.' };
  }
  if (reading.value === null || Number.isNaN(reading.value) || reading.value < 0) {
    return {
      status: reading.value === null ? 'MISSING' : 'INVALID',
      notes: reading.value === null ? 'Missing dosimetry value.' : 'Negative radiation value is physically invalid.',
    };
  }
  if (!reading.unit || !isRadiationQuantityUnitCompatible(reading.quantity, reading.unit)) {
    return {
      status: 'INVALID',
      notes: `Unit "${reading.unit || 'NONE'}" is incompatible with quantity ${reading.quantity}. Gy and Sv must remain separate.`,
    };
  }
  if (reading.calibrationStatus === 'UNCALIBRATED' || reading.calibrationStatus === 'UNKNOWN') {
    return {
      status: 'UNCERTAIN',
      notes: `Dosimeter calibration status is ${reading.calibrationStatus}.`,
    };
  }
  if (reading.uncertainty !== null && reading.value > 0 && reading.uncertainty / reading.value > 0.35) {
    return {
      status: 'UNCERTAIN',
      notes: `Measurement uncertainty (${((reading.uncertainty / reading.value) * 100).toFixed(0)}%) exceeds 35% tolerance.`,
    };
  }
  return { status: 'VALID', notes: 'Dosimetry quantity, unit, and calibration verified.' };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function computeBaselineStatistics(values: number[]): {
  mean: number | null;
  median: number | null;
  stdDev: number | null;
  iqr: number | null;
  sampleCount: number;
  isSufficient: boolean;
} {
  const clean = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  const n = clean.length;
  if (n < MIN_BASELINE_SAMPLES) {
    return {
      mean: null,
      median: null,
      stdDev: null,
      iqr: null,
      sampleCount: n,
      isSufficient: false,
    };
  }
  const sorted = [...clean].sort((a, b) => a - b);
  const mean = clean.reduce((acc, v) => acc + v, 0) / n;
  const median = percentile(sorted, 0.5);
  const variance = clean.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.max(Math.sqrt(variance), 0.001);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  return {
    mean: Number(mean.toFixed(3)),
    median: Number(median.toFixed(3)),
    stdDev: Number(stdDev.toFixed(3)),
    iqr: Number((q3 - q1).toFixed(3)),
    sampleCount: n,
    isSufficient: true,
  };
}

export function computeExperimentalZScore(
  value: number | null,
  baseline?: BaselineProfile
): number | null {
  if (
    value === null ||
    !baseline ||
    !baseline.isSufficient ||
    baseline.mean === null ||
    baseline.stdDev === null ||
    baseline.stdDev <= 0
  ) {
    return null;
  }
  return Number(((value - baseline.mean) / baseline.stdDev).toFixed(2));
}

export interface AnalyticsInput {
  missionId: string;
  astronautId: string;
  referenceNowIso: string;
  healthReadings: HealthReading[];
  radiationReadings: RadiationReading[];
  environmentalReadings: EnvironmentalReading[];
  symptoms: SymptomLog[];
  baselines: BaselineProfile[];
  existingAlerts?: AlertRecord[];
}

export function evaluateDeterministicAlerts(input: AnalyticsInput): AlertRecord[] {
  const alerts: AlertRecord[] = [];
  const existingAckMap = new Map<string, AlertRecord>();
  for (const existing of input.existingAlerts ?? []) {
    existingAckMap.set(existing.id, existing);
  }

  const makeAlert = (
    id: string,
    partial: Omit<
      AlertRecord,
      'id' | 'astronautId' | 'missionId' | 'acknowledged' | 'acknowledgedBy' | 'acknowledgedAt' | 'acknowledgementNote' | 'isSimulated'
    >
  ): AlertRecord => {
    const prev = existingAckMap.get(id);
    return {
      id,
      astronautId: input.astronautId,
      missionId: input.missionId,
      ...partial,
      acknowledged: prev?.acknowledged ?? false,
      acknowledgedBy: prev?.acknowledgedBy ?? null,
      acknowledgedAt: prev?.acknowledgedAt ?? null,
      acknowledgementNote: prev?.acknowledgementNote ?? null,
      isSimulated: true,
    };
  };

  // 1. Baseline deviation rules across VALID recent health readings
  const baselineByMetric = new Map<string, BaselineProfile>();
  for (const b of input.baselines) {
    if (b.astronautId === input.astronautId) {
      baselineByMetric.set(b.metric, b);
    }
  }

  const healthByMetric = new Map<string, HealthReading[]>();
  for (const r of input.healthReadings) {
    if (r.astronautId !== input.astronautId) continue;
    const list = healthByMetric.get(r.metric) ?? [];
    list.push(r);
    healthByMetric.set(r.metric, list);
  }

  for (const [metric, list] of healthByMetric.entries()) {
    const sortedValid = list
      .filter((r) => r.qualityStatus === 'VALID' && r.value !== null)
      .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));

    const baseline = baselineByMetric.get(metric);
    if (!baseline || !baseline.isSufficient || baseline.mean === null || baseline.stdDev === null) {
      continue;
    }

    const tail = sortedValid.slice(-4);
    if (tail.length < 3) continue;

    const tailZScores = tail.map((r) => ({
      reading: r,
      z: computeExperimentalZScore(r.value, baseline) ?? 0,
    }));

    const consecutiveHigh = tailZScores.slice(-3).every((item) => Math.abs(item.z) >= 1.5);
    const maxAbsZ = Math.max(...tailZScores.slice(-3).map((i) => Math.abs(i.z)));

    if (consecutiveHigh) {
      const latest = tail[tail.length - 1];
      const severity = maxAbsZ >= 2.5 ? 'URGENT REVIEW' : 'WATCH';
      const direction = (latest.value ?? 0) >= baseline.mean ? 'above' : 'below';
      const label = getMetricLabel(metric);
      alerts.push(
        makeAlert(`ALT-DEV-${input.astronautId}-${metric}`, {
          category: 'HEALTH_DEVIATION',
          severity,
          createdAt: latest.recordedAt,
          ruleId: severity === 'URGENT REVIEW' ? 'DEMO-RULE-DEV-02' : 'DEMO-RULE-DEV-01',
          ruleVersion: '1.2.0',
          title: `${label} sustained ${direction} personal baseline (${tail.slice(-3).length} consecutive readings)`,
          whatHappened: `Three or more consecutive VALID ${label.toLowerCase()} readings deviated ${direction} the locked personal baseline v${baseline.baselineVersion} by >= ${severity === 'URGENT REVIEW' ? '2.5' : '1.5'} SD (max statistical deviation z = ${maxAbsZ.toFixed(2)}).`,
          triggeringRecordIds: tail.slice(-3).map((r) => r.id),
          measuredSummary: tail
            .slice(-3)
            .map((r) => `${r.value} ${r.unit} @ ${r.recordedAt.slice(11, 16)}Z`)
            .join(' -> '),
          baselineSummary: `Baseline v${baseline.baselineVersion} (${baseline.contextLabel}): mean ${baseline.mean} ${baseline.unit}, median ${baseline.median} ${baseline.unit}, SD ${baseline.stdDev}, IQR ${baseline.iqr}, n=${baseline.sampleCount}`,
          comparisonPerformed: `Experimental statistical deviation indicator z = (x - ${baseline.mean}) / ${baseline.stdDev} evaluated on VALID observations only. Demonstration rule, not a clinical threshold.`,
          missingInformation: 'Concurrent hydration intake, EVA workload intensity, and medical officer clinical context are not captured in automated biometric streams.',
          humanReviewReason: 'Sustained progressive drift across consecutive intervals warrants human medical officer review alongside symptoms and habitat environment.',
          dataQualityLimitations: 'Stale, duplicate, missing, or uncalibrated readings were excluded prior to comparison.',
        })
      );
    }
  }

  // 2. Data quality & sensor fault rule
  const faultyReadings = input.healthReadings.filter(
    (r) =>
      r.astronautId === input.astronautId &&
      ['INVALID', 'STALE', 'MISSING', 'DUPLICATE', 'UNCERTAIN'].includes(r.qualityStatus)
  );
  const faultyRadiation = input.radiationReadings.filter((r) =>
    ['INVALID', 'STALE', 'MISSING', 'DUPLICATE', 'UNCERTAIN'].includes(r.qualityStatus)
  );
  const allFaults = [...faultyReadings, ...faultyRadiation];

  if (allFaults.length > 0) {
    const hasMissingOnly = allFaults.every((f) => f.qualityStatus === 'MISSING' || f.qualityStatus === 'STALE');
    alerts.push(
      makeAlert(`ALT-QUAL-${input.astronautId}`, {
        category: hasMissingOnly ? 'DATA_GAP' : 'SENSOR_FAULT',
        severity: allFaults.some((f) => f.qualityStatus === 'INVALID' || f.qualityStatus === 'UNCERTAIN')
          ? 'WATCH'
          : 'INFO',
        createdAt: allFaults[allFaults.length - 1].recordedAt || input.referenceNowIso,
        ruleId: 'DEMO-RULE-QUAL-01',
        ruleVersion: '1.1.0',
        title: `${allFaults.length} telemetry record(s) flagged for data-quality anomalies`,
        whatHappened: `Ingestion validation detected ${allFaults.length} record(s) marked non-VALID (${Array.from(new Set(allFaults.map((f) => f.qualityStatus))).join(', ')}). These records are withheld from baseline and deviation math.`,
        triggeringRecordIds: allFaults.map((f) => f.id),
        measuredSummary: allFaults
          .slice(0, 4)
          .map((f) => `${f.id}: ${f.qualityStatus} (${f.qualityNotes})`)
          .join(' | '),
        baselineSummary: 'Not applicable — non-VALID records are never compared against personal baselines.',
        comparisonPerformed: 'Schema bounds, unit verification, calibration metadata, freshness window, and duplicate signature checks.',
        missingInformation: 'Hardware diagnostic logs and physical sensor seating checks require crew inspection.',
        humanReviewReason: 'Faulty or stale telemetry can mask real physiological trends or create false gaps in mission monitoring.',
        dataQualityLimitations: `${allFaults.length} record(s) excluded from trend averages until verified or re-acquired.`,
      })
    );
  }

  // 3. Radiation exposure context rule (strictly preserving Gy vs Sv and non-causation)
  const elevatedRad = input.radiationReadings.filter(
    (r) =>
      r.qualityStatus === 'VALID' &&
      r.value !== null &&
      ((r.unit === 'mGy' && r.value >= 1.5) ||
        (r.unit === 'mSv' && r.value >= 2.0) ||
        (r.doseRate !== null && r.doseRate >= 0.45))
  );
  if (elevatedRad.length > 0) {
    const latestRad = elevatedRad[elevatedRad.length - 1];
    alerts.push(
      makeAlert(`ALT-RAD-${input.missionId}`, {
        category: 'RADIATION_EXPOSURE_EVENT',
        severity: 'WATCH',
        createdAt: latestRad.recordedAt,
        ruleId: 'DEMO-RULE-RAD-01',
        ruleVersion: '1.0.0',
        title: `Elevated dosimetry interval recorded (${latestRad.value} ${latestRad.unit} ${latestRad.quantity})`,
        whatHappened: `${elevatedRad.length} calibrated radiation record(s) exceeded demonstration review context thresholds. Original quantities (Gy vs Sv) are preserved separately without automatic conversion.`,
        triggeringRecordIds: elevatedRad.map((r) => r.id),
        measuredSummary: elevatedRad
          .map((r) => `${r.value} ${r.unit} (${r.quantity}, rate: ${r.doseRate ?? 'N/A'} ${r.doseRateUnit ?? ''})`)
          .join('; '),
        baselineSummary: 'Mission ambient background context only; individual cancer risk or prognosis is never calculated.',
        comparisonPerformed: 'Demonstration context check against nominal LEO/transit background rates preserving original recorded units.',
        missingInformation: 'Full particle LET spectrum and shielding directional geometry are outside onboard prototype scope.',
        humanReviewReason: 'Review radiation window alongside cabin telemetry and crew reports. Temporal overlap with health changes does NOT establish causation.',
        dataQualityLimitations: elevatedRad.some((r) => r.uncertainty !== null)
          ? 'Measurement uncertainties preserved per dosimeter metadata.'
          : 'Dosimeter uncertainty not supplied on all entries.',
      })
    );
  }

  // 4. Environmental context rule (e.g., elevated cabin CO2)
  const elevatedEnv = input.environmentalReadings.filter(
    (e) =>
      e.qualityStatus === 'VALID' &&
      e.value !== null &&
      ((e.metric === 'co2_mmhg' && e.value >= 3.8) ||
        (e.metric === 'cabin_temp' && (e.value >= 26.5 || e.value <= 18.0)))
  );
  if (elevatedEnv.length > 0) {
    const latestEnv = elevatedEnv[elevatedEnv.length - 1];
    alerts.push(
      makeAlert(`ALT-ENV-${input.missionId}`, {
        category: 'ENVIRONMENT_CHANGE',
        severity: 'WATCH',
        createdAt: latestEnv.recordedAt,
        ruleId: 'DEMO-RULE-ENV-01',
        ruleVersion: '1.0.0',
        title: `Habitat environmental shift detected (${latestEnv.metric}: ${latestEnv.value} ${latestEnv.unit})`,
        whatHappened: `${elevatedEnv.length} environmental reading(s) moved outside nominal habitat demonstration band in ${latestEnv.location}.`,
        triggeringRecordIds: elevatedEnv.map((e) => e.id),
        measuredSummary: elevatedEnv
          .map((e) => `${e.location} ${e.metric}=${e.value} ${e.unit}`)
          .join('; '),
        baselineSummary: 'Nominal habitat demonstration envelope: CO2 < 3.8 mmHg, Temp 18.5-26.0 °C.',
        comparisonPerformed: 'Deterministic habitat context check on VALID environmental telemetry.',
        missingInformation: 'CDRA scrubber bed cycle state and crew module occupancy count.',
        humanReviewReason: 'Environmental shifts provide essential confounding context when reviewing crew fatigue, respiratory rate, or headache reports.',
        dataQualityLimitations: 'Localized sensor readings may vary across habitat nodes.',
      })
    );
  }

  // 5. Symptom reported rule
  const notableSymptoms = input.symptoms.filter(
    (s) => s.astronautId === input.astronautId && s.severityRating >= 3
  );
  if (notableSymptoms.length > 0) {
    const latestSym = notableSymptoms[notableSymptoms.length - 1];
    alerts.push(
      makeAlert(`ALT-SYM-${input.astronautId}-${latestSym.id}`, {
        category: 'SYMPTOM_REPORTED',
        severity: latestSym.severityRating >= 4 ? 'URGENT REVIEW' : 'WATCH',
        createdAt: latestSym.reportedAt,
        ruleId: 'DEMO-RULE-SYM-01',
        ruleVersion: '1.0.0',
        title: `Crew symptom logged: ${latestSym.symptom} (severity ${latestSym.severityRating}/5)`,
        whatHappened: `Self-reported symptom "${latestSym.symptom}" recorded with severity ${latestSym.severityRating}/5 and duration ${latestSym.durationMinutes} min.`,
        triggeringRecordIds: [latestSym.id],
        measuredSummary: `${latestSym.symptom} (${latestSym.severityRating}/5) — ${latestSym.notes}`,
        baselineSummary: 'Subjective crew log; reviewed alongside physiological trends and environmental logs.',
        comparisonPerformed: 'Deterministic severity check (rating >= 3/5 flags human review).',
        missingInformation: 'Physical examination and clinician follow-up notes.',
        humanReviewReason: 'Self-reported symptoms require flight surgeon review and cannot be resolved by automated software.',
        dataQualityLimitations: 'Self-reported subjective severity scale.',
      })
    );
  }

  return alerts.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
