import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Info,
  ShieldAlert,
  XOctagon,
} from 'lucide-react';
import type { DataQualityStatus, DisplaySeverity } from '../../shared/types';

type TagVariant = DataQualityStatus | DisplaySeverity | 'AVAILABLE' | 'UNAVAILABLE' | 'DEGRADED' | 'BLACKOUT' | 'CONNECTED';

export function StatusTag({
  status,
  compact = false,
}: {
  status: TagVariant;
  compact?: boolean;
}) {
  const map: Record<
    string,
    { label: string; colorClass: string; Icon: typeof CheckCircle2 }
  > = {
    VALID: {
      label: 'VALID',
      colorClass: 'text-[var(--accent-teal)] border-[var(--accent-teal)]/35 bg-[var(--accent-teal)]/8',
      Icon: CheckCircle2,
    },
    AVAILABLE: {
      label: 'AVAILABLE',
      colorClass: 'text-[var(--accent-teal)] border-[var(--accent-teal)]/35 bg-[var(--accent-teal)]/8',
      Icon: CheckCircle2,
    },
    CONNECTED: {
      label: 'LINK READY',
      colorClass: 'text-[var(--accent-teal)] border-[var(--accent-teal)]/35 bg-[var(--accent-teal)]/8',
      Icon: CheckCircle2,
    },
    INFO: {
      label: 'INFO',
      colorClass: 'text-[var(--accent-cyan)] border-[var(--accent-cyan)]/35 bg-[var(--accent-cyan)]/8',
      Icon: Info,
    },
    WATCH: {
      label: 'WATCH',
      colorClass: 'text-[var(--accent-amber)] border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10',
      Icon: AlertTriangle,
    },
    UNCERTAIN: {
      label: 'UNCERTAIN',
      colorClass: 'text-[var(--accent-amber)] border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10',
      Icon: HelpCircle,
    },
    STALE: {
      label: 'STALE',
      colorClass: 'text-[var(--text-secondary)] border-[var(--border-hairline)] bg-[var(--bg-elevated)]',
      Icon: Clock,
    },
    MISSING: {
      label: 'MISSING',
      colorClass: 'text-[var(--text-secondary)] border-[var(--border-hairline)] bg-[var(--bg-elevated)]',
      Icon: HelpCircle,
    },
    DUPLICATE: {
      label: 'DUPLICATE',
      colorClass: 'text-[var(--accent-amber)] border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10',
      Icon: AlertTriangle,
    },
    UNAVAILABLE: {
      label: 'UNAVAILABLE',
      colorClass: 'text-[var(--text-secondary)] border-[var(--border-hairline)] bg-[var(--bg-elevated)]',
      Icon: XOctagon,
    },
    DEGRADED: {
      label: 'DEGRADED',
      colorClass: 'text-[var(--accent-amber)] border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10',
      Icon: AlertTriangle,
    },
    INVALID: {
      label: 'INVALID',
      colorClass: 'text-[var(--accent-coral)] border-[var(--accent-coral)]/40 bg-[var(--accent-coral)]/10',
      Icon: XOctagon,
    },
    'URGENT REVIEW': {
      label: 'URGENT REVIEW',
      colorClass: 'text-[var(--accent-coral)] border-[var(--accent-coral)]/40 bg-[var(--accent-coral)]/10',
      Icon: ShieldAlert,
    },
    EMERGENCY: {
      label: 'EMERGENCY (DEMO)',
      colorClass: 'text-[var(--accent-coral)] border-[var(--accent-coral)]/50 bg-[var(--accent-coral)]/12',
      Icon: ShieldAlert,
    },
    BLACKOUT: {
      label: 'COMMS BLACKOUT',
      colorClass: 'text-[var(--accent-amber)] border-[var(--accent-amber)]/40 bg-[var(--accent-amber)]/10',
      Icon: AlertTriangle,
    },
  };

  const entry = map[status] ?? {
    label: status,
    colorClass: 'text-[var(--text-secondary)] border-[var(--border-hairline)] bg-[var(--bg-elevated)]',
    Icon: Info,
  };
  const Icon = entry.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[2px] border font-mono font-medium uppercase tracking-wider whitespace-nowrap shrink-0 ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      } ${entry.colorClass}`}
    >
      <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden="true" />
      <span>{entry.label}</span>
    </span>
  );
}
