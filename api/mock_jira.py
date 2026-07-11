"""Mock Jira Cloud REST API (v3) for OpsPilot AI.

This module does not connect to real Jira. It mirrors the read-only Jira
Cloud REST API v3 resources that matter for the OpsPilot demo using local
JSON:

- /jira/rest/api/3/issue/{issueIdOrKey}
- /jira/rest/api/3/search
- /jira/rest/api/3/field
- /jira/changes-for-ci      (convenience: recent changes tied to one CI, for root-cause correlation)
- /jira/conflicts           (convenience: overlapping deployment windows on the same CI, for CAB)

Real-API notes, called out rather than hidden:
- Issue shape is {"id", "key", "self", "fields": {...}}, matching the real API.
- Search results are wrapped in {"expand", "startAt", "maxResults", "total", "issues": [...]}.
- Non-standard ops data (linked CI, deployment window, approval status, commit ref)
  is modeled as customfield_10050-10055, resolvable via /field - the same pattern
  real Jira uses for anything beyond its built-in fields.
- `search` supports a small subset of JQL (status = "X", issuetype = "X",
  cf[10050] = "X") plus plain query-param filters for convenience - not full JQL.
- Real `description` is Atlassian Document Format (nested rich-text JSON); we use
  a plain string here to keep this readable for the LLM/orchestration layer.
- No auth - mock is intentionally open/read-only, per the project's NFRs.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

try:
    from fastapi import APIRouter, HTTPException, Query
except ModuleNotFoundError:
    class HTTPException(Exception):
        def __init__(self, status_code: int, detail: str):
            self.status_code = status_code
            self.detail = detail
            super().__init__(detail)

    class APIRouter:
        def __init__(self, *args: Any, **kwargs: Any):
            pass

        def get(self, *args: Any, **kwargs: Any):
            def decorator(func: Any) -> Any:
                return func

            return decorator

    def Query(default: Any = None, **kwargs: Any) -> Any:
        return default


router = APIRouter(prefix="/jira", tags=["Mock Jira"])

DATA_DIR = Path(__file__).resolve().parents[1] / "mock-data" / "jira"

# Mirrors what GET /rest/api/3/field would tell you about our custom fields.
CUSTOM_FIELDS = {
    "customfield_10050": "Linked CI",
    "customfield_10051": "Deployed At",
    "customfield_10052": "Approval Status",
    "customfield_10053": "Deployment Window Start",
    "customfield_10054": "Deployment Window End",
    "customfield_10055": "Commit Reference",
}


def _load_issues() -> list[dict[str, Any]]:
    path = DATA_DIR / "issues.json"
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def _issue_not_found() -> dict[str, Any]:
    raise HTTPException(status_code=404, detail="Issue does not exist or you do not have permission to see it.")


def _apply_jql(issues: list[dict[str, Any]], jql: str) -> list[dict[str, Any]]:
    """Small subset of JQL: `field = "value"` clauses joined by AND.
    Supports status, issuetype, and cf[10050..10055] (our custom fields)."""
    clauses = re.split(r"\s+AND\s+", jql, flags=re.IGNORECASE)
    for clause in clauses:
        match = re.match(r'\s*(\w+|cf\[\d+\])\s*=\s*"([^"]*)"\s*', clause, flags=re.IGNORECASE)
        if not match:
            continue
        field, value = match.group(1), match.group(2)
        cf_match = re.match(r"cf\[(\d+)\]", field, flags=re.IGNORECASE)
        if cf_match:
            key = f"customfield_{cf_match.group(1)}"
            issues = [i for i in issues if str(i["fields"].get(key, "")).lower() == value.lower()]
        elif field.lower() == "status":
            issues = [i for i in issues if i["fields"]["status"]["name"].lower() == value.lower()]
        elif field.lower() == "issuetype":
            issues = [i for i in issues if i["fields"]["issuetype"]["name"].lower() == value.lower()]
    return issues


def search_issues(
    jql: str | None = None,
    status: str | None = None,
    issuetype: str | None = None,
    linked_ci: str | None = None,
    approval_status: str | None = None,
    window_from: str | None = None,
    window_to: str | None = None,
) -> dict[str, Any]:
    """Return synthetic Jira issues matching simple filters or a JQL subset."""

    issues = _load_issues()

    if jql:
        issues = _apply_jql(issues, jql)

    if status:
        issues = [i for i in issues if i["fields"]["status"]["name"].lower() == status.lower()]
    if issuetype:
        issues = [i for i in issues if i["fields"]["issuetype"]["name"].lower() == issuetype.lower()]
    if linked_ci:
        issues = [i for i in issues if (i["fields"].get("customfield_10050") or "").lower() == linked_ci.lower()]
    if approval_status:
        issues = [i for i in issues if (i["fields"].get("customfield_10052") or "").lower() == approval_status.lower()]
    if window_from:
        issues = [
            i for i in issues
            if i["fields"].get("customfield_10054") and i["fields"]["customfield_10054"] >= window_from
        ]
    if window_to:
        issues = [
            i for i in issues
            if i["fields"].get("customfield_10053") and i["fields"]["customfield_10053"] <= window_to
        ]

    return {
        "expand": "names,schema",
        "startAt": 0,
        "maxResults": 50,
        "total": len(issues),
        "issues": issues,
    }


def get_issue(issue_id_or_key: str) -> dict[str, Any]:
    """Return one synthetic Jira issue by id or key."""

    for issue in _load_issues():
        if issue_id_or_key.lower() in (issue["id"].lower(), issue["key"].lower()):
            return issue
    return _issue_not_found()


def list_fields() -> list[dict[str, Any]]:
    """Mirrors the real /field endpoint, so custom field IDs are resolvable."""

    standard = [
        {"id": "summary", "name": "Summary"},
        {"id": "status", "name": "Status"},
        {"id": "issuetype", "name": "Issue Type"},
        {"id": "priority", "name": "Priority"},
        {"id": "created", "name": "Created"},
        {"id": "updated", "name": "Updated"},
        {"id": "description", "name": "Description"},
    ]
    custom = [{"id": fid, "name": name} for fid, name in CUSTOM_FIELDS.items()]
    return standard + custom


def find_changes_for_ci(ci: str, since: str | None = None) -> dict[str, Any]:
    """Return changes linked to a CI, most recent first - for root-cause correlation (FR3)."""

    issues = [i for i in _load_issues() if (i["fields"].get("customfield_10050") or "").lower() == ci.lower()]
    if since:
        issues = [
            i for i in issues
            if i["fields"].get("customfield_10051") and i["fields"]["customfield_10051"] >= since
        ]
    issues.sort(key=lambda i: i["fields"].get("customfield_10051") or i["fields"]["created"], reverse=True)
    return {"total": len(issues), "issues": issues}


def find_conflicts(window_from: str | None = None, window_to: str | None = None) -> dict[str, Any]:
    """Return pairs of changes on the same CI with overlapping deployment windows - for CAB."""

    issues = _load_issues()
    candidates = [
        i for i in issues
        if i["fields"].get("customfield_10053") and i["fields"].get("customfield_10054")
    ]
    if window_from:
        candidates = [i for i in candidates if i["fields"]["customfield_10054"] >= window_from]
    if window_to:
        candidates = [i for i in candidates if i["fields"]["customfield_10053"] <= window_to]

    conflicts = []
    for idx, a in enumerate(candidates):
        for b in candidates[idx + 1:]:
            ci_a = a["fields"].get("customfield_10050")
            ci_b = b["fields"].get("customfield_10050")
            if not ci_a or ci_a != ci_b:
                continue
            start_a, end_a = a["fields"]["customfield_10053"], a["fields"]["customfield_10054"]
            start_b, end_b = b["fields"]["customfield_10053"], b["fields"]["customfield_10054"]
            overlap_start = max(start_a, start_b)
            overlap_end = min(end_a, end_b)
            if overlap_start < overlap_end:
                conflicts.append({
                    "cmdb_ci": ci_a,
                    "change_a": {"key": a["key"], "summary": a["fields"]["summary"], "approval_status": a["fields"].get("customfield_10052")},
                    "change_b": {"key": b["key"], "summary": b["fields"]["summary"], "approval_status": b["fields"].get("customfield_10052")},
                    "overlap_start": overlap_start,
                    "overlap_end": overlap_end,
                })
    return {"total": len(conflicts), "conflicts": conflicts}


@router.get("/rest/api/3/search")
def read_search(
    jql: str | None = None,
    status: str | None = None,
    issuetype: str | None = None,
    linked_ci: str | None = None,
    approval_status: str | None = None,
    window_from: str | None = None,
    window_to: str | None = None,
) -> dict[str, Any]:
    return search_issues(
        jql=jql,
        status=status,
        issuetype=issuetype,
        linked_ci=linked_ci,
        approval_status=approval_status,
        window_from=window_from,
        window_to=window_to,
    )


@router.get("/rest/api/3/issue/{issue_id_or_key}")
def read_issue(issue_id_or_key: str) -> dict[str, Any]:
    return get_issue(issue_id_or_key)


@router.get("/rest/api/3/field")
def read_fields() -> list[dict[str, Any]]:
    return list_fields()


@router.get("/changes-for-ci")
def read_changes_for_ci(ci: str, since: str | None = None) -> dict[str, Any]:
    return find_changes_for_ci(ci=ci, since=since)


@router.get("/conflicts")
def read_conflicts(window_from: str | None = None, window_to: str | None = None) -> dict[str, Any]:
    return find_conflicts(window_from=window_from, window_to=window_to)


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "system": "mock-jira", "mode": "local-json"}
