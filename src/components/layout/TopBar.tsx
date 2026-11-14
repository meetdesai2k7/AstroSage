import { useEffect, useState } from 'react';
import {
  Bell,
  Menu,
  Moon,
  PlayCircle,
  Sun,
  WifiOff,
} from 'lucide-react';
import type {
  AstronautProfile,
  Mission,
  ScenarioName,
} from '../../shared/types';

interface TopBarProps {
  mission: Mission | null;
  astronauts: AstronautProfile[];
  selectedAstronautId: string;
  activeScenario: ScenarioName;
  activeFlagsCount: number;
  theme: 'dark' | 'light';
  presenterActive: boolean;
  onSelectAstronaut: (id: string) => void;
  onOpenAlerts: () => void;
  onToggleTheme: () => void;
  onTogglePresenter: () => void;
  onToggleMobileNav: () => void;
}

export function TopBar({
  mission,
  astronauts,
  selectedAstronautId,
  activeScenario,
  activeFlagsCount,
  theme,
  presenterActive,
  onSelectAstronaut,
  onOpenAlerts,
  onToggleTheme,
  onTogglePresenter,
  onToggleMobileNav,
}: TopBarProps) {
  const [tickSeconds, setTickSeconds] = useState(0);
  const [nowClock, setNowClock] = useState(() => new Date().toISOString().slice(11, 19));

  useEffect(() => {
    const id = window.setInterval(() => {
      setTickSeconds((s) => s + 1);
      setNowClock(new Date().toISOString().slice(11, 19));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const baseHours = mission?.simulatedElapsedHours ?? 342.4;
  const totalSec = Math.floor(baseHours * 3600) + tickSeconds;
  const metHours = String(Math.floor(totalSec / 3600)).padStart(3, '0');
  const metMins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const metSecs = String(totalSec % 60).padStart(2, '0');

  const isBlackout = activeScenario === 'COMMUNICATION_BLACKOUT' || mission?.commsStatus === 'BLACKOUT';

  return (
    <header className="h-12 shrink-0 border-b border-[var(--border-hairline)] bg-[var(--bg-panel)] px-3 lg:px-5 flex items-center justify-between gap-4">
      {/* Left: Wordmark + Mission Context */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleMobileNav}
          aria-label="Toggle navigation menu"
          className="md:hidden p-1.5 border border-[var(--border-hairline)] rounded-[2px] text-[var(--text-secondary)] cursor-pointer"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-block w-2 h-2 rounded-[1px] bg-[var(--accent-primary)]" aria-hidden="true" />
          <span className="font-mono font-bold tracking-[0.14em] text-sm text-[var(--text-primary)] whitespace-nowrap">
            ASTROSAGE
          </span>
        </div>

        <span className="hidden sm:inline text-[var(--border-hairline)]" aria-hidden="true">/</span>

        <div className="hidden sm:flex items-center gap-2 text-xs min-w-0">
          <span className="font-medium text-[var(--text-primary)] truncate">
            {mission?.name ?? 'Selene Transit Sim-04'}
          </span>
          <span className="text-[var(--text-muted)]" aria-hidden="true">·</span>
          <span className="font-medium text-[var(--accent-amber)] whitespace-nowrap">
            Simulation
          </span>
        </div>
      </div>

      {/* Center: Crew Profile Switcher + Live MET + Local Status */}
      <div className="hidden lg:flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <label htmlFor="topbar-crew-select" className="text-[11px] font-medium text-[var(--text-muted)]">
            Crew
          </label>
          <select
            id="topbar-crew-select"
            value={selectedAstronautId}
            onChange={(e) => onSelectAstronaut(e.target.value)}
            className="bg-[var(--bg-elevated)] border border-[var(--border-hairline)] rounded-[2px] px-2 py-1 text-xs font-mono text-[var(--text-primary)] cursor-pointer"
          >
            {astronauts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.callsign} — {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
          <span className="text-[var(--text-muted)] mr-1.5">MET (Sim)</span>
          <span className="text-[var(--text-primary)] font-medium">
            T+{metHours}:{metMins}:{metSecs}
          </span>
        </div>

        <div className="flex items-center gap-1.5 font-mono text-[11px] whitespace-nowrap">
          <WifiOff
            className={`h-3.5 w-3.5 ${isBlackout ? 'text-[var(--accent-amber)]' : 'text-[var(--accent-teal)]'}`}
            aria-hidden="true"
          />
          <span className={isBlackout ? 'text-[var(--accent-amber)] font-medium' : 'text-[var(--accent-teal)] font-medium'}>
            {isBlackout ? 'BLACKOUT / LOCAL' : 'OFFLINE / LOCAL'}
          </span>
        </div>

        <div className="font-mono text-[11px] text-[var(--text-muted)] tabular-nums whitespace-nowrap">
          UTC {nowClock}
        </div>
      </div>

      {/* Right: Alerts + Theme + Presenter Mode */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenAlerts}
          aria-label={`Inspect active review flags (${activeFlagsCount})`}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono border rounded-[2px] cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
            activeFlagsCount > 0
              ? 'border-[var(--accent-amber)]/45 bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] hover:bg-[var(--accent-amber)]/15'
              : 'border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Bell className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="tabular-nums">{activeFlagsCount}</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light instrument theme' : 'Switch to dark aerospace theme'}
          className="p-1.5 border border-[var(--border-hairline)] rounded-[2px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={onTogglePresenter}
          className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-[2px] cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
            presenterActive
              ? 'bg-[var(--bg-elevated)] border border-[var(--accent-primary)] text-[var(--accent-primary)]'
              : 'bg-[var(--accent-primary)] text-[var(--accent-primary-ink)] hover:opacity-90'
          }`}
        >
          <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{presenterActive ? 'Presenter Active' : 'Start Demo'}</span>
        </button>
      </div>
    </header>
  );
}
