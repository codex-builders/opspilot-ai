"""FastAPI HTTP layer for the Incident Commander Assistant."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from api.mock_confluence import router as confluence_router
from api.mock_jira import router as jira_router
from api.mock_servicenow import router as servicenow_router
from api.mock_splunk import router as splunk_router
from api.mock_teams import router as teams_router
from backend import ai_orchestrator
from backend import connectors, orchestrator

app = FastAPI(
    title="Incident Commander Assistant",
    description="Demo orchestration service for incident investigation, morning operations, and CAB briefings.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(servicenow_router)
app.include_router(splunk_router)
app.include_router(jira_router)
app.include_router(teams_router)
app.include_router(confluence_router)


class TriageRequest(BaseModel):
    incident_id: str


@app.get("/")
def index() -> dict:
    return {
        "service": "incident-commander-orchestrator",
        "docs": "/docs",
        "routes": {
            "GET /health": "Service health check",
            "GET /incidents/{incident_id}": "View a fixture incident",
            "GET /triage-incident?incident_id=INC-1001": "Browser-friendly triage demo",
            "POST /triage-incident": "Triage an incident with JSON body {incident_id}",
            "GET /incidents/{incident_id}/post-incident-report": "Generate a PIR draft",
            "GET /morning-briefing": "Generate a one-page morning operations summary",
            "GET /cab-briefing": "Generate CAB conflict and risk assessment",
            "GET /ai/status": "Show OpenAI reasoning configuration",
            "POST /actions/teams-update": "Simulate posting an approved Teams update",
            "POST /actions/jira-task": "Simulate creating an engineering Jira task",
            "POST /actions/cab-brief": "Simulate sending the CAB risk brief",
        },
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "incident-commander-orchestrator"}


@app.get("/ai/status")
def ai_status() -> dict:
    return ai_orchestrator.get_ai_status()


@app.get("/incidents/{incident_id}")
def incident(incident_id: str) -> dict:
    result = connectors.get_incident(incident_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return result


def _triage_or_404(incident_id: str) -> dict:
    result = orchestrator.triage(incident_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return result


@app.get("/triage-incident")
def triage_browser(incident_id: str) -> dict:
    return _triage_or_404(incident_id)


@app.post("/triage-incident")
def triage_api(request: TriageRequest) -> dict:
    return _triage_or_404(request.incident_id)


@app.get("/incidents/{incident_id}/post-incident-report")
def post_incident_report(incident_id: str) -> dict:
    report = orchestrator.post_incident_report(incident_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return report


@app.get("/morning-briefing")
def morning_briefing() -> dict:
    return orchestrator.morning_briefing()


@app.get("/cab-briefing")
def cab_briefing() -> dict:
    return orchestrator.cab_briefing()


@app.post("/actions/teams-update")
def post_teams_update() -> dict:
    return {"messageId": "teams-msg-1042", "status": "posted"}


@app.post("/actions/jira-task")
def create_jira_task() -> dict:
    return {"taskId": "OPS-482", "status": "created"}


@app.post("/actions/cab-brief")
def send_cab_brief() -> dict:
    return {"status": "sent"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.app:app", host="127.0.0.1", port=8000, reload=True)
