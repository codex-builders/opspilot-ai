"""Mock ServiceNow Table API for OpsPilot AI.

This module does not connect to a real ServiceNow instance. It mirrors the
read-only ServiceNow Table API resources that matter for the OpsPilot demo
using local JSON:

- /servicenow/api/now/table/incident
- /servicenow/api/now/table/incident/{sys_id_or_number}
- /servicenow/active-incidents        (convenience: incidents not Resolved/Closed)
- /servicenow/incidents-for-ci        (convenience: incidents tied to one CI)

Real-API notes, called out rather than hidden:
- List/get responses are wrapped in {"result": ...}, matching the real Table API.
- priority/impact/urgency use ServiceNow's real "N - Label" scale.
- sysparm_query supports the real encoded-query syntax (field=value^field2=value2),
  a small subset - not the full GlideRecord query language.
- Real reference fields (cmdb_ci, assigned_to) return {"link", "value"} objects
  unless sysparm_display_value=true; we always return display strings for
  readability by the orchestration layer.
- No auth - mock is intentionally open/read-only, per the project's NFRs.
"""

from __future__ import annotations

import json
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


router = APIRouter(prefix="/servicenow", tags=["Mock ServiceNow"])

DATA_DIR = Path(__file__).resolve().parents[1] / "mock-data" / "servicenow"

RESOLVED_STATES = {"resolved", "closed", "cancelled"}


def _load_incidents() -> list[dict[str, Any]]:
    path = DATA_DIR / "incidents.json"
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def _no_record_error() -> dict[str, Any]:
    raise HTTPException(status_code=404, detail="No Record found")


def _apply_sysparm_query(records: list[dict[str, Any]], sysparm_query: str) -> list[dict[str, Any]]:
    """Small subset of ServiceNow's encoded query language: field=value
    conditions joined by ^ (AND)."""
    for clause in sysparm_query.split("^"):
        if "!=" in clause:
            field, _, value = clause.partition("!=")
            field, value = field.strip(), value.strip()
            records = [r for r in records if str(r.get(field, "")).lower() != value.lower()]
        elif "=" in clause:
            field, _, value = clause.partition("=")
            field, value = field.strip(), value.strip()
            records = [r for r in records if str(r.get(field, "")).lower() == value.lower()]
    return records


def list_incidents(
    sysparm_query: str | None = None,
    sysparm_limit: int | None = None,
    state: str | None = None,
    priority: str | None = None,
    cmdb_ci: str | None = None,
) -> dict[str, Any]:
    """Return synthetic ServiceNow incidents matching simple filters or sysparm_query."""

    records = _load_incidents()

    if sysparm_query:
        records = _apply_sysparm_query(records, sysparm_query)

    if state:
        records = [r for r in records if r["state"].lower() == state.lower()]
    if priority:
        records = [r for r in records if r["priority"].lower() == priority.lower()]
    if cmdb_ci:
        records = [r for r in records if r["cmdb_ci"].lower() == cmdb_ci.lower()]

    if sysparm_limit is not None:
        records = records[:sysparm_limit]

    return {"result": records}


def get_incident(sys_id_or_number: str) -> dict[str, Any]:
    """Return one synthetic ServiceNow incident by sys_id or number."""

    for record in _load_incidents():
        if sys_id_or_number.lower() in (record["sys_id"].lower(), record["number"].lower()):
            return {"result": record}
    return _no_record_error()


def find_active_incidents(cmdb_ci: str | None = None) -> dict[str, Any]:
    """Return incidents that are not Resolved/Closed/Cancelled - for briefing/CAB use."""

    records = [r for r in _load_incidents() if r["state"].lower() not in RESOLVED_STATES]
    if cmdb_ci:
        records = [r for r in records if r["cmdb_ci"].lower() == cmdb_ci.lower()]
    return {"result": records}


@router.get("/api/now/table/incident")
def read_incidents(
    sysparm_query: str | None = None,
    sysparm_limit: int | None = None,
    state: str | None = None,
    priority: str | None = None,
    cmdb_ci: str | None = None,
) -> dict[str, Any]:
    return list_incidents(
        sysparm_query=sysparm_query,
        sysparm_limit=sysparm_limit,
        state=state,
        priority=priority,
        cmdb_ci=cmdb_ci,
    )


@router.get("/api/now/table/incident/{sys_id_or_number}")
def read_incident(sys_id_or_number: str) -> dict[str, Any]:
    return get_incident(sys_id_or_number)


@router.get("/active-incidents")
def read_active_incidents(cmdb_ci: str | None = None) -> dict[str, Any]:
    return find_active_incidents(cmdb_ci=cmdb_ci)


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "system": "mock-servicenow", "mode": "local-json"}
