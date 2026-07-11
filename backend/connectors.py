"""Temporary local connectors; replace their bodies with mock API calls later."""

from copy import deepcopy

try:
    from api.mock_jira import list_issues as list_jira_issues
except (ImportError, OSError):
    list_jira_issues = None

try:
    from api.mock_servicenow import find_active_incidents as find_servicenow_active_incidents
    from api.mock_servicenow import list_incidents as list_servicenow_incidents
except (ImportError, OSError):
    find_servicenow_active_incidents = None
    list_servicenow_incidents = None

try:
    from api.mock_splunk import search_events
except (ImportError, OSError):
    # Keep the orchestrator usable while the Splunk mock is unavailable.
    search_events = None


INCIDENTS = {
    "INC-1001": {
        "id": "INC-1001",
        "severity": "Sev-1",
        "title": "Payment API 5xx spike in EU production",
        "description": "Payment authorization traffic is failing after database connection-pool saturation.",
        "service": "Payments API",
        "environment": "production",
        "region": "EU",
        "started_at": "2026-07-11T01:45:00Z",
        "assignment_group": "Payments Platform",
        "status": "ACTIVE",
    },
    "INC-1002": {
        "id": "INC-1002",
        "severity": "Sev-1",
        "title": "Order queue backlog causing delayed fulfilment",
        "description": "Order events are accumulating faster than consumers can process them.",
        "service": "Order Processing",
        "environment": "production",
        "region": "EU",
        "started_at": "2026-07-11T11:05:00Z",
        "assignment_group": "Order Platform",
        "status": "RESOLVED",
    },
    "INC-1003": {
        "id": "INC-1003",
        "severity": "Sev-1",
        "title": "Checkout API returning elevated 5xx errors",
        "description": "Customers receive HTTP 502 and 503 responses during checkout.",
        "service": "Checkout Gateway",
        "environment": "production",
        "region": "US",
        "started_at": "2026-07-11T11:22:00Z",
        "assignment_group": "Commerce Platform",
        "status": "ACTIVE",
    },
    "INC-1004": {
        "id": "INC-1004",
        "severity": "Sev-1",
        "title": "Customer login failures caused by expiring TLS certificate",
        "description": "Authentication requests fail because the identity endpoint certificate is near expiry.",
        "service": "Identity Service",
        "environment": "production",
        "region": "Global",
        "started_at": "2026-07-11T11:40:00Z",
        "assignment_group": "Identity Engineering",
        "status": "RESOLVED",
    },
    "INC-1005": {
        "id": "INC-1005",
        "severity": "Sev-1",
        "title": "EU region service degradation requiring failover assessment",
        "description": "Multiple services in EU production show availability and latency degradation.",
        "service": "EU Platform Edge",
        "environment": "production",
        "region": "EU",
        "started_at": "2026-07-11T12:00:00Z",
        "assignment_group": "Cloud Infrastructure",
        "status": "ACTIVE",
    },
}

# OpsPilot display names and local incident IDs can differ from the synthetic
# Splunk records. Keep that translation at the connector boundary.
SPLUNK_SERVICE_NAMES = {"Payments API": "payment-api"}
SPLUNK_INCIDENT_IDS = {"INC-1001": "INC10452"}

SERVICE_TO_CMDB_CI = {
    "Payments API": "payment-api-prod",
    "Identity Service": "auth-gateway-prod",
    "Order Processing": "search-svc-prod",
}

CMDB_CI_TO_SERVICE = {value: key for key, value in SERVICE_TO_CMDB_CI.items()}
SERVICE_TO_JIRA_TERMS = {
    "Payments API": ["payment-api"],
    "Identity Service": ["auth-gateway", "certificate"],
    "Checkout Gateway": ["auth-gateway"],
}

