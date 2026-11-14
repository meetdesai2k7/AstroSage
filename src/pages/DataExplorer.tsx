import { useMemo, useState } from 'react';
import {
  Database,
  Download,
  FileUp,
  Search,
  UploadCloud,
} from 'lucide-react';
import type {
  AstronautOverview,
  ImportSummary,
} from '../shared/types';
import { StatusTag } from '../components/widgets/StatusTag';
import { api } from '../lib/api';

interface DataExplorerProps {
  overview: AstronautOverview;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

const SAMPLE_HEALTH_CSV = `id,astronautId,deviceId,metric,value,unit,recordedAt,provenance
HR-IMP-101,AST-VANCE,DEV-BIO-HARNESS-01,heart_rate,71.5,bpm,2026-11-13T11:30:00Z,CSV Import Sample
HR-IMP-BAD1,AST-VANCE,DEV-BIO-HARNESS-01,heart_rate,not_a_num,bpm,2026-11-13T11:45:00Z,CSV Import Bad Value
HR-IMP-BAD2,,DEV-BIO-HARNESS-01,unknown_metric,80,bpm,invalid-date,CSV Import Missing Fields`;

const SAMPLE_RADIATION_CSV = `id,deviceId,quantity,value,unit,doseRate,doseRateUnit,uncertainty,calibrationRef,calibrationStatus,recordedAt,provenance
RAD-IMP-01,DEV-DOS-SIL-01,ABSORBED_DOSE,0.42,mGy,0.09,mGy/h,0.04,NIST-SIM-GY-26,CALIBRATED,2026-11-13T11:15:00Z,CSV Dosimetry Import
RAD-IMP-MIX,DEV-DOS-SIL-01,ABSORBED_DOSE,0.50,mSv,0.10,mSv/h,0.05,NIST-SIM-GY-26,CALIBRATED,2026-11-13T11:30:00Z,Invalid Gy/Sv Mix`;

export function DataExplorer({ overview, onRefresh, onNotify }: DataExplorerProps) {
  const [activeTab, setActiveTab] = useState<'health' | 'radiation' | 'environment' | 'symptoms' | 'cognitive'>('health');
  const [searchQuery, setSearchQuery] = useState('');
  const [qualityFilter, setQualityFilter] = useState('ALL');

  // Import state
  const [importDataset, setImportDataset] = useState<'health' | 'radiation' | 'environment' | 'symptoms'>('health');
  const [importFormat, setImportFormat] = useState<'csv' | 'json'>('csv');
  const [importText, setImportText] = useState(SAMPLE_HEALTH_CSV);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const filteredHealth = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return overview.recentHealthSeries.filter((r) => {
      if (qualityFilter !== 'ALL' && r.qualityStatus !== qualityFilter) return false;
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        r.metric.toLowerCase().includes(q) ||
        r.deviceId.toLowerCase().includes(q) ||
        r.qualityNotes.toLowerCase().includes(q)
      );
    });
  }, [overview.recentHealthSeries, searchQuery, qualityFilter]);

  const filteredRadiation = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return overview.recentRadiation.filter((r) => {
      if (qualityFilter !== 'ALL' && r.qualityStatus !== qualityFilter) return false;
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        r.quantity.toLowerCase().includes(q) ||
        r.unit.toLowerCase().includes(q)
      );
    });
  }, [overview.recentRadiation, searchQuery, qualityFilter]);

  const filteredEnvironment = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return overview.recentEnvironment.filter((e) => {
      if (qualityFilter !== 'ALL' && e.qualityStatus !== qualityFilter) return false;
      if (!q) return true;
      return e.id.toLowerCase().includes(q) || e.metric.toLowerCase().includes(q) || e.location.toLowerCase().includes(q);
    });
  }, [overview.recentEnvironment, searchQuery, qualityFilter]);

  const handleDownloadSample = () => {
    const content = importDataset === 'radiation' ? SAMPLE_RADIATION_CSV : SAMPLE_HEALTH_CSV;
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `astrosage-${importDataset}-sample.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportFiltered = () => {
    const data =
      activeTab === 'health'
        ? filteredHealth
        : activeTab === 'radiation'
          ? filteredRadiation
          : activeTab === 'environment'
            ? filteredEnvironment
            : activeTab === 'symptoms'
              ? overview.recentSymptoms
              : overview.recentCognitive;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `astrosage-${activeTab}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(`Exported ${data.length} ${activeTab} record(s).`);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setImporting(true);
    setImportError(null);
    try {
      const summary = await api.importDataset(importDataset, importFormat, importText);
      setImportSummary(summary);
      await onRefresh();
      onNotify(
        `Import complete: ${summary.rowsAccepted} accepted, ${summary.rowsRejected} rejected.`
      );
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Data Explorer &amp; Validated Ingestion
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Inspect raw telemetry tables, search provenance metadata, export filtered datasets, and import CSV/JSON with strict row-level validation.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportFiltered}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-[var(--border-hairline)] bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)] rounded-[3px] cursor-pointer"
        >
          <Download className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
          <span>Export Filtered ({activeTab})</span>
        </button>
      </div>

      {/* Tabs + Search + Quality Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] p-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[2px]">
          {[
            { id: 'health', label: `Health (${overview.recentHealthSeries.length})` },
            { id: 'radiation', label: `Radiation (${overview.recentRadiation.length})` },
            { id: 'environment', label: `Environment (${overview.recentEnvironment.length})` },
            { id: 'symptoms', label: `Symptoms (${overview.recentSymptoms.length})` },
            { id: 'cognitive', label: `Cognitive (${overview.recentCognitive.length})` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              className={`px-2.5 py-1 text-xs font-mono rounded-[2px] cursor-pointer transition-colors ${
                activeTab === t.id
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] font-medium'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-[var(--text-muted)] absolute left-2.5 top-2" />
            <input
              type="text"
              aria-label="Search records"
              placeholder="Search ID, metric, device…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1 text-xs bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] text-[var(--text-primary)]"
            />
          </div>
          <select
            aria-label="Filter by quality status"
            value={qualityFilter}
            onChange={(e) => setQualityFilter(e.target.value)}
            className="px-2.5 py-1 text-xs font-mono bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] text-[var(--text-primary)]"
          >
            <option value="ALL">Quality: ALL</option>
            <option value="VALID">VALID</option>
            <option value="STALE">STALE</option>
            <option value="MISSING">MISSING</option>
            <option value="INVALID">INVALID</option>
            <option value="UNCERTAIN">UNCERTAIN</option>
            <option value="DUPLICATE">DUPLICATE</option>
          </select>
        </div>
      </div>

      {/* Record Table */}
      <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
          <Database className="h-4 w-4 text-[var(--accent-cyan)]" />
          <span>SQLite Table View: {activeTab.toUpperCase()}</span>
        </div>

        <div className="overflow-x-auto max-h-[320px]">
          {activeTab === 'health' && (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] font-mono text-[11px] text-[var(--text-muted)] uppercase">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Metric</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Recorded (UTC)</th>
                  <th className="px-3 py-2">Device</th>
                  <th className="px-3 py-2">Quality</th>
                  <th className="px-3 py-2">Provenance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {[...filteredHealth].reverse().map((r) => (
                  <tr key={r.id} className="hover:bg-[var(--bg-elevated)]">
                    <td className="px-3 py-2 font-mono">{r.id}</td>
                    <td className="px-3 py-2 font-mono text-[var(--accent-cyan)]">{r.metric}</td>
                    <td className="px-3 py-2 font-mono font-semibold tabular-nums">
                      {r.value !== null ? `${r.value} ${r.unit}` : `NULL (${r.unit})`}
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums">{r.recordedAt.slice(0, 19).replace('T', ' ')}Z</td>
                    <td className="px-3 py-2 font-mono text-[var(--text-muted)]">{r.deviceId}</td>
                    <td className="px-3 py-2"><StatusTag status={r.qualityStatus} compact /></td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{r.provenance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'radiation' && (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] font-mono text-[11px] text-[var(--text-muted)] uppercase">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Quantity</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Calibration</th>
                  <th className="px-3 py-2">Recorded (UTC)</th>
                  <th className="px-3 py-2">Quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filteredRadiation.map((r) => (
                  <tr key={r.id} className="hover:bg-[var(--bg-elevated)]">
                    <td className="px-3 py-2 font-mono">{r.id}</td>
                    <td className="px-3 py-2 font-mono text-[var(--accent-cyan)]">{r.quantity}</td>
                    <td className="px-3 py-2 font-mono font-semibold tabular-nums">{r.value} {r.unit}</td>
                    <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">{r.calibrationRef} ({r.calibrationStatus})</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{r.recordedAt.slice(0, 19).replace('T', ' ')}Z</td>
                    <td className="px-3 py-2"><StatusTag status={r.qualityStatus} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'environment' && (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] font-mono text-[11px] text-[var(--text-muted)] uppercase">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Metric</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Recorded (UTC)</th>
                  <th className="px-3 py-2">Quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filteredEnvironment.map((e) => (
                  <tr key={e.id} className="hover:bg-[var(--bg-elevated)]">
                    <td className="px-3 py-2 font-mono">{e.id}</td>
                    <td className="px-3 py-2">{e.location}</td>
                    <td className="px-3 py-2 font-mono text-[var(--accent-cyan)]">{e.metric}</td>
                    <td className="px-3 py-2 font-mono font-semibold tabular-nums">{e.value} {e.unit}</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{e.recordedAt.slice(0, 19).replace('T', ' ')}Z</td>
                    <td className="px-3 py-2"><StatusTag status={e.qualityStatus} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'symptoms' && (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] font-mono text-[11px] text-[var(--text-muted)] uppercase">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Symptom</th>
                  <th className="px-3 py-2">Severity</th>
                  <th className="px-3 py-2">Duration</th>
                  <th className="px-3 py-2">Reported (UTC)</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {overview.recentSymptoms.map((s) => (
                  <tr key={s.id} className="hover:bg-[var(--bg-elevated)]">
                    <td className="px-3 py-2 font-mono">{s.id}</td>
                    <td className="px-3 py-2 font-semibold">{s.symptom}</td>
                    <td className="px-3 py-2 font-mono">{s.severityRating}/5</td>
                    <td className="px-3 py-2 font-mono">{s.durationMinutes} min</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{s.reportedAt.slice(0, 19).replace('T', ' ')}Z</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{s.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'cognitive' && (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] font-mono text-[11px] text-[var(--text-muted)] uppercase">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Task</th>
                  <th className="px-3 py-2">Reaction Time</th>
                  <th className="px-3 py-2">Accuracy</th>
                  <th className="px-3 py-2">Fatigue</th>
                  <th className="px-3 py-2">Quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {overview.recentCognitive.map((c) => (
                  <tr key={c.id} className="hover:bg-[var(--bg-elevated)]">
                    <td className="px-3 py-2 font-mono">{c.id}</td>
                    <td className="px-3 py-2 font-semibold">{c.taskName}</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{c.reactionTimeMs} ms</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{c.accuracyPct}%</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{c.fatigueRating}/10</td>
                    <td className="px-3 py-2"><StatusTag status={c.qualityStatus} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* CSV / JSON Import & Validation Pipeline */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <form
          onSubmit={handleImportSubmit}
          className="xl:col-span-6 border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] p-4 space-y-3 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <UploadCloud className="h-4 w-4 text-[var(--accent-primary)]" />
              <span>Validated CSV / JSON Import</span>
            </h2>
            <button
              type="button"
              onClick={handleDownloadSample}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono border border-[var(--border-hairline)] rounded-[3px] text-[var(--accent-cyan)] hover:bg-[var(--bg-elevated)] cursor-pointer"
            >
              <Download className="h-3 w-3" />
              <span>Download Sample Template</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="imp-type" className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
                Dataset Type
              </label>
              <select
                id="imp-type"
                value={importDataset}
                onChange={(e) => {
                  const val = e.target.value as typeof importDataset;
                  setImportDataset(val);
                  if (val === 'radiation') setImportText(SAMPLE_RADIATION_CSV);
                  else if (val === 'health') setImportText(SAMPLE_HEALTH_CSV);
                }}
                className="w-full px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] font-mono text-[var(--text-primary)]"
              >
                <option value="health">health</option>
                <option value="radiation">radiation</option>
                <option value="environment">environment</option>
                <option value="symptoms">symptoms</option>
              </select>
            </div>
            <div>
              <label htmlFor="imp-fmt" className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
                Format
              </label>
              <select
                id="imp-fmt"
                value={importFormat}
                onChange={(e) => setImportFormat(e.target.value as 'csv' | 'json')}
                className="w-full px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] font-mono text-[var(--text-primary)]"
              >
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="imp-payload" className="text-[11px] font-mono text-[var(--text-muted)]">
                Paste CSV / JSON Payload or Load File
              </label>
              <label className="text-[11px] font-mono text-[var(--accent-cyan)] cursor-pointer hover:underline inline-flex items-center gap-1">
                <FileUp className="h-3 w-3" />
                <span>Load local file</span>
                <input
                  type="file"
                  accept=".csv,.json,.txt"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setImportText(await f.text());
                  }}
                />
              </label>
            </div>
            <textarea
              id="imp-payload"
              rows={6}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="w-full p-2.5 font-mono text-[11px] bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] text-[var(--text-primary)]"
            />
          </div>

          {importError && (
            <div className="p-2.5 border border-[var(--accent-coral)] bg-[color-mix(in_srgb,var(--accent-coral)_8%,transparent)] text-[var(--accent-coral)] rounded-[2px]">
              {importError}
            </div>
          )}

          <button
            type="submit"
            disabled={importing || !importText.trim()}
            className="px-4 py-2 font-medium bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] rounded-[2px] hover:opacity-90 disabled:opacity-50 cursor-pointer transition-opacity"
          >
            {importing ? 'Validating & Ingesting…' : 'Validate & Import Records'}
          </button>
        </form>

        {/* Import Validation Summary & Error Table */}
        <div className="xl:col-span-6 border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] p-4 space-y-3 text-xs">
          <div className="font-semibold text-sm text-[var(--text-primary)]">
            Import Validation Diagnostics
          </div>

          {!importSummary ? (
            <div className="p-6 border border-[var(--border-hairline)] bg-[var(--bg-canvas)] rounded-[2px] text-[var(--text-muted)]">
              Run an import on the left (the pre-loaded sample includes both valid and intentionally malformed rows) to inspect accepted counts and row-level rejection explanations.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 sm:grid-cols-5 border border-[var(--border-hairline)] bg-[var(--bg-canvas)] rounded-[2px] divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-hairline)] font-mono text-center">
                <div className="p-2.5">
                  <div className="text-[10px] text-[var(--text-muted)]">Received</div>
                  <div className="text-base font-semibold tabular-nums text-[var(--text-primary)]">{importSummary.rowsReceived}</div>
                </div>
                <div className="p-2.5">
                  <div className="text-[10px] text-[var(--accent-teal)]">Accepted</div>
                  <div className="text-base font-semibold text-[var(--accent-teal)] tabular-nums">{importSummary.rowsAccepted}</div>
                </div>
                <div className="p-2.5">
                  <div className="text-[10px] text-[var(--accent-coral)]">Rejected</div>
                  <div className="text-base font-semibold text-[var(--accent-coral)] tabular-nums">{importSummary.rowsRejected}</div>
                </div>
                <div className="p-2.5">
                  <div className="text-[10px] text-[var(--text-muted)]">Duplicates</div>
                  <div className="text-base font-semibold tabular-nums text-[var(--text-primary)]">{importSummary.duplicateRows}</div>
                </div>
                <div className="p-2.5">
                  <div className="text-[10px] text-[var(--text-muted)]">Missing</div>
                  <div className="text-base font-semibold tabular-nums text-[var(--text-primary)]">{importSummary.missingFieldCount}</div>
                </div>
              </div>

              {importSummary.errors.length > 0 && (
                <div className="border border-[var(--border-hairline)] rounded-[3px] overflow-hidden max-h-[200px] overflow-y-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-hairline)] font-mono text-[var(--text-muted)] uppercase">
                      <tr>
                        <th className="px-2.5 py-1.5">Row</th>
                        <th className="px-2.5 py-1.5">Record ID</th>
                        <th className="px-2.5 py-1.5">Field</th>
                        <th className="px-2.5 py-1.5">Rejection Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-hairline)]">
                      {importSummary.errors.map((err, i) => (
                        <tr key={`${err.rowNumber}-${i}`}>
                          <td className="px-2.5 py-1.5 font-mono">{err.rowNumber}</td>
                          <td className="px-2.5 py-1.5 font-mono">{err.recordId}</td>
                          <td className="px-2.5 py-1.5 font-mono text-[var(--accent-amber)]">{err.field}</td>
                          <td className="px-2.5 py-1.5 text-[var(--accent-coral)]">{err.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
