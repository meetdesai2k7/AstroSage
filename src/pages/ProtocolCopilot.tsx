import { useEffect, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Bot,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
} from 'lucide-react';
import type {
  AstronautOverview,
  CopilotResponse,
  KnowledgeCitation,
  SystemStatusReport,
} from '../shared/types';
import { StatusTag } from '../components/widgets/StatusTag';
import { api } from '../lib/api';

const STARTER_QUESTIONS = [
  'Explain why this period was flagged. Show the readings and baseline used.',
  'Summarise the exposure and health records in this 72-hour window. What is known and uncertain?',
  'What does the local reference say about Gray and Sievert? Cite the source section.',
  'Prepare a concise medical handover summary for human review.',
  'Which records have missing or unreliable data?',
];

interface ProtocolCopilotProps {
  overview: AstronautOverview;
  systemStatus: SystemStatusReport | null;
  initialQuestion?: string | null;
  onRefreshStatus: () => Promise<void>;
}

export function ProtocolCopilot({
  overview,
  systemStatus,
  initialQuestion,
  onRefreshStatus,
}: ProtocolCopilotProps) {
  const [question, setQuestion] = useState(initialQuestion || '');
  const [history, setHistory] = useState<CopilotResponse[]>([]);
  const [selectedCitations, setSelectedCitations] = useState<KnowledgeCitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Direct local document search
  const [docQuery, setDocQuery] = useState('');
  const [docSearchResults, setDocSearchResults] = useState<KnowledgeCitation[]>([]);

  useEffect(() => {
    if (initialQuestion) {
      setQuestion(initialQuestion);
    }
  }, [initialQuestion]);

  const ask = async (qText: string) => {
    const trimmed = qText.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.askCopilot(trimmed, overview.astronaut.id);
      setHistory((prev) => [...prev, res]);
      setSelectedCitations(res.citations);
      setQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to query local Copilot.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchDocs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docQuery.trim()) {
      setDocSearchResults([]);
      return;
    }
    const hits = await api.searchKnowledge(docQuery.trim());
    setDocSearchResults(hits);
    if (hits.length > 0) setSelectedCitations(hits);
  };

  const ollamaOnline = systemStatus?.ollamaStatus === 'AVAILABLE';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            ASTROSAGE Protocol Copilot
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Offline local-reference assistant with section-level citations, separating recorded facts, calculations, and uncertainty.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="px-3 py-1.5 border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[3px] flex items-center gap-2 text-xs font-mono">
            <span className="text-[var(--text-muted)]">LOCAL AI:</span>
            {ollamaOnline ? (
              <StatusTag status="AVAILABLE" compact />
            ) : (
              <span className="text-[var(--accent-amber)] font-semibold">
                Local AI unavailable (Retrieval Fallback)
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              try {
                await onRefreshStatus();
              } finally {
                setRetrying(false);
              }
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono border border-[var(--border-hairline)] bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)] rounded-[3px] cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
            <span>Retry Model</span>
          </button>
        </div>
      </div>

      {/* Safety Notice */}
      <div className="p-3 border border-[var(--accent-teal)]/35 bg-[var(--accent-teal)]/8 rounded-[3px] flex items-center gap-2.5 text-xs text-[var(--text-primary)]">
        <ShieldCheck className="h-4 w-4 text-[var(--accent-teal)] shrink-0" aria-hidden="true" />
        <span>
          ASTROSAGE Copilot provides evidence-grounded information support. It does not provide medical diagnosis, treatment or autonomous mission-clearance decisions.
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Conversation Panel */}
        <div className="xl:col-span-7 border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] flex flex-col min-h-[540px]">
          <div className="px-4 py-2.5 border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] flex items-center justify-between text-xs">
            <span className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Bot className="h-4 w-4 text-[var(--accent-cyan)]" />
              <span>Evidence-Grounded Session · {overview.astronaut.callsign} ({overview.activeScenario})</span>
            </span>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              Zero External AI APIs
            </span>
          </div>

          {/* Starter Questions */}
          <div className="p-3 border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] space-y-2">
            <div className="text-[11px] font-mono uppercase text-[var(--text-muted)]">
              Suggested Verification Questions
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STARTER_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={loading}
                  onClick={() => ask(q)}
                  className="text-left px-2.5 py-1 text-xs border border-[var(--border-hairline)] bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-[3px] cursor-pointer transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Message History */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {history.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-10 px-4 space-y-2">
                <Bot className="h-8 w-8 text-[var(--text-muted)]" />
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Ask a question grounded in SQLite telemetry and local reference documents.
                </p>
                <p className="text-xs text-[var(--text-muted)] max-w-md">
                  {ollamaOnline
                    ? `Local Ollama (${systemStatus?.configuredModel}) is active. All prompts stay on 127.0.0.1.`
                    : 'Ollama is not running in this environment. Queries run in honest Retrieval-Only Deterministic Fallback mode using local TF-IDF document search and SQLite facts.'}
                </p>
              </div>
            ) : (
              history.map((item) => (
                <div key={item.id} className="space-y-3 border-b border-[var(--border-hairline)] pb-4 last:border-b-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--accent-cyan)]">
                      Operator Query
                    </span>
                    <span className="text-[11px] font-mono text-[var(--text-muted)]">
                      {item.timestamp.slice(11, 19)}Z
                    </span>
                  </div>
                  <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] text-xs text-[var(--text-primary)]">
                    {item.question}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--accent-teal)]">
                      ASTROSAGE Response
                    </span>
                    <span className="text-[11px] font-mono text-[var(--text-muted)]">
                      {item.mode === 'OLLAMA_LOCAL'
                        ? `Offline / Local AI (${item.modelName})`
                        : 'Local AI unavailable — Deterministic Retrieval Summary'}
                    </span>
                  </div>

                  <div className="p-3.5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] rounded-[3px] text-xs text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                    {item.answer}
                  </div>

                  {item.citations.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                      <span className="text-[var(--text-muted)]">Resolved Citations:</span>
                      {item.citations.map((c) => (
                        <button
                          key={c.chunkId}
                          type="button"
                          onClick={() => setSelectedCitations(item.citations)}
                          className="px-2 py-0.5 border border-[var(--accent-primary)]/35 bg-[var(--accent-primary)]/8 text-[var(--accent-primary)] rounded-[2px] cursor-pointer"
                        >
                          {c.sourceTitle.slice(0, 26)}… ({c.section.split(':')[0]} · p.{c.pageNumber ?? '?'})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}

            {error && (
              <div className="p-3 border border-[var(--accent-coral)]/40 bg-[var(--accent-coral)]/10 rounded-[2px] text-xs text-[var(--accent-coral)] flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
            className="p-3 border-t border-[var(--border-hairline)] bg-[var(--bg-elevated)] flex items-center gap-2"
          >
            <input
              type="text"
              aria-label="Ask ASTROSAGE Protocol Copilot"
              placeholder="Ask about review flags, baselines, Gy vs Sv, or record quality…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="flex-1 px-3 py-2 text-xs bg-[var(--bg-panel)] border border-[var(--border-hairline)] rounded-[2px] text-[var(--text-primary)]"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] rounded-[2px] hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{loading ? 'Retrieving…' : 'Ask'}</span>
            </button>
          </form>
        </div>

        {/* Retrieved Evidence & Local Document Search Panel */}
        <div className="xl:col-span-5 space-y-4">
          <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Search className="h-4 w-4 text-[var(--accent-cyan)]" />
                <span>Local Reference Search</span>
              </h2>
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                {systemStatus?.indexedDocumentCount ?? 4} docs · {systemStatus?.indexedChunkCount ?? 12} chunks
              </span>
            </div>

            <form onSubmit={handleSearchDocs} className="flex items-center gap-2">
              <input
                type="text"
                aria-label="Search local reference library"
                placeholder="Search local PDFs/Markdown (e.g., Gray Sievert, baseline, CO2)…"
                value={docQuery}
                onChange={(e) => setDocQuery(e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-xs bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] text-[var(--text-primary)]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-mono border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-secondary)] rounded-[3px] cursor-pointer"
              >
                Search
              </button>
            </form>
          </div>

          <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[var(--accent-teal)]" />
                <span>Retrieved Source Evidence ({selectedCitations.length})</span>
              </span>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                Verified Chunk Citations
              </span>
            </div>

            <div className="divide-y divide-[var(--border-hairline)] max-h-[450px] overflow-y-auto">
              {selectedCitations.length === 0 ? (
                <div className="p-6 text-center text-xs text-[var(--text-muted)]">
                  Submit a question or search the local reference library to inspect exact source titles, sections, page numbers, and verbatim excerpts.
                </div>
              ) : (
                selectedCitations.map((c) => (
                  <div key={c.chunkId} className="p-4 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-[var(--text-primary)]">{c.sourceTitle}</div>
                      <span className="font-mono text-[10px] text-[var(--accent-teal)] shrink-0">
                        score {c.score.toFixed(2)}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-[var(--accent-cyan)]">
                      {c.section} · Page {c.pageNumber ?? 'N/A'} · v{c.version}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--text-muted)]">
                      File: {c.sourceName} · Chunk ID: {c.chunkId}
                    </div>
                    <blockquote className="p-2.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] text-[var(--text-secondary)] leading-relaxed">
                      &ldquo;{c.excerpt.replace(/\*\*/g, '').replace(/`/g, '')}&rdquo;
                    </blockquote>
                  </div>
                ))
              )}
            </div>
          </div>

          {docSearchResults.length > 0 && (
            <div className="text-[11px] font-mono text-[var(--text-muted)] px-1">
              Showing {docSearchResults.length} local search hit(s) above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