SERVICE_DATA = {
    "Payments API": {
        "logs": [
            ("ERROR", "database connection timeout", "DB_TIMEOUT"),
            ("ERROR", "connection pool exhausted", "POOL_EXHAUSTED"),
            ("WARN", "checkout latency above threshold", "LATENCY_HIGH"),
        ],
        "deployment": ("payments-api v4.18", "Connection retry configuration update"),
        "similar": ("INC-882", "Payments database connection-pool exhaustion", "Rolled back retry configuration and scaled application instances."),
        "runbooks": [
            ("Database Connection Pool Exhaustion", ["connection pool exhausted", "database connection timeout"], "Medium"),
            ("Payments API Rollback", ["errors after deployment", "checkout failures"], "High"),
        ],
        "ownership": ("Payments Platform", "payments-platform-oncall@example.com", ["Database Operations"]),
    },
    "Order Processing": {
        "logs": [
            ("ERROR", "queue depth exceeded critical threshold", "QUEUE_DEPTH_HIGH"),
            ("WARN", "consumer lag increasing", "CONSUMER_LAG"),
            ("ERROR", "message processing timeout", "MESSAGE_TIMEOUT"),
        ],
        "deployment": ("order-consumer v2.9", "Consumer concurrency configuration update"),
        "similar": ("INC-741", "Order-processing queue backlog", "Scaled consumers and paused non-priority message producers."),
        "runbooks": [
            ("Queue Backlog and Consumer Lag", ["queue depth", "consumer lag", "message processing timeout"], "Medium"),
            ("Scale Order Consumers", ["consumer lag", "queue depth"], "Medium"),
        ],
        "ownership": ("Order Platform", "order-platform-oncall@example.com", ["Messaging Infrastructure"]),
    },
    "Checkout Gateway": {
        "logs": [
            ("ERROR", "upstream service returned HTTP 503", "HTTP_503"),
            ("ERROR", "gateway returned HTTP 502", "HTTP_502"),
            ("WARN", "upstream request latency above threshold", "UPSTREAM_LATENCY"),
        ],
        "deployment": ("checkout-gateway v6.4", "Upstream timeout policy update"),
        "similar": ("INC-619", "Checkout gateway 5xx spike", "Rolled back timeout policy and removed unhealthy upstream instances."),
        "runbooks": [
            ("Elevated HTTP 5xx Errors", ["http 503", "http 502", "upstream request latency"], "Medium"),
            ("Checkout Gateway Rollback", ["gateway returned", "upstream service"], "High"),
        ],
        "ownership": ("Commerce Platform", "commerce-platform-oncall@example.com", ["Site Reliability Engineering"]),
    },
    "Identity Service": {
        "logs": [
            ("ERROR", "TLS certificate expires within 24 hours", "CERT_EXPIRING"),
            ("ERROR", "TLS handshake failed", "TLS_HANDSHAKE"),
            ("WARN", "authentication failure rate elevated", "AUTH_FAILURE_RATE"),
        ],
        "deployment": ("identity-service v3.12", "Certificate monitoring agent update"),
        "similar": ("INC-533", "Identity certificate expiry", "Renewed certificate and validated trust-chain propagation."),
        "runbooks": [
            ("TLS Certificate Renewal", ["tls certificate", "tls handshake failed"], "High"),
            ("Authentication Failure Investigation", ["authentication failure rate"], "Medium"),
        ],
        "ownership": ("Identity Engineering", "identity-oncall@example.com", ["Security Operations"]),
    },
    "EU Platform Edge": {
        "logs": [
            ("ERROR", "regional availability below service objective", "REGION_AVAILABILITY"),
            ("ERROR", "load balancer health checks failing", "LB_HEALTHCHECK"),
            ("WARN", "cross-region latency elevated", "CROSS_REGION_LATENCY"),
        ],
        "deployment": ("edge-routing v8.1", "EU routing rule update"),
        "similar": ("INC-401", "EU regional degradation", "Failed over traffic to the secondary region after Incident Commander approval."),
        "runbooks": [
            ("Regional Failover Assessment", ["regional availability", "health checks failing", "cross-region latency"], "High"),
            ("Load Balancer Health Check Failures", ["load balancer health checks"], "Medium"),
        ],
        "ownership": ("Cloud Infrastructure", "cloud-infrastructure-oncall@example.com", ["Site Reliability Engineering", "Network Operations"]),
    },
}


def _normalize_service_now_record(record: dict) -> dict:
    cmdb_ci = record.get("cmdb_ci", "")
    service = CMDB_CI_TO_SERVICE.get(cmdb_ci, record.get("category", "Unknown Service"))
    return {
        "id": record.get("number") or record.get("sys_id"),
        "sys_id": record.get("sys_id"),
        "summary": record.get("short_description"),
        "description": record.get("description"),
        "state": record.get("state"),
        "priority": record.get("priority"),
        "impact": record.get("impact"),
        "urgency": record.get("urgency"),
        "service": service,
        "cmdb_ci": cmdb_ci,
        "assigned_to": record.get("assigned_to"),
        "opened_at": record.get("opened_at"),
        "updated_at": record.get("sys_updated_on"),
    }


