import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvText, validateImportRecords } from './validator';

test('CSV parser handles quoted values and headers cleanly', () => {
  const csv = `id,astronautId,metric,value,unit,recordedAt,provenance
HR-101,AST-1,heart_rate,72,bpm,2026-11-13T10:00:00Z,"Simulated, Chest Strap"`;
  const rows = parseCsvText(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].provenance, 'Simulated, Chest Strap');
});

test('Import validator accepts valid rows and returns explicit errors for rejected/duplicate rows', () => {
  const existingIds = new Set(['HR-EXISTING']);
  const existingSigs = new Set(['AST-1|heart_rate|2026-11-13T09:00:00Z|66']);

  const { summary, acceptedRows } = validateImportRecords(
    'health',
    [
      {
        id: 'HR-NEW-1',
        astronautId: 'AST-1',
        metric: 'heart_rate',
        value: '74',
        unit: 'bpm',
        recordedAt: '2026-11-13T10:00:00Z',
      },
      {
        id: 'HR-EXISTING',
        astronautId: 'AST-1',
        metric: 'heart_rate',
        value: '70',
        unit: 'bpm',
        recordedAt: '2026-11-13T10:15:00Z',
      },
      {
        id: 'HR-BAD-TS',
        astronautId: 'AST-1',
        metric: 'heart_rate',
        value: '70',
        unit: 'bpm',
        recordedAt: 'not-a-timestamp',
      },
      {
        id: 'HR-DUP-SIG',
        astronautId: 'AST-1',
        metric: 'heart_rate',
        value: '66',
        unit: 'bpm',
        recordedAt: '2026-11-13T09:00:00Z',
      },
    ],
    existingIds,
    existingSigs
  );

  assert.equal(summary.rowsReceived, 4);
  assert.equal(summary.rowsAccepted, 1);
  assert.equal(summary.rowsRejected, 3);
  assert.equal(summary.duplicateRows, 2);
  assert.equal(acceptedRows[0].id, 'HR-NEW-1');
  assert.equal(summary.errors.length, 3);
});
