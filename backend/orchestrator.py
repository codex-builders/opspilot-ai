"""Business workflow for evidence gathering, triage, runbook ranking, and reporting."""

from backend import ai_orchestrator
from backend import connectors


def _timeline(incident: dict, deployments: list[dict], logs: list[dict]) -> list[dict]:
    events = [{"time": item["deployed_at"], "event": f"{item['version']} deployed to {item['environment']}", "source": "Jira"} for item in deployments]
    events.append({"time": incident["started_at"], "event": f"{incident['severity']} incident created", "source": "ServiceNow"})
    for log in logs[:2]:
        events.append({"time": log["timestamp"], "event": log["message"].capitalize(), "source": "Splunk"})
    return sorted(events, key=lambda event: event["time"])


def _rank_runbooks(runbooks: list[dict], logs: list[dict], deployments: list[dict]) -> list[dict]:
    log_text = " ".join(log["message"].lower() for log in logs)
    ranked = []
    for runbook in runbooks:
        matches = [symptom for symptom in runbook["symptoms"] if symptom.lower() in log_text]
        if "rollback" in runbook["title"].lower() and deployments:
            matches.append("recent deployment")
        if matches:
            ranked.append({
                **runbook,
                "reason": f"Matched evidence: {', '.join(matches)}.",
                "approval_required": runbook["risk"] in {"Medium", "High"},
                "match_score": len(matches),
            })
    return sorted(ranked, key=lambda runbook: runbook["match_score"], reverse=True)


def triage(incident_id: str) -> dict | None:
    incident = connectors.get_incident(incident_id)
    if incident is None:
        return None
    logs = connectors.get_splunk_logs(incident["service"], incident["started_at"], incident["id"])
    deployments = connectors.get_recent_deployments(incident["service"])
    similar = connectors.get_similar_incidents(incident["service"])
    runbooks = _rank_runbooks(connectors.get_runbooks(incident["service"]), logs, deployments)
    routing = connectors.get_service_ownership(incident["service"])
    existing_tasks = connectors.get_existing_jira_tasks(incident_id)
    service_now_incidents = connectors.get_service_now_incidents(incident["service"])
    jira_changes = connectors.get_jira_changes(incident["service"])
    task_summaries = {task.get("summary") for task in existing_tasks}
    suggested_tasks = [
        {"summary": f"Investigate recent {incident['service']} deployment", "team": routing["primary_team"], "priority": "Highest"},
        {"summary": f"Investigate {logs[0]['message']}", "team": routing["support_teams"][0], "priority": "Highest"},
        {"summary": f"Validate {incident['service']} recovery after mitigation", "team": routing["primary_team"], "priority": "High"},
    ]
    jira_tasks = [task for task in suggested_tasks if task["summary"] not in task_summaries]
    for task in existing_tasks:
        jira_tasks.append({"summary": task["summary"], "team": routing["primary_team"], "priority": "Medium"})
    evidence = [
        f"Splunk reports {logs[0]['message']} and {logs[1]['message']}.",
        f"{deployments[0]['version']} was deployed before the incident." if deployments else "No recent deployments were found.",
        f"Similar incident {similar[0]['id']} was resolved by rolling back retry configuration and scaling instances." if similar else "No similar incidents found.",
    ]
    if service_now_incidents:
        service_now_summary = service_now_incidents[0]
        evidence.append(f"ServiceNow reports {service_now_summary['id']} as {service_now_summary['state']} with {service_now_summary['summary']}.")
    likely_cause = f"Possible {logs[0]['message']} associated with the recent deployment; this is a hypothesis, not a confirmed root cause."
    timeline = _timeline(incident, deployments, logs)
    local_recommended_actions = [
        step
        for runbook in runbooks
        for step in runbook.get("steps", [])
    ][:4]
    ai_context = {
        "incident": incident,
        "service_now_incidents": service_now_incidents,
        "splunk_logs": logs,
        "jira_deployments": deployments,
        "jira_change_activity": jira_changes,
        "similar_confluence_incidents": similar,
        "recommended_confluence_runbooks": runbooks,
        "routing": routing,
        "timeline": timeline,
        "local_evidence": evidence,
        "local_likely_cause": likely_cause,
        "local_recommended_actions": local_recommended_actions,
    }
    ai_analysis = ai_orchestrator.analyze_incident(ai_context)
    ai_completed = ai_analysis.get("status") == "completed"
    recommended_actions = ai_analysis.get("recommended_actions") if ai_completed else local_recommended_actions
    if not recommended_actions:
        recommended_actions = ["Continue evidence collection and validate recovery with the incident commander."]
    teams_status_update = (
        ai_analysis.get("teams_status_update")
        if ai_completed and ai_analysis.get("teams_status_update")
        else (
            f"{incident['severity']} {incident['id']}: {incident['title']}. "
            f"Evidence indicates {logs[0]['message']} after a recent deployment. "
            f"Primary: {routing['primary_team']}; support requested from {', '.join(routing['support_teams'])}. "
            "Runbook recommendation is ready for Incident Commander review."
        )
    )
    return {
        "incident": incident,
        "summary": ai_analysis.get("summary") if ai_completed else f"{incident['title']} requires immediate investigation in {incident['environment']}.",
        "impact": incident["description"],
        "evidence": ai_analysis.get("evidence") if ai_completed and ai_analysis.get("evidence") else evidence,
        "likely_cause": ai_analysis.get("likely_cause") if ai_completed else likely_cause,
        "confidence": ai_analysis.get("confidence", "MEDIUM" if ai_completed else "LOW"),
        "reasoning_summary": ai_analysis.get("reasoning_summary", "Local deterministic analysis used."),
        "recommended_actions": recommended_actions,
        "ai_analysis": ai_analysis,
        "raw_context": {"logs": logs, "recent_deployments": deployments, "similar_incidents": similar},
        "recommended_runbooks": runbooks,
        "routing": routing,
        "teams_status_update": teams_status_update,
        "jira_tasks": jira_tasks,
        "service_now_incidents": service_now_incidents,
        "jira_change_activity": jira_changes,
        "timeline": timeline,
    }


