import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Clock,
  FileSpreadsheet,
  FlaskConical,
  Play,
  Radiation,
  RefreshCw,
  ShieldAlert,
  Thermometer,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AlertRecord,
  AstronautOverview,
  TimelineEvent,
} from '../shared/types';
import { CardiacWaveform } from '../components/widgets/CardiacWaveform';
import { StatusTag } from '../components/widgets/StatusTag';
import type { NavPageId } from '../components/layout/Sidebar';

interface MissionOverviewProps {
  overview: AstronautOverview;
  liveStreamActive: boolean;
  onToggleLiveStream: () => void;
  onStepTelemetry: () => Promise<void>;
  onRunReview: () => Promise<void>;
  onNavigate: (page: NavPageId) => void;
  onInspectAlert: (alert: AlertRecord) => void;
  onInspectEvent: (event: TimelineEvent) => void;
}

export function MissionOverview({
  overview,
  liveStreamActive,
  onToggleLiveStream,
  onStepTelemetry,
  onRunReview,
  onNavigate,
  onInspectAlert,
  onInspectEvent,
}: MissionOverviewProps) {
  const [selectedMetric, setSelectedMetric] = useState<string>('heart_rate');
  const [stepping, setStepping] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const { mission, astronaut, summary, recentHealthSeries, baselines, alerts, recentRadiation, recentEnvironment, recentSymptoms, activityFeed } =
    overview;

  const hrBaseline = baselines.find((b) => b.metric === 'heart_rate');
  const activeBaseline = baselines.find((b) => b.metric === selectedMetric);

  const chartData = recentHealthSeries
    .filter((r) => r.metric === selectedMetric && r.qualityStatus === 'VALID' && r.value !== null)
    .map((r) => ({
      id: r.id,
      time: r.recordedAt.slice(11, 16) + 'Z',
      fullTime: r.recordedAt,
      value: r.value as number,
      unit: r.unit,
    }));

  const latestAbsorbed = [...recentRadiation]
    .reverse()
    .find((r) => r.quantity === 'ABSORBED_DOSE');
  const latestEffective = [...recentRadiation]
    .reverse()
    .find((r) => r.quantity === 'EFFECTIVE_DOSE');
  const latestCo2 = [...recentEnvironment]
    .reverse()
    .find((e) => e.metric === 'co2_mmhg');
  const latestTemp = [...recentEnvironment]
    .reverse()
    .find((e) => e.metric === 'cabin_temp');

  const bandLow =
    activeBaseline?.isSufficient && activeBaseline.mean !== null && activeBaseline.stdDev !== null
      ? Number((activeBaseline.mean - 1.5 * activeBaseline.stdDev).toFixed(2))
      : undefined;
  const bandHigh =
    activeBaseline?.isSufficient && activeBaseline.mean !== null && activeBaseline.stdDev !== null
      ? Number((activeBaseline.mean + 1.5 * activeBaseline.stdDev).toFixed(2))
      : undefined;

  return (
    <div className="space-y-5">
      {/* Header + Quick Actions */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)] mb-1">
            <span className="font-medium text-[var(--text-secondary)]">{mission.name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{astronaut.callsign} ({astronaut.name})</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-[var(--accent-primary)] font-medium">
              Scenario: {overview.activeScenario}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Mission Health Command Center
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Unified health intelligence and mission-context review for offline operations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleLiveStream}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-[2px] cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
              liveStreamActive
                ? 'border-[var(--accent-teal)] bg-[var(--accent-teal)]/10 text-[var(--accent-teal)]'
                : 'border-[var(--border-hairline)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>{liveStreamActive ? 'Live Stream: ON (5s)' : 'Live Stream: OFF'}</span>
          </button>

          <button
            type="button"
            disabled={stepping}
            onClick={async () => {
              setStepping(true);
              try {
                await onStepTelemetry();
              } finally {
                setStepping(false);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-panel)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded-[2px] cursor-pointer whitespace-nowrap shrink-0"
          >
            <Play className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
            <span>{stepping ? 'Logging…' : 'Simulate +15m Packet'}</span>
          </button>

          <button
            type="button"
            disabled={reviewing}
            onClick={async () => {
              setReviewing(true);
              try {
                await onRunReview();
              } finally {
                setReviewing(false);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] hover:opacity-90 rounded-[2px] cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${reviewing ? 'animate-spin' : ''}`} />
            <span>Run Health Review</span>
          </button>
        </div>
      </div>

      {/* Live Animated Cardiac Waveform */}
      <CardiacWaveform
        bpm={summary.latestHeartRate}
        qualityStatus={summary.latestHeartRateQuality}
        baselineMean={hrBaseline?.mean ?? null}
        astronautCallsign={astronaut.callsign}
      />

      {/* Unified Hairline-Divided Telemetry Summary Strip */}
      <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-[var(--border-hairline)] overflow-hidden">
        <button
          type="button"
          onClick={() => onNavigate('monitor')}
          className="text-left px-4 py-3 hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-[var(--text-muted)]">
            Crew Health Records
          </div>
          <div className="mt-1 text-2xl font-mono font-semibold text-[var(--text-primary)] tabular-nums">
            {summary.healthRecordCount}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--accent-primary)]">
            Open Health Monitor
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            if (alerts.length > 0) onInspectAlert(alerts[0]);
            else onNavigate('monitor');
          }}
          className="text-left px-4 py-3 hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-[var(--text-muted)]">
            Active Review Flags
          </div>
          <div
            className={`mt-1 text-2xl font-mono font-semibold tabular-nums ${
              summary.activeReviewFlags > 0
                ? 'text-[var(--accent-amber)]'
                : 'text-[var(--accent-teal)]'
            }`}
          >
            {summary.activeReviewFlags}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
            {summary.activeReviewFlags > 0 ? 'Click to inspect latest' : 'All flags resolved'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('radiation')}
          className="text-left px-4 py-3 hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-[var(--text-muted)]">
            Radiation Records
          </div>
          <div className="mt-1 text-2xl font-mono font-semibold text-[var(--text-primary)] tabular-nums">
            {summary.radiationRecordCount}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
            Gy &amp; Sv preserved separately
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('radiation')}
          className="text-left px-4 py-3 hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-[var(--text-muted)]">
            Env Data Coverage
          </div>
          <div className="mt-1 text-2xl font-mono font-semibold text-[var(--accent-cyan)] tabular-nums">
            {summary.environmentalCoveragePct}%
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
            Valid ECLSS readings
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('explorer')}
          className="text-left px-4 py-3 hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-[var(--text-muted)]">
            Data-Quality Warnings
          </div>
          <div
            className={`mt-1 text-2xl font-mono font-semibold tabular-nums ${
              summary.dataQualityWarnings > 0
                ? 'text-[var(--accent-coral)]'
                : 'text-[var(--accent-teal)]'
            }`}
          >
            {summary.dataQualityWarnings}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
            Quarantined from baseline
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('timeline')}
          className="text-left px-4 py-3 hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-[var(--text-muted)]">
            Latest Health Timestamp
          </div>
          <div className="mt-1.5 text-base font-mono font-semibold text-[var(--text-primary)] tabular-nums truncate">
            {summary.latestHealthTimestamp
              ? summary.latestHealthTimestamp.slice(11, 19) + 'Z'
              : 'N/A'}
          </div>
          <div className="mt-0.5 text-[11px] font-mono text-[var(--text-muted)] truncate">
            {summary.latestHealthTimestamp ? summary.latestHealthTimestamp.slice(0, 10) : 'No records'}
          </div>
        </button>
      </div>

      {/* Main Workspace Grid: Left 8 cols visualizations, Right 4 cols Activity Feed */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8 space-y-5">
          {/* Health Trend & Baseline Comparison Chart */}
          <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Physiological Trend &amp; Personal Baseline Envelope
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  {activeBaseline?.isSufficient
                    ? `Baseline v${activeBaseline.baselineVersion} (n=${activeBaseline.sampleCount}): Mean ${activeBaseline.mean} ${activeBaseline.unit}, ±1.5 SD demonstration band [${bandLow}–${bandHigh}]`
                    : 'Insufficient baseline samples (n < 8) — statistical band withheld.'}
                </p>
              </div>
              <div className="flex items-center gap-1 p-0.5 bg-[var(--bg-secondary)] border border-[var(--border-hairline)] rounded-[2px]">
                {[
                  { id: 'heart_rate', label: 'HR' },
                  { id: 'spo2', label: 'SpO2' },
                  { id: 'body_temp', label: 'Temp' },
                  { id: 'respiratory_rate', label: 'Resp' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMetric(m.id)}
                    className={`px-2.5 py-1 text-xs font-mono rounded-[2px] cursor-pointer transition-colors ${
                      selectedMetric === m.id
                        ? 'bg-[var(--bg-panel)] text-[var(--accent-primary)] font-semibold border border-[var(--border-hairline)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[240px] w-full">
              {chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-[var(--text-muted)] font-mono">
                  No VALID readings available for {selectedMetric}.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-hairline)" opacity={0.7} />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                      stroke="var(--border-hairline)"
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                      stroke="var(--border-hairline)"
                      width={44}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-panel)',
                        border: '1px solid var(--border-hairline)',
                        borderRadius: '2px',
                        fontSize: '12px',
                        fontFamily: 'IBM Plex Mono',
                        color: 'var(--text-primary)',
                      }}
                    />
                    {bandLow !== undefined && bandHigh !== undefined && (
                      <ReferenceArea
                        y1={bandLow}
                        y2={bandHigh}
                        fill="var(--accent-teal)"
                        fillOpacity={0.08}
                      />
                    )}
                    {activeBaseline?.mean !== null && activeBaseline?.mean !== undefined && (
                      <ReferenceLine
                        y={activeBaseline.mean}
                        stroke="var(--accent-teal)"
                        strokeDasharray="4 4"
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--accent-primary)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: 'var(--accent-primary)' }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Alerts + Context Split */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Active Review Flags */}
            <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-[var(--accent-amber)]" aria-hidden="true" />
                  <span>Explainable Review Flags</span>
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('monitor')}
                  className="text-xs font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
                >
                  Inspect all
                </button>
              </div>

              {alerts.length === 0 ? (
                <div className="p-4 border border-[var(--border-hairline)] bg-[var(--bg-elevated)] rounded-[2px] text-xs text-[var(--text-secondary)]">
                  No deterministic review flags active. All VALID physiological and environmental parameters lie within demonstration review bands.
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.slice(0, 3).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onInspectAlert(a)}
                      className="w-full text-left p-3 border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-secondary)] rounded-[2px] space-y-1.5 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <StatusTag status={a.severity} compact />
                        <span className="text-[11px] font-mono text-[var(--text-muted)]">
                          {a.acknowledged ? 'ACKNOWLEDGED' : 'NEEDS REVIEW'}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        {a.title}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)]">
                        {a.ruleId} · {a.createdAt.slice(11, 16)}Z
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Radiation, Environment & Symptoms Context */}
            <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Radiation className="h-4 w-4 text-[var(--accent-cyan)]" aria-hidden="true" />
                  <span>Radiation, Habitat &amp; Symptoms</span>
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('radiation')}
                  className="text-xs font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
                >
                  Open context
                </button>
              </div>

              <div className="grid grid-cols-2 border border-[var(--border-hairline)] rounded-[2px] divide-x divide-y divide-[var(--border-hairline)] text-xs overflow-hidden">
                <div className="p-2.5 bg-[var(--bg-elevated)]">
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Absorbed Dose (Gy)
                  </div>
                  <div className="mt-1 font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                    {latestAbsorbed ? `${latestAbsorbed.value} ${latestAbsorbed.unit}` : 'N/A'}
                  </div>
                </div>
                <div className="p-2.5 bg-[var(--bg-elevated)]">
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Effective Dose (Sv)
                  </div>
                  <div className="mt-1 font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                    {latestEffective ? `${latestEffective.value} ${latestEffective.unit}` : 'N/A'}
                  </div>
                </div>
                <div className="p-2.5 bg-[var(--bg-elevated)]">
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Cabin CO2
                  </div>
                  <div className="mt-1 font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                    {latestCo2 ? `${latestCo2.value} ${latestCo2.unit}` : 'N/A'}
                  </div>
                </div>
                <div className="p-2.5 bg-[var(--bg-elevated)]">
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Cabin Temp
                  </div>
                  <div className="mt-1 font-mono font-semibold text-[var(--text-primary)] tabular-nums flex items-center gap-1">
                    <Thermometer className="h-3 w-3 text-[var(--text-muted)]" />
                    <span>{latestTemp ? `${latestTemp.value} ${latestTemp.unit}` : 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--border-hairline)] pt-2.5">
                <div className="text-xs font-medium text-[var(--text-muted)] mb-1">
                  Recent Crew Symptoms ({recentSymptoms.length})
                </div>
                {recentSymptoms.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)]">No symptoms logged in current window.</p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {recentSymptoms.slice(0, 2).map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 text-[var(--text-primary)]">
                        <span className="truncate">{s.symptom}</span>
                        <span className="font-mono text-[11px] text-[var(--accent-amber)] shrink-0">
                          {s.severityRating}/5
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-medium text-[var(--text-muted)]">
              Workflow Actions
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (alerts.length > 0) onInspectAlert(alerts[0]);
                  else onNavigate('monitor');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-elevated)] rounded-[2px] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] cursor-pointer"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-[var(--accent-amber)]" />
                <span>Open Latest Alert</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('copilot')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-elevated)] rounded-[2px] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] cursor-pointer"
              >
                <Bot className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                <span>Ask Protocol Copilot</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-elevated)] rounded-[2px] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] cursor-pointer"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-[var(--accent-teal)]" />
                <span>Generate Medical Handover</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('scenarios')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-elevated)] rounded-[2px] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] cursor-pointer"
              >
                <FlaskConical className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                <span>Load Demo Scenario</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right-side Chronological Mission Activity Feed */}
        <div className="xl:col-span-4 border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] flex flex-col max-h-[640px]">
          <div className="px-4 py-3 border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Mission Activity Feed
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('timeline')}
              className="text-xs font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
            >
              72h Timeline
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-hairline)]">
            {activityFeed.length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--text-muted)]">
                No activity records available for this profile.
              </div>
            ) : (
              activityFeed.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onInspectEvent(ev)}
                  className="w-full text-left p-3 hover:bg-[var(--bg-elevated)] transition-colors space-y-1 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                    <span className="text-[var(--accent-cyan)] font-medium">{ev.category}</span>
                    <span className="text-[var(--text-muted)] tabular-nums">
                      {ev.timestamp.slice(5, 16).replace('T', ' ')}Z
                    </span>
                  </div>
                  <div className="text-xs font-medium text-[var(--text-primary)]">
                    {ev.title}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[var(--text-muted)] truncate">
                      {ev.summary}
                    </span>
                    {ev.qualityStatus !== 'N/A' && (
                      <StatusTag status={ev.qualityStatus} compact />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
