# OpsPilot AI - Data Flow

## Overview

This document describes how information moves through the OpsPilot AI system.

The architecture follows a read-only workflow where enterprise information is collected, analysed by Codex, and returned to the user as operational recommendations.

---

# High-Level Flow

```
User

↓

Dashboard Request

↓

Backend API

↓

Codex Orchestrator

↓

Retrieve Enterprise Data

↓

Merge Operational Context

↓

AI Analysis

↓

Generate Summary

↓

Display Dashboard
```

---

# Detailed Data Flow

```
                    ┌───────────────────────┐
                    │      User opens       │
                    │ Incident Investigation│
                    └───────────┬───────────┘
                                │
                                ▼
                     Request Incident ID
                                │
                                ▼
                     Backend REST Endpoint
                                │
                                ▼
                    Codex Orchestrator
                                │
        ┌───────────────────────┼────────────────────────┐
        ▼                       ▼                        ▼

 ServiceNow API           Splunk API               Jira API

 Incident              Infrastructure Logs      Recent Changes

        │                       │                        │
        └──────────────┬────────┴──────────────┬─────────┘
                       ▼                       ▼

                Teams Messages        Confluence Articles

                       │
                       ▼
             Context Aggregation Layer

                       │
                       ▼
             Prompt Construction Layer

                       │
                       ▼
               OpenAI Codex Analysis

                       │
                       ▼
          Structured Incident Summary

                       │
                       ▼
              Recommendations Generated

                       │
                       ▼
          Dashboard + AI Chat + Reports
```

---

# Incident Investigation Flow

## Step 1

User selects an incident.

Example:

```
INC10452
```

---

## Step 2

The backend retrieves:

ServiceNow

- Incident information

Splunk

- Error logs

Jira

- Recent deployments

Teams

- Team discussion

Confluence

- Previous incidents

---

## Step 3

The orchestrator combines all retrieved information into a single context object.

Example:

```
Incident

+

Logs

+

Change History

+

Knowledge Base

+

Communications

↓

Unified Context
```

---

## Step 4

The unified context is sent to Codex.

Codex performs:

- Information summarisation
- Timeline generation
- Root cause reasoning
- Pattern matching
- Recommendation generation

---

## Step 5

Codex returns a structured response.

Example

```
Root Cause

Database migration caused connection pool exhaustion.

Confidence

87%

Recommended Actions

Restart connection pool

Validate latency

Prepare rollback
```

---

## Step 6

The frontend displays:

- Timeline
- Evidence
- AI Summary
- Recommendations
- Confidence Score

---

# Morning Operations Flow

```
Scheduled Request

↓

Retrieve Overnight Incidents

↓

Retrieve Shift Messages

↓

Retrieve Monitoring Metrics

↓

Retrieve Today's Changes

↓

Generate Morning Brief

↓

Display Dashboard
```

Output

- Critical incidents
- Outstanding issues
- Planned maintenance
- Recommended priorities

---

# CAB Review Flow

```
Retrieve Today's Changes

↓

Check Approval Status

↓

Check Time Conflicts

↓

Check Similar Historical Failures

↓

Risk Assessment

↓

CAB Report
```

Output

- Change conflicts
- Missing approvals
- Risk level
- Suggested schedule adjustments

---

# Report Generation Flow

```
User clicks

Generate Report

↓

Retrieve Current Context

↓

Generate Executive Summary

↓

Generate Incident Timeline

↓

Generate Recommendations

↓

Create Report

↓

Download PDF
```

---

# Data Sources

| Source     | Information                       |
| ---------- | --------------------------------- |
| ServiceNow | Incidents                         |
| Splunk     | Logs                              |
| Jira       | Change Requests                   |
| Teams      | Operational Messages              |
| Confluence | Runbooks and Historical Incidents |

---

# AI Boundaries

The AI is responsible for:

- Summarisation
- Correlation
- Recommendation
- Report generation

The AI is **not** responsible for:

- Restarting services
- Deploying software
- Closing incidents
- Executing scripts
- Approving operational changes

All operational decisions require human approval.

---

# Design Principles

The data flow is designed around four principles:

1. **Read-only integrations** – external systems are queried but never modified.
2. **Context aggregation** – information from multiple platforms is combined before AI analysis.
3. **Explainable recommendations** – every recommendation is based on evidence retrieved from the source systems.
4. **Human-in-the-loop** – engineers remain responsible for validating and executing operational actions.
