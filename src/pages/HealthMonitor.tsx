import { useMemo, useState } from 'react';
import {
  Activity,
  Lock,
  PlusCircle,
  RotateCcw,
  ShieldAlert,
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
  BaselineProfile,
  DataQualityStatus,
} from '../shared/types';
import { StatusTag } from '../components/widgets/StatusTag';
import { api } from '../lib/api';

interface HealthMonitorProps {
  overview: AstronautOverview;
  onRefresh: () => Promise<void>;
  onInspectAlert: (alert: AlertRecord) => void;
  onNotify: (msg: string) => void;
}

export function HealthMonitor({
  overview,
  onRefresh,
  onInspectAlert,
  onNotify,
}: HealthMonitorProps) {
  const [selectedMetric, setSelectedMetric] = useState<string>('heart_rate');
  const [hoursFilter, setHoursFilter] = useState<number>(72);
  const [deviceFilter, setDeviceFilter] = useState<string>('ALL');
  const [qualityFilter, setQualityFilter] = useState<string>('ALL');
  const [alertFilter, setAlertFilter] = useState<string>('ALL');

  // Manual reading log state
  const [newMetric, setNewMetric] = useState('heart_rate');
  const [newValue, setNewValue] = useState('72');
  const [newUnit, setNewUnit] = useState('bpm');
  const [submitting, setSubmitting] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const devices = useMemo(
    () => Array.from(new Set(overview.recentHealthSeries.map((r) => r.deviceId))),
    [overview.recentHealthSeries]
  );

  const filteredMetrics = useMemo(() => {
    return overview.latestMetrics.filter((m) => {
      if (qualityFilter !== 'ALL' && m.qualityStatus !== qualityFilter) return false;
      if (alertFilter === 'FLAGGED') {
        return overview.alerts.some((a) => a.title.toLowerCase().includes(m.metric.replace('_', ' ')) || a.category === 'HEALTH_DEVIATION');
      }
      return true;
    });
  }, [overview.latestMetrics, overview.alerts, qualityFilter, alertFilter]);

  const metricSeries = useMemo(() => {
    const all = overview.recentHealthSeries.filter((r) => r.metric === selectedMetric);
    const maxTs = all.length > 0 ? Math.max(...all.map((r) => Date.parse(r.recordedAt) || 0)) : 0;
    const cutoff = hoursFilter > 0 ? maxTs - hoursFilter * 3600 * 1000 : 0;
    return all.filter((r) => {
      if (hoursFilter > 0 && (Date.parse(r.recordedAt) || 0) < cutoff) return false;
      if (deviceFilter !== 'ALL' && r.deviceId !== deviceFilter) return false;
      if (qualityFilter !== 'ALL' && r.qualityStatus !== qualityFilter) return false;
      return true;
    });
  }, [overview.recentHealthSeries, selectedMetric, hoursFilter, deviceFilter, qualityFilter]);

  const selectedSummary = overview.latestMetrics.find((m) => m.metric === selectedMetric);
  const selectedBaseline: BaselineProfile | undefined = overview.baselines.find(
    (b) => b.metric === selectedMetric
  );
  const relevantAlerts = overview.alerts.filter(
    (a) =>
      a.category === 'HEALTH_DEVIATION' ||
      a.category === 'SENSOR_FAULT' ||
      a.title.toLowerCase().includes(selectedMetric.replace('_', ' '))
  );

  const chartPoints = metricSeries
    .filter((r) => r.qualityStatus === 'VALID' && r.value !== null)
    .map((r) => ({
      id: r.id,
      time: r.recordedAt.slice(5, 16).replace('T', ' ') + 'Z',
      shortTime: r.recordedAt.slice(11, 16) + 'Z',
      value: r.value as number,
    }));

  const resetFilters = () => {
    setHoursFilter(72);
    setDeviceFilter('ALL');
    setQualityFilter('ALL');
    setAlertFilter('ALL');
  };

  const handleLogReading = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.addHealthReading({
        astronautId: overview.astronaut.id,
        missionId: overview.mission.id,
        metric: newMetric,
        value: Number(newValue),
        unit: newUnit,
        recordedAt: new Date().toISOString(),
      });
      await onRefresh();
      onNotify(`Recorded ${newMetric} reading (${res.qualityStatus}).`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to log reading');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecalculateBaseline = async () => {
    setRecalculating(true);
    try {
      const updated = await api.recalculateBaseline(
        overview.astronaut.id,
        selectedMetric,
        'Flight Surgeon Operator (Sim)',
        'Explicitly approved baseline recalibration'
      );
      await onRefresh();
      onNotify(
        `Baseline for ${selectedMetric} updated to v${updated.baselineVersion} (n=${updated.sampleCount}).`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Baseline recalculation failed');
    } finally {
      setRecalculating(false);
    }
  };

  const bandLow =
    selectedBaseline?.isSufficient && selectedBaseline.mean !== null && selectedBaseline.stdDev !== null
      ? Number((selectedBaseline.mean - 1.5 * selectedBaseline.stdDev).toFixed(2))
      : undefined;
  const bandHigh =
    selectedBaseline?.isSufficient && selectedBaseline.mean !== null && selectedBaseline.stdDev !== null
      ? Number((selectedBaseline.mean + 1.5 * selectedBaseline.stdDev).toFixed(2))
      : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Health Monitor &amp; Personal Baselines
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Inspect physiological trends, data-quality validation, and explainable baseline deviations for {overview.astronaut.callsign}.
          </p>
        </div>
        <button
          type="button"
          onClick={resetFilters}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset filters</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3.5 border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] text-xs">
        <div>
          <label htmlFor="hm-range" className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
            Time Window
          </label>
          <select
            id="hm-range"
            value={hoursFilter}
            onChange={(e) => setHoursFilter(Number(e.target.value))}
            className="w-full px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] font-mono text-[var(--text-primary)]"
          >
            <option value={12}>Last 12 hours</option>
            <option value={24}>Last 24 hours</option>
            <option value={48}>Last 48 hours</option>
            <option value={72}>Last 72 hours</option>
            <option value={0}>All stored records</option>
          </select>
        </div>

        <div>
          <label htmlFor="hm-device" className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
            Device / Source
          </label>
          <select
            id="hm-device"
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] font-mono text-[var(--text-primary)]"
          >
            <option value="ALL">All devices</option>
            {devices.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="hm-quality" className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
            Data-Quality Status
          </label>
          <select
            id="hm-quality"
            value={qualityFilter}
            onChange={(e) => setQualityFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] font-mono text-[var(--text-primary)]"
          >
            <option value="ALL">All statuses</option>
            {(['VALID', 'STALE', 'MISSING', 'INVALID', 'UNCERTAIN', 'DUPLICATE'] as DataQualityStatus[]).map(
              (s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              )
            )}
          </select>
        </div>

        <div>
          <label htmlFor="hm-alert" className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
            Review Flag Filter
          </label>
          <select
            id="hm-alert"
            value={alertFilter}
            onChange={(e) => setAlertFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] font-mono text-[var(--text-primary)]"
          >
            <option value="ALL">All metrics</option>
            <option value="FLAGGED">Metrics with review flags</option>
          </select>
        </div>
      </div>

      {/* Selectable Metric Strip */}
      {filteredMetrics.length === 0 ? (
        <div className="p-8 text-center border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] text-sm text-[var(--text-muted)]">
          No metrics match the active filter criteria. Click &ldquo;Reset filters&rdquo; to restore all monitored channels.
        </div>
      ) : (
        <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y lg:divide-y-0 divide-[var(--border-hairline)] overflow-hidden">
          {filteredMetrics.map((m) => {
            const active = selectedMetric === m.metric;
            return (
              <button
                key={m.metric}
                type="button"
                onClick={() => setSelectedMetric(m.metric)}
                className={`text-left p-3 transition-colors cursor-pointer space-y-1.5 border-t-2 ${
                  active
                    ? 'border-t-[var(--accent-primary)] bg-[var(--bg-elevated)]'
                    : 'border-t-transparent bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)]'
                }`}
              >
                <div className="text-xs font-medium text-[var(--text-muted)] truncate">
                  {m.label}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                    {m.value !== null ? m.value : '--'}
                  </span>
                  <span className="text-[11px] font-mono text-[var(--text-muted)]">{m.unit}</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <StatusTag status={m.qualityStatus} compact />
                  {m.zScore !== null && (
                    <span className="text-[10px] font-mono text-[var(--text-secondary)] tabular-nums">
                      z={m.zScore > 0 ? `+${m.zScore}` : m.zScore}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected Metric Detail Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8 space-y-4">
          <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[var(--accent-teal)]" />
                  <span>{selectedSummary?.label ?? selectedMetric}</span>
                </h2>
                <p className="text-xs font-mono text-[var(--text-muted)]">
                  Latest: {selectedSummary?.value ?? 'N/A'} {selectedSummary?.unit} · Recorded {selectedSummary?.recordedAt || 'N/A'}
                </p>
              </div>
              {selectedSummary && <StatusTag status={selectedSummary.qualityStatus} />}
            </div>

            <div className="h-[250px] w-full">
              {chartPoints.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs font-mono text-[var(--text-muted)]">
                  No VALID observations in the filtered window for {selectedMetric}. Faulty or stale records are shown in the ledger below.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={chartPoints} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-hairline)" opacity={0.5} />
                    <XAxis
                      dataKey="shortTime"
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
                      }}
                    />
                    {bandLow !== undefined && bandHigh !== undefined && (
                      <ReferenceArea y1={bandLow} y2={bandHigh} fill="var(--accent-teal)" fillOpacity={0.09} />
                    )}
                    {selectedBaseline?.mean !== null && selectedBaseline?.mean !== undefined && (
                      <ReferenceLine y={selectedBaseline.mean} stroke="var(--accent-teal)" strokeDasharray="4 4" />
                    )}
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--accent-primary)"
                      strokeWidth={2}
                      dot={{ r: 3.5, fill: 'var(--accent-primary)' }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Observations Table */}
          <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                Recorded Observations ({metricSeries.length})
              </span>
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                Simulated telemetry · Original units preserved
              </span>
            </div>
            <div className="overflow-x-auto max-h-[260px]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] font-mono text-[11px] text-[var(--text-muted)] uppercase">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Recorded (UTC)</th>
                    <th className="px-3 py-2">Value</th>
                    <th className="px-3 py-2">Device</th>
                    <th className="px-3 py-2">Quality</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {[...metricSeries].reverse().map((r) => (
                    <tr key={r.id} className="hover:bg-[var(--bg-elevated)]">
                      <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">{r.id}</td>
                      <td className="px-3 py-2 font-mono tabular-nums text-[var(--text-secondary)]">
                        {r.recordedAt.slice(0, 19).replace('T', ' ')}Z
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                        {r.value !== null ? `${r.value} ${r.unit}` : `NULL (${r.unit})`}
                      </td>
                      <td className="px-3 py-2 font-mono text-[var(--text-muted)]">{r.deviceId}</td>
                      <td className="px-3 py-2">
                        <StatusTag status={r.qualityStatus} compact />
                      </td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{r.qualityNotes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Personal Baseline Explainability + Manual Entry */}
        <div className="xl:col-span-4 space-y-4">
          <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Lock className="h-4 w-4 text-[var(--accent-teal)]" />
                <span>Personal Baseline Profile</span>
              </h2>
              {selectedBaseline && (
                <span className="text-[11px] font-mono text-[var(--accent-cyan)]">
                  v{selectedBaseline.baselineVersion}
                </span>
              )}
            </div>

            {!selectedBaseline || !selectedBaseline.isSufficient ? (
              <div className="p-3 border border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10 rounded-[2px] text-xs space-y-1">
                <div className="font-semibold text-[var(--accent-amber)]">
                  Insufficient Baseline Observations (n = {selectedBaseline?.sampleCount ?? 0})
                </div>
                <p className="text-[var(--text-secondary)]">
                  At least 8 VALID observations are required before computing mean, SD, or statistical deviation indicators.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 text-xs">
                <div className="grid grid-cols-2 border border-[var(--border-hairline)] rounded-[2px] divide-x divide-y divide-[var(--border-hairline)] font-mono overflow-hidden">
                  <div className="p-2.5 bg-[var(--bg-elevated)]">
                    <div className="text-[10px] text-[var(--text-muted)]">Mean</div>
                    <div className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                      {selectedBaseline.mean} {selectedBaseline.unit}
                    </div>
                  </div>
                  <div className="p-2.5 bg-[var(--bg-elevated)]">
                    <div className="text-[10px] text-[var(--text-muted)]">Median</div>
                    <div className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                      {selectedBaseline.median} {selectedBaseline.unit}
                    </div>
                  </div>
                  <div className="p-2.5 bg-[var(--bg-elevated)]">
                    <div className="text-[10px] text-[var(--text-muted)]">Std Dev (SD)</div>
                    <div className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                      {selectedBaseline.stdDev}
                    </div>
                  </div>
                  <div className="p-2.5 bg-[var(--bg-elevated)]">
                    <div className="text-[10px] text-[var(--text-muted)]">IQR / Samples</div>
                    <div className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                      {selectedBaseline.iqr} (n={selectedBaseline.sampleCount})
                    </div>
                  </div>
                </div>

                {selectedSummary?.zScore !== null && selectedSummary?.zScore !== undefined && (
                  <div className="p-2.5 border border-[var(--border-hairline)] bg-[var(--bg-elevated)] rounded-[2px]">
                    <div className="text-xs font-medium text-[var(--text-muted)]">
                      Experimental Statistical Deviation Indicator
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-[var(--accent-primary)] tabular-nums">
                      z = {selectedSummary.zScore > 0 ? `+${selectedSummary.zScore}` : selectedSummary.zScore} SD
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      Statistical comparison indicator only — not a universal clinical threshold.
                    </div>
                  </div>
                )}

                <div className="text-[11px] text-[var(--text-secondary)] space-y-0.5">
                  <div>Context: {selectedBaseline.contextLabel}</div>
                  <div className="font-mono text-[var(--text-muted)]">
                    Window: {selectedBaseline.observationPeriodStart.slice(0, 10)} to{' '}
                    {selectedBaseline.observationPeriodEnd.slice(0, 10)}
                  </div>
                  <div>Approved by: {selectedBaseline.approvedBy}</div>
                </div>
              </div>
            )}

            <div className="border-t border-[var(--border-hairline)] pt-3 space-y-2">
              <p className="text-[11px] text-[var(--text-muted)]">
                New readings never silently alter an approved baseline. Recalculation is an explicit, audited action.
              </p>
              <button
                type="button"
                disabled={recalculating}
                onClick={handleRecalculateBaseline}
                className="w-full px-3 py-1.5 text-xs font-mono border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-[3px] cursor-pointer"
              >
                {recalculating ? 'Updating Version…' : 'Explicitly Recalculate Baseline'}
              </button>
            </div>
          </div>

          {/* Relevant Flags */}
          <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] p-4 space-y-2.5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[var(--accent-amber)]" />
              <span>Related Review Flags ({relevantAlerts.length})</span>
            </h3>
            {relevantAlerts.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No flags currently active for this metric.</p>
            ) : (
              relevantAlerts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onInspectAlert(a)}
                  className="w-full text-left p-2.5 border border-[var(--border-hairline)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-elevated)] rounded-[3px] space-y-1 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <StatusTag status={a.severity} compact />
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">{a.ruleId}</span>
                  </div>
                  <div className="text-xs font-medium text-[var(--text-primary)]">{a.title}</div>
                </button>
              ))
            )}
          </div>

          {/* Add Manual Reading */}
          <form
            onSubmit={handleLogReading}
            className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] p-4 space-y-2.5 text-xs"
          >
            <div className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-[var(--accent-teal)]" />
              <span>Log Simulated Health Reading</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select
                aria-label="Metric"
                value={newMetric}
                onChange={(e) => {
                  const m = e.target.value;
                  setNewMetric(m);
                  if (m === 'heart_rate') { setNewUnit('bpm'); setNewValue('72'); }
                  else if (m === 'spo2') { setNewUnit('%'); setNewValue('98.2'); }
                  else if (m === 'body_temp') { setNewUnit('°C'); setNewValue('36.8'); }
                  else if (m === 'respiratory_rate') { setNewUnit('br/min'); setNewValue('15'); }
                }}
                className="col-span-2 px-2 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] font-mono text-[var(--text-primary)]"
              >
                <option value="heart_rate">heart_rate</option>
                <option value="spo2">spo2</option>
                <option value="body_temp">body_temp</option>
                <option value="respiratory_rate">respiratory_rate</option>
              </select>
              <input
                aria-label="Value"
                type="number"
                step="0.1"
                required
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="px-2 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] font-mono text-[var(--text-primary)]"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full px-3 py-2 font-semibold bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] rounded-[2px] hover:opacity-90 cursor-pointer"
            >
              {submitting ? 'Submitting…' : `Record (${newUnit}) & Run Quality Gate`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
