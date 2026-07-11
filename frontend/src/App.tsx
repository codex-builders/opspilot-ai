import { useEffect, useMemo, useState } from "react";
import type {
  CabChange,
  IncidentSummary,
  InvestigationResult as InvestigationResultData,
  OperationsDashboardData,
  TrendSeries
} from "./domain/operations";
import { operationsApi } from "./services/operationsApi";

type Page = "overview" | "incidents" | "cab";
type InvestigationState = "ready" | "running" | "complete" | "error";
type CabState = "ready" | "loading" | "analysed" | "error";
type ApprovalState = "pending" | "approved" | "rejected";
type IncidentStatusFilter = "ALL" | "ACTIVE" | "RESOLVED";
type TrendFilter = "ALL" | "SEV-1" | "SEV-2" | "SEV-3";

const pageLabels: Record<Page, string> = {
  overview: "Overview",
  incidents: "Incidents",
  cab: "CAB Review"
};

export function App() {
  const [page, setPage] = useState<Page>("overview");
  const [selectedIncidentId, setSelectedIncidentId] = useState("INC-1001");
  const [investigationState, setInvestigationState] =
    useState<InvestigationState>("ready");
  const [investigationResult, setInvestigationResult] =
    useState<InvestigationResultData | null>(null);
  const [investigationError, setInvestigationError] = useState("");
  const [approvalState, setApprovalState] = useState<ApprovalState>("pending");
  const [activeStep, setActiveStep] = useState(0);
  const [cabState, setCabState] = useState<CabState>("ready");
  const [cabError, setCabError] = useState("");
  const [cabBriefOpen, setCabBriefOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [data, setData] = useState<OperationsDashboardData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function loadDashboard() {
    setIsLoading(true);
    setLoadError("");
    try {
      setData(await operationsApi.getDashboardData());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load the operations dashboard.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  useEffect(() => {
    if (investigationState !== "running" || !data) {
      return;
    }

    setActiveStep(0);
    const timer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, Math.max(data.investigation.steps.length - 2, 0)));
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
          <h1>{loadError ? "Unable to load operational data" : "Loading operational workspace"}</h1>
          {loadError && <p>{loadError}</p>}
          {loadError && (
            <button className="primary-button" disabled={isLoading} onClick={() => void loadDashboard()} type="button">
              {isLoading ? "Retrying" : "Retry"}
            </button>
          )}
        </div>
      </div>
    );
  }

  const selectedIncident =
    data.incidents.find((incident) => incident.id === selectedIncidentId) ??
    data.incidents[0];
  const investigationStepCount = data.investigation.steps.length;

  function selectIncident(id: string) {
    setSelectedIncidentId(id);
    setInvestigationState("ready");
    setInvestigationResult(null);
    setInvestigationError("");
    setApprovalState("pending");
    setActiveStep(0);
  }

  async function runInvestigation() {
    setInvestigationState("running");
    setInvestigationResult(null);
    setInvestigationError("");
    setApprovalState("pending");
    setActiveStep(0);
    try {
      const result = await operationsApi.triageIncident(selectedIncident.id);
      setInvestigationResult(result);
      setActiveStep(Math.max(investigationStepCount - 1, 0));
      setInvestigationState("complete");
    } catch (error) {
      setInvestigationError(error instanceof Error ? error.message : "The investigation request failed.");
      setInvestigationState("error");
    }
  }

  function resetInvestigation() {
    setInvestigationState("ready");
    setInvestigationResult(null);
    setInvestigationError("");
    setApprovalState("pending");
    setActiveStep(0);
  }

  async function runCabAnalysis() {
    setCabState("loading");
    setCabError("");
    try {
      const cab = await operationsApi.getCabBriefing();
      setData((current) => current ? { ...current, cab } : current);
      setCabState("analysed");
    } catch (error) {
      setCabError(error instanceof Error ? error.message : "The CAB analysis request failed.");
      setCabState("error");
    }
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
            investigationResult={investigationResult}
            investigationError={investigationError}
            approvalState={approvalState}
            activeStep={activeStep}
            onSelectIncident={selectIncident}
            onRunInvestigation={() => void runInvestigation()}
            onResetInvestigation={resetInvestigation}
            onRejectUpdate={() => {
              setApprovalState("rejected");
              setToast("Draft rejected locally. Nothing was sent or created.");
            }}
            onApproveUpdate={() => {
              setApprovalState("approved");
              setToast("Draft approved locally. No Teams message was posted and no Jira task was created.");
            }}
          />
        )}

        {page === "cab" && (
          <CabPage
            data={data}
            state={cabState}
            error={cabError}
            briefOpen={cabBriefOpen}
            analyse={() => void runCabAnalysis()}
            backToQueue={() => {
              setCabState("ready");
              setCabError("");
              setCabBriefOpen(false);
            }}
            viewBrief={() => setCabBriefOpen((current) => !current)}
            exportBrief={() => setToast("PDF export is not connected in this MVP.")}
            approve={() => setToast("CAB brief approved locally. No notification was sent.")}
          />
        )}
      </main>

      {toast && (
        <div className="toast" role="status">
          <strong>Notice</strong>
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
  investigationResult,
  investigationError,
  approvalState,
  activeStep,
  onSelectIncident,
  onRunInvestigation,
  onResetInvestigation,
  onRejectUpdate,
  onApproveUpdate
}: {
  data: OperationsDashboardData;
  selectedIncident: IncidentSummary;
  investigationState: InvestigationState;
  investigationResult: InvestigationResultData | null;
  investigationError: string;
  approvalState: ApprovalState;
  activeStep: number;
  onSelectIncident: (incidentId: string) => void;
  onRunInvestigation: () => void;
  onResetInvestigation: () => void;
  onRejectUpdate: () => void;
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

  function changeStatusFilter(filter: IncidentStatusFilter) {
    setStatusFilter(filter);
    const nextIncidents = filter === "ALL" ? data.incidents : data.incidents.filter((incident) => incident.status === filter);
    const nextIncident = nextIncidents[0];
    if (!nextIncidents.some((incident) => incident.id === selectedIncident.id) && nextIncident) {
      onSelectIncident(nextIncident.id);
    }
  }

  return (
    <div className="page-stack">
      <section className="incident-workflow">
        <IncidentQueue
          incidents={filteredIncidents}
          allIncidentCount={data.incidents.length}
          statusFilter={statusFilter}
          onStatusFilterChange={changeStatusFilter}
          selectedIncidentId={visibleSelectedIncident.id}
          onSelectIncident={onSelectIncident}
        />
        <InvestigationWorkspace
          data={data}
          incident={visibleSelectedIncident}
          state={investigationState}
          result={investigationResult}
          error={investigationError}
          approvalState={approvalState}
          activeStep={activeStep}
          onRunInvestigation={onRunInvestigation}
          onResetInvestigation={onResetInvestigation}
          onRejectUpdate={onRejectUpdate}
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
  result,
  error,
  approvalState,
  activeStep,
  onRunInvestigation,
  onResetInvestigation,
  onRejectUpdate,
  onApproveUpdate
}: {
  data: OperationsDashboardData;
  incident: IncidentSummary;
  state: InvestigationState;
  result: InvestigationResultData | null;
  error: string;
  approvalState: ApprovalState;
  activeStep: number;
  onRunInvestigation: () => void;
  onResetInvestigation: () => void;
  onRejectUpdate: () => void;
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
                  : state === "error"
                    ? "Retry Investigation"
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

      {state === "error" && (
        <section className="alert-panel" role="alert">
          <p className="eyebrow">Investigation Failed</p>
          <h2>Backend evidence could not be retrieved</h2>
          <p>{error}</p>
          <button className="primary-button" onClick={onRunInvestigation} type="button">
            Retry Investigation
          </button>
        </section>
      )}

      {state === "complete" && result && (
        <InvestigationResult
          result={result}
          incident={incident}
          approvalState={approvalState}
          onResetInvestigation={onResetInvestigation}
          onRejectUpdate={onRejectUpdate}
          onApproveUpdate={onApproveUpdate}
        />
      )}
    </section>
  );
}

function InvestigationResult({
  result,
  incident,
  approvalState,
  onResetInvestigation,
  onRejectUpdate,
  onApproveUpdate
}: {
  result: InvestigationResultData;
  incident: IncidentSummary;
  approvalState: ApprovalState;
  onResetInvestigation: () => void;
  onRejectUpdate: () => void;
  onApproveUpdate: () => void;
}) {
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
          <p>Approval is recorded in this browser only. No message or Jira task is sent.</p>
        </div>
        <div className="approval-actions">
          <button className="secondary-button" onClick={onResetInvestigation} type="button">
            Re-run Investigation
          </button>
          <button className="secondary-button" disabled={approvalState === "rejected"} onClick={onRejectUpdate} type="button">
            Reject
          </button>
          <button className="primary-button" disabled={approvalState === "approved"} onClick={onApproveUpdate} type="button">
            {approvalState === "approved" ? "Draft Approved" : "Approve Draft"}
          </button>
        </div>
      </section>
    </>
  );
}

function CabPage({
  data,
  state,
  error,
  briefOpen,
  analyse,
  backToQueue,
  viewBrief,
  exportBrief,
  approve
}: {
  data: OperationsDashboardData;
  state: CabState;
  error: string;
  briefOpen: boolean;
  analyse: () => void;
  backToQueue: () => void;
  viewBrief: () => void;
  exportBrief: () => void;
  approve: () => void;
}) {
  const { cab } = data;

  if (state !== "analysed") {
    return (
      <div className="page-stack">
        {state === "error" && (
          <section className="alert-panel" role="alert">
            <p className="eyebrow">CAB Analysis Failed</p>
            <h2>Backend change data could not be refreshed</h2>
            <p>{error}</p>
          </section>
        )}
        <section className="overview-hero">
          <div>
            <p className="eyebrow">Change Advisory Board</p>
            <h2>Upcoming changes requiring timing, dependency, and rollback review.</h2>
            <p>
              Review scheduled changes before approval to reduce incident risk in
              production windows.
            </p>
          </div>
          <button className="primary-button" disabled={state === "loading"} onClick={analyse} type="button">
            {state === "loading" ? "Analysing Changes" : state === "error" ? "Retry Analysis" : "Analyse Changes"}
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
        <button className="primary-button" onClick={approve} type="button">
          Approve Brief
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
  const firstValue = values[0] ?? 0;
  const lastValue = values[values.length - 1] ?? 0;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 38 - ((value - min) / range) * 30;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="sparkline-block">
      <svg
        className={`sparkline ${tone}`}
        viewBox="0 0 100 42"
        role="img"
        aria-label={`Trend from ${formatTrendValue(firstValue)} to ${formatTrendValue(lastValue)}`}
      >
        <line className="sparkline-baseline" x1="0" x2="100" y1="38" y2="38" />
        <polyline points={points} />
      </svg>
      <div className="sparkline-meta">
        <span>Start {formatTrendValue(firstValue)}</span>
        <span>Now {formatTrendValue(lastValue)}</span>
      </div>
    </div>
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
  const flatValues = series.flatMap((item) => item.values);
  const chartMax = Math.max(...flatValues, 1);
  const yTicks = Array.from(
    new Set([chartMax, Math.ceil(chartMax / 2), 0])
  ).sort((a, b) => b - a);
  const totalsByPeriod = xLabels.map((_, index) =>
    series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0)
  );
  const latestTotal = totalsByPeriod[totalsByPeriod.length - 1] ?? 0;
  const peakTotal = Math.max(...totalsByPeriod, 0);
  const firstTotal = totalsByPeriod[0] ?? 0;
  const netChange = latestTotal - firstTotal;

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
      <div className="chart-summary-row" aria-label="Chart summary">
        <div>
          <span>Current open</span>
          <strong>{latestTotal}</strong>
        </div>
        <div>
          <span>Peak in range</span>
          <strong>{peakTotal}</strong>
        </div>
        <div>
          <span>Net change</span>
          <strong>{netChange > 0 ? `+${netChange}` : netChange}</strong>
        </div>
      </div>
      <svg viewBox="0 0 540 158" role="img" aria-label="Incident volume trend by open incident count">
        <text className="chart-y-axis-title" x="16" y="86" transform="rotate(-90 16 86)">
          Open incident count
        </text>
        {yTicks.map((tick) => {
          const y = chartY(tick, chartMax);
          return (
            <g key={tick}>
              <line className="chart-grid-line" x1="64" x2="500" y1={y} y2={y} />
              <text className="chart-y-tick" x="52" y={y + 4}>
                {tick}
              </text>
            </g>
          );
        })}
        {series.map((item) => {
          const lastValue = item.values[item.values.length - 1] ?? 0;
          return (
            <g key={item.label}>
              <polyline
                className={`chart-line ${item.tone}`}
                points={toChartPoints(item.values, chartMax)}
              />
              <text
                className={`chart-end-label ${item.tone}`}
                x="508"
                y={chartY(lastValue, chartMax) + 4}
              >
                {lastValue}
              </text>
            </g>
          );
        })}
        {xLabels.map((label, index) => (
          <text
            className="chart-axis-label"
            key={label}
            x={chartX(index, xLabels.length)}
            y="148"
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

function formatTrendValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function chartX(index: number, length: number) {
  return 64 + (index / Math.max(length - 1, 1)) * 436;
}

function chartY(value: number, chartMax: number) {
  return 126 - (value / Math.max(chartMax, 1)) * 96;
}

function toChartPoints(values: number[], chartMax: number) {
  return values
    .map((value, index) => {
      const x = chartX(index, values.length);
      const y = chartY(value, chartMax);
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
