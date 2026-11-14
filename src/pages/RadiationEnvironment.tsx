import { useMemo } from 'react';
import { AlertTriangle, Info, Radiation, Thermometer } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AstronautOverview } from '../shared/types';
import { StatusTag } from '../components/widgets/StatusTag';

interface RadiationEnvironmentProps {
  overview: AstronautOverview;
}

export function RadiationEnvironment({ overview }: RadiationEnvironmentProps) {
  const { recentRadiation, recentEnvironment, recentHealthSeries } = overview;

  const absorbedList = useMemo(
    () => recentRadiation.filter((r) => r.quantity === 'ABSORBED_DOSE'),
    [recentRadiation]
  );
  const effectiveList = useMemo(
    () => recentRadiation.filter((r) => r.quantity !== 'ABSORBED_DOSE'),
    [recentRadiation]
  );

  const absorbedChartData = absorbedList.map((r) => ({
    time: r.recordedAt.slice(5, 16).replace('T', ' ') + 'Z',
    shortTime: r.recordedAt.slice(11, 16) + 'Z',
    value: r.value ?? 0,
    unit: r.unit,
  }));

  const effectiveChartData = effectiveList.map((r) => ({
    time: r.recordedAt.slice(5, 16).replace('T', ' ') + 'Z',
    shortTime: r.recordedAt.slice(11, 16) + 'Z',
    value: r.value ?? 0,
    unit: r.unit,
  }));

  const co2Data = useMemo(
    () =>
      recentEnvironment
        .filter((e) => e.metric === 'co2_mmhg' && e.value !== null)
        .map((e) => ({
          shortTime: e.recordedAt.slice(11, 16) + 'Z',
          co2: e.value as number,
        })),
    [recentEnvironment]
  );

  const hrOverlayData = useMemo(
    () =>
      recentHealthSeries
        .filter((h) => h.metric === 'heart_rate' && h.qualityStatus === 'VALID' && h.value !== null)
        .map((h) => ({
          shortTime: h.recordedAt.slice(11, 16) + 'Z',
          hr: h.value as number,
        })),
    [recentHealthSeries]
  );

  const radWarnings = recentRadiation.filter((r) => r.qualityStatus !== 'VALID');
  const envWarnings = recentEnvironment.filter((e) => e.qualityStatus !== 'VALID');
  const allWarnings = [...radWarnings, ...envWarnings];

  const latestCo2 = [...recentEnvironment].reverse().find((e) => e.metric === 'co2_mmhg');
  const latestTemp = [...recentEnvironment].reverse().find((e) => e.metric === 'cabin_temp');
  const latestHum = [...recentEnvironment].reverse().find((e) => e.metric === 'humidity');
  const latestPress = [...recentEnvironment].reverse().find((e) => e.metric === 'cabin_pressure');

  return (
    <div className="space-y-5">
      <div className="border-b border-[var(--border-hairline)] pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Radiation Dosimetry &amp; Habitat Environment
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
          Scientific telemetry review preserving original units, device calibration metadata, and temporal context.
        </p>
      </div>

      {/* Mandatory Scientific Guardrails */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="p-3.5 border border-[var(--accent-cyan)]/35 bg-[var(--accent-cyan)]/8 rounded-[3px] flex items-start gap-2.5 text-xs">
          <Info className="h-4 w-4 text-[var(--accent-cyan)] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <div className="font-semibold text-[var(--text-primary)]">
              Strict Unit Separation: Gray (Gy) vs Sievert (Sv)
            </div>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              Gray (Gy, physical absorbed dose) and Sievert (Sv, biologically weighted equivalent/effective dose) represent distinct quantities. ASTROSAGE never auto-converts between Gy and Sv and does not calculate cancer risk or prognosis.
            </p>
          </div>
        </div>

        <div className="p-3.5 border border-[var(--accent-amber)]/35 bg-[var(--accent-amber)]/8 rounded-[3px] flex items-start gap-2.5 text-xs">
          <AlertTriangle className="h-4 w-4 text-[var(--accent-amber)] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <div className="font-semibold text-[var(--text-primary)]">
              Context Correlation Notice
            </div>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              These records overlap in time. Temporal overlap does not establish causation. Evaluate radiation intervals alongside cabin CO2, workload, hydration, and calibration status.
            </p>
          </div>
        </div>
      </div>

      {/* Data-Quality Warnings */}
      {allWarnings.length > 0 && (
        <div className="border border-[var(--accent-amber)]/45 bg-[var(--bg-panel)] rounded-[3px] p-4 space-y-2">
          <div className="text-xs font-semibold text-[var(--accent-amber)] flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>Radiation / Environmental Data-Quality Warnings ({allWarnings.length})</span>
          </div>
          <div className="space-y-1.5 text-xs">
            {allWarnings.map((w) => (
              <div
                key={w.id}
                className="flex flex-wrap items-center justify-between gap-2 p-2 border border-[var(--border-hairline)] bg-[var(--bg-elevated)] rounded-[2px]"
              >
                <span className="font-mono text-[var(--text-primary)]">{w.id}</span>
                <span className="text-[var(--text-secondary)] flex-1">{w.qualityNotes}</span>
                <StatusTag status={w.qualityStatus} compact />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Separate Absorbed Dose (mGy) and Effective Dose (mSv) Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Radiation className="h-4 w-4 text-[var(--accent-cyan)]" />
                <span>Absorbed Dose (mGy) — Silicon Detector</span>
              </h2>
              <p className="text-xs font-mono text-[var(--text-muted)]">
                Quantity: ABSORBED_DOSE · Original unit preserved (mGy)
              </p>
            </div>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={absorbedChartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-hairline)" opacity={0.5} />
                <XAxis dataKey="shortTime" tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'IBM Plex Mono' }} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'IBM Plex Mono' }} width={40} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-panel)',
                    border: '1px solid var(--border-hairline)',
                    fontSize: '12px',
                    fontFamily: 'IBM Plex Mono',
                  }}
                />
                <Bar dataKey="value" name="Absorbed (mGy)" fill="var(--accent-cyan)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Radiation className="h-4 w-4 text-[var(--accent-amber)]" />
                <span>Effective Dose (mSv) — TEPC Dosimeter</span>
              </h2>
              <p className="text-xs font-mono text-[var(--text-muted)]">
                Quantity: EFFECTIVE_DOSE · Original unit preserved (mSv)
              </p>
            </div>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={effectiveChartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-hairline)" opacity={0.6} />
                <XAxis dataKey="shortTime" tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'IBM Plex Mono' }} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'IBM Plex Mono' }} width={40} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-panel)',
                    border: '1px solid var(--border-hairline)',
                    fontSize: '12px',
                    fontFamily: 'IBM Plex Mono',
                  }}
                />
                <Bar dataKey="value" name="Effective (mSv)" fill="var(--accent-amber)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Radiation Records Ledger */}
      <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-primary)]">
          Dosimetry Records Ledger ({recentRadiation.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] font-mono text-[11px] text-[var(--text-muted)] uppercase">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Recorded (UTC)</th>
                <th className="px-3 py-2">Quantity</th>
                <th className="px-3 py-2">Value &amp; Unit</th>
                <th className="px-3 py-2">Dose Rate</th>
                <th className="px-3 py-2">Uncertainty</th>
                <th className="px-3 py-2">Calibration Ref</th>
                <th className="px-3 py-2">Quality</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {recentRadiation.map((r) => (
                <tr key={r.id} className="hover:bg-[var(--bg-elevated)]">
                  <td className="px-3 py-2 font-mono">{r.id}</td>
                  <td className="px-3 py-2 font-mono tabular-nums">{r.recordedAt.slice(0, 19).replace('T', ' ')}Z</td>
                  <td className="px-3 py-2 font-mono text-[var(--accent-cyan)]">{r.quantity}</td>
                  <td className="px-3 py-2 font-mono font-semibold tabular-nums">
                    {r.value ?? 'NULL'} {r.unit}
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums text-[var(--text-secondary)]">
                    {r.doseRate !== null ? `${r.doseRate} ${r.doseRateUnit ?? ''}` : 'N/A'}
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums text-[var(--text-secondary)]">
                    {r.uncertainty !== null ? `±${r.uncertainty} ${r.unit}` : 'Not supplied'}
                  </td>
                  <td className="px-3 py-2 font-mono text-[var(--text-muted)]">
                    {r.calibrationRef} ({r.calibrationStatus})
                  </td>
                  <td className="px-3 py-2">
                    <StatusTag status={r.qualityStatus} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Habitat Environmental Snapshot Strip */}
      <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-[var(--border-hairline)] overflow-hidden">
        {[
          { label: 'Cabin Temperature', rec: latestTemp },
          { label: 'Relative Humidity', rec: latestHum },
          { label: 'CO2 Partial Pressure', rec: latestCo2 },
          { label: 'Cabin Total Pressure', rec: latestPress },
        ].map((item) => (
          <div
            key={item.label}
            className="p-3.5 space-y-1"
          >
            <div className="text-xs font-medium text-[var(--text-muted)] flex items-center gap-1.5">
              <Thermometer className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </div>
            <div className="text-xl font-mono font-semibold text-[var(--text-primary)] tabular-nums">
              {item.rec ? `${item.rec.value} ${item.rec.unit}` : 'N/A'}
            </div>
            <div className="text-[11px] font-mono text-[var(--text-muted)]">
              {item.rec ? `${item.rec.location} · ${item.rec.qualityStatus}` : 'No reading'}
            </div>
          </div>
        ))}
      </div>

      {/* Aligned Time Windows (CO2 vs Heart Rate Context) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Habitat CO2 Partial Pressure (mmHg)
            </h3>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">Aligned Window</span>
          </div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={co2Data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-hairline)" opacity={0.6} />
                <XAxis dataKey="shortTime" tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'IBM Plex Mono' }} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'IBM Plex Mono' }} width={40} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-panel)',
                    border: '1px solid var(--border-hairline)',
                    fontSize: '12px',
                    fontFamily: 'IBM Plex Mono',
                  }}
                />
                <Line type="monotone" dataKey="co2" stroke="var(--accent-amber)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Crew Heart Rate ({overview.astronaut.callsign}) — Temporal Context
            </h3>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">Non-causal alignment</span>
          </div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={hrOverlayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-hairline)" opacity={0.6} />
                <XAxis dataKey="shortTime" tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'IBM Plex Mono' }} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'IBM Plex Mono' }} width={40} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-panel)',
                    border: '1px solid var(--border-hairline)',
                    fontSize: '12px',
                    fontFamily: 'IBM Plex Mono',
                  }}
                />
                <Line type="monotone" dataKey="hr" stroke="var(--accent-primary)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
