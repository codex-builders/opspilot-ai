import type {
  CabAnalysis,
  CabChange,
  ChangeRisk,
  IncidentSummary,
  IncidentTrend,
  InvestigationResult,
  InvestigationStep,
  MorningBriefing,
  OperationsDashboardData,
  ServiceHealth,
  SystemConnection,
  SystemName
} from "../domain/operations";

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL ?? "/api";
const REQUEST_TIMEOUT_MS = 30_000;

type BackendIncident = {
  id: string;
  severity: string;
  title: string;
  description: string;
  service: string;
  environment: string;
  region: string;
  started_at: string;
  assignment_group: string;
  status?: string;
};

type BackendMorningBriefing = {
  title: string;
  summary: string;
  priorities: Array<{ priority: number; service: string; action: string; reason: string }>;
  overnight_incidents: Array<{ id: string; severity: string; service: string; status: string; summary: string }>;
  health_metrics: Array<{ service: string; metric: string; value: string; status: string }>;
  team_updates: Array<{ time: string; team: string; message: string }>;
};

type BackendChange = {
  id: string;
  title: string;
  service: string;
  window: string;
  risk: string;
  approval: string;
  owner: string;
};

type BackendCabBriefing = {
  title: string;
  summary: string;
  scheduled_changes: BackendChange[];
  conflicts: Array<{ changes: string[]; severity: string; reason: string; recommendation: string }>;
  risk_assessment: Array<{ change_id: string; risk: string; recommendation: string }>;
  cab_decisions_required: string[];
};

type BackendTriage = {
  incident: BackendIncident;
  summary: string;
  impact: string;
  evidence: string[];
  likely_cause: string;
  raw_context: {
    logs: Array<{ timestamp: string; message: string }>;
    recent_deployments: Array<{ version: string; deployed_at: string; summary: string }>;
    similar_incidents: Array<{ id: string; title: string; resolution: string }>;
  };
  recommended_runbooks: Array<{ title: string; reason: string; steps: string[] }>;
  jira_tasks: Array<{ summary: string; team: string; priority: string }>;
  teams_status_update: string;
  timeline: Array<{ time: string; event: string; source: string }>;
};

const sourceNames: SystemName[] = ["ServiceNow", "Splunk", "Jira", "Confluence", "Teams", "Azure Monitor"];

const incidentTrend: IncidentTrend = {
  periods: [
    {
      id: "overnight",
      label: "Overnight",
      xLabels: ["18:00", "20:00", "22:00", "00:00", "02:00", "04:00", "06:00", "08:00"],
      series: [
        { label: "SEV-1", values: [0, 0, 0, 0, 0, 1, 1, 1], tone: "critical" },
        { label: "SEV-2", values: [2, 2, 2, 1, 1, 1, 1, 1], tone: "warning" },
        { label: "SEV-3", values: [5, 5, 4, 4, 3, 3, 2, 2], tone: "neutral" }
      ]
    },
    {
      id: "day",
      label: "24 Hours",
      xLabels: ["08:00", "12:00", "16:00", "20:00", "00:00", "04:00", "08:00"],
      series: [
        { label: "SEV-1", values: [0, 0, 0, 0, 0, 1, 1], tone: "critical" },
        { label: "SEV-2", values: [1, 1, 2, 2, 1, 1, 1], tone: "warning" },
        { label: "SEV-3", values: [3, 4, 5, 5, 4, 3, 2], tone: "neutral" }
      ]
    }
  ]
};

const investigationSteps: InvestigationStep[] = [
  { label: "Read ServiceNow incident", detail: "Load the selected incident and service metadata.", source: "ServiceNow" },
  { label: "Search Splunk logs", detail: "Retrieve warning and error events for the incident.", source: "Splunk" },
  { label: "Check recent deployments", detail: "Correlate Jira changes with the incident start time.", source: "Jira" },
  { label: "Search similar incidents", detail: "Compare symptoms with historical incident records.", source: "Confluence" },
  { label: "Prepare draft outputs", detail: "Build evidence-linked recommendations and status text.", source: "Teams" }
];

