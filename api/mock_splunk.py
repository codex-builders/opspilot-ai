"""Mock Splunk API for OpsPilot AI.

This module intentionally does not connect to Splunk. It mirrors a small,
useful subset of Splunk Enterprise REST resources using local synthetic JSON:

- /services/search/jobs
- /services/search/jobs/export
- /services/search/jobs/{sid}/results
- /servicesNS/nobody/search/alerts/fired_alerts
- /servicesNS/nobody/search/saved/searches
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from fastapi import APIRouter, Body, HTTPException, Query
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

        def post(self, *args: Any, **kwargs: Any):
            def decorator(func: Any) -> Any:
                return func

            return decorator

    def Query(default: Any = None, **kwargs: Any) -> Any:
        return default

    def Body(default: Any = None, **kwargs: Any) -> Any:
        return default


router = APIRouter(prefix="/splunk", tags=["Mock Splunk"])

DATA_DIR = Path(__file__).resolve().parents[1] / "mock-data" / "splunk"
SEVERITY_ORDER = {
    "DEBUG": 10,
    "INFO": 20,
    "WARN": 30,
    "WARNING": 30,
    "ERROR": 40,
    "CRITICAL": 50,
}

_SEARCH_JOBS: dict[str, dict[str, Any]] = {}


def _load_json(filename: str) -> list[dict[str, Any]]:
    path = DATA_DIR / filename
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid datetime '{value}'. Use ISO 8601, for example 2026-07-11T01:45:00Z.",
        ) from exc


def _event_time(event: dict[str, Any]) -> datetime:
    return datetime.fromisoformat(event["timestamp"].replace("Z", "+00:00"))


def _extract_query_filters(query: str | None) -> dict[str, str]:
    if not query:
        return {}

    filters: dict[str, str] = {}
    for key in (
        "index",
        "source",
        "sourcetype",
        "host",
        "service",
        "environment",
        "severity",
        "incident_id",
    ):
        match = re.search(rf"\b{key}=([\"']?)([^\"'\s|)]+)\1", query, re.IGNORECASE)
        if match:
            filters[key] = match.group(2)

    severity_threshold = re.search(r"\bseverity\s*>=\s*([A-Z]+)", query, re.IGNORECASE)
    if severity_threshold:
        filters["severity_gte"] = severity_threshold.group(1)
    return filters


def _contains_query_terms(event: dict[str, Any], query: str | None) -> bool:
    if not query:
        return True

    searchable = json.dumps(event, sort_keys=True).lower()
    ignored = {"search", "index", "source", "sourcetype", "host", "service", "environment", "severity", "incident_id"}
    terms = re.findall(r'"([^"]+)"|(?<![<>=])\b([a-zA-Z][\w-]{2,})\b(?![<>=])', query)

    for phrase, word in terms:
        term = (phrase or word).lower()
        if term in ignored or term in {"and", "or", "not", "earliest", "latest"}:
            continue
        if term not in searchable:
            return False
    return True


def _matches_filters(event: dict[str, Any], filters: dict[str, str]) -> bool:
    for key, expected in filters.items():
        if key == "severity_gte":
            actual_rank = SEVERITY_ORDER.get(str(event.get("severity", "")).upper(), 0)
            expected_rank = SEVERITY_ORDER.get(expected.upper(), 0)
            if actual_rank < expected_rank:
                return False
            continue

        actual = event.get(key)
        if actual is None:
            return False
        if str(actual).lower() != expected.lower():
            return False
    return True


def _matches_time_window(
    event: dict[str, Any],
    earliest_time: str | None,
    latest_time: str | None,
) -> bool:
    timestamp = _event_time(event)
    earliest = _parse_datetime(earliest_time)
    latest = _parse_datetime(latest_time)

    if earliest and timestamp < earliest:
        return False
    if latest and timestamp > latest:
        return False
    return True


def _splunk_entry(name: str, content: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": name,
        "id": f"https://localhost:8089/services/mock/{name}",
        "updated": content.get("timestamp") or content.get("trigger_time") or datetime.now(timezone.utc).isoformat(),
        "content": content,
    }


def _feed_response(entries: list[dict[str, Any]], offset: int = 0) -> dict[str, Any]:
    return {
        "generator": {
            "build": "mock-opspilot",
            "version": "10.4-compatible-mvp",
        },
        "paging": {
            "total": len(entries),
            "perPage": len(entries),
            "offset": offset,
        },
        "entry": entries,
    }


def search_events(
    query: str | None = None,
    earliest_time: str | None = None,
    latest_time: str | None = None,
    service: str | None = None,
    host: str | None = None,
    severity: str | None = None,
    incident_id: str | None = None,
    source: str | None = None,
    sourcetype: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Return synthetic log events matching Splunk-like filters."""

    filters = _extract_query_filters(query)
    explicit_filters = {
        "service": service,
        "host": host,
        "severity": severity,
        "incident_id": incident_id,
        "source": source,
        "sourcetype": sourcetype,
    }
    filters.update({key: value for key, value in explicit_filters.items() if value})

    events = _load_json("events.json")
    matches = [
        event
        for event in events
        if _matches_filters(event, filters)
        and _matches_time_window(event, earliest_time, latest_time)
        and _contains_query_terms(event, query)
    ]
    matches.sort(key=_event_time)
    return matches[:limit]


