import type { OperationsDashboardData } from "../domain/operations";

export const operationsMockData: OperationsDashboardData = {
  systems: [
    { name: "ServiceNow", status: "online" },
    { name: "Splunk", status: "online" },
    { name: "Jira", status: "online" },
    { name: "Teams", status: "online" },
    { name: "Confluence", status: "online" },
    { name: "Azure Monitor", status: "online" }
  ],
  metrics: [
    {
      label: "Active Sev-1",
      value: "1",
      context: "1 customer-facing incident",
      tone: "critical",
      trend: [0, 0, 0, 1, 1, 1, 1]
    },
    {
      label: "Open Incidents",
      value: "4",
      context: "3 resolved overnight",
      tone: "warning",
      trend: [7, 6, 6, 5, 5, 4, 4]
    },
    {
      label: "Service Health",
      value: "98.5%",
      context: "12 services checked",
      tone: "success",
      trend: [94, 96, 95, 97, 96, 98, 99]
    },
    {
      label: "Open Changes",
      value: "8",
      context: "2 high-risk changes",
      tone: "neutral",
      trend: [6, 7, 7, 8, 8, 7, 8]
    }
  ],
  incidentTrend: {
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
  },
  apiContracts: [
    {
      system: "ServiceNow",
      method: "GET",
      endpoint: "/incidents/{id}",
      minimumResponse:
        "ID, severity, title, description, affected service, environment, start time, assignment group"
    },
    {
      system: "Splunk",
      method: "GET",
      endpoint: "/logs?service=&from=&to=",
      minimumResponse: "timestamp, level, message, host, error code, correlation ID"
    },
    {
      system: "Jira",
      method: "GET",
      endpoint: "/deployments?service=",
      minimumResponse: "version, deployed time, environment, change summary"
    },
    {
      system: "Jira",
      method: "GET",
      endpoint: "/issues?incident_id=",
      minimumResponse: "task ID, summary, status, assignee"
    },
    {
      system: "Confluence",
      method: "GET",
      endpoint: "/runbooks?service=&symptom=",
      minimumResponse: "title, URL, symptoms, steps, risk level"
    },
    {
      system: "Teams",
      method: "POST",
      endpoint: "/messages",
      minimumResponse: "channel ID, message text, status"
    }
  ],
  incidents: [
    {
      id: "INC-1042",
      title: "Checkout API HTTP 500 errors",
      severity: "SEV-1",
      status: "ACTIVE",
      affectedService: "Checkout API",
      environment: "Production",
      startTime: "10:32",
      assignmentGroup: "Incident Operations",
      impact: "Critical customer checkout failures",
      owner: "Checkout Platform",
      lastUpdated: "10:38",
      signalScore: 96,
      description:
        "Customers are seeing intermittent HTTP 500 errors during checkout. Error volume increased shortly after the latest checkout-api deployment."
    },
    {
      id: "INC-1039",
      title: "Email delivery latency",
      severity: "SEV-2",
      status: "RESOLVED",
      affectedService: "Email Service",
      environment: "Production",
      startTime: "02:14",
      assignmentGroup: "Messaging Operations",
      impact: "Delayed transactional emails for a subset of customers",
      owner: "Messaging Platform",
      lastUpdated: "04:25",
      signalScore: 61,
      description:
        "Outbound email processing lagged behind normal throughput after a queue worker restart. Service recovered after worker capacity was increased."
    },
    {
      id: "INC-1037",
      title: "Reporting data freshness delay",
      severity: "SEV-3",
      status: "RESOLVED",
      affectedService: "Reporting",
      environment: "Production",
      startTime: "23:40",
      assignmentGroup: "Data Operations",
      impact: "Internal dashboards refreshed 28 minutes behind schedule",
      owner: "Data Platform",
      lastUpdated: "00:32",
      signalScore: 44,
      description:
        "Batch ingestion completed later than expected because one upstream export retried. No data was lost and reporting freshness returned to normal."
    },
    {
      id: "INC-1035",
      title: "Authentication warning spike",
      severity: "SEV-3",
      status: "RESOLVED",
      affectedService: "Authentication",
      environment: "Production",
      startTime: "21:05",
      assignmentGroup: "Identity Operations",
      impact: "No customer-facing impact detected",
      owner: "Identity Platform",
      lastUpdated: "21:44",
      signalScore: 39,
      description:
        "A warning spike was traced to expired synthetic-monitor credentials. Production authentication traffic remained healthy."
    }
  ],
  investigation: {
    steps: [
      {
        label: "Read ServiceNow incident",
        detail: "Loaded INC-1042 details and affected service metadata.",
        source: "ServiceNow"
      },
      {
        label: "Search Splunk logs",
        detail: "Retrieved 148 relevant log entries for checkout-api.",
        source: "Splunk"
      },
      {
        label: "Check recent deployments",
        detail: "Found checkout-api v2.4.1 deployed to production at 10:24.",
        source: "Jira"
      },
      {
        label: "Search similar incidents",
        detail: "Matched symptoms with INC-0876 connection pool exhaustion.",
        source: "ServiceNow"
      },
      {
        label: "Check Jira tasks",
        detail: "Found no open rollback task for the deployment.",
        source: "Jira"
      },
      {
        label: "Generate investigation report",
        detail: "Prepared recommended actions and Teams update for approval.",
        source: "Teams"
      }
    ],
    activityFeed: [
      "10:36 Connected to ServiceNow",
      "10:36 Retrieved 148 relevant Splunk log entries",
      "10:37 Found deployment checkout-api v2.4.1",
      "10:37 Matched historical incident INC-0876",
      "10:38 Drafted Teams status update"
    ],
    result: {
      confidence: "HIGH",
      probableRootCause:
        "Database connection pool exhaustion introduced by checkout-api v2.4.1.",
      explanation:
        "The deployment completed seven minutes before the error spike. Log evidence and a matched historical incident point to connection pool saturation rather than network or platform failure.",
      evidence: [
        "92 database timeout errors in checkout-api logs",
        "Error spike began at 10:31",
        "Deployment completed at 10:24",
        "Similar incident INC-0876 resolved by rollback"
      ],
      recommendations: [
        "Roll back checkout-api v2.4.1",
        "Restart affected checkout instances",
        "Monitor database connection saturation",
        "Create engineering Jira task for connection pool review"
      ],
      similarIncident: {
        id: "INC-0876",
        summary: "Database connection leak",
        resolution: "Rollback deployment"
      },
      timeline: [
        "10:24 Deployment",
        "10:31 DB errors",
        "10:32 Alert",
        "10:34 Sev-1"
      ],
      teamsUpdateDraft:
        "We are investigating elevated checkout errors affecting production customers. Evidence points to checkout-api v2.4.1 causing database connection pool exhaustion. Recommended action is rollback, with database connection monitoring during recovery."
    }
  },
  briefingSources: ["ServiceNow", "Teams", "Splunk", "Azure Monitor"],
  briefingCollection: [
    { label: "Incidents Found", value: "4" },
    { label: "Teams Messages", value: "37" },
    { label: "Services Checked", value: "12" }
  ],
  morningBriefing: {
    generatedAt: "11 July 2026, 08:00",
    overallStatus: "AMBER",
    summary:
      "Four incidents occurred overnight. Three were resolved. One checkout service issue remains under investigation.",
    context: "No customer data loss was detected. Payment team has rollback support ready.",
    priorityActions: [
      "Review INC-1042 rollback decision.",
      "Monitor payment service latency.",
      "Confirm checkout database connection recovery."
    ],
    overnightIncidents: [
      { id: "INC-1042", service: "Checkout API", severity: "SEV-1", state: "Active" },
      { id: "INC-1039", service: "Email Service", severity: "SEV-2", state: "Resolved" },
      { id: "INC-1037", service: "Reporting", severity: "SEV-3", state: "Resolved" },
      { id: "INC-1035", service: "Authentication", severity: "SEV-3", state: "Resolved" }
    ],
    serviceHealth: [
      { service: "Checkout", status: "Red" },
      { service: "Payments", status: "Amber" },
      { service: "Authentication", status: "Green" }
    ],
    teamsUpdates: [
      "Payment team preparing rollback support.",
      "Database capacity increased overnight.",
      "Network maintenance completed successfully."
    ]
  },
  cab: {
    meetingTime: "14:00",
    conflictsFound: 2,
    conflictTitle: "CHG-2041 and CHG-2042 both affect the payments database.",
    conflictSummary:
      "The Payment API deployment and database maintenance overlap between 20:00 and 21:00.",
    recommendation: "Reschedule CHG-2042 to 22:00.",
    riskScore: 87,
    riskChangeId: "CHG-2041",
    riskFactors: [
      "Customer-facing service.",
      "No tested rollback plan.",
      "Previous deployment failure.",
      "Overlapping maintenance window."
    ],
    focusItems: [
      {
        title: "Conflict detection",
        detail: "Payment API and database windows overlap."
      },
      {
        title: "Rollback readiness",
        detail: "One high-risk change needs a named rollback owner."
      },
      {
        title: "Customer impact",
        detail: "Two changes touch customer-facing payment flows."
      }
    ],
    changes: [
      {
        id: "CHG-2041",
        service: "Payment API",
        window: "20:00",
        risk: "High",
        conflict: "CHG-2042",
        recommendation: "Approve with conditions"
      },
      {
        id: "CHG-2042",
        service: "Database",
        window: "20:30",
        risk: "Medium",
        conflict: "CHG-2041",
        recommendation: "Reschedule to 22:00"
      },
      {
        id: "CHG-2043",
        service: "Firewall Rules",
        window: "21:00",
        risk: "Low",
        conflict: "None",
        recommendation: "Approve"
      },
      {
        id: "CHG-2044",
        service: "Checkout API",
        window: "21:30",
        risk: "High",
        conflict: "None",
        recommendation: "Approve with rollback owner"
      }
    ]
  }
};
