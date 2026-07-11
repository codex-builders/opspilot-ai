"""Mock Microsoft Teams API for OpsPilot AI.

This module does not use Microsoft Graph, Teams SDK credentials, OAuth, or any
external Microsoft service. It mirrors the Teams SDK areas that matter for the
OpsPilot demo using local synthetic JSON:

- conversations: channel messages and members
- meetings: meeting details and participant lookups
- teams: team and channel metadata
"""

from __future__ import annotations

import json
from datetime import datetime
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


router = APIRouter(prefix="/teams", tags=["Mock Microsoft Teams"])

DATA_DIR = Path(__file__).resolve().parents[1] / "mock-data" / "teams"


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


def _message_time(message: dict[str, Any]) -> datetime:
    return datetime.fromisoformat(message["created_at"].replace("Z", "+00:00"))


def _matches_time_window(
    message: dict[str, Any],
    start_time: str | None,
    end_time: str | None,
) -> bool:
    created_at = _message_time(message)
    start = _parse_datetime(start_time)
    end = _parse_datetime(end_time)

    if start and created_at < start:
        return False
    if end and created_at > end:
        return False
    return True


def _contains_text(message: dict[str, Any], query: str | None) -> bool:
    if not query:
        return True
    searchable = json.dumps(message, sort_keys=True).lower()
    return query.lower() in searchable


def list_teams() -> list[dict[str, Any]]:
    """Return synthetic Teams visible to the OpsPilot demo."""

    return _load_json("teams.json")


def get_team(team_id: str) -> dict[str, Any]:
    """Return one synthetic Team by ID."""

    for team in list_teams():
        if team["team_id"] == team_id:
            return team
    raise HTTPException(status_code=404, detail=f"Team '{team_id}' was not found.")


def list_channels(team_id: str | None = None) -> list[dict[str, Any]]:
    """Return channels, optionally restricted to one team."""

    teams = [get_team(team_id)] if team_id else list_teams()
    channels: list[dict[str, Any]] = []

    for team in teams:
        for channel in team["channels"]:
            channels.append(
                {
                    **channel,
                    "team_id": team["team_id"],
                    "team_display_name": team["display_name"],
                }
            )
    return channels


def list_conversation_members(conversation_id: str) -> list[dict[str, Any]]:
    """Return members for the team that owns a conversation."""

    for team in list_teams():
        if any(channel["conversation_id"] == conversation_id for channel in team["channels"]):
            return team["members"]
    raise HTTPException(status_code=404, detail=f"Conversation '{conversation_id}' was not found.")