def list_alerts(
    service: str | None = None,
    incident_id: str | None = None,
    minimum_severity: int | None = None,
) -> list[dict[str, Any]]:
    """Return synthetic fired alerts."""

    alerts = _load_json("alerts.json")
    matches = alerts

    if service:
        matches = [alert for alert in matches if alert["service"].lower() == service.lower()]
    if incident_id:
        matches = [alert for alert in matches if alert.get("incident_id") == incident_id]
    if minimum_severity is not None:
        matches = [alert for alert in matches if alert["severity"] >= minimum_severity]

    return sorted(matches, key=lambda alert: alert["trigger_time"])


def list_metrics(
    service: str | None = None,
    metric_name: str | None = None,
    earliest_time: str | None = None,
    latest_time: str | None = None,
) -> list[dict[str, Any]]:
    """Return synthetic Splunk metrics used for health and trend views."""

    metrics = _load_json("metrics.json")
    matches = []

    for metric in metrics:
        if service and metric["service"].lower() != service.lower():
            continue
        if metric_name and metric["metric_name"].lower() != metric_name.lower():
            continue
        if not _matches_time_window(metric, earliest_time, latest_time):
            continue
        matches.append(metric)

    return sorted(matches, key=lambda metric: metric["timestamp"])


def list_saved_searches() -> list[dict[str, Any]]:
    """Return the saved searches available to the OpsPilot demo."""

    return _load_json("saved_searches.json")


def run_saved_search(name: str) -> list[dict[str, Any]]:
    """Run one synthetic saved search by name."""

    for saved_search in list_saved_searches():
        if saved_search["name"].lower() == name.lower():
            return search_events(
                query=saved_search["search"],
                earliest_time=saved_search["earliest_time"],
                latest_time=saved_search["latest_time"],
            )
    raise HTTPException(status_code=404, detail=f"Saved search '{name}' was not found.")


def create_search_job(
    search: str,
    earliest_time: str | None = None,
    latest_time: str | None = None,
) -> dict[str, Any]:
    """Create an in-memory mock search job and immediately complete it."""

    sid_seed = f"{search}|{earliest_time}|{latest_time}"
    sid = "mock_" + hashlib.sha1(sid_seed.encode("utf-8")).hexdigest()[:12]
    results = search_events(query=search, earliest_time=earliest_time, latest_time=latest_time)
    job = {
        "sid": sid,
        "search": search,
        "earliest_time": earliest_time,
        "latest_time": latest_time,
        "dispatchState": "DONE",
        "isDone": True,
        "eventCount": len(results),
        "resultCount": len(results),
        "results": results,
    }
    _SEARCH_JOBS[sid] = job
    return job