def get_service_now_incidents(service: str | None = None) -> list[dict]:
    """Return normalized incidents from the ServiceNow mock, optionally filtered by service."""
    if list_servicenow_incidents is None:
        return []
    kwargs: dict = {"sysparm_limit": 5}
    if service:
        cmdb_ci = SERVICE_TO_CMDB_CI.get(service)
        if cmdb_ci:
            kwargs["cmdb_ci"] = cmdb_ci
    payload = list_servicenow_incidents(**kwargs)
    records = payload.get("result", []) if isinstance(payload, dict) else []
    return [_normalize_service_now_record(record) for record in records]


def get_service_now_active_incidents(service: str | None = None) -> list[dict]:
    """Return active incidents from ServiceNow for operational briefings."""
    if find_servicenow_active_incidents is None:
        return []
    kwargs: dict = {}
    if service:
        cmdb_ci = SERVICE_TO_CMDB_CI.get(service)
        if cmdb_ci:
            kwargs["cmdb_ci"] = cmdb_ci
    payload = find_servicenow_active_incidents(**kwargs)
    records = payload.get("result", []) if isinstance(payload, dict) else []
    return [_normalize_service_now_record(record) for record in records]


def get_jira_changes(service: str | None = None) -> list[dict]:
    """Return normalized Jira change issues relevant to the current service."""
    if list_jira_issues is None:
        return []
    issues = list_jira_issues()
    normalized: list[dict] = []
    for issue in issues:
        fields = issue.get("fields", {})
        if fields.get("issuetype", {}).get("name") != "Change":
            continue
        summary = fields.get("summary", "")
        if service:
            terms = SERVICE_TO_JIRA_TERMS.get(service, [])
            if terms and not any(term.lower() in summary.lower() for term in terms):
                continue
        normalized.append(
            {
                "id": issue.get("key") or issue.get("id"),
                "title": summary,
                "service": service or fields.get("customfield_10050") or "Unknown Service",
                "window": f"{fields.get('customfield_10053') or 'TBD'} to {fields.get('customfield_10054') or 'TBD'}",
                "start": fields.get("customfield_10053"),
                "end": fields.get("customfield_10054"),
                "risk": "High" if fields.get("priority", {}).get("name", "Medium").lower() == "high" else "Medium",
                "approval": fields.get("customfield_10052") or "Pending",
                "owner": "Unassigned",
            }
        )
    return normalized


def get_overnight_incidents() -> list[dict]:
    """Fixture replacement point for ServiceNow's overnight incident query."""
    service_now_incidents = get_service_now_active_incidents()
    if service_now_incidents:
        return [
            {
                "id": incident["id"],
                "severity": incident["priority"],
                "service": incident["service"],
                "status": incident["state"],
                "summary": incident["summary"],
            }
            for incident in service_now_incidents[:3]
        ]
    return [
        {"id": "INC-997", "severity": "Sev-2", "service": "Order Processing", "status": "Resolved", "summary": "Queue backlog delayed order fulfilment for 18 minutes."},
        {"id": "INC-998", "severity": "Sev-3", "service": "Identity Service", "status": "Monitoring", "summary": "Certificate expiry warning raised; renewal scheduled today."},
        {"id": "INC-999", "severity": "Sev-2", "service": "Checkout Gateway", "status": "Open", "summary": "Intermittent 5xx errors remain under investigation."},
    ]


def get_overnight_teams_messages() -> list[dict]:
    """Fixture replacement point for Teams incident/status messages."""
    return [
        {"time": "2026-07-11T06:10:00Z", "team": "Commerce Platform", "message": "Checkout Gateway error rate remains elevated at 2.4%; on-call investigating upstream dependency."},
        {"time": "2026-07-11T06:35:00Z", "team": "Identity Engineering", "message": "Certificate renewal change is planned for 09:00 UTC and requires verification."},
    ]


def get_health_metrics() -> list[dict]:
    """Fixture replacement point for Splunk/Azure Monitor/CloudWatch health metrics."""
    return [
        {"service": "Checkout Gateway", "metric": "5xx error rate", "value": "2.4%", "status": "warning"},
        {"service": "Order Processing", "metric": "queue depth", "value": "Normal", "status": "healthy"},
        {"service": "Identity Service", "metric": "certificate expiry", "value": "23 hours", "status": "critical"},
    ]