def search_messages(
    conversation_id: str | None = None,
    team_id: str | None = None,
    channel_id: str | None = None,
    incident_id: str | None = None,
    service: str | None = None,
    message_type: str | None = None,
    tag: str | None = None,
    query: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Return synthetic Teams messages matching OpsPilot context filters."""

    messages = _load_json("messages.json")
    matches = []

    for message in messages:
        if conversation_id and message["conversation_id"] != conversation_id:
            continue
        if team_id and message["team_id"] != team_id:
            continue
        if channel_id and message["channel_id"] != channel_id:
            continue
        if incident_id and message.get("incident_id") != incident_id:
            continue
        if service and message["service"].lower() != service.lower():
            continue
        if message_type and message["message_type"].lower() != message_type.lower():
            continue
        if tag and tag.lower() not in [item.lower() for item in message.get("tags", [])]:
            continue
        if not _matches_time_window(message, start_time, end_time):
            continue
        if not _contains_text(message, query):
            continue
        matches.append(message)

    matches.sort(key=_message_time)
    return matches[:limit]


def get_message(message_id: str) -> dict[str, Any]:
    """Return one synthetic Teams message by ID."""

    for message in _load_json("messages.json"):
        if message["message_id"] == message_id:
            return message
    raise HTTPException(status_code=404, detail=f"Message '{message_id}' was not found.")


def get_conversation_thread(conversation_id: str, incident_id: str | None = None) -> dict[str, Any]:
    """Return conversation messages plus members for incident timeline building."""

    messages = search_messages(conversation_id=conversation_id, incident_id=incident_id)
    members = list_conversation_members(conversation_id)
    return {
        "conversation_id": conversation_id,
        "members": members,
        "messages": messages,
        "message_count": len(messages),
    }


def list_meetings(
    incident_id: str | None = None,
    service: str | None = None,
) -> list[dict[str, Any]]:
    """Return synthetic meeting records."""

    meetings = _load_json("meetings.json")
    matches = []

    for meeting in meetings:
        if incident_id and meeting.get("related_incident_id") != incident_id:
            continue
        if service and meeting["service"].lower() != service.lower():
            continue
        matches.append(meeting)

    return sorted(matches, key=lambda meeting: meeting["started_at"])


def get_meeting(meeting_id: str) -> dict[str, Any]:
    """Return one synthetic meeting by ID."""

    for meeting in _load_json("meetings.json"):
        if meeting["meeting_id"] == meeting_id:
            return meeting
    raise HTTPException(status_code=404, detail=f"Meeting '{meeting_id}' was not found.")


def get_meeting_participant(meeting_id: str, user_id: str, tenant_id: str | None = None) -> dict[str, Any]:
    """Return participant details similar to Teams SDK meeting participant lookup."""

    meeting = get_meeting(meeting_id)
    if tenant_id and meeting["tenant_id"] != tenant_id:
        raise HTTPException(status_code=404, detail=f"Meeting '{meeting_id}' was not found for tenant '{tenant_id}'.")

    for participant in meeting["participants"]:
        if participant["user_id"] == user_id:
            return {
                "meeting_id": meeting_id,
                "tenant_id": meeting["tenant_id"],
                "participant": participant,
                "meeting": {
                    "role": participant["role"],
                    "in_meeting": participant["in_meeting"],
                },
            }
    raise HTTPException(status_code=404, detail=f"Participant '{user_id}' was not found in meeting '{meeting_id}'.")


@router.get("/teams")
def read_teams() -> dict[str, Any]:
    teams = list_teams()
    return {"teams": teams, "count": len(teams)}


@router.get("/teams/{team_id}")
def read_team(team_id: str) -> dict[str, Any]:
    return get_team(team_id)


@router.get("/teams/{team_id}/channels")
def read_channels(team_id: str) -> dict[str, Any]:
    channels = list_channels(team_id=team_id)
    return {"team_id": team_id, "channels": channels, "count": len(channels)}


@router.get("/conversations/search")
def read_message_search(
    conversation_id: str | None = None,
    team_id: str | None = None,
    channel_id: str | None = None,
    incident_id: str | None = None,
    service: str | None = None,
    message_type: str | None = None,
    tag: str | None = None,
    query: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
) -> dict[str, Any]:
    messages = search_messages(
        conversation_id=conversation_id,
        team_id=team_id,
        channel_id=channel_id,
        incident_id=incident_id,
        service=service,
        message_type=message_type,
        tag=tag,
        query=query,
        start_time=start_time,
        end_time=end_time,
        limit=limit,
    )
    return {"messages": messages, "count": len(messages)}


@router.get("/conversations/{conversation_id}/messages")
def read_conversation_messages(
    conversation_id: str,
    incident_id: str | None = None,
    service: str | None = None,
    message_type: str | None = None,
    tag: str | None = None,
    query: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
) -> dict[str, Any]:
    messages = search_messages(
        conversation_id=conversation_id,
        incident_id=incident_id,
        service=service,
        message_type=message_type,
        tag=tag,
        query=query,
        start_time=start_time,
        end_time=end_time,
        limit=limit,
    )
    return {"conversation_id": conversation_id, "messages": messages, "count": len(messages)}


@router.get("/conversations/{conversation_id}/members")
def read_conversation_members(conversation_id: str) -> dict[str, Any]:
    members = list_conversation_members(conversation_id)
    return {"conversation_id": conversation_id, "members": members, "count": len(members)}


@router.get("/conversations/{conversation_id}/thread")
def read_conversation_thread(conversation_id: str, incident_id: str | None = None) -> dict[str, Any]:
    return get_conversation_thread(conversation_id=conversation_id, incident_id=incident_id)


@router.get("/messages/{message_id}")
def read_message(message_id: str) -> dict[str, Any]:
    return get_message(message_id)


@router.get("/meetings")
def read_meetings(
    incident_id: str | None = None,
    service: str | None = None,
) -> dict[str, Any]:
    meetings = list_meetings(incident_id=incident_id, service=service)
    return {"meetings": meetings, "count": len(meetings)}


@router.get("/meetings/{meeting_id}")
def read_meeting(meeting_id: str) -> dict[str, Any]:
    return get_meeting(meeting_id)


@router.get("/meetings/{meeting_id}/participants/{user_id}")
def read_meeting_participant(
    meeting_id: str,
    user_id: str,
    tenant_id: str | None = None,
) -> dict[str, Any]:
    return get_meeting_participant(meeting_id=meeting_id, user_id=user_id, tenant_id=tenant_id)


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "system": "mock-teams", "mode": "local-json"}
