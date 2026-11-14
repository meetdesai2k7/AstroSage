import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessHealthQuality,
  assessRadiationQuality,
  computeBaselineStatistics,
  computeExperimentalZScore,
  evaluateDeterministicAlerts,
  isRadiationQuantityUnitCompatible,
} from './engine';
import type { BaselineProfile, HealthReading } from '../../shared/types';

test('Gy and Sv remain strictly distinct and incompatible units fail validation', () => {
  assert.equal(isRadiationQuantityUnitCompatible('ABSORBED_DOSE', 'mGy'), true);
  assert.equal(isRadiationQuantityUnitCompatible('ABSORBED_DOSE', 'mSv'), false);
  assert.equal(isRadiationQuantityUnitCompatible('EFFECTIVE_DOSE', 'mSv'), true);
  assert.equal(isRadiationQuantityUnitCompatible('EFFECTIVE_DOSE', 'mGy'), false);

  const q = assessRadiationQuality({
    quantity: 'ABSORBED_DOSE',
    value: 1.8,
    unit: 'mSv',
    recordedAt: '2026-11-13T10:00:00Z',
    calibrationStatus: 'CALIBRATED',
    uncertainty: 0.1,
  });
  assert.equal(q.status, 'INVALID');
});

test('Insufficient baseline samples (< 8) are handled safely without misleading statistics', () => {
  const stats = computeBaselineStatistics([64, 66, 65, 67, 68]);
  assert.equal(stats.isSufficient, false);
  assert.equal(stats.mean, null);
  assert.equal(stats.sampleCount, 5);

  const sufficientStats = computeBaselineStatistics([62, 64, 65, 66, 66, 67, 68, 70]);
  assert.equal(sufficientStats.isSufficient, true);
  assert.equal(sufficientStats.sampleCount, 8);
  assert.ok(sufficientStats.mean !== null && sufficientStats.stdDev !== null);
});

test('Data quality checks flag missing, stale, invalid, and duplicate health readings', () => {
  const nowMs = Date.parse('2026-11-13T12:00:00Z');
  assert.equal(
    assessHealthQuality(
      { value: null, unit: 'bpm', metric: 'heart_rate', recordedAt: '2026-11-13T11:00:00Z', deviceId: 'D1' },
      nowMs
    ).status,
    'MISSING'
  );
  assert.equal(
    assessHealthQuality(
      { value: 105, unit: '%', metric: 'spo2', recordedAt: '2026-11-13T11:00:00Z', deviceId: 'D1' },
      nowMs
    ).status,
    'INVALID'
  );
  assert.equal(
    assessHealthQuality(
      { value: 68, unit: 'bpm', metric: 'heart_rate', recordedAt: '2026-11-11T00:00:00Z', deviceId: 'D1' },
      nowMs
    ).status,
    'STALE'
  );
  assert.equal(
    assessHealthQuality(
      { value: 68, unit: 'bpm', metric: 'heart_rate', recordedAt: '2026-11-13T11:30:00Z', deviceId: 'D1' },
      nowMs,
      undefined,
      true
    ).status,
    'DUPLICATE'
  );
});

test('Deterministic drift rule triggers explainable alert when 3 consecutive valid readings exceed baseline SD', () => {
  const baseline: BaselineProfile = {
    id: 'BL-1',
    astronautId: 'AST-1',
    metric: 'heart_rate',
    unit: 'bpm',
    mean: 66,
    median: 66,
    stdDev: 3,
    iqr: 4,
    sampleCount: 16,
    observationPeriodStart: '2026-11-01T00:00:00Z',
    observationPeriodEnd: '2026-11-08T00:00:00Z',
    baselineVersion: 1,
    contextLabel: 'Simulated Nominal Resting Baseline',
    isSufficient: true,
    approvedBy: 'Flight Surgeon Review Sim',
    updatedAt: '2026-11-08T00:00:00Z',
  };

  assert.equal(computeExperimentalZScore(75, baseline), 3);

  const readings: HealthReading[] = [1, 2, 3].map((i) => ({
    id: `HR-${i}`,
    astronautId: 'AST-1',
    missionId: 'MIS-1',
    deviceId: 'DEV-1',
    metric: 'heart_rate',
    value: 76 + i * 2,
    unit: 'bpm',
    recordedAt: `2026-11-13T0${i}:00:00Z`,
    receivedAt: `2026-11-13T0${i}:01:00Z`,
    qualityStatus: 'VALID',
    qualityNotes: 'OK',
    provenance: 'Simulated',
    isSimulated: true,
  }));

  const alerts = evaluateDeterministicAlerts({
    missionId: 'MIS-1',
    astronautId: 'AST-1',
    referenceNowIso: '2026-11-13T05:00:00Z',
    healthReadings: readings,
    radiationReadings: [],
    environmentalReadings: [],
    symptoms: [],
    baselines: [baseline],
  });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].category, 'HEALTH_DEVIATION');
  assert.equal(alerts[0].severity, 'URGENT REVIEW');
  assert.deepEqual(alerts[0].triggeringRecordIds, ['HR-1', 'HR-2', 'HR-3']);
});
