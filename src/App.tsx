import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import type {
  AlertRecord,
  AppSettings,
  AstronautOverview,
  AstronautProfile,
  Mission,
  SystemStatusReport,
  TimelineEvent,
} from './shared/types';
import { NAV_ITEMS, Sidebar, type NavPageId } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import {
  PRESENTER_STEPS,
  PresenterGuide,
  type PresenterStep,
} from './components/widgets/PresenterGuide';
import { RecordDrawer } from './components/widgets/RecordDrawer';
import { api } from './lib/api';
import { DataExplorer } from './pages/DataExplorer';
import { DemoScenarios } from './pages/DemoScenarios';
import { HealthMonitor } from './pages/HealthMonitor';
import { HealthTimeline } from './pages/HealthTimeline';
import { MedicalReports } from './pages/MedicalReports';
import { MissionOverview } from './pages/MissionOverview';
import { ProtocolCopilot } from './pages/ProtocolCopilot';
import { RadiationEnvironment } from './pages/RadiationEnvironment';
import { SettingsPage } from './pages/SettingsPage';
import { SystemStatus } from './pages/SystemStatus';

export default function App() {
  const [activePage, setActivePage] = useState<NavPageId>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [astronauts, setAstronauts] = useState<AstronautProfile[]>([]);
  const [overview, setOverview] = useState<AstronautOverview | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatusReport | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedAlert, setSelectedAlert] = useState<AlertRecord | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [liveStreamActive, setLiveStreamActive] = useState(false);
  const [presenterActive, setPresenterActive] = useState(false);
  const [presenterStepIndex, setPresenterStepIndex] = useState(0);
  const [copilotInitialQ, setCopilotInitialQ] = useState<string | null>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 4500);
  }, []);

  const refreshSystemStatus = useCallback(async () => {
    try {
      const status = await api.getSystemStatus();
      setSystemStatus(status);
    } catch {
      // ignore transient status poll errors
    }
  }, []);

  const loadAll = useCallback(async (astronautOverride?: string) => {
    try {
      setLoadError(null);
      const [s, m, a, sys] = await Promise.all([
        api.getSettings(),
        api.getMissions(),
        api.getAstronauts(),
        api.getSystemStatus(),
      ]);
      setSettings(s);
      setMissions(m);
      setAstronauts(a);
      setSystemStatus(sys);

      const targetAstronaut = astronautOverride || s.activeAstronautId || a[0]?.id || 'AST-VANCE';
      const ov = await api.getOverview(targetAstronaut);
      setOverview(ov);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to initialize ASTROSAGE workspace');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Sync HTML dark class
  useEffect(() => {
    const theme = settings?.theme ?? 'light';
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [settings?.theme]);

  // Live telemetry stream (5s step)
  useEffect(() => {
    if (!liveStreamActive || !overview?.astronaut.id) return;
    const id = window.setInterval(async () => {
      try {
        await api.stepTelemetry(overview.astronaut.id);
        const ov = await api.getOverview(overview.astronaut.id);
        setOverview(ov);
      } catch {
        // ignore transient step errors
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [liveStreamActive, overview?.astronaut.id]);

  const handleSelectAstronaut = async (astronautId: string) => {
    await api.updateSettings({ activeAstronautId: astronautId });
    await loadAll(astronautId);
    notify(`Switched active crew profile to ${astronautId}.`);
  };

  const handleSaveSettings = async (patch: Partial<AppSettings>) => {
    const updated = await api.updateSettings(patch);
    setSettings(updated);
    if (patch.activeAstronautId) {
      await loadAll(patch.activeAstronautId);
    }
  };

  const handleToggleTheme = async () => {
    const next = settings?.theme === 'dark' ? 'light' : 'dark';
    await handleSaveSettings({ theme: next });
  };

  const handleStepTelemetry = async () => {
    if (!overview) return;
    const res = await api.stepTelemetry(overview.astronaut.id);
    await loadAll(overview.astronaut.id);
    notify(`Simulated +15m packet: HR ${res.reading.value} ${res.reading.unit}.`);
  };

  const handleRunReview = async () => {
    if (!overview) return;
    const res = await api.runAnalytics(overview.astronaut.id);
    await loadAll(overview.astronaut.id);
    notify(`Deterministic health review complete: ${res.alertCount} active flag(s).`);
  };

  const handleAcknowledgeAlert = async (alertId: string, reviewer: string, note: string) => {
    const updated = await api.acknowledgeAlert(alertId, reviewer, note);
    setSelectedAlert(updated);
    await loadAll(overview?.astronaut.id);
    notify(`Acknowledged alert ${alertId}.`);
  };

  const handlePresenterStep = async (step: PresenterStep, index: number) => {
    setPresenterStepIndex(index);
    if (step.scenario && step.scenario !== overview?.activeScenario) {
      await api.loadScenario(step.scenario);
      await loadAll();
    }
    if (step.suggestedQuestion) {
      setCopilotInitialQ(step.suggestedQuestion);
    }
    setActivePage(step.page as NavPageId);
  };

  const handleTogglePresenter = async () => {
    if (presenterActive) {
      setPresenterActive(false);
    } else {
      setPresenterActive(true);
      await handlePresenterStep(PRESENTER_STEPS[0], 0);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] text-[var(--text-primary)] font-mono text-sm">
        Initializing ASTROSAGE Local Telemetry &amp; SQLite Workspace…
      </div>
    );
  }

  if (loadError || !overview || !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] p-6">
        <div className="max-w-md w-full border border-[var(--accent-coral)]/45 bg-[var(--bg-panel)] rounded-[3px] p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-coral)]">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to Load ASTROSAGE Workspace</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">{loadError || 'Unknown initialization error'}</p>
          <button
            type="button"
            onClick={() => loadAll()}
            className="px-4 py-2 text-xs font-semibold bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] rounded-[3px] cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <TopBar
        mission={overview.mission}
        astronauts={astronauts}
        selectedAstronautId={overview.astronaut.id}
        activeScenario={overview.activeScenario}
        activeFlagsCount={overview.summary.activeReviewFlags}
        theme={settings.theme}
        presenterActive={presenterActive}
        onSelectAstronaut={handleSelectAstronaut}
        onOpenAlerts={() => {
          if (overview.alerts.length > 0) {
            setSelectedEvent(null);
            setSelectedAlert(overview.alerts[0]);
          } else {
            setActivePage('monitor');
          }
        }}
        onToggleTheme={handleToggleTheme}
        onTogglePresenter={handleTogglePresenter}
        onToggleMobileNav={() => setMobileNavOpen((o) => !o)}
      />

      <PresenterGuide
        active={presenterActive}
        currentStepIndex={presenterStepIndex}
        onSelectStep={handlePresenterStep}
        onClose={() => setPresenterActive(false)}
      />

      {/* Mobile Navigation Bar */}
      {mobileNavOpen && (
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden border-b border-[var(--border-hairline)] bg-[var(--bg-secondary)] p-2 grid grid-cols-2 gap-1.5"
        >
          {NAV_ITEMS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActivePage(id);
                setMobileNavOpen(false);
              }}
              className={`px-2.5 py-2 text-xs text-left rounded-[3px] border cursor-pointer ${
                activePage === id
                  ? 'border-[var(--accent-primary)] bg-[var(--bg-panel)] text-[var(--accent-primary)] font-semibold'
                  : 'border-[var(--border-hairline)] text-[var(--text-secondary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      <div className="flex-1 flex min-h-0">
        <div className="hidden md:flex">
          <Sidebar
            activePage={activePage}
            collapsed={sidebarCollapsed}
            activeFlagsCount={overview.summary.activeReviewFlags}
            onNavigate={setActivePage}
            onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          />
        </div>

        <main className="flex-1 min-w-0 p-4 lg:p-6 overflow-y-auto">
          <div className="max-w-[1360px] mx-auto">
            {activePage === 'overview' && (
              <MissionOverview
                overview={overview}
                liveStreamActive={liveStreamActive}
                onToggleLiveStream={() => {
                  setLiveStreamActive((v) => !v);
                  notify(!liveStreamActive ? 'Live telemetry stream enabled (5s interval).' : 'Live telemetry stream paused.');
                }}
                onStepTelemetry={handleStepTelemetry}
                onRunReview={handleRunReview}
                onNavigate={setActivePage}
                onInspectAlert={(a) => {
                  setSelectedEvent(null);
                  setSelectedAlert(a);
                }}
                onInspectEvent={(e) => {
                  setSelectedAlert(null);
                  setSelectedEvent(e);
                }}
              />
            )}

            {activePage === 'monitor' && (
              <HealthMonitor
                overview={overview}
                onRefresh={() => loadAll(overview.astronaut.id)}
                onInspectAlert={(a) => {
                  setSelectedEvent(null);
                  setSelectedAlert(a);
                }}
                onNotify={notify}
              />
            )}

            {activePage === 'radiation' && <RadiationEnvironment overview={overview} />}

            {activePage === 'timeline' && (
              <HealthTimeline
                overview={overview}
                onInspectEvent={(e) => {
                  setSelectedAlert(null);
                  setSelectedEvent(e);
                }}
                onNotify={notify}
              />
            )}

            {activePage === 'copilot' && (
              <ProtocolCopilot
                overview={overview}
                systemStatus={systemStatus}
                initialQuestion={copilotInitialQ}
                onRefreshStatus={refreshSystemStatus}
              />
            )}

            {activePage === 'reports' && (
              <MedicalReports overview={overview} onNotify={notify} />
            )}

            {activePage === 'explorer' && (
              <DataExplorer
                overview={overview}
                onRefresh={() => loadAll(overview.astronaut.id)}
                onNotify={notify}
              />
            )}

            {activePage === 'scenarios' && (
              <DemoScenarios
                activeScenario={overview.activeScenario}
                onScenarioChanged={() => loadAll()}
                onNotify={notify}
              />
            )}

            {activePage === 'status' && (
              <SystemStatus
                systemStatus={systemStatus}
                onRefreshStatus={refreshSystemStatus}
              />
            )}

            {activePage === 'settings' && (
              <SettingsPage
                settings={settings}
                missions={missions}
                astronauts={astronauts}
                onSaveSettings={handleSaveSettings}
                onRefreshAll={() => loadAll(overview.astronaut.id)}
                onNotify={notify}
              />
            )}
          </div>
        </main>
      </div>

      {/* Record / Alert Slide-Over Drawer */}
      <RecordDrawer
        selectedAlert={selectedAlert}
        selectedEvent={selectedEvent}
        onClose={() => {
          setSelectedAlert(null);
          setSelectedEvent(null);
        }}
        onAcknowledgeAlert={handleAcknowledgeAlert}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-50 sm:max-w-md border border-[var(--border-hairline)] bg-[var(--bg-panel)] text-[var(--text-primary)] px-4 py-2.5 rounded-[3px] flex items-center gap-2.5 text-xs shadow-sm"
        >
          <CheckCircle2 className="h-4 w-4 text-[var(--accent-teal)] shrink-0" />
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
