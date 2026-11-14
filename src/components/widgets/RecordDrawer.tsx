import { useState } from 'react';
import { CheckCircle2, FileText, ShieldAlert, X } from 'lucide-react';
import type { AlertRecord, TimelineEvent } from '../../shared/types';
import { StatusTag } from './StatusTag';

interface RecordDrawerProps {
  selectedAlert: AlertRecord | null;
  selectedEvent: TimelineEvent | null;
  onClose: () => void;
  onAcknowledgeAlert: (alertId: string, reviewer: string, note: string) => Promise<void>;
}

export function RecordDrawer({
  selectedAlert,
  selectedEvent,
  onClose,
  onAcknowledgeAlert,
}: RecordDrawerProps) {
  const [reviewer, setReviewer] = useState('Flight Medical Reviewer (Sim)');
  const [note, setNote] = useState('Inspected supporting readings, baseline statistics, and habitat context.');
  const [submitting, setSubmitting] = useState(false);

  if (!selectedAlert && !selectedEvent) return null;

  const handleAck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlert) return;
    setSubmitting(true);
    try {
      await onAcknowledgeAlert(selectedAlert.id, reviewer, note);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/45"
      role="dialog"
      aria-modal="true"
      aria-label="Record and Rule Inspection Panel"
    >
      <div className="w-full max-w-xl h-full bg-[var(--bg-panel)] border-l border-[var(--border-hairline)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)]">
          <div className="flex items-center gap-2">
            {selectedAlert ? (
              <ShieldAlert className="h-4 w-4 text-[var(--accent-amber)]" aria-hidden="true" />
            ) : (
              <FileText className="h-4 w-4 text-[var(--accent-cyan)]" aria-hidden="true" />
            )}
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {selectedAlert ? 'Deterministic Alert & Rule Inspection' : 'Timeline Record Inspection'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspection panel"
            className="p-1.5 rounded-[3px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          {selectedAlert && (
            <>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusTag status={selectedAlert.severity} />
                  <span className="text-xs font-mono text-[var(--text-muted)]">
                    {selectedAlert.id} · {selectedAlert.ruleId} v{selectedAlert.ruleVersion}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  {selectedAlert.title}
                </h3>
                <p className="text-xs font-mono text-[var(--text-muted)]">
                  Created: {selectedAlert.createdAt} · Category: {selectedAlert.category}
                </p>
              </div>

              <div className="space-y-3 border-t border-[var(--border-hairline)] pt-4">
                <div>
                  <div className="text-xs font-semibold text-[var(--text-muted)]">
                    What happened
                  </div>
                  <p className="mt-1 text-[var(--text-primary)] leading-relaxed">
                    {selectedAlert.whatHappened}
                  </p>
                </div>

                <div>
                  <div className="text-xs font-semibold text-[var(--text-muted)]">
                    Triggering records ({selectedAlert.triggeringRecordIds.length})
                  </div>
                  <div className="mt-1 font-mono text-xs bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[2px] p-2.5 text-[var(--text-secondary)]">
                    {selectedAlert.triggeringRecordIds.join(', ')}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-[var(--text-muted)]">
                    Measured values &amp; comparison performed
                  </div>
                  <p className="mt-1 text-xs font-mono text-[var(--text-secondary)] bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[2px] p-2.5">
                    {selectedAlert.measuredSummary}
                  </p>
                  <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                    {selectedAlert.comparisonPerformed}
                  </p>
                </div>

                <div>
                  <div className="text-xs font-semibold text-[var(--text-muted)]">
                    Baseline context
                  </div>
                  <p className="mt-1 text-xs font-mono text-[var(--text-secondary)]">
                    {selectedAlert.baselineSummary}
                  </p>
                </div>

                <div>
                  <div className="text-xs font-semibold text-[var(--text-muted)]">
                    Missing information &amp; quality limitations
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {selectedAlert.missingInformation}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Limitations: {selectedAlert.dataQualityLimitations}
                  </p>
                </div>

                <div>
                  <div className="text-xs font-semibold text-[var(--text-muted)]">
                    Why human review is required
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-primary)]">
                    {selectedAlert.humanReviewReason}
                  </p>
                </div>
              </div>

              <div className="border-t border-[var(--border-hairline)] pt-4">
                {selectedAlert.acknowledged ? (
                  <div className="p-3.5 border border-[var(--accent-teal)]/40 bg-[var(--accent-teal)]/8 rounded-[2px] space-y-1">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent-teal)]">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Alert Acknowledged</span>
                    </div>
                    <p className="text-xs font-mono text-[var(--text-secondary)]">
                      By {selectedAlert.acknowledgedBy} at {selectedAlert.acknowledgedAt}
                    </p>
                    <p className="text-xs text-[var(--text-primary)]">
                      Note: {selectedAlert.acknowledgementNote}
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleAck} className="space-y-3">
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      Human Review Acknowledgement
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--text-secondary)] mb-1" htmlFor="ack-reviewer">
                        Reviewer Name / Role
                      </label>
                      <input
                        id="ack-reviewer"
                        type="text"
                        required
                        value={reviewer}
                        onChange={(e) => setReviewer(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[2px] text-[var(--text-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--text-secondary)] mb-1" htmlFor="ack-note">
                        Review Note
                      </label>
                      <textarea
                        id="ack-note"
                        rows={2}
                        required
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[2px] text-[var(--text-primary)]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 text-xs font-semibold bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] rounded-[2px] hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      {submitting ? 'Recording Acknowledgement…' : 'Acknowledge Alert'}
                    </button>
                  </form>
                )}
              </div>
            </>
          )}

          {selectedEvent && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase text-[var(--accent-cyan)]">
                    {selectedEvent.category}
                  </span>
                  {selectedEvent.qualityStatus !== 'N/A' && (
                    <StatusTag status={selectedEvent.qualityStatus} compact />
                  )}
                </div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  {selectedEvent.title}
                </h3>
                <p className="text-xs font-mono text-[var(--text-muted)]">
                  Timestamp: {selectedEvent.timestamp} · Source ID: {selectedEvent.sourceId}
                </p>
              </div>

              <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[2px] text-xs text-[var(--text-primary)]">
                {selectedEvent.summary}
              </div>

              <div>
                <div className="text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                  Full Record &amp; Provenance Metadata (Simulated)
                </div>
                <pre className="text-[11px] font-mono bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] p-3 overflow-x-auto text-[var(--text-secondary)] leading-relaxed">
                  {JSON.stringify(selectedEvent.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
