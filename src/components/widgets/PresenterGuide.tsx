import { ArrowRight, Check, Presentation, X } from 'lucide-react';
import type { ScenarioName } from '../../shared/types';

export interface PresenterStep {
  id: number;
  timecode: string;
  title: string;
  page: string;
  scenario?: ScenarioName;
  suggestedQuestion?: string;
  talkingPoint: string;
}

export const PRESENTER_STEPS: PresenterStep[] = [
  {
    id: 1,
    timecode: '0:00 – 0:25',
    title: 'Mission Problem & Overview',
    page: 'overview',
    scenario: 'NORMAL_MISSION',
    talkingPoint:
      'Show Mission Health Command Center: unified biometric, dosimetry, and habitat telemetry running locally on SQLite when Earth link is delayed or unavailable.',
  },
  {
    id: 2,
    timecode: '0:25 – 0:55',
    title: 'Offline Operation Proof',
    page: 'status',
    scenario: 'COMMUNICATION_BLACKOUT',
    talkingPoint:
      'COMMUNICATION BLACKOUT loads pending outbox items locally without cloud APIs. Monitoring, search, retrieval fallback, and PDF export stay 100% functional.',
  },
  {
    id: 3,
    timecode: '0:55 – 1:25',
    title: 'Explainable Health Drift',
    page: 'monitor',
    scenario: 'GRADUAL_HEALTH_DRIFT',
    talkingPoint:
      'Progressive resting HR rise (~66 to 94 bpm) triggers deterministic rule DEMO-RULE-DEV-02 against locked personal baseline v1—inspect exact readings and z-score indicator.',
  },
  {
    id: 4,
    timecode: '1:25 – 1:55',
    title: 'Radiation & Temporal Context',
    page: 'radiation',
    scenario: 'EXPOSURE_CONTEXT',
    talkingPoint:
      'Show Gray (mGy) and Sievert (mSv) strictly separated with original units preserved, plus aligned context charts noting temporal overlap never proves causation.',
  },
  {
    id: 5,
    timecode: '1:55 – 2:30',
    title: 'Evidence-Grounded Local Copilot',
    page: 'copilot',
    scenario: 'GRADUAL_HEALTH_DRIFT',
    suggestedQuestion: 'Explain why this period was flagged. Show the readings and baseline used.',
    talkingPoint:
      'Ask Protocol Copilot: inspect real local reference citations (section + page) and honest Ollama / retrieval-only fallback mode with zero diagnosis claims.',
  },
  {
    id: 6,
    timecode: '2:30 – 3:00',
    title: 'Medical Handover PDF Report',
    page: 'reports',
    talkingPoint:
      'Preview and generate a real printable PDF + JSON medical handover report with SHA-256 integrity hash and explicit human-review declaration.',
  },
];

interface PresenterGuideProps {
  active: boolean;
  currentStepIndex: number;
  onSelectStep: (step: PresenterStep, index: number) => void;
  onClose: () => void;
}

export function PresenterGuide({
  active,
  currentStepIndex,
  onSelectStep,
  onClose,
}: PresenterGuideProps) {
  if (!active) return null;
  const step = PRESENTER_STEPS[currentStepIndex] ?? PRESENTER_STEPS[0];

  return (
    <div
      data-testid="presenter-mode-bar"
      className="border-b border-[var(--accent-primary)]/35 bg-[var(--bg-elevated)] px-5 py-2.5 flex flex-wrap items-center justify-between gap-4"
    >
      <div className="flex items-start gap-3 max-w-3xl">
        <Presentation className="h-4 w-4 text-[var(--accent-primary)] mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="text-[var(--accent-primary)] font-semibold">
              PRESENTER MODE · STEP {step.id}/{PRESENTER_STEPS.length}
            </span>
            <span className="text-[var(--text-muted)]">({step.timecode})</span>
            <span className="text-[var(--text-primary)] font-sans font-semibold">{step.title}</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">{step.talkingPoint}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden lg:flex items-center gap-1">
          {PRESENTER_STEPS.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectStep(s, idx)}
              title={`${s.timecode}: ${s.title}`}
              className={`px-2 py-1 text-[11px] font-mono rounded-[2px] border cursor-pointer transition-colors ${
                idx === currentStepIndex
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/12 text-[var(--accent-primary)] font-semibold'
                  : idx < currentStepIndex
                    ? 'border-[var(--border-hairline)] text-[var(--text-secondary)] bg-[var(--bg-panel)]'
                    : 'border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-panel)]'
              }`}
            >
              {idx < currentStepIndex ? <Check className="h-3 w-3 inline mr-0.5" /> : null}
              {s.id}
            </button>
          ))}
        </div>

        {currentStepIndex < PRESENTER_STEPS.length - 1 && (
          <button
            type="button"
            onClick={() =>
              onSelectStep(PRESENTER_STEPS[currentStepIndex + 1], currentStepIndex + 1)
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] rounded-[2px] hover:opacity-90 cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Next Step</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Exit presenter mode"
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[2px] cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
