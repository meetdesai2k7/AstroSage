import type {
  AlertRecord,
  AppSettings,
  AstronautOverview,
  AstronautProfile,
  AuditLogEntry,
  BaselineProfile,
  CopilotResponse,
  DeviceRecord,
  EnvironmentalReading,
  HealthReading,
  ImportSummary,
  KnowledgeCitation,
  KnowledgeDocument,
  Mission,
  OutboxEntry,
  RadiationReading,
  ReportRecord,
  ScenarioName,
  SymptomLog,
  SystemStatusReport,
  TimelineEvent,
} from '../shared/types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      // ignore json parse error
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getSettings: () => request<AppSettings>('/api/v1/settings'),
  updateSettings: (patch: Partial<AppSettings>) =>
    request<AppSettings>('/api/v1/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  syncSettingsFromEnv: () =>
    request<AppSettings>('/api/v1/settings/sync-env', { method: 'POST' }),

  getSystemStatus: () => request<SystemStatusReport>('/api/v1/system/status'),
  getMissions: () => request<Mission[]>('/api/v1/missions'),
  getAstronauts: () => request<AstronautProfile[]>('/api/v1/astronauts'),
  getDevices: () => request<DeviceRecord[]>('/api/v1/devices'),
  getOverview: (astronautId: string) =>
    request<AstronautOverview>(`/api/v1/astronauts/${encodeURIComponent(astronautId)}/overview`),

  getHealthReadings: (params?: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== '') sp.set(k, String(v));
      }
    }
    return request<HealthReading[]>(`/api/v1/readings/health?${sp.toString()}`);
  },
  addHealthReading: (payload: Record<string, unknown>) =>
    request<{ id: string; qualityStatus: string; qualityNotes: string }>('/api/v1/readings/health', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getRadiationReadings: (missionId?: string) =>
    request<RadiationReading[]>(
      `/api/v1/readings/radiation${missionId ? `?missionId=${encodeURIComponent(missionId)}` : ''}`
    ),
  addRadiationReading: (payload: Record<string, unknown>) =>
    request<{ id: string; qualityStatus: string }>('/api/v1/readings/radiation', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getEnvironmentalReadings: (missionId?: string) =>
    request<EnvironmentalReading[]>(
      `/api/v1/readings/environment${missionId ? `?missionId=${encodeURIComponent(missionId)}` : ''}`
    ),
  addEnvironmentalReading: (payload: Record<string, unknown>) =>
    request<{ id: string }>('/api/v1/readings/environment', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSymptoms: (astronautId?: string) =>
    request<SymptomLog[]>(
      `/api/v1/symptoms${astronautId ? `?astronautId=${encodeURIComponent(astronautId)}` : ''}`
    ),
  addSymptom: (payload: Record<string, unknown>) =>
    request<{ id: string; alerts: AlertRecord[] }>('/api/v1/symptoms', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getTimeline: (astronautId: string, hours: number, categories?: string[]) => {
    const sp = new URLSearchParams({ astronautId, hours: String(hours) });
    if (categories && categories.length > 0) sp.set('categories', categories.join(','));
    return request<TimelineEvent[]>(`/api/v1/timeline?${sp.toString()}`);
  },

  getBaselines: (astronautId: string) =>
    request<BaselineProfile[]>(`/api/v1/baselines/${encodeURIComponent(astronautId)}`),
  recalculateBaseline: (astronautId: string, metric: string, approvedBy: string, contextLabel: string) =>
    request<BaselineProfile>(`/api/v1/baselines/${encodeURIComponent(astronautId)}/recalculate`, {
      method: 'POST',
      body: JSON.stringify({ metric, approvedBy, contextLabel }),
    }),

  runAnalytics: (astronautId: string) =>
    request<{ astronautId: string; alertCount: number; alerts: AlertRecord[] }>('/api/v1/analytics/run', {
      method: 'POST',
      body: JSON.stringify({ astronautId }),
    }),
  getAlerts: (astronautId?: string) =>
    request<AlertRecord[]>(
      `/api/v1/alerts${astronautId ? `?astronautId=${encodeURIComponent(astronautId)}` : ''}`
    ),
  acknowledgeAlert: (alertId: string, acknowledgedBy: string, note: string) =>
    request<AlertRecord>(`/api/v1/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ acknowledgedBy, note }),
    }),

  getKnowledgeDocuments: () => request<KnowledgeDocument[]>('/api/v1/knowledge/documents'),
  searchKnowledge: (q: string) =>
    request<KnowledgeCitation[]>(`/api/v1/knowledge/search?q=${encodeURIComponent(q)}`),
  addKnowledgeDocument: (payload: { title: string; sourceName: string; version: string; category: string; content: string }) =>
    request<{ id: string; chunkCount: number }>('/api/v1/knowledge/documents', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  askCopilot: (question: string, astronautId: string) =>
    request<CopilotResponse>('/api/v1/copilot/ask', {
      method: 'POST',
      body: JSON.stringify({ question, astronautId }),
    }),

  getReports: () => request<ReportRecord[]>('/api/v1/reports'),
  generateReport: (payload: { astronautId: string; windowHours: number; includedSections: string[] }) =>
    request<ReportRecord>('/api/v1/reports/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  importDataset: (datasetType: 'health' | 'radiation' | 'environment' | 'symptoms', format: 'csv' | 'json', content: string) =>
    request<ImportSummary>('/api/v1/import', {
      method: 'POST',
      body: JSON.stringify({ datasetType, format, content }),
    }),

  getOutbox: () => request<OutboxEntry[]>('/api/v1/sync/outbox'),
  getAuditLogs: () => request<AuditLogEntry[]>('/api/v1/audit'),

  loadScenario: (name: ScenarioName) =>
    request<{ scenario: ScenarioName; insertedCounts: Record<string, number>; description: string; expectedBehaviour: string }>(
      `/api/v1/demo/scenario/${name}`,
      { method: 'POST' }
    ),
  resetScenario: () => request<{ scenario: ScenarioName }>('/api/v1/demo/reset', { method: 'POST' }),
  clearDemoData: () => request<{ cleared: boolean }>('/api/v1/demo/clear', { method: 'POST' }),
  stepTelemetry: (astronautId: string) =>
    request<{ reading: HealthReading; alerts: AlertRecord[] }>('/api/v1/demo/telemetry-step', {
      method: 'POST',
      body: JSON.stringify({ astronautId }),
    }),
};
