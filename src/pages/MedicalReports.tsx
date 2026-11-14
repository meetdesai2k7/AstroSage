import { useEffect, useState } from 'react';
import {
  CheckSquare,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import type {
  AstronautOverview,
  ReportRecord,
} from '../shared/types';
import { api } from '../lib/api';

interface MedicalReportsProps {
  overview: AstronautOverview;
  onNotify: (msg: string) => void;
}

const SECTION_OPTIONS = [
  { id: 'health', label: 'Health Measurement Summary & Baselines' },
  { id: 'symptoms', label: 'Reported Symptoms & Crew Observations' },
  { id: 'radiation', label: 'Radiation Context (Gy & Sv Separate)' },
  { id: 'environment', label: 'Habitat Environmental Telemetry' },
  { id: 'alerts', label: 'Review Flags & Supporting Evidence' },
  { id: 'quality', label: 'Data-Quality Limitations' },
];

export function MedicalReports({ overview, onNotify }: MedicalReportsProps) {
  const [windowHours, setWindowHours] = useState<number>(72);
  const [includedSections, setIncludedSections] = useState<string[]>(
    SECTION_OPTIONS.map((s) => s.id)
  );
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [generating, setGenerating] = useState(false);

  const loadReports = async () => {
    const list = await api.getReports();
    setReports(list);
  };

  useEffect(() => {
    loadReports();
  }, []);

  const toggleSection = (id: string) => {
    setIncludedSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const created = await api.generateReport({
        astronautId: overview.astronaut.id,
        windowHours,
        includedSections,
      });
      await loadReports();
      onNotify(`Generated handover report ${created.id} (SHA-256 ${created.contentHash.slice(0, 12)}…).`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Report generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Medical Handover Reports
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Prepare structured, printable PDF and JSON handover packages with integrity hashes and explicit human-review boundaries.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || includedSections.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] rounded-[2px] hover:opacity-90 disabled:opacity-50 cursor-pointer transition-opacity"
        >
          <FileSpreadsheet className="h-4 w-4" />
          <span>{generating ? 'Generating Report…' : 'Generate Handover Report'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Configuration + Stored History */}
        <div className="xl:col-span-5 space-y-4">
          <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] p-4 space-y-4 text-xs">
            <div className="font-semibold text-sm text-[var(--text-primary)]">
              Report Configuration
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] font-mono text-[var(--text-muted)]">Crew Profile</div>
                <div className="mt-1 font-mono font-semibold text-[var(--text-primary)]">
                  {overview.astronaut.callsign} ({overview.astronaut.name})
                </div>
              </div>
              <div>
                <div className="text-[11px] font-mono text-[var(--text-muted)]">Mission</div>
                <div className="mt-1 font-mono font-semibold text-[var(--text-primary)]">
                  {overview.mission.name}
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="rpt-window" className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
                Review Window
              </label>
              <select
                id="rpt-window"
                value={windowHours}
                onChange={(e) => setWindowHours(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] font-mono text-[var(--text-primary)]"
              >
                <option value={24}>Last 24 hours</option>
                <option value={48}>Last 48 hours</option>
                <option value={72}>Last 72 hours</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-mono text-[var(--text-muted)]">Included Sections</div>
              {SECTION_OPTIONS.map((sec) => {
                const checked = includedSections.includes(sec.id);
                return (
                  <label
                    key={sec.id}
                    className="flex items-center gap-2.5 p-2 border border-[var(--border-hairline)] bg-[var(--bg-canvas)] rounded-[3px] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSection(sec.id)}
                      className="accent-[var(--accent-primary)]"
                    />
                    <span className="text-[var(--text-primary)]">{sec.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Local Report Archive */}
          <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-primary)]">
              Locally Stored Reports ({reports.length})
            </div>
            {reports.length === 0 ? (
              <div className="p-5 text-xs text-[var(--text-muted)] text-center">
                No reports generated yet. Click &ldquo;Generate Handover Report&rdquo; to create a PDF &amp; JSON archive entry.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-hairline)] max-h-[300px] overflow-y-auto">
                {reports.map((r) => (
                  <div key={r.id} className="p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-[var(--accent-teal)]">{r.id}</span>
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">
                        {r.generatedAt.slice(0, 19).replace('T', ' ')}Z
                      </span>
                    </div>
                    <div className="font-medium text-[var(--text-primary)]">{r.title}</div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] truncate">
                      SHA-256: {r.contentHash}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href={`/api/v1/reports/${encodeURIComponent(r.id)}/pdf`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] font-medium rounded-[2px] hover:opacity-90"
                      >
                        <Download className="h-3 w-3" />
                        <span>Download PDF</span>
                      </a>
                      <a
                        href={`/api/v1/reports/${encodeURIComponent(r.id)}/json`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono border border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-primary)] rounded-[2px] hover:bg-[var(--bg-elevated)]"
                      >
                        <FileText className="h-3 w-3" />
                        <span>Download JSON</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Light Off-White Printable Report Preview */}
        <div className="xl:col-span-7 border border-[var(--border-hairline)] rounded-[4px] overflow-hidden bg-[#F8FAFC] text-[#0F172A]">
          <div className="px-5 py-3 border-b border-[#CBD5E1] bg-[#EEF2F6] flex items-center justify-between text-xs">
            <span className="font-mono font-semibold text-[#0F172A] flex items-center gap-2">
              <Printer className="h-4 w-4 text-[#0F766E]" />
              <span>Printable Handover Preview</span>
            </span>
            <span className="font-mono text-[#475569]">
              A4 Medical Review Format · Simulated Data
            </span>
          </div>

          <div className="p-6 space-y-5 text-xs leading-relaxed">
            <div className="border-b border-[#CBD5E1] pb-3 flex flex-wrap justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-[#0F172A]">
                  ASTROSAGE MEDICAL HANDOVER REPORT
                </h2>
                <div className="font-mono text-[11px] text-[#475569]">
                  {overview.mission.name} ({overview.mission.code}) · {overview.astronaut.callsign} — {overview.astronaut.name}
                </div>
              </div>
              <div className="text-right font-mono text-[11px] text-[#475569]">
                <div>Window: Last {windowHours}h</div>
                <div>Scenario: {overview.activeScenario}</div>
              </div>
            </div>

            <div className="p-3 border border-[#D97706]/40 bg-[#FFFBEB] rounded-[3px] flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-[#B45309] shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-[#92400E]">SIMULATION &amp; HUMAN-REVIEW NOTE</div>
                <p className="text-[#78350F]">
                  Prepared to support human medical review. This is not a diagnosis or clinical clearance. All records are synthetic demonstration telemetry.
                </p>
              </div>
            </div>

            {includedSections.includes('health') && (
              <div className="space-y-1.5">
                <h3 className="font-bold text-[#0F766E] uppercase tracking-wider text-[11px] border-b border-[#E2E8F0] pb-1">
                  Health Summary &amp; Personal Baselines
                </h3>
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  {overview.latestMetrics.map((m) => (
                    <div key={m.metric} className="p-2 border border-[#E2E8F0] bg-white rounded-[2px]">
                      <div className="font-bold text-[#0F172A]">
                        {m.label}: {m.value ?? '--'} {m.unit} ({m.qualityStatus})
                      </div>
                      <div className="text-[#475569]">
                        {m.baselineSufficient
                          ? `Baseline mean ${m.baselineMean} ± ${m.baselineStdDev} ${m.unit}`
                          : 'Insufficient baseline samples'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {includedSections.includes('symptoms') && (
              <div className="space-y-1">
                <h3 className="font-bold text-[#0F766E] uppercase tracking-wider text-[11px] border-b border-[#E2E8F0] pb-1">
                  Symptoms &amp; Crew Observations
                </h3>
                {overview.recentSymptoms.length === 0 ? (
                  <p className="text-[#475569]">No symptoms recorded in current review window.</p>
                ) : (
                  overview.recentSymptoms.map((s) => (
                    <div key={s.id} className="text-[#0F172A]">
                      • <strong>{s.symptom}</strong> (severity {s.severityRating}/5, {s.durationMinutes} min): {s.notes}
                    </div>
                  ))
                )}
              </div>
            )}

            {(includedSections.includes('radiation') || includedSections.includes('environment')) && (
              <div className="space-y-1">
                <h3 className="font-bold text-[#0F766E] uppercase tracking-wider text-[11px] border-b border-[#E2E8F0] pb-1">
                  Radiation (Gy / Sv Separate) &amp; Environmental Context
                </h3>
                <p className="italic text-[#475569] text-[11px]">
                  Gray (Gy) and Sievert (Sv) remain separate quantities. Temporal overlap does not establish causation.
                </p>
                <div className="font-mono text-[11px] text-[#0F172A]">
                  Radiation records: {overview.recentRadiation.length} · Environmental records: {overview.recentEnvironment.length}
                </div>
              </div>
            )}

            {includedSections.includes('alerts') && (
              <div className="space-y-1.5">
                <h3 className="font-bold text-[#0F766E] uppercase tracking-wider text-[11px] border-b border-[#E2E8F0] pb-1">
                  Deterministic Review Flags ({overview.alerts.length})
                </h3>
                {overview.alerts.length === 0 ? (
                  <p className="text-[#475569]">No active review flags.</p>
                ) : (
                  overview.alerts.map((a) => (
                    <div key={a.id} className="p-2 border border-[#E2E8F0] bg-white rounded-[2px]">
                      <div className="font-bold">
                        [{a.severity}] {a.title} ({a.ruleId})
                      </div>
                      <div className="text-[#475569]">{a.whatHappened}</div>
                    </div>
                  ))
                )}
              </div>
            )}

            {includedSections.includes('quality') && (
              <div className="space-y-1">
                <h3 className="font-bold text-[#0F766E] uppercase tracking-wider text-[11px] border-b border-[#E2E8F0] pb-1">
                  Data-Quality Limitations
                </h3>
                <p className="text-[#0F172A]">
                  {overview.summary.dataQualityWarnings} non-VALID record(s) excluded from baseline statistics.
                </p>
              </div>
            )}

            <div className="pt-2 border-t border-[#CBD5E1] flex items-center gap-2 text-[11px] font-semibold text-[#334155]">
              <CheckSquare className="h-3.5 w-3.5 text-[#0F766E]" />
              <span>Prepared to support human medical review. This is not a diagnosis or clinical clearance.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
