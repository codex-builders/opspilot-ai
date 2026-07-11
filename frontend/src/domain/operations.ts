export type SystemName =
  | "ServiceNow"
  | "Splunk"
  | "Jira"
  | "Confluence"
  | "Teams"
  | "OpenAI"
  | "Azure Monitor";

export type HttpMethod = "GET" | "POST";

export type SystemConnection = {
  name: SystemName;
  status: "online" | "degraded" | "offline";
};

export type ApiContract = {
  system: SystemName;
  method: HttpMethod;
  endpoint: string;
  minimumResponse: string;
};

export type IncidentSummary = {
  id: string;
  title: string;
  severity: "SEV-1" | "SEV-2" | "SEV-3";
  status: "ACTIVE" | "RESOLVED";
  affectedService: string;
  environment: string;
  startTime: string;
  assignmentGroup: string;
  impact: string;
  description: string;
  owner: string;
  lastUpdated: string;
  signalScore: number;
};

export type InvestigationStep = {
  label: string;
  detail: string;
  source: SystemName;
};

export type InvestigationResult = {
  confidence: "HIGH" | "MEDIUM" | "LOW";
  aiStatus: "completed" | "disabled" | "error";
  aiModel: string;
  reasoningSummary: string;
  sourceTrace: Array<{
    source: SystemName;
    detail: string;
  }>;
  probableRootCause: string;
  explanation: string;
  evidence: string[];
  recommendations: string[];
  similarIncident: {
    id: string;
    summary: string;
    resolution: string;
  };
  timeline: string[];
  teamsUpdateDraft: string;
};

export type OperationsMetric = {
  label: string;
  value: string;
  context?: string;
  tone?: "neutral" | "critical" | "warning" | "success";
  trend?: number[];
};

export type TrendSeries = {
  label: string;
  values: number[];
  tone: "neutral" | "critical" | "warning" | "success";
};

export type IncidentTrend = {
  periods: Array<{
    id: string;
    label: string;
    xLabels: string[];
    series: TrendSeries[];
  }>;
};

export type OvernightIncident = {
  id: string;
  service: string;
  severity: string;
  state: string;
};

export type ServiceHealth = {
  service: string;
  status: "Red" | "Amber" | "Green" | "Grey";
};

export type MorningBriefing = {
  generatedAt: string;
  overallStatus: "GREEN" | "AMBER" | "RED" | "GREY";
  summary: string;
  context: string;
  priorityActions: string[];
  overnightIncidents: OvernightIncident[];
  serviceHealth: ServiceHealth[];
  teamsUpdates: string[];
};

export type ChangeRisk = "High" | "Medium" | "Low";

export type CabChange = {
  id: string;
  service: string;
  window: string;
  risk: ChangeRisk;
  conflict: string;
  recommendation: string;
};

export type CabAnalysis = {
  meetingTime: string;
  conflictsFound: number;
  conflictTitle: string;
  conflictSummary: string;
  recommendation: string;
  riskScore: number;
  riskChangeId: string;
  riskFactors: string[];
  focusItems: Array<{
    title: string;
    detail: string;
  }>;
  changes: CabChange[];
};

export type OperationsDashboardData = {
  systems: SystemConnection[];
  metrics: OperationsMetric[];
  incidentTrend: IncidentTrend;
  apiContracts: ApiContract[];
  incidents: IncidentSummary[];
  investigation: {
    steps: InvestigationStep[];
    activityFeed: string[];
    result: InvestigationResult;
  };
  briefingSources: SystemName[];
  briefingCollection: OperationsMetric[];
  morningBriefing: MorningBriefing;
  cab: CabAnalysis;
};
