export type DataQualityStatus =
  | 'VALID'
  | 'MISSING'
  | 'STALE'
  | 'INVALID'
  | 'UNCERTAIN'
  | 'DUPLICATE';

export type AlertCategory =
  | 'HEALTH_DEVIATION'
  | 'RADIATION_EXPOSURE_EVENT'
  | 'ENVIRONMENT_CHANGE'
  | 'SENSOR_FAULT'
  | 'DATA_GAP'
  | 'SYMPTOM_REPORTED';

export type DisplaySeverity = 'INFO' | 'WATCH' | 'URGENT REVIEW' | 'EMERGENCY';

export type ScenarioName =
  | 'NORMAL_MISSION'
  | 'GRADUAL_HEALTH_DRIFT'
  | 'EXPOSURE_CONTEXT'
  | 'SENSOR_FAULT'
  | 'COMMUNICATION_BLACKOUT';

export type HealthMetricType =
  | 'heart_rate'
  | 'spo2'
  | 'body_temp'
  | 'respiratory_rate'
  | 'systolic_bp'
  | 'diastolic_bp'
  | 'sleep_hours'
  | 'exercise_minutes';

export type RadiationQuantity =
  | 'ABSORBED_DOSE'
  | 'EFFECTIVE_DOSE'
  | 'AMBIENT_DOSE_EQUIVALENT';

export interface Mission {
  id: string;
  name: string;
  code: string;
  phase: string;
  startTimestamp: string;
  simulatedElapsedHours: number;
  commsStatus: 'CONNECTED' | 'BLACKOUT' | 'INTERMITTENT';
  isSimulated: boolean;
  description: string;
}

export interface AstronautProfile {
  id: string;
  missionId: string;
  callsign: string;
  name: string;
  role: string;
  ageGroup: string;
  notes: string;
  isSimulated: boolean;
}

export interface DeviceRecord {
  id: string;
  name: string;
  category: 'BIOMETRIC' | 'DOSIMETRY' | 'ENVIRONMENT' | 'COGNITIVE';
  calibrationStatus: 'CALIBRATED' | 'DUE' | 'UNCALIBRATED';
  calibrationRef: string;
  lastCalibratedAt: string;
  firmwareVersion: string;
}

export interface HealthReading {
  id: string;
  astronautId: string;
  missionId: string;
  deviceId: string;
  metric: HealthMetricType | string;
  value: number | null;
  unit: string;
  recordedAt: string;
  receivedAt: string;
  qualityStatus: DataQualityStatus;
  qualityNotes: string;
  provenance: string;
  isSimulated: boolean;
}

export interface RadiationReading {
  id: string;
  missionId: string;
  astronautId: string | null;
  deviceId: string;
  quantity: RadiationQuantity;
  value: number | null;
  unit: string;
  doseRate: number | null;
  doseRateUnit: string | null;
  uncertainty: number | null;
  calibrationRef: string;
  calibrationStatus: 'CALIBRATED' | 'UNCALIBRATED' | 'UNKNOWN';
  recordedAt: string;
  receivedAt: string;
  qualityStatus: DataQualityStatus;
  qualityNotes: string;
  provenance: string;
  isSimulated: boolean;
}

export interface EnvironmentalReading {
  id: string;
  missionId: string;
  deviceId: string;
  location: string;
  metric: 'cabin_temp' | 'humidity' | 'co2_mmhg' | 'cabin_pressure' | string;
  value: number | null;
  unit: string;
  recordedAt: string;
  receivedAt: string;
  qualityStatus: DataQualityStatus;
  qualityNotes: string;
  provenance: string;
  isSimulated: boolean;
}

export interface SymptomLog {
  id: string;
  astronautId: string;
  missionId: string;
  symptom: string;
  severityRating: number;
  durationMinutes: number;
  notes: string;
  reportedAt: string;
  provenance: string;
  isSimulated: boolean;
}

export interface CognitiveCheck {
  id: string;
  astronautId: string;
  missionId: string;
  taskName: string;
  reactionTimeMs: number;
  accuracyPct: number;
  fatigueRating: number;
  recordedAt: string;
  qualityStatus: DataQualityStatus;
  provenance: string;
  isSimulated: boolean;
}

export interface BaselineProfile {
  id: string;
  astronautId: string;
  metric: string;
  unit: string;
  mean: number | null;
  median: number | null;
  stdDev: number | null;
  iqr: number | null;
  sampleCount: number;
  observationPeriodStart: string;
  observationPeriodEnd: string;
  baselineVersion: number;
  contextLabel: string;
  isSufficient: boolean;
  approvedBy: string;
  updatedAt: string;
}

