"""FastAPI HTTP layer for the Incident Commander Assistant."""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from backend import connectors, orchestrator


app = FastAPI(
    title="Incident Commander Assistant",
    description="Demo orchestration service for incident investigation, morning operations, and CAB briefings.",
    version="1.0.0",
)


class TriageRequest(BaseModel):
    incident_id: str


@app.get("/")
def index() -> dict:
    return {
        "service": "incident-commander-orchestrator",
        "docs": "/docs",
        "routes": {
            "GET /health": "Service health check",
            "GET /incidents": "List fixture incidents",
            "GET /incidents/{incident_id}": "View a fixture incident",
            "GET /triage-incident?incident_id=INC-1001": "Browser-friendly triage demo",
            "POST /triage-incident": "Triage an incident with JSON body {incident_id}",
            "GET /incidents/{incident_id}/post-incident-report": "Generate a PIR draft",
            "GET /morning-briefing": "Generate a one-page morning operations summary",
            "GET /cab-briefing": "Generate CAB conflict and risk assessment",
        },
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "incident-commander-orchestrator"}


@app.get("/incidents")
def incidents() -> list[dict]:
    return connectors.list_demo_incidents()


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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.app:app", host="127.0.0.1", port=8000, reload=True)
