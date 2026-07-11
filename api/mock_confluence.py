"""Mock Confluence API for OpsPilot AI.

This module does not connect to Atlassian Confluence. It mirrors the read-only
Confluence REST resources that matter for the OpsPilot demo using local JSON:

- /rest/api/content
- /rest/api/content/{id}
- /rest/api/search
- /rest/api/content/{id}/label
- /rest/api/content/{id}/child/attachment
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


router = APIRouter(prefix="/confluence", tags=["Mock Confluence"])

DATA_DIR = Path(__file__).resolve().parents[1] / "mock-data" / "confluence"


def _load_json(filename: str) -> list[dict[str, Any]]:
    path = DATA_DIR / filename
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def _content_link(content_id: str) -> dict[str, str]:
    return {
        "base": "http://localhost:8000/confluence",
        "context": "",
        "self": f"http://localhost:8000/confluence/rest/api/content/{content_id}",
    }


def _space_link(space_key: str) -> dict[str, str]:
    return {
        "self": f"http://localhost:8000/confluence/rest/api/space/{space_key}",
    }


def _space_lookup() -> dict[str, dict[str, Any]]:
    return {space["key"]: space for space in _load_json("spaces.json")}


def _label_names(content: dict[str, Any]) -> list[str]:
    return [label["name"].lower() for label in content.get("labels", [])]


def _metadata_values(content: dict[str, Any], key: str) -> list[str]:
    values = content.get("metadata", {}).get(key, [])
    return [str(value).lower() for value in values]


def _content_matches_text(content: dict[str, Any], query: str | None) -> bool:
    if not query:
        return True
    searchable = json.dumps(content, sort_keys=True).lower()
    return query.lower() in searchable


def _extract_cql_filters(cql: str | None) -> dict[str, str]:
    if not cql:
        return {}

    filters: dict[str, str] = {}
    patterns = {
        "space": r"\bspace\s*=\s*([\"']?)([^\"'\s)]+)\1",
        "type": r"\btype\s*=\s*([\"']?)([^\"'\s)]+)\1",
        "title": r"\btitle\s*~\s*([\"'])(.*?)\1",
        "label": r"\blabel\s*=\s*([\"']?)([^\"'\s)]+)\1",
        "text": r"\btext\s*~\s*([\"'])(.*?)\1",
    }

    for key, pattern in patterns.items():
        match = re.search(pattern, cql, re.IGNORECASE)
        if match:
            filters[key] = match.group(2)
    return filters


def _shape_content(content: dict[str, Any], expand: str | None = None) -> dict[str, Any]:
    shaped = {
        "id": content["id"],
        "type": content["type"],
        "status": content["status"],
        "title": content["title"],
        "space": {
            **content["space"],
            "_links": _space_link(content["space"]["key"]),
        },
        "version": content["version"],
        "metadata": {
            "labels": {
                "results": content.get("labels", []),
                "size": len(content.get("labels", [])),
            },
            "properties": content.get("metadata", {}),
        },
        "summary": content["summary"],
        "_links": _content_link(content["id"]),
    }

    expand_parts = {part.strip() for part in (expand or "").split(",") if part.strip()}
    if "body.view" in expand_parts or "body.storage" in expand_parts or "body" in expand_parts:
        shaped["body"] = {}
        if "body.storage" in expand_parts:
            shaped["body"]["storage"] = content["body"]["storage"]
        if "body.view" in expand_parts or "body" in expand_parts:
            shaped["body"]["view"] = content["body"]["view"]

    return shaped


def _paged_response(results: list[dict[str, Any]], start: int = 0, limit: int = 25) -> dict[str, Any]:
    page = results[start : start + limit]
    return {
        "results": page,
        "start": start,
        "limit": limit,
        "size": len(page),
        "_links": {
            "base": "http://localhost:8000/confluence",
            "context": "",
        },
    }


def list_spaces() -> list[dict[str, Any]]:
    """Return synthetic Confluence spaces."""

    return _load_json("spaces.json")


def get_space(space_key: str) -> dict[str, Any]:
    """Return one synthetic Confluence space."""

    space = _space_lookup().get(space_key)
    if not space:
        raise HTTPException(status_code=404, detail=f"Space '{space_key}' was not found.")
    return {**space, "_links": _space_link(space_key)}


def search_content(
    cql: str | None = None,
    query: str | None = None,
    space_key: str | None = None,
    title: str | None = None,
    content_type: str | None = "page",
    label: str | None = None,
    service: str | None = None,
    incident_id: str | None = None,
    change_id: str | None = None,
    scenario: str | None = None,
    expand: str | None = None,
    start: int = 0,
    limit: int = 25,
) -> dict[str, Any]:
    """Return synthetic Confluence content matching simple filters or CQL."""

    cql_filters = _extract_cql_filters(cql)
    effective_space = space_key or cql_filters.get("space")
    effective_type = content_type or cql_filters.get("type")
    effective_title = title or cql_filters.get("title")
    effective_label = label or cql_filters.get("label")
    effective_query = query or cql_filters.get("text")

    matches = []
    for content in _load_json("pages.json"):
        if effective_type and content["type"].lower() != effective_type.lower():
            continue
        if effective_space and content["space"]["key"].lower() != effective_space.lower():
            continue
        if effective_title and effective_title.lower() not in content["title"].lower():
            continue
        if effective_label and effective_label.lower() not in _label_names(content):
            continue
        if service and service.lower() not in _metadata_values(content, "services"):
            continue
        if incident_id and incident_id.lower() not in _metadata_values(content, "incident_ids"):
            continue
        if change_id and change_id.lower() not in _metadata_values(content, "change_ids"):
            continue
        if scenario and scenario.lower() not in _metadata_values(content, "scenario"):
            continue
        if not _content_matches_text(content, effective_query):
            continue
        matches.append(_shape_content(content, expand=expand))

    matches.sort(key=lambda item: item["title"])
    return _paged_response(matches, start=start, limit=limit)


def get_content(content_id: str, expand: str | None = "body.view,metadata.labels") -> dict[str, Any]:
    """Return one synthetic Confluence content item by ID."""

    for content in _load_json("pages.json"):
        if content["id"] == content_id:
            return _shape_content(content, expand=expand)
    raise HTTPException(status_code=404, detail=f"Content '{content_id}' was not found.")


def get_labels(content_id: str, prefix: str | None = None, start: int = 0, limit: int = 200) -> dict[str, Any]:
    """Return labels for a synthetic Confluence page."""

    content = get_content(content_id, expand=None)
    labels = content["metadata"]["labels"]["results"]
    if prefix:
        labels = [label for label in labels if label["prefix"].lower() == prefix.lower()]
    return _paged_response(labels, start=start, limit=limit)


def list_attachments(content_id: str, start: int = 0, limit: int = 25) -> dict[str, Any]:
    """Return synthetic attachment metadata for a Confluence page."""

    get_content(content_id, expand=None)
    attachments = [
        {
            **attachment,
            "container": {
                "id": content_id,
                "_links": _content_link(content_id),
            },
            "metadata": {
                "mediaType": attachment["mediaType"],
                "comment": attachment["comment"],
            },
            "_links": _content_link(attachment["id"]),
        }
        for attachment in _load_json("attachments.json")
        if attachment["container_id"] == content_id
    ]
    return _paged_response(attachments, start=start, limit=limit)


def find_runbooks(service: str | None = None, incident_id: str | None = None) -> dict[str, Any]:
    """Return runbooks and known issues relevant to an incident."""

    results = search_content(
        label="runbook",
        service=service,
        incident_id=incident_id,
        expand="body.view",
        limit=50,
    )["results"]
    known_issues = search_content(
        label="known-issue",
        service=service,
        incident_id=incident_id,
        expand="body.view",
        limit=50,
    )["results"]
    return {
        "results": results + known_issues,
        "size": len(results) + len(known_issues),
    }


def find_historical_incidents(service: str | None = None) -> dict[str, Any]:
    """Return previous incident reviews related to a service."""

    return search_content(
        label="post-incident-review",
        service=service,
        expand="body.view",
        limit=50,
    )


def find_cab_guidance(change_id: str | None = None, service: str | None = None) -> dict[str, Any]:
    """Return CAB pages relevant to a planned change."""

    return search_content(
        label="cab",
        change_id=change_id,
        service=service,
        expand="body.view",
        limit=50,
    )


@router.get("/rest/api/space")
def read_spaces() -> dict[str, Any]:
    spaces = [{**space, "_links": _space_link(space["key"])} for space in list_spaces()]
    return _paged_response(spaces, start=0, limit=len(spaces))


@router.get("/rest/api/space/{space_key}")
def read_space(space_key: str) -> dict[str, Any]:
    return get_space(space_key)


@router.get("/rest/api/search")
def read_search(
    cql: str | None = None,
    query: str | None = None,
    spaceKey: str | None = None,
    label: str | None = None,
    service: str | None = None,
    incident_id: str | None = None,
    change_id: str | None = None,
    scenario: str | None = None,
    expand: str | None = None,
    start: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=200),
) -> dict[str, Any]:
    return search_content(
        cql=cql,
        query=query,
        space_key=spaceKey,
        label=label,
        service=service,
        incident_id=incident_id,
        change_id=change_id,
        scenario=scenario,
        expand=expand,
        start=start,
        limit=limit,
    )


@router.get("/rest/api/content")
def read_content_list(
    type: str | None = "page",
    spaceKey: str | None = None,
    title: str | None = None,
    label: str | None = None,
    service: str | None = None,
    incident_id: str | None = None,
    change_id: str | None = None,
    scenario: str | None = None,
    expand: str | None = None,
    start: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=200),
) -> dict[str, Any]:
    return search_content(
        space_key=spaceKey,
        title=title,
        content_type=type,
        label=label,
        service=service,
        incident_id=incident_id,
        change_id=change_id,
        scenario=scenario,
        expand=expand,
        start=start,
        limit=limit,
    )


@router.get("/rest/api/content/{content_id}")
def read_content(content_id: str, expand: str | None = "body.view,metadata.labels") -> dict[str, Any]:
    return get_content(content_id, expand=expand)


@router.get("/rest/api/content/{content_id}/label")
def read_labels(
    content_id: str,
    prefix: str | None = None,
    start: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=200),
) -> dict[str, Any]:
    return get_labels(content_id=content_id, prefix=prefix, start=start, limit=limit)


@router.get("/rest/api/content/{content_id}/child/attachment")
def read_attachments(
    content_id: str,
    start: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=200),
) -> dict[str, Any]:
    return list_attachments(content_id=content_id, start=start, limit=limit)


@router.get("/runbooks")
def read_runbooks(service: str | None = None, incident_id: str | None = None) -> dict[str, Any]:
    return find_runbooks(service=service, incident_id=incident_id)


@router.get("/historical-incidents")
def read_historical_incidents(service: str | None = None) -> dict[str, Any]:
    return find_historical_incidents(service=service)


@router.get("/cab-guidance")
def read_cab_guidance(change_id: str | None = None, service: str | None = None) -> dict[str, Any]:
    return find_cab_guidance(change_id=change_id, service=service)


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "system": "mock-confluence", "mode": "local-json"}