def get_scheduled_changes() -> list[dict]:
    """Fixture replacement point for Jira/ServiceNow CAB change records."""
    changes = [
        {"id": "CHG-201", "title": "Identity TLS certificate renewal", "service": "Identity Service", "window": "2026-07-11 09:00-09:30 UTC", "start": "2026-07-11T09:00:00Z", "end": "2026-07-11T09:30:00Z", "risk": "Medium", "approval": "Approved", "owner": "Identity Engineering"},
        {"id": "CHG-202", "title": "Checkout Gateway timeout-policy release", "service": "Checkout Gateway", "window": "2026-07-11 09:15-10:00 UTC", "start": "2026-07-11T09:15:00Z", "end": "2026-07-11T10:00:00Z", "risk": "High", "approval": "Pending", "owner": "Commerce Platform"},
        {"id": "CHG-203", "title": "EU edge routing maintenance", "service": "EU Platform Edge", "window": "2026-07-11 11:00-11:30 UTC", "start": "2026-07-11T11:00:00Z", "end": "2026-07-11T11:30:00Z", "risk": "High", "approval": "Approved", "owner": "Cloud Infrastructure"},
    ]
    jira_changes = get_jira_changes()
    if jira_changes:
        changes.extend(jira_changes)
    return changes


def get_incident(incident_id: str) -> dict | None:
    return deepcopy(INCIDENTS.get(incident_id))


def list_demo_incidents() -> list[dict]:
    return deepcopy(list(INCIDENTS.values()))


def get_splunk_logs(service: str, started_at: str, incident_id: str | None = None) -> list[dict]:
    """Read and normalize events from Member 3's Splunk mock."""
    if search_events:
        splunk_service = SPLUNK_SERVICE_NAMES.get(service, service)
        splunk_incident_id = SPLUNK_INCIDENT_IDS.get(incident_id or "", incident_id)
        events = search_events(
            query="search severity>=WARN",
            service=splunk_service,
            incident_id=splunk_incident_id,
            limit=50,
        )
        if events:
            return [
                {
                    "timestamp": event["timestamp"],
                    "level": event.get("severity", "UNKNOWN"),
                    "host": event.get("host", "unknown"),
                    "message": event.get("message", "No message supplied"),
                    "error_code": event.get("fields", {}).get("error_code") or f"SPLUNK_{event.get('event_id', 'EVENT')}",
                    "event_id": event.get("event_id"),
                    "trace_id": event.get("trace_id"),
                    "incident_id": event.get("incident_id"),
                    "source": event.get("source"),
                    "fields": event.get("fields", {}),
                }
                for event in events
            ]

    # Fallback supports other demo scenarios until matching Splunk fixture data
    # is added for them.
    return [
        {"timestamp": started_at, "level": level, "host": f"{service.lower().replace(' ', '-')}-01", "message": message, "error_code": error_code}
        for level, message, error_code in SERVICE_DATA[service]["logs"]
    ]


def get_recent_deployments(service: str) -> list[dict]:
    version, summary = SERVICE_DATA[service]["deployment"]
    deployed_at = "2026-07-11T01:37:00Z" if service == "Payments API" else "2026-07-11T10:37:00Z"
    return [{"version": version, "deployed_at": deployed_at, "environment": "production", "summary": summary}]


def get_existing_jira_tasks(incident_id: str) -> list[dict]:
    incident = get_incident(incident_id)
    service = incident.get("service") if incident else None
    jira_changes = get_jira_changes(service)
    return [{"id": change["id"], "summary": change["title"], "status": "Open", "key": change["id"]} for change in jira_changes[:3]]


def get_similar_incidents(service: str) -> list[dict]:
    incident_id, title, resolution = SERVICE_DATA[service]["similar"]
    return [{"id": incident_id, "title": title, "resolution": resolution}]


def get_runbooks(service: str) -> list[dict]:
    return [
        {
            "title": title,
            "url": f"https://confluence.example/runbooks/{title.lower().replace(' ', '-')}",
            "symptoms": symptoms,
            "steps": [f"Confirm the matching signals for {title}.", "Follow the approved mitigation procedure.", "Validate recovery before resolving the incident."],
            "risk": risk,
        }
        for title, symptoms, risk in SERVICE_DATA[service]["runbooks"]
    ]


def get_service_ownership(service: str) -> dict:
    primary_team, primary_on_call, support_teams = SERVICE_DATA[service]["ownership"]
    return {"primary_team": primary_team, "primary_on_call": primary_on_call, "support_teams": support_teams}