async function requestJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      try {
        const body = await response.json() as { detail?: string };
        if (body.detail) detail = body.detail;
      } catch {
        // Keep the HTTP status when the response is not JSON.
      }
      throw new Error(detail);
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The backend did not respond within 30 seconds.");
    }
    throw error instanceof Error ? error : new Error("The backend request failed.");
  } finally {
    window.clearTimeout(timeout);
  }
}

function normalizeSeverity(value: string): IncidentSummary["severity"] {
  const severity = value.toUpperCase();
  if (severity === "SEV-1" || severity === "SEV-2" || severity === "SEV-3") return severity;
  return "SEV-3";
}

function mapIncident(incident: BackendIncident): IncidentSummary {
  return {
    id: incident.id,
    title: incident.title,
    severity: normalizeSeverity(incident.severity),
    status: incident.status?.toUpperCase() === "RESOLVED" ? "RESOLVED" : "ACTIVE",
    affectedService: incident.service,
    environment: `${incident.environment} / ${incident.region}`,
    startTime: incident.started_at.replace("T", " ").replace("Z", " UTC"),
    assignmentGroup: incident.assignment_group,
    impact: incident.description,
    description: incident.description,
    owner: incident.assignment_group,
    lastUpdated: incident.started_at.replace("T", " ").replace("Z", " UTC"),
    signalScore: normalizeSeverity(incident.severity) === "SEV-1" ? 95 : 70
  };
}

function mapMorningBriefing(payload: BackendMorningBriefing): MorningBriefing {
  const statuses = payload.health_metrics.map((metric) => metric.status.toLowerCase());
  const overallStatus = statuses.includes("critical") ? "RED" : statuses.includes("warning") ? "AMBER" : "GREEN";
  const statusMap: Record<string, ServiceHealth["status"]> = {
    critical: "Red",
    warning: "Amber",
    healthy: "Green"
  };
  const serviceHealthByName = new Map<string, ServiceHealth>();
  for (const metric of payload.health_metrics) {
    serviceHealthByName.set(metric.service, {
      service: metric.service,
      status: statusMap[metric.status.toLowerCase()] ?? "Grey"
    });
  }
  const serviceHealth = Array.from(serviceHealthByName.values());

  return {
    generatedAt: new Date().toLocaleString(),
    overallStatus,
    summary: payload.summary,
    context: payload.priorities[0]?.reason ?? "Generated from current operational evidence.",
    priorityActions: payload.priorities.map((item) => item.action),
    overnightIncidents: payload.overnight_incidents.map((incident) => ({
      id: incident.id,
      service: incident.service,
      severity: incident.severity,
      state: incident.status
    })),
    serviceHealth,
    teamsUpdates: payload.team_updates.map((update) => `${update.team}: ${update.message}`)
  };
}

function normalizeRisk(value: string): ChangeRisk {
  const risk = value.toLowerCase();
  if (risk === "high") return "High";
  if (risk === "low") return "Low";
  return "Medium";
}

function mapCabBriefing(payload: BackendCabBriefing): CabAnalysis {
  const firstConflict = payload.conflicts[0];
  const firstHighRisk = payload.risk_assessment.find((item) => item.risk.toLowerCase().includes("high"));
  const changes: CabChange[] = payload.scheduled_changes.map((change) => {
    const conflict = payload.conflicts.find((item) => item.changes.includes(change.id));
    const assessment = payload.risk_assessment.find((item) => item.change_id === change.id);
    return {
      id: change.id,
      service: change.service,
      window: change.window,
      risk: normalizeRisk(change.risk),
      conflict: conflict ? conflict.changes.filter((id) => id !== change.id).join(", ") : "None",
      recommendation: assessment?.recommendation ?? conflict?.recommendation ?? "Proceed with standard controls"
    };
  });
  const highestRisk = changes.some((change) => change.risk === "High") ? 85 : changes.some((change) => change.risk === "Medium") ? 60 : 25;

  return {
    meetingTime: "14:00",
    conflictsFound: payload.conflicts.length,
    conflictTitle: firstConflict ? `${firstConflict.changes.join(" and ")} require CAB review.` : "No deployment conflicts found.",
    conflictSummary: firstConflict?.reason ?? payload.summary,
    recommendation: firstConflict?.recommendation ?? "Proceed with the documented approval controls.",
    riskScore: highestRisk,
    riskChangeId: firstHighRisk?.change_id ?? changes[0]?.id ?? "N/A",
    riskFactors: payload.risk_assessment.map((item) => `${item.change_id}: ${item.risk}. ${item.recommendation}`),
    focusItems: payload.cab_decisions_required.map((decision, index) => ({ title: `Decision ${index + 1}`, detail: decision })),
    changes
  };
}

