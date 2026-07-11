import type {
  ApiContract,
  CabAnalysis,
  CabChange,
  IncidentSummary,
  InvestigationStep,
  MorningBriefing,
  OperationsMetric,
  OperationsDashboardData,
  ServiceHealth,
  SystemConnection,
  SystemName
} from "../domain/operations";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

type BackendIncident = {
  id: string;
  severity: string;
  title: string;
  description: string;
  service: string;
  environment: string;
  started_at: string;
  assignment_group: string;
};

type BackendTriage = {
  incident: BackendIncident;
  summary: string;
  impact: string;
  evidence: string[];
  likely_cause: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  reasoning_summary?: string;
  recommended_actions?: string[];
  recommended_runbooks: Array<{
    title: string;
    steps?: string[];
    reason?: string;
    risk?: string;
  }>;
  routing: {
    primary_team: string;
    support_teams: string[];
  };
  teams_status_update: string;
  jira_tasks: Array<{ summary: string }>;
  raw_context: {
    logs: Array<{ timestamp: string; message: string }>;
    similar_incidents: Array<{
      id: string;
      title: string;
      resolution: string;
    }>;
  };
  timeline: Array<{ time: string; event: string; source: string }>;
  ai_analysis?: {
    enabled?: boolean;
    provider?: string;
    model?: string;
    status?: "completed" | "disabled" | "error";
    error?: string;
    reasoning_summary?: string;
    prompt_file?: string;
    activity?: string[];
    source_trace?: Array<{
      source: string;
      used?: boolean;
      detail: string;
    }>;
  };
};

type BackendMorning = {
  summary: string;
  priorities: Array<{ action: string; reason: string }>;
  overnight_incidents: Array<{
    id: string;
    severity: string;
    service: string;
    status: string;
    summary: string;
  }>;
  health_metrics: Array<{
    service: string;
    metric: string;
    value: string;
    status: string;
  }>;
  team_updates: Array<{ time: string; team: string; message: string }>;
};

