# OpsPilot AI - System Architecture

## Overview

OpsPilot AI is an AI-powered IT Operations Assistant designed to reduce the time engineers spend collecting operational information across multiple enterprise systems.

Instead of manually opening ServiceNow, Splunk, Jira, Microsoft Teams and Confluence, OpsPilot retrieves information from authorized sources, consolidates the data, and uses OpenAI Codex to generate actionable insights.

The system is designed as a read-only decision support tool. It never performs operational changes automatically; engineers remain responsible for approving all recommendations.

---

# Architecture Goals

- Reduce Mean Time to Investigate (MTTI)
- Eliminate context switching between enterprise tools
- Provide explainable AI recommendations
- Support human decision making
- Maintain an auditable reasoning process

---

# High-Level Architecture

```
                                    ┌───────────────────────┐
                                    │   IT Operations User  │
                                    │  (Engineer / Manager) │
                                    └───────────┬───────────┘
                                                │
                                        Web Dashboard
                                                │
                                                ▼
                             ┌──────────────────────────────────┐
                             │          Frontend UI             │
                             │                                  │
                             │ Dashboard                        │
                             │ Incident Investigation           │
                             │ Morning Briefing                 │
                             │ CAB Review                       │
                             │ AI Chat                          │
                             └──────────────┬───────────────────┘
                                            │ REST API
                                            ▼
                         ┌──────────────────────────────────────┐
                         │          Backend (FastAPI)           │
                         │                                      │
                         │ Authentication (optional)            │
                         │ API Endpoints                        │
                         │ Orchestrator                         │
                         │ Report Generator                     │
                         └──────────────┬───────────────────────┘
                                        │
                                        ▼
                     ┌──────────────────────────────────────────┐
                     │        Codex Orchestrator Service        │
                     │                                          │
                     │ Collect Context                          │
                     │ Correlate Information                    │
                     │ Prompt Engineering                       │
                     │ AI Reasoning                             │
                     │ Report Generation                        │
                     └──────────────┬───────────────────────────┘
                                    │
          ┌───────────────┬──────────┼─────────────┬──────────────┐
          ▼               ▼          ▼             ▼              ▼

   Mock ServiceNow    Mock Splunk   Mock Jira   Mock Teams   Mock Confluence

   Incidents          Logs          Changes     Messages      Knowledge Base

```

---

# Components

## Frontend

Responsibilities

- Dashboard
- Incident Investigation page
- Morning Operations page
- CAB Review page
- AI Chat
- Report download

Technology

- React
- Tailwind CSS
- TypeScript

---

## Backend

Responsibilities

- REST API
- Read mock enterprise systems
- Coordinate Codex requests
- Generate reports

Technology

- FastAPI
- Python

---

## Codex Orchestrator

The orchestrator is the core intelligence of the application.

Responsibilities

- Retrieve information from enterprise systems
- Merge operational context
- Generate prompts
- Request AI analysis
- Return structured recommendations

The orchestrator never modifies enterprise systems.

---

## Mock Enterprise Systems

For demonstration purposes, enterprise platforms are simulated using local JSON files exposed through REST endpoints.

### ServiceNow

Stores

- Incidents
- Priorities
- Status
- Assigned teams

---

### Splunk

Stores

- System logs
- Error rates
- Latency
- Infrastructure alerts

---

### Jira

Stores

- Change Requests
- Deployment history
- Operational tasks

---

### Teams

Stores

- Operational discussions
- Shift handovers
- Incident communications

---

### Confluence

Stores

- Previous incidents
- Runbooks
- Recovery procedures
- Known issues

---

# AI Workflow

The Codex assistant performs the following tasks:

1. Receive an incident request
2. Retrieve relevant data
3. Merge context
4. Identify patterns
5. Compare against historical incidents
6. Produce recommendations
7. Generate reports

The AI only provides recommendations.

Final operational decisions always remain with engineers.

---

# Security Model

This prototype assumes read-only access.

The AI cannot:

- Restart servers
- Deploy software
- Close incidents
- Execute scripts
- Modify enterprise systems

Instead, it generates suggested actions for approval.

---

# Project Structure

```
frontend/
backend/
api/
mock-data/
docs/
tests/
reports/
```

---

# Future Enhancements

Possible future improvements include:

- Live ServiceNow API integration
- Live Splunk API integration
- Microsoft Teams Bot
- Azure OpenAI deployment
- Authentication using Microsoft Entra ID
- Role-based access control
- Retrieval-Augmented Generation (RAG)
- Incident trend analytics
- Predictive incident detection

---

# Technology Stack

| Layer           | Technology     |
| --------------- | -------------- |
| Frontend        | React          |
| Backend         | FastAPI        |
| AI              | OpenAI Codex   |
| Data            | Mock JSON APIs |
| Reports         | Markdown / PDF |
| Version Control | GitHub         |
| Deployment      | Docker         |
