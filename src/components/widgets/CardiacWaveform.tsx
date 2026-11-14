import { useEffect, useRef, useState } from 'react';
import { Activity, Pause, Play } from 'lucide-react';
import type { DataQualityStatus } from '../../shared/types';

interface CardiacWaveformProps {
  bpm: number | null;
  qualityStatus: DataQualityStatus | null;
  baselineMean: number | null;
  astronautCallsign: string;
  compact?: boolean;
}

/**
 * Generates an authentic normalized P-QRS-T cardiac cycle amplitude (-0.35 to +1.05)
 * for phase t in [0, 1).
 */
function sampleEcgCycle(t: number): number {
  const gauss = (center: number, width: number, amp: number) =>
    amp * Math.exp(-Math.pow((t - center) / width, 2));

  const pWave = gauss(0.16, 0.032, 0.14);
  const qDip = gauss(0.28, 0.012, -0.18);
  const rPeak = gauss(0.315, 0.014, 1.0);
  const sDip = gauss(0.35, 0.014, -0.28);
  const tWave = gauss(0.56, 0.055, 0.28);
  return pWave + qDip + rPeak + sDip + tWave;
}

export function CardiacWaveform({
  bpm,
  qualityStatus,
  baselineMean,
  astronautCallsign,
  compact = false,
}: CardiacWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [beatFlash, setBeatFlash] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{ xPct: number; mv: string } | null>(null);

  const effectiveBpm = bpm && bpm > 20 ? bpm : 66;
  const isFaultSignal =
    qualityStatus !== null &&
    ['MISSING', 'INVALID', 'STALE'].includes(qualityStatus);

  const isElevated =
    !isFaultSignal &&
    baselineMean !== null &&
    bpm !== null &&
    Math.abs(bpm - baselineMean) >= 10;

  const isCritical =
    !isFaultSignal &&
    baselineMean !== null &&
    bpm !== null &&
    Math.abs(bpm - baselineMean) >= 20;

  const stateRef = useRef({
    bpm: effectiveBpm,
    paused,
    isFaultSignal,
    isElevated,
    isCritical,
  });
  stateRef.current = {
    bpm: effectiveBpm,
    paused,
    isFaultSignal,
    isElevated,
    isCritical,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let lastTime = performance.now();
    let sweepX = 0;
    let beatPhase = 0;
    let lastBeatIndex = -1;
    const history: number[] = [];

    const draw = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.08);
      lastTime = now;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(240, Math.floor(rect.width));
      const height = Math.max(76, Math.floor(rect.height));

      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.scale(dpr, dpr);

      const isDark = document.documentElement.classList.contains('dark');
      const bg = isDark ? '#141820' : '#FAFBFD';
      const gridMinor = isDark ? 'rgba(46, 52, 66, 0.45)' : 'rgba(203, 213, 225, 0.45)';
      const gridMajor = isDark ? 'rgba(16, 185, 129, 0.16)' : 'rgba(148, 163, 184, 0.45)';

      let traceColor = isDark ? '#10B981' : '#047857';
      if (stateRef.current.isFaultSignal) {
        traceColor = isDark ? '#768394' : '#64748B';
      } else if (stateRef.current.isCritical) {
        traceColor = isDark ? '#EF4444' : '#B91C1C';
      } else if (stateRef.current.isElevated) {
        traceColor = isDark ? '#F59E0B' : '#B45309';
      }

      // Fill oscilloscope background
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // Draw calibration grid (10px minor, 50px major)
      ctx.lineWidth = 1;
      ctx.strokeStyle = gridMinor;
      ctx.beginPath();
      for (let x = 0; x < width; x += 12) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
      }
      for (let y = 0; y < height; y += 12) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
      }
      ctx.stroke();

      ctx.strokeStyle = gridMajor;
      ctx.beginPath();
      for (let x = 0; x < width; x += 60) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
      }
      for (let y = 0; y < height; y += 48) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
      }
      ctx.stroke();

      const midY = height * 0.6;
      const ampScale = height * 0.44;
      const speedPxPerSec = 95;

      if (history.length !== width) {
        history.length = width;
        for (let i = 0; i < width; i++) {
          const syntheticPhase = ((i / speedPxPerSec) * (stateRef.current.bpm / 60)) % 1;
          history[i] = stateRef.current.isFaultSignal
            ? (i % 16 < 8 ? 0.02 : -0.02)
            : sampleEcgCycle(syntheticPhase);
        }
      }

      if (!stateRef.current.paused && !prefersReduced) {
        const pxStep = Math.max(1, Math.round(dt * speedPxPerSec));
        const beatsPerSec = stateRef.current.bpm / 60;
        for (let s = 0; s < pxStep; s++) {
          const dtStep = 1 / speedPxPerSec;
          beatPhase += dtStep * beatsPerSec;
          const beatIdx = Math.floor(beatPhase);
          if (beatIdx !== lastBeatIndex && !stateRef.current.isFaultSignal) {
            lastBeatIndex = beatIdx;
            setBeatFlash(true);
            window.setTimeout(() => setBeatFlash(false), 140);
          }
          const phaseMod = beatPhase % 1;
          const val = stateRef.current.isFaultSignal
            ? (Math.sin(sweepX * 0.35) * 0.02)
            : sampleEcgCycle(phaseMod);
          history[sweepX % width] = val;
          sweepX = (sweepX + 1) % width;
        }
      }

      // Draw ECG waveform with sweep erase gap
      const gapWidth = prefersReduced ? 0 : 18;
      ctx.lineWidth = 1.75;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (stateRef.current.isFaultSignal) {
        ctx.setLineDash([5, 5]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.strokeStyle = traceColor;
      ctx.beginPath();
      let started = false;
      for (let x = 0; x < width; x++) {
        const distAhead = (x - (sweepX % width) + width) % width;
        if (!prefersReduced && distAhead < gapWidth) {
          started = false;
          continue;
        }
        const y = midY - (history[x] ?? 0) * ampScale;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw active phosphor sweep head
      if (!prefersReduced && !stateRef.current.paused) {
        const headX = (sweepX - 1 + width) % width;
        const headY = midY - (history[headX] ?? 0) * ampScale;
        ctx.fillStyle = traceColor;
        ctx.beginPath();
        ctx.arc(headX, headY, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      if (!prefersReduced) {
        rafId = requestAnimationFrame(draw);
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const rrMs = Math.round(60000 / effectiveBpm);

  return (
    <div
      data-testid="cardiac-waveform-panel"
      className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)]">
        <div className="flex items-center gap-2.5">
          <Activity
            className={`h-4 w-4 transition-transform duration-100 ${
              beatFlash && !isFaultSignal ? 'scale-125' : 'scale-100'
            } ${
              isFaultSignal
                ? 'text-[var(--text-muted)]'
                : isCritical
                  ? 'text-[var(--accent-coral)]'
                  : isElevated
                    ? 'text-[var(--accent-amber)]'
                    : 'text-[var(--accent-teal)]'
            }`}
            aria-hidden="true"
          />
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            Simulated Lead-II Cardiac Rhythm Monitor
          </span>
          <span className="text-[11px] font-mono text-[var(--text-muted)]">
            {astronautCallsign} · 25 mm/s · 10 mm/mV
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">HR</span>
            <span
              data-testid="live-bpm-readout"
              className={`text-xl font-mono font-semibold tabular-nums ${
                isFaultSignal
                  ? 'text-[var(--text-muted)]'
                  : isCritical
                    ? 'text-[var(--accent-coral)]'
                    : isElevated
                      ? 'text-[var(--accent-amber)]'
                      : 'text-[var(--accent-teal)]'
              }`}
            >
              {bpm !== null ? bpm.toFixed(1) : '--'}
            </span>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">bpm</span>
            <span className="hidden sm:inline text-[11px] font-mono text-[var(--text-muted)] ml-1 tabular-nums">
              · R-R {isFaultSignal ? '--' : rrMs} ms
            </span>
            {baselineMean !== null && (
              <span className="text-[11px] font-mono text-[var(--text-secondary)] ml-1.5 tabular-nums">
                (Baseline {baselineMean.toFixed(1)})
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Resume waveform sweep' : 'Pause waveform sweep'}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[2px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            <span>{paused ? 'Resume' : 'Freeze'}</span>
          </button>
        </div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          className={`w-full block cursor-crosshair ${compact ? 'h-[88px]' : 'h-[112px]'}`}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const xPct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
            const mv = (((rect.height * 0.6 - (e.clientY - rect.top)) / (rect.height * 0.44)) * 1.2).toFixed(2);
            setHoverInfo({ xPct, mv });
          }}
          onMouseLeave={() => setHoverInfo(null)}
        />
        {isFaultSignal && (
          <div className="absolute inset-x-0 bottom-2 flex justify-center pointer-events-none">
            <span className="px-2 py-0.5 text-[11px] font-mono bg-[var(--bg-panel)]/95 border border-[var(--border-hairline)] text-[var(--accent-amber)] rounded-[3px]">
              SIGNAL DEGRADED ({qualityStatus}) — Trace held on last valid cadence
            </span>
          </div>
        )}
        {hoverInfo && (
          <div className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-mono bg-[var(--bg-panel)]/90 border border-[var(--border-hairline)] text-[var(--text-secondary)] rounded-[3px] pointer-events-none tabular-nums">
            Cursor {hoverInfo.xPct}% · {hoverInfo.mv} mV
          </div>
        )}
      </div>
    </div>
  );
}
