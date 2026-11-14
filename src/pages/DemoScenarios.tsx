import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type { ScenarioName } from '../shared/types';
import { api } from '../lib/api';

interface DemoScenariosProps {
  activeScenario: ScenarioName;
  onScenarioChanged: () => Promise<void>;
  onNotify: (msg: string) => void;
}

const SCENARIO_CARDS: Array<{
  id: ScenarioName;
  code: string;
  title: string;
  description: string;
  expectedBehaviour: string;
  insertedNote: string;
}> = [
  {
    id: 'NORMAL_MISSION',
    code: 'A',
    title: 'Normal Mission',
    description:
      'Ordinary physiological variation in simulated health readings, calibrated sensors, complete 72-hour coverage, and stable locked personal baselines.',
    expectedBehaviour:
      'All metrics remain within ±1.5 SD of v1 baselines. Zero health deviation or sensor fault review flags.',
    insertedNote: '~105 health readings, 12 dosimetry (mGy & mSv), 32 ECLSS habitat readings, 1 PVT check.',
  },
  {
    id: 'GRADUAL_HEALTH_DRIFT',
    code: 'B',
    title: 'Gradual Health Drift',
    description:
      'Resting heart rate progresses from ~66 bpm to 94.2 bpm over the last 32 hours alongside rising temperature, faster respiratory rate, shorter sleep, and fatigue.',
    expectedBehaviour:
      'Deterministic rules DEMO-RULE-DEV-02 / DEV-01 create explainable URGENT REVIEW / WATCH flags citing exact readings and v1 baseline SD.',
    insertedNote: 'Adds progressive multi-metric drift series + SYM-DRIFT-01 + elevated PVT latency.',
  },
  {
    id: 'EXPOSURE_CONTEXT',
    code: 'C',
    title: 'Exposure Context',
    description:
      'Elevated absorbed dose (mGy) and effective dose (mSv) intervals occur in overlapping time windows with higher cabin CO2 and a mild headache report.',
    expectedBehaviour:
      'Preserves Gy and Sv separately without conversion. Timeline and Radiation views explicitly state temporal overlap does not establish causation.',
    insertedNote: 'Adds elevated 1.65+ mGy / 2.35+ mSv intervals, CO2 4.1+ mmHg, and SYM-EXP-01.',
  },
  {
    id: 'SENSOR_FAULT',
    code: 'D',
    title: 'Sensor Fault',
    description:
      'Injects dropped MISSING (null) packets, INVALID values (-18 bpm, 104.2% SpO2), DUPLICATE replay rows, STALE (28h old) readings, and an UNCALIBRATED device.',
    expectedBehaviour:
      'Quality gates quarantine faulty readings from baseline calculations and generate transparent SENSOR_FAULT warnings.',
    insertedNote: 'Marks specific HR, SpO2, and Silicon Dosimeter entries as MISSING, INVALID, DUPLICATE, STALE, or UNCERTAIN.',
  },
  {
    id: 'COMMUNICATION_BLACKOUT',
    code: 'E',
    title: 'Communication Blackout',
    description:
      'Simulates disconnected Earth telemetry link while keeping local monitoring, reference search, retrieval Copilot, and PDF generation fully functional.',
    expectedBehaviour:
      'Mission status switches to BLACKOUT; local writes queue honestly in offline_outbox as PENDING/BLOCKED_OFFLINE without pretending sync occurred.',
    insertedNote: 'Sets mission comms to BLACKOUT and queues local outbox synchronization items.',
  },
];

