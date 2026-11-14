import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeterministicFallbackAnswer,
  chunkMarkdownDocument,
  retrieveTopChunks,
} from './retrieval';
import type { AstronautOverview } from '../../shared/types';

test('Chunker preserves sections and page numbers and retrieval returns matching citations', () => {
  const md = `# Radiation Dosimetry Primer
Version: 1.4.0 | Category: Dosimetry

<!-- page: 1 -->
## Section 2.1: Gray vs Sievert
Gray (Gy) measures physical absorbed dose while Sievert (Sv) measures equivalent or effective biological dose. Never treat Gy and Sv as interchangeable.

<!-- page: 2 -->
## Section 2.2: Non-Causation
Temporal overlap between radiation records and health readings does not establish causation.`;

  const { chunks } = chunkMarkdownDocument('REF-RAD', 'radiation-primer.md', md);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].pageNumber, 1);
  assert.equal(chunks[1].pageNumber, 2);

  const citations = retrieveTopChunks('What does the reference say about Gray and Sievert?', chunks, 2);
  assert.ok(citations.length >= 1);
  assert.equal(citations[0].section, 'Section 2.1: Gray vs Sievert');
  assert.equal(citations[0].pageNumber, 1);
});

test('Fallback Copilot produces honest insufficiency message when evidence is absent', () => {
  const dummyOverview = {
    mission: { id: 'M1', name: 'Artemis-Sim IV', code: 'AS-4', phase: 'Transit', startTimestamp: '2026-11-10T00:00:00Z', simulatedElapsedHours: 72, commsStatus: 'CONNECTED', isSimulated: true, description: '' },
    astronaut: { id: 'A1', missionId: 'M1', callsign: 'CDR-VANCE', name: 'Elena Vance', role: 'Commander', ageGroup: '35-44', notes: '', isSimulated: true },
    activeScenario: 'NORMAL_MISSION',
    summary: { healthRecordCount: 10, activeReviewFlags: 0, radiationRecordCount: 2, environmentalCoveragePct: 100, dataQualityWarnings: 0, latestHealthTimestamp: null, latestHeartRate: 66, latestHeartRateQuality: 'VALID', pendingOutboxCount: 0 },
    latestMetrics: [],
    recentHealthSeries: [],
    baselines: [],
    alerts: [],
    recentRadiation: [],
    recentEnvironment: [],
    recentSymptoms: [],
    recentCognitive: [],
    activityFeed: [],
  } satisfies AstronautOverview;

  const res = buildDeterministicFallbackAnswer('What is the stock price of Acme Corp?', dummyOverview, []);
  assert.equal(res.mode, 'RETRIEVAL_FALLBACK');
  assert.match(res.answer, /Insufficient local evidence/i);
  assert.equal(res.citations.length, 0);
});
