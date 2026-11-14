import {
  Activity,
  BellRing,
  Bot,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  FileSpreadsheet,
  FlaskConical,
  LayoutDashboard,
  Radiation,
  Settings,
} from 'lucide-react';

export type NavPageId =
  | 'overview'
  | 'monitor'
  | 'radiation'
  | 'timeline'
  | 'copilot'
  | 'reports'
  | 'explorer'
  | 'scenarios'
  | 'status'
  | 'settings';

export const NAV_ITEMS: Array<{
  id: NavPageId;
  label: string;
  Icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'Mission Overview', Icon: LayoutDashboard },
  { id: 'monitor', label: 'Health Monitor', Icon: Activity },
  { id: 'radiation', label: 'Radiation & Environment', Icon: Radiation },
  { id: 'timeline', label: 'Health Timeline', Icon: Clock },
  { id: 'copilot', label: 'Protocol Copilot', Icon: Bot },
  { id: 'reports', label: 'Medical Reports', Icon: FileSpreadsheet },
  { id: 'explorer', label: 'Data Explorer', Icon: Database },
  { id: 'scenarios', label: 'Demo Scenarios', Icon: FlaskConical },
  { id: 'status', label: 'System Status', Icon: Cpu },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

interface SidebarProps {
  activePage: NavPageId;
  collapsed: boolean;
  activeFlagsCount: number;
  onNavigate: (page: NavPageId) => void;
  onToggleCollapse: () => void;
}

export function Sidebar({
  activePage,
  collapsed,
  activeFlagsCount,
  onNavigate,
  onToggleCollapse,
}: SidebarProps) {
  return (
    <aside
      aria-label="Primary Navigation"
      className={`shrink-0 border-r border-[var(--border-hairline)] bg-[var(--bg-secondary)] flex flex-col justify-between transition-[width] duration-200 ${
        collapsed ? 'w-[60px]' : 'w-[228px]'
      }`}
    >
      <div className="py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = activePage === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? label : undefined}
              className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-[2px] text-[13px] transition-colors cursor-pointer border-l-2 ${
                isActive
                  ? 'border-l-[var(--accent-primary)] bg-[var(--bg-panel)] text-[var(--accent-primary)] font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
                  : 'border-l-transparent text-[var(--text-secondary)] font-medium hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)]/70'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {!collapsed && <span className="truncate whitespace-nowrap">{label}</span>}
              </span>
              {!collapsed && id === 'overview' && activeFlagsCount > 0 && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--accent-amber)] tabular-nums shrink-0">
                  <BellRing className="h-3 w-3" aria-hidden="true" />
                  {activeFlagsCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="p-2.5 border-t border-[var(--border-hairline)] space-y-2">
        {!collapsed && (
          <div className="px-2.5 py-2 text-[11px] leading-snug text-[var(--text-muted)] border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[2px]">
            Decision-support prototype. Not a diagnostic or flight-clearance tool.
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-full flex items-center justify-center gap-2 px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)] bg-[var(--bg-panel)] rounded-[2px] hover:bg-[var(--bg-elevated)] cursor-pointer"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          {!collapsed && <span>Collapse Rail</span>}
        </button>
      </div>
    </aside>
  );
}
