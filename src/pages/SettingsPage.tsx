import { useEffect, useState } from 'react';
import {
  BookPlus,
  Download,
  RotateCcw,
  Save,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import type {
  AppSettings,
  AstronautProfile,
  KnowledgeDocument,
  Mission,
} from '../shared/types';
import { api } from '../lib/api';

interface SettingsPageProps {
  settings: AppSettings;
  missions: Mission[];
  astronauts: AstronautProfile[];
  onSaveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onRefreshAll: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export function SettingsPage({
  settings,
  missions,
  astronauts,
  onSaveSettings,
  onRefreshAll,
  onNotify,
}: SettingsPageProps) {
  const [ollamaUrl, setOllamaUrl] = useState(settings.ollamaBaseUrl);
  const [ollamaModel, setOllamaModel] = useState(settings.ollamaModel);
  const [timelineHours, setTimelineHours] = useState(settings.defaultTimelineHours);
  const [auditCopilot, setAuditCopilot] = useState(settings.auditCopilotQueries);
  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);

  // Custom knowledge document upload
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState('Local Mission Protocol');
  const [docContent, setDocContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOllamaUrl(settings.ollamaBaseUrl);
    setOllamaModel(settings.ollamaModel);
    setTimelineHours(settings.defaultTimelineHours);
    setAuditCopilot(settings.auditCopilotQueries);
  }, [settings]);

  useEffect(() => {
    api.getKnowledgeDocuments().then(setDocs);
  }, []);

  const [syncingEnv, setSyncingEnv] = useState(false);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveSettings({
        ollamaBaseUrl: ollamaUrl,
        ollamaModel,
        defaultTimelineHours: timelineHours,
        auditCopilotQueries: auditCopilot,
      });
      await onRefreshAll();
      onNotify('Saved local configuration to SQLite.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetEnv = async () => {
    setSyncingEnv(true);
    try {
      const updated = await api.syncSettingsFromEnv();
      setOllamaUrl(updated.ollamaBaseUrl);
      setOllamaModel(updated.ollamaModel);
      await onRefreshAll();
      onNotify('Synced Ollama endpoint and model to runtime environment (.env) defaults.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to sync from environment');
    } finally {
      setSyncingEnv(false);
    }
  };

  const handleAddDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.addKnowledgeDocument({
        title: docTitle,
        sourceName: `${docTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`,
        version: '1.0.0',
        category: docCategory,
        content: docContent,
      });
      setDocTitle('');
      setDocContent('');
      setDocs(await api.getKnowledgeDocuments());
      await onRefreshAll();
      onNotify(`Indexed "${docTitle}" into local retrieval library (${res.chunkCount} chunks).`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to index document');
    }
  };

  return (
    <div className="space-y-5">
      <div className="border-b border-[var(--border-hairline)] pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Workspace Settings &amp; Local Knowledge Management
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
          All controls directly configure SQLite persistence, interface theme, local Ollama endpoints, and indexed protocol references.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left: Core Configuration */}
        <form
          onSubmit={handleSaveConfig}
          className="xl:col-span-6 border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] p-5 space-y-4 text-xs"
        >
          <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Settings className="h-4 w-4 text-[var(--accent-teal)]" />
            <span>Application &amp; Local AI Configuration</span>
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
                Interface Theme
              </label>
              <div className="flex gap-2">
                {(['light', 'dark'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onSaveSettings({ theme: t })}
                    className={`flex-1 py-1.5 font-mono border rounded-[2px] cursor-pointer capitalize transition-colors ${
                      settings.theme === t
                        ? 'border-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)] text-[var(--accent-primary)] font-semibold'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {t === 'light' ? 'Lab Light' : 'Flight Dark'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="set-crew" className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
                Active Crew Profile
              </label>
              <select
                id="set-crew"
                value={settings.activeAstronautId}
                onChange={(e) => onSaveSettings({ activeAstronautId: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] font-mono text-[var(--text-primary)]"
              >
                {astronauts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.callsign} ({a.name})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="set-mission" className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
                Active Mission
              </label>
              <select
                id="set-mission"
                value={settings.activeMissionId}
                onChange={(e) => onSaveSettings({ activeMissionId: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] font-mono text-[var(--text-primary)]"
              >
                {missions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="set-tl-hours" className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
                Default Timeline Window
              </label>
              <select
                id="set-tl-hours"
                value={timelineHours}
                onChange={(e) => setTimelineHours(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] font-mono text-[var(--text-primary)]"
              >
                <option value={24}>24 hours</option>
                <option value={48}>48 hours</option>
                <option value={72}>72 hours</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="set-ollama-url" className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
                Local Ollama Endpoint
              </label>
              <input
                id="set-ollama-url"
                type="text"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] font-mono text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label htmlFor="set-ollama-model" className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
                Configured Local LLM Model
              </label>
              <input
                id="set-ollama-model"
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] font-mono text-[var(--text-primary)]"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 p-2.5 border border-[var(--border-hairline)] bg-[var(--bg-canvas)] rounded-[2px] cursor-pointer">
            <input
              type="checkbox"
              checked={auditCopilot}
              onChange={(e) => setAuditCopilot(e.target.checked)}
              className="accent-[var(--accent-primary)]"
            />
            <span className="text-[var(--text-primary)]">
              Record Protocol Copilot queries in local SQLite audit trail
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 font-medium bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] rounded-[2px] hover:opacity-90 cursor-pointer transition-opacity"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saving ? 'Saving…' : 'Save Settings'}</span>
              </button>

              <button
                type="button"
                disabled={syncingEnv}
                onClick={handleResetEnv}
                className="inline-flex items-center gap-1.5 px-3 py-2 font-mono border border-[var(--border-hairline)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] rounded-[2px] cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                <span>{syncingEnv ? 'Syncing…' : 'Reset to .env Defaults'}</span>
              </button>
            </div>

            <a
              href="/api/v1/backup/export"
              className="inline-flex items-center gap-1.5 px-3 py-2 font-mono border border-[var(--border-hairline)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] rounded-[2px]"
            >
              <Download className="h-3.5 w-3.5 text-[var(--accent-cyan)]" />
              <span>Export Local Backup (JSON)</span>
            </a>
          </div>
        </form>

        {/* Right: Local Knowledge Document Indexing */}
        <div className="xl:col-span-6 space-y-4">
          <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] p-4 space-y-3 text-xs">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Indexed Local Reference Library ({docs.length})
            </h2>
            <div className="divide-y divide-[var(--border-hairline)] max-h-[180px] overflow-y-auto border border-[var(--border-hairline)] rounded-[3px]">
              {docs.map((d) => (
                <div key={d.id} className="p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--text-primary)] truncate">{d.title}</div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)]">
                      {d.sourceName} · v{d.version} · {d.category}
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-[var(--accent-teal)] shrink-0">
                    {d.chunkCount} chunks
                  </span>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddDoc} className="space-y-2.5 pt-2 border-t border-[var(--border-hairline)]">
              <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <BookPlus className="h-4 w-4 text-[var(--accent-cyan)]" />
                <span>Index Additional Local Protocol Document</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Document Title"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  className="px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] text-[var(--text-primary)]"
                />
                <input
                  type="text"
                  required
                  placeholder="Category"
                  value={docCategory}
                  onChange={(e) => setDocCategory(e.target.value)}
                  className="px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] text-[var(--text-primary)]"
                />
              </div>
              <textarea
                rows={3}
                required
                minLength={30}
                placeholder="Paste protocol markdown (supports ## Section headers)…"
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                className="w-full p-2.5 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-[3px] font-mono text-[11px] text-[var(--text-primary)]"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 font-semibold border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-[3px] cursor-pointer"
              >
                Chunk &amp; Index Locally
              </button>
            </form>
          </div>

          <div className="border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[4px] p-4 space-y-1.5 text-xs">
            <div className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[var(--accent-amber)]" />
              <span>Scientific Limitations &amp; Safety Statement</span>
            </div>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              ASTROSAGE is an offline-first hackathon research prototype. It does not claim NASA affiliation, clinical validation, or flight qualification. It does not diagnose medical conditions, prescribe treatments, determine clinical fitness, or clear crew members for EVA. All seeded data is simulated. SQLite local files are stored unencrypted on local disk unless encrypted at the host filesystem level.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
