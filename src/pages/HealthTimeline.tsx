import { useEffect, useMemo, useState } from 'react';
import { Clock, Download, Filter, ZoomIn } from 'lucide-react';
import type { AstronautOverview, TimelineEvent } from '../shared/types';
import { StatusTag } from '../components/widgets/StatusTag';
import { api } from '../lib/api';

interface HealthTimelineProps {
  overview: AstronautOverview;
  onInspectEvent: (event: TimelineEvent) => void;
  onNotify: (msg: string) => void;
}

const CATEGORIES: TimelineEvent['category'][] = [
  'HEALTH',
  'RADIATION',
  'ENVIRONMENT',
  'SYMPTOM',
  'COGNITIVE',
  'QUALITY',
  'ALERT',
  'SYSTEM',
];

export function HealthTimeline({
  overview,
  onInspectEvent,
  onNotify,
}: HealthTimelineProps) {
  const [hours, setHours] = useState<number>(72);
  const [selectedCats, setSelectedCats] = useState<TimelineEvent['category'][]>(CATEGORIES);
  const [events, setEvents] = useState<TimelineEvent[]>(overview.activityFeed);
  const [loading, setLoading] = useState(false);
  const [zoomSlicePct, setZoomSlicePct] = useState<[number, number]>([0, 100]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getTimeline(overview.astronaut.id, hours, selectedCats)
      .then((list) => {
        if (active) setEvents(list);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [overview.astronaut.id, overview.activeScenario, overview.summary.healthRecordCount, hours, selectedCats]);

  const zoomedEvents = useMemo(() => {
    if (events.length === 0) return [];
    const startIdx = Math.floor((zoomSlicePct[0] / 100) * events.length);
    const endIdx = Math.max(startIdx + 1, Math.ceil((zoomSlicePct[1] / 100) * events.length));
    return events.slice(startIdx, endIdx);
  }, [events, zoomSlicePct]);

  const toggleCategory = (cat: TimelineEvent['category']) => {
    setSelectedCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleExportWindow = () => {
    const blob = new Blob([JSON.stringify(zoomedEvents, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `astrosage-timeline-${overview.astronaut.callsign}-${hours}h.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(`Exported ${zoomedEvents.length} timeline events (${hours}h window).`);
  };

  const categoryColor = (cat: TimelineEvent['category']) => {
    switch (cat) {
      case 'HEALTH':
        return 'text-[var(--accent-teal)] border-[var(--accent-teal)]/35';
      case 'RADIATION':
        return 'text-[var(--accent-amber)] border-[var(--accent-amber)]/35';
      case 'ENVIRONMENT':
        return 'text-[var(--accent-cyan)] border-[var(--accent-cyan)]/35';
      case 'SYMPTOM':
        return 'text-[var(--accent-amber)] border-[var(--accent-amber)]/35';
      case 'ALERT':
      case 'QUALITY':
        return 'text-[var(--accent-coral)] border-[var(--accent-coral)]/35';
      default:
        return 'text-[var(--text-secondary)] border-[var(--border-hairline)]';
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            72-Hour Integrated Health Event Timeline
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Chronological correlation across biometrics, symptoms, dosimetry, habitat environment, quality checks, and deterministic alerts.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportWindow}
          disabled={zoomedEvents.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] rounded-[2px] cursor-pointer disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
          <span>Export Window (JSON)</span>
        </button>
      </div>

      {/* Controls: Time Window + Zoom + Category Toggles */}
      <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--accent-primary)]" />
            <span className="text-xs font-medium text-[var(--text-muted)]">Window</span>
            <div className="flex items-center gap-1 p-0.5 bg-[var(--bg-secondary)] border border-[var(--border-hairline)] rounded-[2px]">
              {[6, 12, 24, 48, 72].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => {
                    setHours(h);
                    setZoomSlicePct([0, 100]);
                  }}
                  className={`px-2.5 py-1 text-xs font-mono rounded-[2px] cursor-pointer ${
                    hours === h
                      ? 'bg-[var(--bg-panel)] text-[var(--accent-primary)] font-semibold border border-[var(--border-hairline)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <ZoomIn className="h-4 w-4 text-[var(--text-muted)]" />
            <label htmlFor="tl-zoom-end" className="text-[var(--text-muted)]">
              Range Slice: {zoomSlicePct[0]}%–{zoomSlicePct[1]}%
            </label>
            <input
              id="tl-zoom-end"
              type="range"
              min={15}
              max={100}
              value={zoomSlicePct[1]}
              onChange={(e) => setZoomSlicePct([0, Number(e.target.value)])}
              className="w-28 accent-[var(--accent-primary)]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-hairline)]">
          <Filter className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <span className="text-xs font-medium text-[var(--text-muted)] mr-1">Categories</span>
          {CATEGORIES.map((cat) => {
            const active = selectedCats.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`px-2.5 py-1 text-[11px] font-mono border rounded-[2px] cursor-pointer transition-colors ${
                  active
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] font-semibold'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Category Comparison Summary Strip */}
      <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] grid grid-cols-4 md:grid-cols-8 divide-x divide-y md:divide-y-0 divide-[var(--border-hairline)] overflow-hidden">
        {CATEGORIES.map((cat) => {
          const count = zoomedEvents.filter((e) => e.category === cat).length;
          return (
            <div
              key={cat}
              className="p-2.5 text-center"
            >
              <div className="text-[10px] font-mono text-[var(--text-muted)] truncate">{cat}</div>
              <div className="text-base font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                {count}
              </div>
            </div>
          );
        })}
      </div>

      {/* Chronological Event Stream */}
      <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] flex items-center justify-between text-xs">
          <span className="font-semibold text-[var(--text-primary)]">
            Chronological Events ({zoomedEvents.length})
          </span>
          <span className="font-mono text-[11px] text-[var(--text-muted)]">
            Click any event to inspect full provenance &amp; metadata
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs font-mono text-[var(--text-muted)]">
            Loading timeline events…
          </div>
        ) : zoomedEvents.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--text-muted)]">
            No timeline events match the selected categories or time range.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-hairline)] max-h-[540px] overflow-y-auto">
            {zoomedEvents.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => onInspectEvent(ev)}
                className="w-full text-left px-4 py-3 hover:bg-[var(--bg-elevated)] transition-colors flex flex-wrap items-center justify-between gap-3 cursor-pointer"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums whitespace-nowrap pt-0.5">
                    {ev.timestamp.slice(5, 19).replace('T', ' ')}Z
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-mono border rounded-[2px] whitespace-nowrap shrink-0 ${categoryColor(
                      ev.category
                    )}`}
                  >
                    {ev.category}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {ev.title}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] truncate">
                      {ev.summary}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {ev.severity !== 'NONE' && <StatusTag status={ev.severity} compact />}
                  {ev.qualityStatus !== 'N/A' && <StatusTag status={ev.qualityStatus} compact />}
                  <span className="text-[11px] font-mono text-[var(--text-muted)]">{ev.sourceId}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