export interface AlertRecord {
  id: string;
  astronautId: string;
  missionId: string;
  category: AlertCategory;
  severity: DisplaySeverity;
  createdAt: string;
  ruleId: string;
  ruleVersion: string;
  title: string;
  whatHappened: string;
  triggeringRecordIds: string[];
  measuredSummary: string;
  baselineSummary: string;
  comparisonPerformed: string;
  missingInformation: string;
  humanReviewReason: string;
  dataQualityLimitations: string;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  acknowledgementNote: string | null;
  isSimulated: boolean;
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  category:
    | 'HEALTH'
    | 'RADIATION'
    | 'ENVIRONMENT'
    | 'SYMPTOM'
    | 'COGNITIVE'
    | 'QUALITY'
    | 'SYSTEM'
    | 'ALERT';
  title: string;
  summary: string;
  severity: DisplaySeverity | 'NONE';
  qualityStatus: DataQualityStatus | 'N/A';
  sourceId: string;
  recordType: string;
  metadata: Record<string, unknown>;
  isSimulated: boolean;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  sourceName: string;
  version: string;
  publishedDate: string;
  category: string;
  chunkCount: number;
  isBuiltin: boolean;
  createdAt: string;
}

export interface KnowledgeCitation {
  chunkId: string;
  documentId: string;
  sourceTitle: string;
  sourceName: string;
  section: string;
  pageNumber: number | null;
  version: string;
  excerpt: string;
  score: number;
}

export interface CopilotResponse {
  id: string;
  question: string;
  mode: 'OLLAMA_LOCAL' | 'RETRIEVAL_FALLBACK';
  modelName: string | null;
  answer: string;
  observations: string[];
  calculations: string[];
  uncertainties: string[];
  citations: KnowledgeCitation[];
  referencedRecordIds: string[];
  safetyNotice: string;
  timestamp: string;
}

export interface ReportRecord {
  id: string;
  missionId: string;
  astronautId: string;
  title: string;
  windowHours: number;
  generatedAt: string;
  contentHash: string;
  includedSections: string[];
  summaryJson: string;
  isSimulated: boolean;
}

export interface OutboxEntry {
  id: string;
  operationType: string;
  entityType: string;
  entityId: string;
  payloadSummary: string;
  status: 'PENDING' | 'BLOCKED_OFFLINE';
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
}

export interface ImportValidationError {
  rowNumber: number;
  recordId: string;
  field: string;
  reason: string;
  rawRow: Record<string, unknown>;
}

export interface ImportSummary {
  datasetType: 'health' | 'radiation' | 'environment' | 'symptoms';
  rowsReceived: number;
  rowsAccepted: number;
  rowsRejected: number;
  duplicateRows: number;
  missingFieldCount: number;
  errors: ImportValidationError[];
  acceptedIds: string[];
}

export interface RuntimeEnvVar {
  key: string;
  value: string;
  source: 'process.env' | 'default';
  description: string;
}

export interface SystemStatusReport {
  checkedAt: string;
  serverStatus: 'AVAILABLE' | 'DEGRADED';
  sqliteStatus: 'AVAILABLE' | 'UNAVAILABLE';
  sqlitePath: string;
  ollamaStatus: 'AVAILABLE' | 'UNAVAILABLE';
  ollamaEndpoint: string;
  configuredModel: string;
  availableModels: string[];
  embeddingStatus: 'AVAILABLE';
  embeddingEngine: string;
  faissIndexStatus: 'AVAILABLE';
  indexedDocumentCount: number;
  indexedChunkCount: number;
  reportServiceStatus: 'AVAILABLE';
  lastSuccessfulReportAt: string | null;
  pendingOutboxCount: number;
  activeScenario: ScenarioName;
  commsStatus: 'CONNECTED' | 'BLACKOUT' | 'INTERMITTENT';
  explanation: string;
  runtimeEnv: RuntimeEnvVar[];
}

export interface AppSettings {
  theme: 'dark' | 'light';
  activeMissionId: string;
  activeAstronautId: string;
  activeScenario: ScenarioName;
  ollamaBaseUrl: string;
  ollamaModel: string;
  preferredTempUnit: 'C' | 'F';
  defaultTimelineHours: number;
  strictDuplicateRejection: boolean;
  auditCopilotQueries: boolean;
  liveTelemetryEnabled: boolean;
}

export interface AstronautOverview {
  mission: Mission;
  astronaut: AstronautProfile;
  activeScenario: ScenarioName;
  summary: {
    healthRecordCount: number;
    activeReviewFlags: number;
    radiationRecordCount: number;
    environmentalCoveragePct: number;
    dataQualityWarnings: number;
    latestHealthTimestamp: string | null;
    latestHeartRate: number | null;
    latestHeartRateQuality: DataQualityStatus | null;
    pendingOutboxCount: number;
  };
  latestMetrics: Array<{
    metric: string;
    label: string;
    value: number | null;
    unit: string;
    recordedAt: string;
    qualityStatus: DataQualityStatus;
    baselineMean: number | null;
    baselineStdDev: number | null;
    baselineSufficient: boolean;
    zScore: number | null;
  }>;
  recentHealthSeries: HealthReading[];
  baselines: BaselineProfile[];
  alerts: AlertRecord[];
  recentRadiation: RadiationReading[];
  recentEnvironment: EnvironmentalReading[];
  recentSymptoms: SymptomLog[];
  recentCognitive: CognitiveCheck[];
  activityFeed: TimelineEvent[];
}