def get_search_job(sid: str) -> dict[str, Any]:
    job = _SEARCH_JOBS.get(sid)
    if not job:
        raise HTTPException(status_code=404, detail=f"Search job '{sid}' was not found.")
    return job


@router.get("/services/search/jobs/export")
def export_search(
    search: str | None = Query(default=None, description="Splunk-like SPL search string."),
    earliest_time: str | None = None,
    latest_time: str | None = None,
    service: str | None = None,
    host: str | None = None,
    severity: str | None = None,
    incident_id: str | None = None,
    source: str | None = None,
    sourcetype: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
) -> dict[str, Any]:
    events = search_events(
        query=search,
        earliest_time=earliest_time,
        latest_time=latest_time,
        service=service,
        host=host,
        severity=severity,
        incident_id=incident_id,
        source=source,
        sourcetype=sourcetype,
        limit=limit,
    )
    return {
        "results": events,
        "result_count": len(events),
        "search": search,
    }


@router.post("/services/search/jobs")
def dispatch_search_job(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    search = payload.get("search")
    if not search:
        raise HTTPException(status_code=400, detail="Request body must include a 'search' value.")

    job = create_search_job(
        search=search,
        earliest_time=payload.get("earliest_time"),
        latest_time=payload.get("latest_time"),
    )
    return {
        "sid": job["sid"],
        "dispatchState": job["dispatchState"],
        "isDone": job["isDone"],
        "eventCount": job["eventCount"],
        "resultCount": job["resultCount"],
    }


@router.get("/services/search/jobs/{sid}")
def read_search_job(sid: str) -> dict[str, Any]:
    job = get_search_job(sid)
    content = {key: value for key, value in job.items() if key != "results"}
    return _feed_response([_splunk_entry(sid, content)])


@router.get("/services/search/jobs/{sid}/results")
def read_search_results(sid: str) -> dict[str, Any]:
    job = get_search_job(sid)
    entries = [_splunk_entry(event["event_id"], event) for event in job["results"]]
    return _feed_response(entries)


@router.get("/servicesNS/nobody/search/alerts/fired_alerts")
def read_fired_alerts(
    service: str | None = None,
    incident_id: str | None = None,
    minimum_severity: int | None = Query(default=None, ge=1, le=5),
) -> dict[str, Any]:
    alerts = list_alerts(service=service, incident_id=incident_id, minimum_severity=minimum_severity)
    entries = [_splunk_entry(alert["alert_id"], alert) for alert in alerts]
    return _feed_response(entries)


@router.get("/servicesNS/nobody/search/saved/searches")
def read_saved_searches() -> dict[str, Any]:
    saved_searches = list_saved_searches()
    entries = [_splunk_entry(saved_search["name"], saved_search) for saved_search in saved_searches]
    return _feed_response(entries)


@router.get("/servicesNS/nobody/search/saved/searches/{name}/dispatch")
def dispatch_saved_search(name: str) -> dict[str, Any]:
    results = run_saved_search(name)
    sid = "saved_" + hashlib.sha1(name.lower().encode("utf-8")).hexdigest()[:12]
    _SEARCH_JOBS[sid] = {
        "sid": sid,
        "search": name,
        "earliest_time": None,
        "latest_time": None,
        "dispatchState": "DONE",
        "isDone": True,
        "eventCount": len(results),
        "resultCount": len(results),
        "results": results,
    }
    return {"sid": sid, "dispatchState": "DONE", "isDone": True, "resultCount": len(results)}


@router.get("/services/metrics")
def read_metrics(
    service: str | None = None,
    metric_name: str | None = None,
    earliest_time: str | None = None,
    latest_time: str | None = None,
) -> dict[str, Any]:
    metrics = list_metrics(
        service=service,
        metric_name=metric_name,
        earliest_time=earliest_time,
        latest_time=latest_time,
    )
    entries = [_splunk_entry(metric["metric_id"], metric) for metric in metrics]
    return _feed_response(entries)


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "system": "mock-splunk", "mode": "local-json"}