function mapTriage(payload: BackendTriage): InvestigationResult {
  const similar = payload.raw_context.similar_incidents[0];
  const recommendations = Array.from(new Set([
    ...payload.recommended_runbooks.flatMap((runbook) => runbook.steps),
    ...payload.jira_tasks.map((task) => `Draft Jira task: ${task.summary}`)
  ])).slice(0, 6);

  return {
    confidence: payload.evidence.length >= 3 ? "MEDIUM" : "LOW",
    probableRootCause: payload.likely_cause,
    explanation: `${payload.summary} ${payload.impact}`,
    evidence: payload.evidence,
    recommendations: recommendations.length ? recommendations : ["Continue manual investigation using the collected evidence."],
    similarIncident: similar ? {
      id: similar.id,
      summary: similar.title,
      resolution: similar.resolution
    } : {
      id: "No match",
      summary: "No similar historical incident was found",
      resolution: "Continue manual diagnosis"
    },
    timeline: payload.timeline.map((item) => `${item.time.replace("T", " ").replace("Z", " UTC")} | ${item.event} (${item.source})`),
    teamsUpdateDraft: payload.teams_status_update
  };
}

async function getMorningBriefing(): Promise<MorningBriefing> {
  return mapMorningBriefing(await requestJson<BackendMorningBriefing>("/morning-briefing"));
}

async function getCabBriefing(): Promise<CabAnalysis> {
  return mapCabBriefing(await requestJson<BackendCabBriefing>("/cab-briefing"));
}

export const operationsApi = {
  async getDashboardData(): Promise<OperationsDashboardData> {
    const [, incidentPayload, morningBriefing, cab] = await Promise.all([
      requestJson<{ status: string }>("/health"),
      requestJson<BackendIncident[]>("/incidents"),
      getMorningBriefing(),
      getCabBriefing()
    ]);
    const incidents = incidentPayload.map(mapIncident);
    const activeIncidents = incidents.filter((incident) => incident.status === "ACTIVE");
    const serviceAlerts = morningBriefing.serviceHealth.filter((health) => health.status === "Red" || health.status === "Amber").length;
    const systems: SystemConnection[] = sourceNames.map((name) => ({ name, status: name === "Azure Monitor" ? "degraded" : "online" }));

    return {
      systems,
      metrics: [
        { label: "Active Sev-1", value: String(activeIncidents.filter((incident) => incident.severity === "SEV-1").length), context: "Backend incident fixtures", tone: "critical" },
        { label: "Open Incidents", value: String(activeIncidents.length), context: `${incidents.length - activeIncidents.length} resolved`, tone: "warning" },
        { label: "Service Alerts", value: String(serviceAlerts), context: "Current health metrics", tone: serviceAlerts ? "warning" : "success" },
        { label: "Scheduled Changes", value: String(cab.changes.length), context: `${cab.conflictsFound} conflicts`, tone: "neutral" }
      ],
      incidentTrend,
      apiContracts: [],
      incidents,
      investigation: {
        steps: investigationSteps,
        activityFeed: ["Ready to retrieve incident evidence", "Backend connection verified"],
        result: null
      },
      briefingSources: ["ServiceNow", "Teams", "Splunk", "Azure Monitor"],
      briefingCollection: [
        { label: "Incidents Found", value: String(morningBriefing.overnightIncidents.length) },
        { label: "Teams Updates", value: String(morningBriefing.teamsUpdates.length) },
        { label: "Services Checked", value: String(morningBriefing.serviceHealth.length) }
      ],
      morningBriefing,
      cab
    };
  },

  async triageIncident(incidentId: string): Promise<InvestigationResult> {
    return mapTriage(await requestJson<BackendTriage>(`/triage-incident?incident_id=${encodeURIComponent(incidentId)}`));
  },

  getMorningBriefing,
  getCabBriefing
};