def post_incident_report(incident_id: str) -> dict | None:
    result = triage(incident_id)
    if result is None:
        return None
    return {
        "title": f"Post-Incident Report — {result['incident']['id']}",
        "executive_summary": result["summary"],
        "customer_impact": result["impact"],
        "timeline": result["timeline"],
        "root_cause_status": "Hypothesis pending Incident Commander review",
        "root_cause_hypothesis": result["likely_cause"],
        "evidence": result["evidence"],
        "follow_up_actions": result["jira_tasks"],
        "recommended_runbook_updates": ["Review connection-pool alert thresholds and add deployment correlation to the runbook."],
    }


def morning_briefing() -> dict:
    """Create a one-page operational summary from overnight operational data."""
    incidents = connectors.get_overnight_incidents()
    messages = connectors.get_overnight_teams_messages()
    metrics = connectors.get_health_metrics()
    priorities = [
        {"priority": 1, "service": "Identity Service", "action": "Complete and validate TLS certificate renewal before expiry.", "reason": "Certificate has 23 hours remaining."},
        {"priority": 2, "service": "Checkout Gateway", "action": "Continue investigation of intermittent 5xx errors and update the incident owner.", "reason": "Incident INC-999 remains open and 5xx rate is 2.4%."},
        {"priority": 3, "service": "Order Processing", "action": "Review queue-backlog remediation and confirm follow-up actions.", "reason": "Overnight Sev-2 was resolved but requires prevention review."},
    ]
    return {
        "title": "Morning Operations Briefing",
        "summary": "One open customer-facing issue and one time-sensitive certificate renewal require attention this morning.",
        "priorities": priorities,
        "overnight_incidents": incidents,
        "health_metrics": metrics,
        "team_updates": messages,
        "recommended_meeting_agenda": [item["action"] for item in priorities],
    }


def _overlap(first: dict, second: dict) -> bool:
    return first["start"] < second["end"] and second["start"] < first["end"]


def cab_briefing() -> dict:
    """Assess scheduled changes for conflicts, approvals, and operational risk."""
    changes = connectors.get_scheduled_changes()
    conflicts = []
    for index, first in enumerate(changes):
        for second in changes[index + 1:]:
            if _overlap(first, second):
                conflicts.append({
                    "changes": [first["id"], second["id"]],
                    "severity": "Medium",
                    "reason": f"Deployment windows overlap: {first['window']} and {second['window']}.",
                    "recommendation": "Sequence the changes or obtain explicit CAB approval for concurrent execution.",
                })
    risks = []
    for change in changes:
        if change["approval"] != "Approved":
            risks.append({"change_id": change["id"], "risk": "Approval missing", "recommendation": "Do not schedule until the required approval is recorded."})
        if change["risk"] == "High":
            risks.append({"change_id": change["id"], "risk": "High operational impact", "recommendation": "Confirm rollback plan, owner availability, and stakeholder communication."})
    return {
        "title": "CAB Meeting Brief",
        "summary": f"{len(changes)} scheduled changes reviewed; {len(conflicts)} timing conflict(s) and {len(risks)} risk item(s) require CAB attention.",
        "scheduled_changes": changes,
        "conflicts": conflicts,
        "risk_assessment": risks,
        "cab_decisions_required": [
            "Approve or reschedule CHG-202 before its deployment window.",
            "Decide whether CHG-201 and CHG-202 may run concurrently.",
            "Confirm rollback and communications for high-risk changes.",
        ],
    }
