import { useEffect, useMemo, useState } from "react";
import type {
  CabChange,
  IncidentSummary,
  OperationsDashboardData,
  TrendSeries
} from "./domain/operations";
import { operationsApi } from "./services/operationsApi";

type Page = "overview" | "incidents" | "cab";
type InvestigationState = "ready" | "running" | "complete";
type CabState = "ready" | "analysed";
type IncidentStatusFilter = "ALL" | "ACTIVE" | "RESOLVED";
type TrendFilter = "ALL" | "SEV-1" | "SEV-2" | "SEV-3";

const pageLabels: Record<Page, string> = {
  overview: "Overview",
  incidents: "Incidents",
  cab: "CAB Review"
};

export function App() {
  const [page, setPage] = useState<Page>("overview");
  const [selectedIncidentId, setSelectedIncidentId] = useState("INC-1042");
  const [investigationState, setInvestigationState] =
    useState<InvestigationState>("ready");
  const [activeStep, setActiveStep] = useState(0);
  const [cabState, setCabState] = useState<CabState>("ready");
  const [cabBriefOpen, setCabBriefOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [data, setData] = useState<OperationsDashboardData | null>(null);

  useEffect(() => {
    operationsApi.getDashboardData().then(setData);
  }, []);

  useEffect(() => {
    if (investigationState !== "running" || !data) {
      return;
    }

    setActiveStep(0);
    const timer = window.setInterval(() => {
      setActiveStep((current) => {
        if (current >= data.investigation.steps.length - 1) {
          window.clearInterval(timer);
          window.setTimeout(() => setInvestigationState("complete"), 500);
          return current;
        }
        return current + 1;
      });
    }, 650);

    return () => window.clearInterval(timer);
  }, [data, investigationState]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (!data) {
    return (
      <div className="loading-screen">
        <div className="panel">
          <p className="eyebrow">Operations Command Centre</p>
          <h1>Loading operational workspace</h1>
        </div>
      </div>
    );
  }

  const selectedIncident =
    data.incidents.find((incident) => incident.id === selectedIncidentId) ??
    data.incidents[0];

  function selectIncident(id: string) {
    setSelectedIncidentId(id);
    setInvestigationState("ready");
    setActiveStep(0);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">OC</div>
          <div>
            <strong>Operations</strong>
            <span>Command Centre</span>
          </div>
        </div>

        <nav aria-label="Main navigation">
          {(Object.keys(pageLabels) as Page[]).map((key) => (
            <button
              key={key}
              className={page === key ? "nav-item active" : "nav-item"}
              onClick={() => setPage(key)}
              type="button"
            >
              <span className="nav-dot" />
              {pageLabels[key]}
            </button>
          ))}
        </nav>

        <div className="connections">
          <p className="eyebrow">Connected Sources</p>
          {data.systems.map((system) => (
            <div className="connection" key={system.name}>
              <span
                className={
                  system.status === "online" ? "status-dot healthy" : "status-dot"
                }
              />
              {system.name}
            </div>
          ))}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Production Operations</p>
            <h1>{pageLabels[page]}</h1>
          </div>
          <div className="system-pill">
            <span className="status-dot healthy" />
            Systems: {data.systems.filter((system) => system.status === "online").length}/
            {data.systems.length} Online
          </div>
        </header>

        {page === "overview" && (
          <OverviewPage
            data={data}
            onOpenIncidents={() => setPage("incidents")}
            onOpenCab={() => setPage("cab")}
          />
        )}

        {page === "incidents" && (
          <IncidentsPage
            data={data}
            selectedIncident={selectedIncident}
            investigationState={investigationState}
            activeStep={activeStep}
            onSelectIncident={selectIncident}
            onRunInvestigation={() => setInvestigationState("running")}
            onResetInvestigation={() => setInvestigationState("ready")}
            onApproveUpdate={async () => {
              await Promise.all([
                operationsApi.postTeamsUpdate(),
                operationsApi.createJiraTask()
              ]);
              setToast(
                "Status update posted to Teams. Jira task OPS-482 created. Next update scheduled in 15 minutes."
              );
            }}
          />
        )}

        {page === "cab" && (
          <CabPage
            data={data}
            state={cabState}
            briefOpen={cabBriefOpen}
            analyse={() => setCabState("analysed")}
            backToQueue={() => {
              setCabState("ready");
              setCabBriefOpen(false);
            }}
            viewBrief={() => setCabBriefOpen((current) => !current)}
            exportBrief={() => setToast("CAB PDF export prepared.")}
            notify={async () => {
              await operationsApi.sendCabBrief();
              setToast("CAB risk brief sent to CAB members.");
            }}
          />
        )}
      </main>

      {toast && (
        <div className="toast" role="status">
          <strong>Success</strong>
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

function OverviewPage({
  data,
  onOpenIncidents,
  onOpenCab
}: {
  data: OperationsDashboardData;
  onOpenIncidents: () => void;
  onOpenCab: () => void;
}) {
  const activeIncident = data.incidents.find((incident) => incident.status === "ACTIVE");
  const [trendPeriodId, setTrendPeriodId] = useState(data.incidentTrend.periods[0]?.id ?? "");
  const [trendFilter, setTrendFilter] = useState<TrendFilter>("ALL");
  const trendPeriod =
    data.incidentTrend.periods.find((period) => period.id === trendPeriodId) ??
    data.incidentTrend.periods[0];
  const trendSeries =
    trendFilter === "ALL"
      ? trendPeriod.series
      : trendPeriod.series.filter((series) => series.label === trendFilter);
  const severityCounts = [
    { label: "SEV-1", value: data.incidents.filter((incident) => incident.severity === "SEV-1").length, tone: "critical" },
    { label: "SEV-2", value: data.incidents.filter((incident) => incident.severity === "SEV-2").length, tone: "warning" },
    { label: "SEV-3", value: data.incidents.filter((incident) => incident.severity === "SEV-3").length, tone: "neutral" }
  ] as const;

  return (
    <div className="page-stack">
      <section className="overview-hero">
        <div>
          <p className="eyebrow">Operational Summary</p>
          <h2>{data.morningBriefing.summary}</h2>
          <p>{data.morningBriefing.context}</p>
        </div>
        <div className="hero-actions">
          <button className="primary-button" onClick={onOpenIncidents} type="button">
            Open Incident Queue
          </button>
          <button className="secondary-button" onClick={onOpenCab} type="button">
            Review Changes
          </button>
        </div>
      </section>

      <section className="overview-metrics">
        {data.metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            context={metric.context}
            tone={metric.tone}
            trend={metric.trend}
          />
        ))}
      </section>

      <section className="overview-grid">
        <div className="panel overview-wide">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Incident Volume</p>
              <h2>Overnight trend by severity</h2>
            </div>
          </div>
          <TrendPanel
            periodLabel={trendPeriod.label}
            series={trendSeries}
            xLabels={trendPeriod.xLabels}
            periodOptions={data.incidentTrend.periods.map((period) => ({
              id: period.id,
              label: period.label
            }))}
            selectedPeriodId={trendPeriod.id}
            selectedSeverity={trendFilter}
            onPeriodChange={setTrendPeriodId}
            onSeverityChange={setTrendFilter}
          />
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Service Health</p>
              <h2>Current production status</h2>
            </div>
          </div>
          <div className="service-health-list">
            {data.morningBriefing.serviceHealth.map((health) => (
              <div className="service-health-row" key={health.service}>
                <span>{health.service}</span>
                <HealthBar status={health.status} />
                <strong className={healthTone(health.status)}>{health.status}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Incident Mix</p>
              <h2>Severity distribution</h2>
            </div>
          </div>
          <div className="bar-list">
            {severityCounts.map((item) => (
              <BarRow
                key={item.label}
                label={item.label}
                value={item.value}
                max={data.incidents.length}
                tone={item.tone}
              />
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Priority Incident</p>
              <h2>{activeIncident?.id ?? "No active incident"}</h2>
            </div>
            {activeIncident && (
              <StatusBadge label={activeIncident.severity} tone={severityTone(activeIncident.severity)} />
            )}
          </div>
          {activeIncident ? (
            <div className="priority-incident">
              <strong>{activeIncident.title}</strong>
              <span>{activeIncident.impact}</span>
              <button className="primary-button" onClick={onOpenIncidents} type="button">
                Investigate
              </button>
            </div>
          ) : (
            <p>No active production incidents require investigation.</p>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Change Risk</p>
              <h2>{data.cab.conflictsFound} conflicts found</h2>
            </div>
          </div>
          <div className="risk-summary">
            <div className="risk-score-small">
              <strong>{data.cab.riskScore}</strong>
              <span>/ 100</span>
            </div>
            <p>{data.cab.conflictTitle}</p>
            <button className="secondary-button" onClick={onOpenCab} type="button">
              Open CAB Review
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function IncidentsPage({
  data,
  selectedIncident,
  investigationState,
  activeStep,
  onSelectIncident,
  onRunInvestigation,
  onResetInvestigation,
  onApproveUpdate
}: {
  data: OperationsDashboardData;
  selectedIncident: IncidentSummary;
  investigationState: InvestigationState;
  activeStep: number;
  onSelectIncident: (incidentId: string) => void;
  onRunInvestigation: () => void;
  onResetInvestigation: () => void;
  onApproveUpdate: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<IncidentStatusFilter>("ALL");
  const filteredIncidents =
    statusFilter === "ALL"
      ? data.incidents
      : data.incidents.filter((incident) => incident.status === statusFilter);
  const visibleSelectedIncident = filteredIncidents.some(
    (incident) => incident.id === selectedIncident.id
  )
    ? selectedIncident
    : filteredIncidents[0] ?? selectedIncident;

  return (
    <div className="page-stack">
      <section className="incident-workflow">
        <IncidentQueue
          incidents={filteredIncidents}
          allIncidentCount={data.incidents.length}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          selectedIncidentId={visibleSelectedIncident.id}
          onSelectIncident={onSelectIncident}
        />
        <InvestigationWorkspace
          data={data}
          incident={visibleSelectedIncident}
          state={investigationState}
          activeStep={activeStep}
          onRunInvestigation={onRunInvestigation}
          onResetInvestigation={onResetInvestigation}
          onApproveUpdate={onApproveUpdate}
        />
      </section>
    </div>
  );
}

function IncidentQueue({
  incidents,
  allIncidentCount,
  statusFilter,
  onStatusFilterChange,
  selectedIncidentId,
  onSelectIncident
}: {
  incidents: IncidentSummary[];
  allIncidentCount: number;
  statusFilter: IncidentStatusFilter;
  onStatusFilterChange: (filter: IncidentStatusFilter) => void;
  selectedIncidentId: string;
  onSelectIncident: (incidentId: string) => void;
}) {
  return (
    <section className="panel incident-queue">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Incident Queue</p>
          <h2>{incidents.length} of {allIncidentCount} tickets shown</h2>
        </div>
      </div>

      <div className="segmented-control" aria-label="Filter incidents by status">
        {(["ALL", "ACTIVE", "RESOLVED"] as IncidentStatusFilter[]).map((filter) => (
          <button
            className={statusFilter === filter ? "active" : ""}
            key={filter}
            onClick={() => onStatusFilterChange(filter)}
            type="button"
          >
            {filter === "ALL" ? "All" : filter}
          </button>
        ))}
      </div>

      <div className="ticket-list">
        {incidents.length > 0 ? incidents.map((incident) => (
          <button
            className={
              selectedIncidentId === incident.id ? "ticket-row selected" : "ticket-row"
            }
            key={incident.id}
            onClick={() => onSelectIncident(incident.id)}
            type="button"
          >
            <span>
              <code>{incident.id}</code>
              <strong>{incident.title}</strong>
            </span>
            <StatusBadge label={incident.severity} tone={severityTone(incident.severity)} />
            <span>{incident.affectedService}</span>
            <span>{incident.owner}</span>
            <span>{incident.lastUpdated}</span>
            <StatusBadge
              label={incident.status}
              tone={incident.status === "ACTIVE" ? "critical" : "success"}
            />
          </button>
        )) : (
          <div className="empty-state">
            No incidents match the selected status.
          </div>
        )}
      </div>
    </section>
  );
}

function InvestigationWorkspace({
  data,
  incident,
  state,
  activeStep,
  onRunInvestigation,
  onResetInvestigation,
  onApproveUpdate
}: {
  data: OperationsDashboardData;
  incident: IncidentSummary;
  state: InvestigationState;
  activeStep: number;
  onRunInvestigation: () => void;
  onResetInvestigation: () => void;
  onApproveUpdate: () => void;
}) {
  const visibleActivity = useMemo(() => {
    if (state === "ready") {
      return data.investigation.activityFeed.slice(0, 2);
    }
    return data.investigation.activityFeed.slice(
      0,
      Math.min(activeStep + 2, data.investigation.activityFeed.length)
    );
  }, [activeStep, data, state]);

  const canInvestigate = incident.status === "ACTIVE";

  return (
    <section className="workspace">
      <div className="incident-header">
        <div>
          <p className="eyebrow">
            {incident.id} / {incident.environment}
          </p>
          <h2>{incident.title}</h2>
          <p>{incident.description}</p>
        </div>
        <div className="header-badges">
          <StatusBadge label={incident.severity} tone={severityTone(incident.severity)} />
          <StatusBadge
            label={incident.status}
            tone={incident.status === "ACTIVE" ? "critical" : "success"}
          />
        </div>
      </div>

      <div className="split-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Ticket Details</p>
              <h2>{incident.affectedService}</h2>
            </div>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Started</dt>
              <dd>{incident.startTime}</dd>
            </div>
            <div>
              <dt>Impact</dt>
              <dd>{incident.impact}</dd>
            </div>
            <div>
              <dt>Assignment group</dt>
              <dd>{incident.assignmentGroup}</dd>
            </div>
            <div>
              <dt>Correlation signal</dt>
              <dd>{incident.signalScore} / 100</dd>
            </div>
          </dl>
          <button
            className="primary-button block"
            disabled={!canInvestigate || state === "running" || state === "complete"}
            onClick={onRunInvestigation}
            type="button"
          >
            {!canInvestigate
              ? "Incident Resolved"
              : state === "running"
                ? "Investigation Running"
                : state === "complete"
                  ? "Investigation Complete"
                : "Run Investigation"}
          </button>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Evidence Collection</p>
              <h2>Investigation Progress</h2>
            </div>
            <ProgressRing
              current={state === "running" ? activeStep + 1 : state === "complete" ? data.investigation.steps.length : 0}
              total={data.investigation.steps.length}
            />
          </div>
          <div className="progress-list">
            {data.investigation.steps.map((step, index) => (
              <div
                className={
                  state === "complete" || index < activeStep
                    ? "progress-step done"
                    : index === activeStep && state === "running"
                      ? "progress-step active"
                      : "progress-step"
                }
                key={step.label}
              >
                <span className="step-marker" />
                <div>
                  <strong>{step.label}</strong>
                  <span>{step.detail}</span>
                </div>
                <code>{step.source}</code>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Live Activity</p>
            <h2>Cross-system evidence collection</h2>
          </div>
        </div>
        <div className="log-panel">
          {visibleActivity.map((item) => (
            <code key={item}>{item}</code>
          ))}
        </div>
      </section>

      {state === "complete" && (
        <InvestigationResult
          data={data}
          incident={incident}
          onResetInvestigation={onResetInvestigation}
          onApproveUpdate={onApproveUpdate}
        />
      )}
    </section>
  );
}

function InvestigationResult({
  data,
  incident,
  onResetInvestigation,
  onApproveUpdate
}: {
  data: OperationsDashboardData;
  incident: IncidentSummary;
  onResetInvestigation: () => void;
  onApproveUpdate: () => void;
}) {
  const { result } = data.investigation;

  return (
    <>
      <section className="split-grid equal">
        <div className="panel result-panel">
          <p className="eyebrow">Probable Root Cause</p>
          <h2>{result.probableRootCause}</h2>
          <p>{result.explanation}</p>
        </div>
        <div className="panel">
          <p className="eyebrow">Evidence Sources</p>
          <ul className="check-list">
            {result.evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="split-grid equal">
        <div className="panel">
          <p className="eyebrow">Recommended Actions</p>
          <ol className="number-list">
            {result.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
        <div className="panel">
          <p className="eyebrow">Incident Timeline</p>
          <h2>{result.similarIncident.id} matched as a historical pattern</h2>
          <p>
            {result.similarIncident.summary}. Resolution:{" "}
            {result.similarIncident.resolution}.
          </p>
          <div className="timeline">
            {result.timeline.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="approval-panel">
        <div>
          <p className="eyebrow">Controlled Communication</p>
          <h2>Teams update for {incident.id}</h2>
          <textarea
            aria-label="Teams update preview"
            defaultValue={result.teamsUpdateDraft}
          />
        </div>
        <div className="approval-actions">
          <button className="secondary-button" onClick={onResetInvestigation} type="button">
            Re-run Investigation
          </button>
          <button className="secondary-button" type="button">
            Reject
          </button>
          <button className="primary-button" onClick={onApproveUpdate} type="button">
            Approve & Post Update
          </button>
        </div>
      </section>
    </>
  );
}

function CabPage({
  data,
  state,
  briefOpen,
  analyse,
  backToQueue,
  viewBrief,
  exportBrief,
  notify
}: {
  data: OperationsDashboardData;
  state: CabState;
  briefOpen: boolean;
  analyse: () => void;
  backToQueue: () => void;
  viewBrief: () => void;
  exportBrief: () => void;
  notify: () => void;
}) {
  const { cab } = data;

  if (state === "ready") {
    return (
      <div className="page-stack">
        <section className="overview-hero">
          <div>
            <p className="eyebrow">Change Advisory Board</p>
            <h2>Upcoming changes requiring timing, dependency, and rollback review.</h2>
            <p>
              Review scheduled changes before approval to reduce incident risk in
              production windows.
            </p>
          </div>
          <button className="primary-button" onClick={analyse} type="button">
            Analyse Changes
          </button>
        </section>

        <section className="cab-summary-grid">
          <MetricCard label="Scheduled Changes" value={String(cab.changes.length)} context="Next production window" />
          <MetricCard label="High Risk" value={String(cab.changes.filter((change) => change.risk === "High").length)} context="Require CAB conditions" tone="warning" />
          <MetricCard label="Known Conflicts" value={String(cab.conflictsFound)} context="Before analysis close" tone="critical" />
        </section>

        <section className="cab-review-grid">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Approval Focus</p>
                <h2>Review queue before the {cab.meetingTime} meeting</h2>
              </div>
            </div>
            <div className="cab-focus-list">
              {cab.focusItems.map((item) => (
                <div key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
              ))}
            </div>
          </div>
          <ChangeTable changes={cab.changes} />
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="incident-header">
        <div>
          <p className="eyebrow">CAB Risk Analysis</p>
          <h2>
            {cab.conflictsFound} conflicts found before the {cab.meetingTime} CAB
            meeting.
          </h2>
        </div>
        <div className="header-badges">
          <StatusBadge label={`${cab.conflictsFound} Conflicts`} tone="warning" />
          <button className="secondary-button" onClick={backToQueue} type="button">
            Back to Review Queue
          </button>
        </div>
      </section>

      <section className="alert-panel">
        <p className="eyebrow">Deployment Conflict</p>
        <h2>{cab.conflictTitle}</h2>
        <p>
          {cab.conflictSummary} Recommendation: {cab.recommendation}
        </p>
      </section>

      <section className="split-grid equal">
        <div className="panel">
          <p className="eyebrow">Change Risk Score</p>
          <div className="risk-meter">
            <strong>{cab.riskScore} / 100</strong>
            <span>{cab.riskChangeId} Risk: HIGH</span>
          </div>
        </div>
        <div className="panel">
          <p className="eyebrow">Risk Factors</p>
          <ul className="plain-list">
            {cab.riskFactors.map((factor) => (
              <li key={factor}>{factor}</li>
            ))}
          </ul>
        </div>
      </section>

      <ChangeTable changes={cab.changes} />

      {briefOpen && (
        <section className="panel">
          <p className="eyebrow">CAB Meeting Brief</p>
          <h2>Recommended CAB decisions</h2>
          <div className="brief-grid">
            {cab.changes.map((change) => (
              <div key={change.id}>
                <code>{change.id}</code>
                <strong>{change.recommendation}</strong>
                <span>{change.service} / {change.window}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="footer-actions">
        <button className="secondary-button" onClick={viewBrief} type="button">
          {briefOpen ? "Hide Full Brief" : "View Full Brief"}
        </button>
        <button className="secondary-button" onClick={exportBrief} type="button">
          Export PDF
        </button>
        <button className="primary-button" onClick={notify} type="button">
          Send to CAB Members
        </button>
      </div>
    </div>
  );
}

function ChangeTable({ changes }: { changes: CabChange[] }) {
  return (
    <section className="panel">
      <p className="eyebrow">Change Register</p>
      <div className="cab-table">
        <div className="cab-head">
          <span>Change</span>
          <span>Service</span>
          <span>Window</span>
          <span>Risk</span>
          <span>Conflict</span>
          <span>Recommendation</span>
        </div>
        {changes.map((change) => (
          <div className="cab-row" key={change.id}>
            <code>{change.id}</code>
            <span>{change.service}</span>
            <span>{change.window}</span>
            <StatusBadge label={change.risk} tone={riskTone(change.risk)} />
            <span>{change.conflict}</span>
            <span>{change.recommendation}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  context,
  tone = "neutral",
  trend
}: {
  label: string;
  value: string;
  context?: string;
  tone?: "neutral" | "critical" | "warning" | "success";
  trend?: number[];
}) {
  return (
    <div className={`metric-card ${tone}`}>
      <div className="metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        {context && <small>{context}</small>}
      </div>
      {trend && <Sparkline values={trend} tone={tone} />}
    </div>
  );
}

function Sparkline({
  values,
  tone
}: {
  values: number[];
  tone: "neutral" | "critical" | "warning" | "success";
}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 38 - ((value - min) / range) * 30;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className={`sparkline ${tone}`} viewBox="0 0 100 42" role="img" aria-label="Metric trend">
      <polyline points={points} />
    </svg>
  );
}

function TrendPanel({
  periodLabel,
  series,
  xLabels,
  periodOptions,
  selectedPeriodId,
  selectedSeverity,
  onPeriodChange,
  onSeverityChange
}: {
  periodLabel: string;
  series: TrendSeries[];
  xLabels: string[];
  periodOptions: Array<{ id: string; label: string }>;
  selectedPeriodId: string;
  selectedSeverity: TrendFilter;
  onPeriodChange: (periodId: string) => void;
  onSeverityChange: (filter: TrendFilter) => void;
}) {
  return (
    <div className="trend-panel">
      <div className="chart-toolbar">
        <div className="segmented-control" aria-label="Filter chart by severity">
          {(["ALL", "SEV-1", "SEV-2", "SEV-3"] as TrendFilter[]).map((filter) => (
            <button
              className={selectedSeverity === filter ? "active" : ""}
              key={filter}
              onClick={() => onSeverityChange(filter)}
              type="button"
            >
              {filter === "ALL" ? "All severities" : filter}
            </button>
          ))}
        </div>
        <label className="chart-select">
          <span>Range</span>
          <select
            onChange={(event) => onPeriodChange(event.target.value)}
            value={selectedPeriodId}
          >
            {periodOptions.map((period) => (
              <option key={period.id} value={period.id}>
                {period.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <svg viewBox="0 0 520 180" role="img" aria-label="Incident volume trend">
        {[0, 1, 2, 3].map((line) => (
          <line
            key={line}
            className="chart-grid-line"
            x1="28"
            x2="500"
            y1={30 + line * 38}
            y2={30 + line * 38}
          />
        ))}
        {series.map((item) => (
          <polyline
            className={`chart-line ${item.tone}`}
            key={item.label}
            points={toChartPoints(item.values, series)}
          />
        ))}
        {xLabels.map((label, index) => (
          <text
            className="chart-axis-label"
            key={label}
            x={28 + (index / Math.max(xLabels.length - 1, 1)) * 472}
            y="170"
          >
            {label}
          </text>
        ))}
      </svg>
      <div className="chart-legend">
        <strong>{periodLabel}</strong>
        {series.map((item) => (
          <span key={item.label}>
            <i className={item.tone} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function toChartPoints(values: number[], series: TrendSeries[]) {
  const max = Math.max(...series.flatMap((item) => item.values), 1);
  return values
    .map((value, index) => {
      const x = 28 + (index / Math.max(values.length - 1, 1)) * 472;
      const y = 144 - (value / max) * 112;
      return `${x},${y}`;
    })
    .join(" ");
}

function HealthBar({ status }: { status: "Red" | "Amber" | "Green" | "Grey" }) {
  const value = status === "Green" ? 96 : status === "Amber" ? 68 : status === "Red" ? 34 : 12;
  return (
    <span className="health-bar" aria-label={`${status} status`}>
      <span className={healthTone(status)} style={{ width: `${value}%` }} />
    </span>
  );
}

function BarRow({
  label,
  value,
  max,
  tone
}: {
  label: string;
  value: number;
  max: number;
  tone: "critical" | "warning" | "neutral";
}) {
  const width = `${Math.max((value / Math.max(max, 1)) * 100, 4)}%`;

  return (
    <div className="bar-row">
      <span>{label}</span>
      <div className="bar-track">
        <span className={tone} style={{ width }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function ProgressRing({ current, total }: { current: number; total: number }) {
  const percent = Math.round((current / total) * 100);
  return (
    <div className="progress-ring" aria-label={`Progress ${percent} percent`}>
      {percent}%
    </div>
  );
}

function HealthRow({
  label,
  status
}: {
  label: string;
  status: "Red" | "Amber" | "Green" | "Grey";
}) {
  const tone =
    status === "Red" ? "critical" : status === "Amber" ? "warning" : "success";

  return (
    <div className="health-row">
      <span>{label}</span>
      <strong className={tone}>{status}</strong>
    </div>
  );
}

function healthTone(status: "Red" | "Amber" | "Green" | "Grey") {
  return status === "Red" ? "critical" : status === "Amber" ? "warning" : status === "Green" ? "success" : "neutral";
}

function StatusBadge({
  label,
  tone
}: {
  label: string;
  tone: "critical" | "warning" | "success" | "neutral";
}) {
  return <span className={`mini-badge ${tone}`}>{label}</span>;
}

function severityTone(severity: IncidentSummary["severity"]) {
  return severity === "SEV-1" ? "critical" : severity === "SEV-2" ? "warning" : "neutral";
}

function riskTone(risk: CabChange["risk"]) {
  return risk === "High" ? "critical" : risk === "Medium" ? "warning" : "success";
}