export function DemoScenarios({
  activeScenario,
  onScenarioChanged,
  onNotify,
}: DemoScenariosProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [lastResult, setLastResult] = useState<{
    scenario: ScenarioName;
    insertedCounts: Record<string, number>;
    expectedBehaviour: string;
  } | null>(null);

  const handleLoad = async (id: ScenarioName) => {
    setLoadingId(id);
    try {
      const res = await api.loadScenario(id);
      setLastResult(res);
      await onScenarioChanged();
      onNotify(`Loaded simulated scenario: ${id}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to load scenario');
    } finally {
      setLoadingId(null);
    }
  };

  const handleReset = async () => {
    setLoadingId('RESET');
    try {
      await api.resetScenario();
      await onScenarioChanged();
      onNotify(`Reset active scenario (${activeScenario}) to deterministic baseline seed.`);
    } finally {
      setLoadingId(null);
    }
  };

  const handleClear = async () => {
    setLoadingId('CLEAR');
    try {
      await api.clearDemoData();
      setConfirmClear(false);
      await onScenarioChanged();
      onNotify('Cleared simulated telemetry records from SQLite.');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Interactive Demo Scenarios Console
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Instantly load deterministic, clearly labelled synthetic mission datasets into SQLite to demonstrate every ASTROSAGE workflow.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loadingId !== null}
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-[var(--border-hairline)] bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)] rounded-[3px] cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5 text-[var(--accent-cyan)]" />
            <span>Reset Active Scenario</span>
          </button>

          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-[var(--accent-coral)] text-[var(--accent-coral)] bg-[color-mix(in_srgb,var(--accent-coral)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent-coral)_16%,transparent)] rounded-[2px] cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear Demo Data</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleClear}
                className="px-3 py-1.5 text-xs font-mono font-medium bg-[var(--accent-coral)] text-white rounded-[2px] cursor-pointer"
              >
                Confirm Clear DB
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-2.5 py-1.5 text-xs font-mono border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[2px] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {lastResult && (
        <div className="p-3.5 border border-[var(--accent-teal)] bg-[color-mix(in_srgb,var(--accent-teal)_8%,transparent)] rounded-[3px] text-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[var(--accent-teal)]" />
            <span className="font-mono font-semibold text-[var(--text-primary)]">
              Seeded {lastResult.scenario} into SQLite:
            </span>
            <span className="font-mono text-[var(--text-secondary)]">
              {Object.entries(lastResult.insertedCounts)
                .map(([k, v]) => `${k}=${v}`)
                .join(' · ')}
            </span>
          </div>
          <span className="text-[11px] font-mono text-[var(--accent-teal)]">SIMULATED DATA</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {SCENARIO_CARDS.map((sc) => {
          const isActive = activeScenario === sc.id;
          return (
            <div
              key={sc.id}
              className={`border rounded-[3px] p-4 flex flex-col justify-between space-y-4 ${
                isActive
                  ? 'border-[var(--accent-primary)] border-t-2 border-t-[var(--accent-primary)] bg-[var(--bg-panel)]'
                  : 'border-[var(--border-hairline)] bg-[var(--bg-panel)]'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-[var(--accent-cyan)]">
                    Scenario {sc.code} · {sc.id}
                  </span>
                  {isActive && (
                    <span className="text-[11px] font-mono font-semibold text-[var(--accent-primary)]">
                      Active
                    </span>
                  )}
                </div>

                <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-[var(--accent-primary)]" />
                  <span>{sc.title}</span>
                </h2>

                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {sc.description}
                </p>

                <div className="p-2.5 border border-[var(--border-hairline)] bg-[var(--bg-canvas)] rounded-[2px] text-[11px] space-y-1">
                  <div className="font-mono text-[var(--text-muted)]">
                    Expected Rule Behaviour
                  </div>
                  <p className="text-[var(--text-primary)]">{sc.expectedBehaviour}</p>
                </div>

                <div className="text-[11px] font-mono text-[var(--text-muted)]">
                  Seed payload: {sc.insertedNote}
                </div>
              </div>

              <button
                type="button"
                disabled={loadingId !== null}
                onClick={() => handleLoad(sc.id)}
                className={`w-full py-2 text-xs font-medium rounded-[2px] cursor-pointer transition-colors ${
                  isActive
                    ? 'border border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent-primary)_15%,transparent)]'
                    : 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] hover:opacity-90'
                }`}
              >
                {loadingId === sc.id ? 'Loading Seed…' : isActive ? 'Reload Scenario' : 'Load Scenario'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="p-3.5 border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
        <AlertTriangle className="h-4 w-4 text-[var(--accent-amber)] shrink-0" />
        <span>
          Every record created by these scenarios is marked <code className="font-mono">isSimulated = true</code>. No real astronaut medical records are used.
        </span>
      </div>
    </div>
  );
}
