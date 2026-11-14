import { useEffect, useState } from 'react';
import {
  Cpu,
  HardDrive,
  RefreshCw,
  Terminal,
  WifiOff,
} from 'lucide-react';
import type {
  AuditLogEntry,
  OutboxEntry,
  SystemStatusReport,
} from '../shared/types';
import { StatusTag } from '../components/widgets/StatusTag';
import { api } from '../lib/api';

interface SystemStatusProps {
  systemStatus: SystemStatusReport | null;
  onRefreshStatus: () => Promise<void>;
}

export function SystemStatus({ systemStatus, onRefreshStatus }: SystemStatusProps) {
  const [checking, setChecking] = useState(false);
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const loadAux = async () => {
    const [obx, aud] = await Promise.all([api.getOutbox(), api.getAuditLogs()]);
    setOutbox(obx);
    setAuditLogs(aud);
  };

  useEffect(() => {
    loadAux();
  }, [systemStatus?.checkedAt]);

  const handleRunChecks = async () => {
    setChecking(true);
    try {
      await onRefreshStatus();
      await loadAux();
    } finally {
      setChecking(false);
    }
  };

  const rows = systemStatus
    ? [
        {
          name: 'Local Application Server',
          status: systemStatus.serverStatus,
          detail: 'Express + Node.js local API serving /api/v1/*',
        },
        {
          name: 'SQLite Database',
          status: systemStatus.sqliteStatus,
          detail: `WAL persistence at ${systemStatus.sqlitePath}`,
        },
        {
          name: 'Ollama Local LLM Daemon',
          status: systemStatus.ollamaStatus,
          detail:
            systemStatus.ollamaStatus === 'AVAILABLE'
              ? `Connected at ${systemStatus.ollamaEndpoint} · Model: ${systemStatus.configuredModel}`
              : `Unreachable at ${systemStatus.ollamaEndpoint} · Retrieval-only deterministic fallback active`,
        },
        {
          name: 'Configured Local Model',
          status: systemStatus.ollamaStatus,
          detail: `${systemStatus.configuredModel} (discovered: ${
            systemStatus.availableModels.length > 0
              ? systemStatus.availableModels.join(', ')
              : 'none detected'
          })`,
        },
        {
          name: 'Local Embedding Engine',
          status: systemStatus.embeddingStatus,
          detail: systemStatus.embeddingEngine,
        },
        {
          name: 'Local Vector Retrieval Index',
          status: systemStatus.faissIndexStatus,
          detail: `${systemStatus.indexedDocumentCount} documents · ${systemStatus.indexedChunkCount} indexed chunks`,
        },
        {
          name: 'Report-Generation Service (PDFKit)',
          status: systemStatus.reportServiceStatus,
          detail: systemStatus.lastSuccessfulReportAt
            ? `Last generated: ${systemStatus.lastSuccessfulReportAt}`
            : 'Ready (no reports generated in current session)',
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            System Status &amp; Offline Diagnostics
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Live verification of local SQLite storage, retrieval index, Ollama daemon availability, and pending offline synchronization queue.
          </p>
        </div>

        <button
          type="button"
          disabled={checking}
          onClick={handleRunChecks}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] rounded-[2px] hover:opacity-90 disabled:opacity-50 cursor-pointer transition-opacity"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
          <span>{checking ? 'Probing Services…' : 'Run system checks'}</span>
        </button>
      </div>

      {systemStatus && (
        <div className="p-3.5 border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-4 w-4 text-[var(--accent-cyan)]" />
            <span className="text-[var(--text-primary)]">{systemStatus.explanation}</span>
          </div>
          <span className="font-mono text-[11px] text-[var(--text-muted)]">
            Last checked: {systemStatus.checkedAt.slice(0, 19).replace('T', ' ')}Z
          </span>
        </div>
      )}

      {/* Service Matrix */}
      <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-primary)]">
          Local Subsystem Health Checks
        </div>
        <div className="divide-y divide-[var(--border-hairline)]">
          {rows.map((row) => (
            <div
              key={row.name}
              className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
            >
              <div>
                <div className="font-semibold text-[var(--text-primary)]">{row.name}</div>
                <div className="font-mono text-[11px] text-[var(--text-muted)] mt-0.5">
                  {row.detail}
                </div>
              </div>
              <StatusTag status={row.status} />
            </div>
          ))}
        </div>
      </div>

      {/* Runtime Environment Variables (process.env) */}
      {systemStatus && systemStatus.runtimeEnv && systemStatus.runtimeEnv.length > 0 && (
        <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Terminal className="h-4 w-4 text-[var(--accent-primary)]" />
              <span>Runtime Environment Variables (process.env)</span>
            </span>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              Non-secret server configuration fetched at runtime
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] font-mono text-[11px] text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-2 font-medium">Variable</th>
                  <th className="px-4 py-2 font-medium">Resolved Value</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {systemStatus.runtimeEnv.map((envVar) => (
                  <tr key={envVar.key} className="hover:bg-[var(--bg-elevated)]">
                    <td className="px-4 py-2.5 font-mono font-semibold text-[var(--text-primary)] whitespace-nowrap">
                      {envVar.key}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[var(--accent-cyan)] whitespace-nowrap">
                      {envVar.value}
                    </td>
                    <td className="px-4 py-2.5 font-mono whitespace-nowrap">
                      <span
                        className={`inline-block px-1.5 py-0.5 text-[10px] border rounded-[2px] ${
                          envVar.source === 'process.env'
                            ? 'border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)]'
                            : 'border-[var(--border-hairline)] text-[var(--text-muted)] bg-[var(--bg-canvas)]'
                        }`}
                      >
                        {envVar.source}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                      {envVar.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Offline Outbox + Audit Trail */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] flex items-center justify-between text-xs">
            <span className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-[var(--accent-amber)]" />
              <span>Pending Offline Outbox ({outbox.length})</span>
            </span>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              Never fabricates sync
            </span>
          </div>
          {outbox.length === 0 ? (
            <div className="p-6 text-xs text-[var(--text-muted)] text-center">
              Outbox is empty. Load COMMUNICATION_BLACKOUT or log offline entries to observe queued pending items.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-hairline)] max-h-[260px] overflow-y-auto">
              {outbox.map((o) => (
                <div key={o.id} className="p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-[var(--accent-cyan)]">{o.id} · {o.operationType}</span>
                    <span className="text-[var(--accent-amber)]">{o.status}</span>
                  </div>
                  <div className="text-[var(--text-primary)]">{o.payloadSummary}</div>
                  <div className="text-[11px] font-mono text-[var(--text-muted)]">
                    Queued: {o.createdAt}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] flex items-center justify-between text-xs">
            <span className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-[var(--accent-teal)]" />
              <span>Local Audit Log ({auditLogs.length})</span>
            </span>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">SQLite Provenance</span>
          </div>
          <div className="divide-y divide-[var(--border-hairline)] max-h-[260px] overflow-y-auto">
            {auditLogs.map((a) => (
              <div key={a.id} className="p-3 text-xs space-y-0.5">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-[var(--accent-teal)]">{a.action}</span>
                  <span className="text-[var(--text-muted)]">{a.createdAt.slice(11, 19)}Z</span>
                </div>
                <div className="text-[var(--text-primary)]">{a.details}</div>
                <div className="text-[10px] font-mono text-[var(--text-muted)]">
                  Actor: {a.actor} · Entity: {a.entityType}/{a.entityId}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