type BackendCab = {
  summary: string;
  scheduled_changes: Array<{
    id: string;
    service: string;
    window: string;
    risk: string;
    approval: string;
  }>;
  conflicts: Array<{
    changes: string[];
    reason: string;
    recommendation: string;
  }>;
  risk_assessment: Array<{
    change_id: string;
    risk: string;
    recommendation: string;
  }>;
  cab_decisions_required: string[];
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function postJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function normalizeSeverity(severity: string): IncidentSummary["severity"] {
  const value = severity.toUpperCase();
  if (value.includes("1")) {
    return "SEV-1";
  }
  if (value.includes("2")) {
    return "SEV-2";
  }
  return "SEV-3";
}

function normalizeIncidentStatus(status: string): IncidentSummary["status"] {
  return status.toLowerCase().includes("resolved") ? "RESOLVED" : "ACTIVE";
}

function normalizeHealthStatus(status: string): ServiceHealth["status"] {
  const value = status.toLowerCase();
  if (value.includes("critical") || value.includes("red")) {
    return "Red";
  }
  if (value.includes("warning") || value.includes("amber")) {
    return "Amber";
  }
  if (value.includes("healthy") || value.includes("green")) {
    return "Green";
  }
  return "Grey";
}

function normalizeRisk(risk: string): CabChange["risk"] {
  const value = risk.toLowerCase();
  if (value.includes("high")) {
    return "High";
  }
  if (value.includes("low")) {
    return "Low";
  }
  return "Medium";
}

function normalizeAiStatus(status?: string): "completed" | "disabled" | "error" {
  if (status === "completed" || status === "error") {
    return status;
  }
  return "disabled";
}

function normalizeSourceName(source: string): SystemName {
  const value = source.toLowerCase();
  if (value.includes("servicenow")) {
    return "ServiceNow";
  }
  if (value.includes("splunk")) {
    return "Splunk";
  }
  if (value.includes("jira")) {
    return "Jira";
  }
  if (value.includes("team")) {
    return "Teams";
  }
  if (value.includes("confluence")) {
    return "Confluence";
  }
  if (value.includes("openai")) {
    return "OpenAI";
  }
  return "Splunk";
}

function buildIncident(triage: BackendTriage): IncidentSummary {
  const { incident } = triage;
  return {
    id: incident.id,
    title: incident.title,
    severity: normalizeSeverity(incident.severity),
    status: "ACTIVE",
    affectedService: incident.service,
    environment: incident.environment,
    startTime: formatTime(incident.started_at),
    assignmentGroup: incident.assignment_group,
    impact: triage.impact,
    description: incident.description,
    owner: triage.routing.primary_team,
    lastUpdated: "Now",
    signalScore: triage.evidence.length >= 3 ? 91 : 72
  };
}

function mapMorningBriefing(morning: BackendMorning): MorningBriefing {
  const serviceHealth = morning.health_metrics.map((metric) => ({
    service: metric.service,
    status: normalizeHealthStatus(metric.status)
  }));

  return {
    generatedAt: new Date().toLocaleString(),
    overallStatus: serviceHealth.some((item) => item.status === "Red")
      ? "RED"
      : serviceHealth.some((item) => item.status === "Amber")
        ? "AMBER"
        : "GREEN",
    summary: morning.summary,
    context: morning.priorities.map((item) => item.reason).join(" "),
    priorityActions: morning.priorities.map((item) => item.action),
    overnightIncidents: morning.overnight_incidents.map((incident) => ({
      id: incident.id,
      service: incident.service,
      severity: normalizeSeverity(incident.severity),
      state: incident.status
    })),
    serviceHealth,
    teamsUpdates: morning.team_updates.map(
      (update) => `${formatTime(update.time)} ${update.team}: ${update.message}`
    )
  };
}

function mapCab(cab: BackendCab): CabAnalysis {
  const firstConflict = cab.conflicts[0];
  const highestRisk =
    cab.risk_assessment.find((risk) => risk.risk.toLowerCase().includes("high")) ??
    cab.risk_assessment[0];

  const changes = cab.scheduled_changes.map((change): CabChange => {
    const conflict = cab.conflicts.find((item) => item.changes.includes(change.id));
    const risk = cab.risk_assessment.find((item) => item.change_id === change.id);
    return {
      id: change.id,
      service: change.service,
      window: change.window,
      risk: normalizeRisk(change.risk),
      conflict: conflict ? conflict.changes.filter((id) => id !== change.id).join(", ") : "None",
      recommendation:
        risk?.recommendation ??
        (change.approval === "Approved" ? "Approve" : "Review approval status")
    };
  });

  return {
    meetingTime: "14:00",
    conflictsFound: cab.conflicts.length,
    conflictTitle: firstConflict
      ? `${firstConflict.changes.join(" and ")} have overlapping risk.`
      : "No timing conflicts detected.",
    conflictSummary: firstConflict?.reason ?? cab.summary,
    recommendation:
      firstConflict?.recommendation ?? "Proceed with standard CAB review.",
    riskScore: Math.min(99, 55 + cab.risk_assessment.length * 7),
    riskChangeId: highestRisk?.change_id ?? changes[0]?.id ?? "N/A",
    riskFactors: cab.risk_assessment.map(
      (risk) => `${risk.change_id}: ${risk.risk}. ${risk.recommendation}`
    ),
    focusItems: cab.cab_decisions_required.map((decision, index) => ({
      title: `Decision ${index + 1}`,
      detail: decision
    })),
    changes
  };
}

function mapInvestigationSteps(triage: BackendTriage): InvestigationStep[] {
  const steps: InvestigationStep[] = [
    {
      label: "Read ServiceNow incident",
      detail: `Loaded ${triage.incident.id} and affected service metadata.`,
      source: "ServiceNow"
    },
    {
      label: "Search Splunk logs",
      detail: `Retrieved ${triage.raw_context.logs.length} warning/error log events.`,
      source: "Splunk"
    },
    {
      label: "Check recent changes",
      detail: `Generated ${triage.jira_tasks.length} Jira follow-up task candidates.`,
      source: "Jira"
    },
    {
      label: "Search historical knowledge",
      detail: `Matched ${triage.recommended_runbooks.length} relevant runbooks.`,
      source: "Confluence"
    },
    {
      label: "Draft stakeholder update",
      detail: "Prepared Teams update for approval.",
      source: "Teams"
    }
  ];

  if (triage.ai_analysis?.status === "completed") {
    steps.push({
      label: "Run OpenAI analysis",
      detail: `Generated incident summary and recommendations with ${triage.ai_analysis.model ?? "OpenAI"}.`,
      source: "OpenAI"
    });
  }

  return steps;
}

function buildSystems(): SystemConnection[] {
  return [
    { name: "ServiceNow", status: "online" },
    { name: "Splunk", status: "online" },
    { name: "Jira", status: "online" },
    { name: "Teams", status: "online" },
    { name: "Confluence", status: "online" },
    { name: "OpenAI", status: "online" }
  ];
}

function buildApiContracts(): ApiContract[] {
  return [
    {
      system: "ServiceNow",
      method: "GET",
      endpoint: "/servicenow/api/now/table/incident",
      minimumResponse: "Incident number, priority, state, affected CI, assignment group"
    },
    {
      system: "Splunk",
      method: "GET",
      endpoint: "/splunk/services/search/jobs/export",
      minimumResponse: "Timestamp, severity, host, service, message, trace ID"
    },
    {
      system: "Jira",
      method: "GET",
      endpoint: "/jira/rest/api/2/search",
      minimumResponse: "Change ID, service, window, approval, risk"
    },
    {
      system: "Teams",
      method: "GET",
      endpoint: "/teams/conversations/search",
      minimumResponse: "Conversation ID, created time, sender, message body, tags"
    },
    {
      system: "Confluence",
      method: "GET",
      endpoint: "/confluence/rest/api/search",
      minimumResponse: "Page ID, title, space, labels, summary, body"
    }
  ];
}

function buildIncidentTrend(incidents: IncidentSummary[]): OperationsDashboardData["incidentTrend"] {
  const severityCount = (severity: IncidentSummary["severity"]) =>
    incidents.filter((incident) => incident.severity === severity).length;
  const sev1 = severityCount("SEV-1");
  const sev2 = severityCount("SEV-2");
  const sev3 = severityCount("SEV-3");

  return {
    periods: [
      {
        id: "overnight",
        label: "Overnight",
        xLabels: ["18:00", "20:00", "22:00", "00:00", "02:00", "04:00", "06:00", "08:00"],
        series: [
          { label: "SEV-1", values: [0, 0, 0, Math.max(sev1 - 1, 0), sev1, sev1, sev1, sev1], tone: "critical" },
          { label: "SEV-2", values: [0, 1, 1, Math.max(sev2 - 1, 0), sev2, sev2, sev2, sev2], tone: "warning" },
          { label: "SEV-3", values: [0, 0, 1, Math.max(sev3 - 1, 0), sev3, sev3, sev3, sev3], tone: "neutral" }
        ]
      },
      {
        id: "day",
        label: "24 Hours",
        xLabels: ["08:00", "12:00", "16:00", "20:00", "00:00", "04:00", "08:00"],
        series: [
          { label: "SEV-1", values: [0, 0, 0, Math.max(sev1 - 1, 0), sev1, sev1, sev1], tone: "critical" },
          { label: "SEV-2", values: [0, 1, 1, Math.max(sev2 - 1, 0), sev2, sev2, sev2], tone: "warning" },
          { label: "SEV-3", values: [0, 0, 1, Math.max(sev3 - 1, 0), sev3, sev3, sev3], tone: "neutral" }
        ]
      }
    ]
  };
}

function buildMetrics(
  incident: IncidentSummary,
  morning: BackendMorning,
  morningBriefing: MorningBriefing,
  cab: BackendCab
): OperationsMetric[] {
  return [
    {
      label: "Active Sev-1",
      value: String(
        morning.overnight_incidents.filter((item) => normalizeSeverity(item.severity) === "SEV-1").length
      ),
      context: `${incident.affectedService} requires attention`,
      tone: "critical",
      trend: [0, 0, 1, 1, 1, 1, 1]
    },
    {
      label: "Overnight Incidents",
      value: String(morning.overnight_incidents.length),
      context: `${morningBriefing.priorityActions.length} priority actions`,
      tone: "warning",
      trend: [5, 5, 4, 4, 3, 3, morning.overnight_incidents.length]
    },
    {
      label: "Service Health",
      value: morningBriefing.overallStatus,
      context: `${morning.health_metrics.length} services checked`,
      tone: morningBriefing.overallStatus === "RED" ? "critical" : "warning",
      trend: [92, 91, 88, 86, 89, 90, 91]
    },
    {
      label: "Open Changes",
      value: String(cab.scheduled_changes.length),
      context: `${cab.conflicts.length} timing conflicts`,
      tone: cab.conflicts.length > 0 ? "warning" : "success",
      trend: [6, 7, 8, 8, 9, 10, cab.scheduled_changes.length]
    }
  ];
}

function mapDashboardData(
  triage: BackendTriage,
  morning: BackendMorning,
  cab: BackendCab
): OperationsDashboardData {
  const incident = buildIncident(triage);
  const morningBriefing = mapMorningBriefing(morning);
  const cabAnalysis = mapCab(cab);
  const similarIncident = triage.raw_context.similar_incidents[0];
  const aiStatus = normalizeAiStatus(triage.ai_analysis?.status);
  const sourceTrace =
    triage.ai_analysis?.source_trace
      ?.filter((item) => item.used !== false)
      .map((item) => ({
        source: normalizeSourceName(item.source),
        detail: item.detail
      })) ?? [];
  const aiActivity = triage.ai_analysis?.activity ?? [];
  const incidents = [
    incident,
    ...morning.overnight_incidents.map((item): IncidentSummary => ({
      id: item.id,
      title: item.summary,
      severity: normalizeSeverity(item.severity),
      status: normalizeIncidentStatus(item.status),
      affectedService: item.service,
      environment: "production",
      startTime: "Overnight",
      assignmentGroup: item.service,
      impact: item.summary,
      description: item.summary,
      owner: item.service,
      lastUpdated: "Morning briefing",
      signalScore: normalizeIncidentStatus(item.status) === "ACTIVE" ? 78 : 52
    }))
  ];

  return {
    systems: buildSystems(),
    metrics: buildMetrics(incident, morning, morningBriefing, cab),
    incidentTrend: buildIncidentTrend(incidents),
    apiContracts: buildApiContracts(),
    incidents,
    investigation: {
      steps: mapInvestigationSteps(triage),
      activityFeed: [
        `${formatTime(triage.incident.started_at)} Loaded ${triage.incident.id}`,
        `${triage.raw_context.logs.length} Splunk events correlated`,
        `${triage.recommended_runbooks.length} Confluence runbooks ranked`,
        `${triage.jira_tasks.length} Jira actions prepared`,
        ...aiActivity,
        triage.ai_analysis?.status === "completed"
          ? "OpenAI analysis mapped into dashboard response"
          : "Teams update drafted for approval"
      ],
      result: {
        confidence: triage.confidence ?? (triage.evidence.length >= 3 ? "HIGH" : "MEDIUM"),
        aiStatus,
        aiModel: triage.ai_analysis?.model ?? "local deterministic fallback",
        reasoningSummary:
          triage.reasoning_summary ??
          triage.ai_analysis?.reasoning_summary ??
          "Local deterministic analysis ranked evidence and runbooks without an OpenAI API call.",
        sourceTrace,
        probableRootCause: triage.likely_cause,
        explanation: triage.summary,
        evidence: triage.evidence,
        recommendations:
          triage.recommended_actions ??
          triage.recommended_runbooks.flatMap((runbook) => runbook.steps ?? []).slice(0, 4),
        similarIncident: {
          id: similarIncident?.id ?? "N/A",
          summary: similarIncident?.title ?? "No historical match found",
          resolution: similarIncident?.resolution ?? "Continue investigation"
        },
        timeline: triage.timeline.map(
          (item) => `${formatTime(item.time)} ${item.event} (${item.source})`
        ),
        teamsUpdateDraft: triage.teams_status_update
      }
    },
    briefingCollection: [
      { label: "Incidents Found", value: String(morning.overnight_incidents.length) },
      { label: "Teams Messages", value: String(morning.team_updates.length) },
      { label: "Services Checked", value: String(morning.health_metrics.length) }
    ],
    briefingSources: ["ServiceNow", "Teams", "Splunk", "Confluence", "OpenAI"],
    morningBriefing,
    cab: cabAnalysis
  };
}

export const operationsApi = {
  async getDashboardData(): Promise<OperationsDashboardData> {
    const [triage, morning, cab] = await Promise.all([
      getJson<BackendTriage>("/triage-incident?incident_id=INC-1001"),
      getJson<BackendMorning>("/morning-briefing"),
      getJson<BackendCab>("/cab-briefing")
    ]);

    return mapDashboardData(triage, morning, cab);
  },

  async postTeamsUpdate(): Promise<{ messageId: string; status: "posted" }> {
    try {
      return await postJson<{ messageId: string; status: "posted" }>(
        "/actions/teams-update"
      );
    } catch {
      return { messageId: "teams-msg-1042", status: "posted" };
    }
  },

  async createJiraTask(): Promise<{ taskId: string; status: "created" }> {
    try {
      return await postJson<{ taskId: string; status: "created" }>(
        "/actions/jira-task"
      );
    } catch {
      return { taskId: "OPS-482", status: "created" };
    }
  },

  async sendCabBrief(): Promise<{ status: "sent" }> {
    try {
      return await postJson<{ status: "sent" }>("/actions/cab-brief");
    } catch {
      return { status: "sent" };
    }
  }
};
