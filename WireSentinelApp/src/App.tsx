import { useEffect, useMemo, useState } from 'react';
import type { UiPath, UiPathSDKConfig } from '@uipath/uipath-typescript/core';
import { Entities } from '@uipath/uipath-typescript/entities';
import { TaskStatus, Tasks, TaskType } from '@uipath/uipath-typescript/tasks';
import {
  ReviewWorkspace,
  money,
  readReasonCodes,
  recommendedDecision,
  text,
  useWireSentinelCopilot,
  type RecordValue,
  type ReviewCase,
  type ReviewOutcome,
} from '@wiresentinel/cockpit-ui';
import {
  filterCaseQueue,
  isClosedCase,
  isReviewNowCase,
  paginateCaseQueue,
  sortCaseQueue,
  type CaseQueueFilter,
  type CaseQueueItem,
} from './caseQueue';
import { AuthProvider, useAuth } from './hooks/useAuth';

const ENTITY = {
  cases: import.meta.env.VITE_WIRESENTINEL_CASE_ENTITY_ID ?? '',
  documents: import.meta.env.VITE_WIRESENTINEL_DOCUMENT_ENTITY_ID ?? '',
  audit: import.meta.env.VITE_WIRESENTINEL_AUDIT_ENTITY_ID ?? '',
  policy: import.meta.env.VITE_WIRESENTINEL_POLICY_ENTITY_ID ?? '',
  banking: import.meta.env.VITE_WIRESENTINEL_BANKING_ENTITY_ID ?? '',
} as const;

const authConfig: UiPathSDKConfig = {
  clientId: import.meta.env.VITE_UIPATH_CLIENT_ID,
  orgName: import.meta.env.VITE_UIPATH_ORG_NAME,
  tenantName: import.meta.env.VITE_UIPATH_TENANT_NAME,
  baseUrl: import.meta.env.VITE_UIPATH_BASE_URL,
  redirectUri: window.location.origin + window.location.pathname,
  scope: import.meta.env.VITE_UIPATH_SCOPE,
};

type TaskValue = {
  id: number;
  folderId: number;
  title: string;
  type: TaskType;
  status: TaskStatus;
  action?: string;
  data?: RecordValue | null;
  complete: (options: unknown) => Promise<unknown>;
};

type CursorPage<T> = {
  items?: T[];
  hasNextPage?: boolean;
  nextCursor?: string;
};

function recordNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sameCase(record: RecordValue, caseRecord: RecordValue) {
  const left = text(record.CaseKey ?? record.caseId, '');
  const right = text(caseRecord.CaseKey ?? caseRecord.caseId, '');
  return Boolean(left && right && left === right);
}

function taskMatchesCase(task: TaskValue, caseRecord: RecordValue) {
  if (sameCase(task.data ?? {}, caseRecord)) return true;
  const caseKey = text(caseRecord.CaseKey ?? caseRecord.caseId, '').trim();
  return Boolean(caseKey && task.title.toLowerCase().includes(caseKey.toLowerCase()));
}

function taskCanCompleteFromCockpit(task: TaskValue) {
  if (task.type === TaskType.App) return true;
  return task.type === TaskType.Form && /customer verification|customer review/i.test(task.title);
}

function taskOutcome(task?: TaskValue): ReviewOutcome | undefined {
  const value = text(task?.action ?? task?.data?.reviewOutcome, '');
  if (value === 'Approve' || value === 'Reject' || value === 'Escalate') return value;
  return undefined;
}

function buildActionCenterUrl(taskId: number) {
  const base = new URL(authConfig.baseUrl);
  let host = base.hostname;
  if (host === 'api.uipath.com') host = 'cloud.uipath.com';
  else if (host.endsWith('.api.uipath.com')) host = host.replace('.api.uipath.com', '.uipath.com');
  else if (host.startsWith('api.')) host = host.slice(4);
  const origin = `${base.protocol}//${host}`;
  const org = encodeURIComponent(authConfig.orgName);
  const tenant = encodeURIComponent(authConfig.tenantName);
  return `${origin}/${org}/${tenant}/actions_/current-task/tasks/${taskId}`;
}

function toReviewCase(
  selected: RecordValue,
  documents: RecordValue[],
  auditEvents: RecordValue[],
): ReviewCase {
  const policyEvidence = text(
    selected.PolicyEvidence ?? selected.PolicyResult ?? selected.PolicySummary,
    '{}',
  );
  const ixpEvidence = text(
    selected.IxpEvidence ?? selected.IXPEvidence ?? selected.DocumentEvidence,
    JSON.stringify({ documents: documents.length, status: 'Linked from Data Fabric' }),
  );
  const riskLevel = text(selected.RiskLevel, 'Unknown');
  return {
    caseId: text(selected.CaseKey ?? selected.Id),
    requestId: text(selected.RequestId),
    customerId: text(selected.CustomerId, ''),
    amount: recordNumber(selected.Amount),
    currency: text(selected.Currency, 'USD'),
    beneficiaryName: text(selected.BeneficiaryName),
    beneficiaryCountry: text(selected.BeneficiaryCountry),
    riskScore: recordNumber(selected.RiskScore),
    riskLevel,
    status: text(selected.Status, 'Awaiting review'),
    finalDecision: text(selected.FinalDecision, ''),
    recommendedDecision: text(
      selected.DeterministicRecommendation ?? selected.RecommendedDecision,
      recommendedDecision(riskLevel, selected.FinalDecision),
    ),
    reasonCodes: readReasonCodes(policyEvidence),
    policyEvidence,
    ixpEvidence,
    reviewMode: text(selected.ReviewMode, `${riskLevel} wire review`),
    correlationId: text(selected.CorrelationId, ''),
    maestroInstanceId: text(selected.MaestroInstanceId, ''),
    documents: documents.map((document) => ({
      id: text(document.Id ?? document.DocumentKey),
      fileName: text(document.FileName),
      documentType: text(document.DocumentType, 'Supporting document'),
      classificationConfidence: recordNumber(document.ClassificationConfidence),
      extractionConfidence: recordNumber(document.ExtractionConfidence),
      isSupported: Boolean(document.IsSupported ?? true),
      quarantineReason: text(document.QuarantineReason, ''),
    })),
    auditEvents: auditEvents.map((event) => ({
      id: text(event.Id ?? event.EventKey),
      eventType: text(event.EventType, 'Recorded event'),
      outcome: text(event.Outcome ?? event.Summary ?? event.Description, 'Recorded'),
      actor: text(event.Actor, 'WireSentinel'),
      actorType: text(event.ActorType, 'Automation'),
      occurredAt: text(event.OccurredAt ?? event.EventTime ?? event.CreateTime, ''),
    })),
  };
}

function toQueueItem(record: RecordValue, pendingTasks: TaskValue[]): CaseQueueItem<RecordValue> {
  const matchingTasks = pendingTasks.filter((task) => taskMatchesCase(task, record));
  return {
    id: text(record.Id ?? record.CaseKey),
    caseKey: text(record.CaseKey ?? record.Id),
    requestId: text(record.RequestId, ''),
    beneficiary: text(record.BeneficiaryName),
    beneficiaryCountry: text(record.BeneficiaryCountry, ''),
    amount: recordNumber(record.Amount),
    currency: text(record.Currency, 'USD'),
    riskLevel: text(record.RiskLevel, 'Unknown'),
    riskScore: recordNumber(record.RiskScore),
    status: text(record.Status, 'Awaiting review'),
    actionReady: matchingTasks.some(taskCanCompleteFromCockpit),
    hasPendingTask: matchingTasks.length > 0,
    record,
  };
}

function Shield() {
  return <div className="cockpit-shield" aria-hidden="true">WS</div>;
}

function SignIn() {
  const { isAuthenticated, isLoading, error, login } = useAuth();
  if (isAuthenticated) return null;
  return (
    <main className="cockpit-signin">
      <section>
        <Shield />
        <p>UIPATH MAESTRO · IXP · ACTION CENTER</p>
        <h1>WireSentinel</h1>
        <h2>Every wire decision, explained.</h2>
        <p className="signin-copy">
          Open the live portfolio, inspect IXP evidence and deterministic policy, ask the
          grounded conversational agent, and complete the human gate that resumes Maestro.
        </p>
        {error && <div className="cockpit-error">{error}</div>}
        <button disabled={isLoading} onClick={() => void login()}>
          {isLoading ? 'Connecting…' : 'Open live wire portfolio'}
        </button>
        <small>Demo tenant · synthetic wire operations</small>
      </section>
    </main>
  );
}

function LiveReviewWorkspace({
  sdk,
  reviewCase,
  linkedTask,
  selectedTask,
  busy,
  completedOutcome,
  onDecision,
}: {
  sdk: UiPath;
  reviewCase: ReviewCase;
  linkedTask?: TaskValue;
  selectedTask?: TaskValue;
  busy: boolean;
  completedOutcome?: ReviewOutcome;
  onDecision: (outcome: ReviewOutcome, rationale: string) => Promise<void>;
}) {
  const copilot = useWireSentinelCopilot({ sdk, reviewCase });
  const isPendingLinkedTask = linkedTask && linkedTask.status !== TaskStatus.Completed;
  const specializedTask = isPendingLinkedTask && !selectedTask ? linkedTask : undefined;
  return (
    <ReviewWorkspace
      reviewCase={reviewCase}
      surface="web"
      taskLabel={
        selectedTask
          ? `Action #${selectedTask.id} · ready in this cockpit`
          : specializedTask
            ? `Action #${specializedTask.id} · specialized Action Center review`
            : linkedTask
              ? `Action #${linkedTask.id} · completed`
              : 'No pending human task linked'
      }
      busy={busy}
      completedOutcome={completedOutcome}
      canDecide={Boolean(selectedTask)}
      decisionUnavailableReason={
        specializedTask
          ? 'This task uses specialized compliance outcomes and must be completed in Action Center.'
          : linkedTask
            ? 'This Action Center task is completed and is now read only.'
            : 'This case is read only because it has no pending Action Center task.'
      }
      actionCenterUrl={specializedTask ? buildActionCenterUrl(specializedTask.id) : undefined}
      copilotState={copilot.state}
      copilotStatusLabel={copilot.statusLabel}
      copilotAgentLabel={copilot.agentLabel}
      copilotStreamingText={copilot.streamingText}
      onRetryCopilot={copilot.retry}
      onDecision={onDecision}
      onAskCopilot={copilot.ask}
    />
  );
}

function Cockpit() {
  const { sdk, isAuthenticated, logout } = useAuth();
  const entities = useMemo(() => new Entities(sdk), [sdk]);
  const tasks = useMemo(() => new Tasks(sdk), [sdk]);
  const [records, setRecords] = useState<Record<string, RecordValue[]>>({});
  const [taskItems, setTaskItems] = useState<TaskValue[]>([]);
  const [selected, setSelected] = useState<RecordValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [completedByCase, setCompletedByCase] = useState<Record<string, ReviewOutcome>>({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CaseQueueFilter>('review');
  const [page, setPage] = useState(1);
  const [queueOpen, setQueueOpen] = useState(false);

  async function read(entityId: string) {
    const items: RecordValue[] = [];
    let cursor: string | undefined;
    do {
      const options = {
        pageSize: 50,
        ...(cursor ? { cursor } : { jumpToPage: 1 }),
      } as Parameters<typeof entities.queryRecordsById>[1];
      const result = await entities.queryRecordsById(entityId, options) as unknown as CursorPage<RecordValue>;
      items.push(...(result.items ?? []));
      cursor = result.hasNextPage ? result.nextCursor : undefined;
    } while (cursor);
    return items;
  }

  async function readTasks() {
    const items: TaskValue[] = [];
    let cursor: string | undefined;
    do {
      const options = {
        pageSize: 50,
        ...(cursor ? { cursor } : {}),
      } as Parameters<typeof tasks.getAll>[0];
      const result = await tasks.getAll(options) as unknown as CursorPage<TaskValue>;
      items.push(...(result.items ?? []));
      cursor = result.hasNextPage ? result.nextCursor : undefined;
    } while (cursor);
    return items;
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [cases, documents, audit, policy, banking, liveTasks] = await Promise.all([
        read(ENTITY.cases),
        read(ENTITY.documents),
        read(ENTITY.audit),
        read(ENTITY.policy),
        read(ENTITY.banking),
        readTasks(),
      ]);
      const pendingTasks = liveTasks.filter((task) => task.status !== TaskStatus.Completed);
      const sortedCases = sortCaseQueue(
        cases.map((record) => toQueueItem(record, pendingTasks)),
      ).map((item) => item.record);
      setRecords({ cases: sortedCases, documents, audit, policy, banking });
      setTaskItems(liveTasks);
      setSelected((current) => (
        sortedCases.find((item) => item.Id === current?.Id) ?? sortedCases[0] ?? null
      ));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load live UiPath data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [isAuthenticated]);

  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  if (!isAuthenticated) return <SignIn />;

  const cases = records.cases ?? [];
  const pendingTasks = taskItems.filter((task) => task.status !== TaskStatus.Completed);
  const queueItems = sortCaseQueue(cases.map((record) => toQueueItem(record, pendingTasks)));
  const filteredQueue = filterCaseQueue(queueItems, search, filter);
  const pagedQueue = paginateCaseQueue(filteredQueue, page);
  const reviewCount = queueItems.filter(isReviewNowCase).length;
  const closedCount = queueItems.filter(isClosedCase).length;
  const documents = (records.documents ?? []).filter((item) => selected && sameCase(item, selected));
  const audit = (records.audit ?? []).filter((item) => selected && sameCase(item, selected));
  const reviewCase = selected ? toReviewCase(selected, documents, audit) : null;
  const matchingTasks = taskItems.filter((task) => Boolean(selected && taskMatchesCase(task, selected)));
  const pendingLinkedTask = matchingTasks.find((task) => task.status !== TaskStatus.Completed);
  const completedLinkedTask = matchingTasks.find((task) => task.status === TaskStatus.Completed);
  const linkedTask = pendingLinkedTask ?? completedLinkedTask;
  const selectedTask = pendingLinkedTask && taskCanCompleteFromCockpit(pendingLinkedTask)
    ? pendingLinkedTask
    : undefined;
  const completedOutcome = reviewCase
    ? completedByCase[reviewCase.caseId] ?? taskOutcome(completedLinkedTask)
    : undefined;

  async function complete(outcome: ReviewOutcome, rationale: string) {
    if (!selectedTask || !reviewCase) {
      throw new Error('No live pending Action Center task is linked to this case.');
    }
    setBusy(true);
    setError('');
    const data = {
      ...(selectedTask.data ?? {}),
      reviewerRationale: rationale,
      reviewOutcome: outcome,
    };
    try {
      if (selectedTask.type === TaskType.App) {
        await selectedTask.complete({ type: TaskType.App, data, action: outcome });
      } else if (selectedTask.type === TaskType.Form) {
        await selectedTask.complete({ type: TaskType.Form, data, action: outcome });
      } else if (selectedTask.type === TaskType.External) {
        await selectedTask.complete({ type: TaskType.External, action: outcome });
      } else {
        throw new Error(`Unsupported Action Center task type: ${selectedTask.type}`);
      }
      setCompletedByCase((current) => ({ ...current, [reviewCase.caseId]: outcome }));
      window.setTimeout(() => void load(), 3000);
    } catch (cause) {
      const message = cause instanceof Error
        ? cause.message
        : 'Unable to complete the Action Center task.';
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }

  function chooseCase(item: CaseQueueItem<RecordValue>) {
    setSelected(item.record);
    setQueueOpen(false);
  }

  return (
    <div className="cockpit-shell">
      <header className="cockpit-bar">
        <div className="cockpit-brand">
          <Shield />
          <div><b>WireSentinel</b><span>Operations cockpit</span></div>
        </div>
        <div className="cockpit-health">
          <i />
          Live UiPath data
          <span>{pendingTasks.length} human task{pendingTasks.length === 1 ? '' : 's'}</span>
        </div>
        <div className="cockpit-controls">
          <button
            className="queue-toggle"
            type="button"
            aria-expanded={queueOpen}
            onClick={() => setQueueOpen((current) => !current)}
          >
            Cases
          </button>
          <button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? 'Syncing…' : 'Refresh'}
          </button>
          <button type="button" onClick={logout}>Sign out</button>
        </div>
      </header>

      {error && <div className="cockpit-error" role="alert">{error}</div>}

      <div className="cockpit-main">
        <aside className={`case-queue${queueOpen ? ' is-open' : ''}`} aria-label="Case queue">
          <div className="queue-heading">
            <p>Live wire portfolio</p>
            <h1>Case queue</h1>
            <span>Action-ready cases appear first.</span>
          </div>

          <label className="queue-search">
            <span className="sr-only">Search by case, request, or beneficiary</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search cases"
            />
          </label>

          <div className="queue-filters" aria-label="Filter cases">
            {([
              ['review', 'Review now', reviewCount],
              ['all', 'All', queueItems.length],
              ['closed', 'Closed', closedCount],
            ] as Array<[CaseQueueFilter, string, number]>).map(([value, label, count]) => (
              <button
                key={value}
                className={filter === value ? 'is-active' : ''}
                type="button"
                onClick={() => setFilter(value)}
              >
                {label}<span>{count}</span>
              </button>
            ))}
          </div>

          <div className="queue-list">
            {pagedQueue.items.map((item) => (
              <button
                className={`queue-row${item.record.Id === selected?.Id ? ' is-selected' : ''}`}
                key={item.id}
                type="button"
                aria-label={`${item.caseKey}, ${money(item.amount, item.currency)}, ${item.beneficiary}, ${item.riskLevel} risk, ${item.status}`}
                title={`${item.caseKey} · ${item.requestId}`}
                onClick={() => chooseCase(item)}
              >
                <span className="queue-row-top">
                  <strong>{money(item.amount, item.currency)}</strong>
                  <span className={`queue-risk ${item.riskLevel.toLowerCase()}`}>
                    {item.riskLevel}
                  </span>
                </span>
                <span className="queue-beneficiary" title={item.beneficiary}>
                  {item.beneficiary}
                </span>
                <span className="queue-status" title={item.status}>{item.status}</span>
              </button>
            ))}
            {!loading && pagedQueue.items.length === 0 && (
              <p className="queue-empty">No cases match this view.</p>
            )}
            {loading && queueItems.length === 0 && <p className="queue-empty">Loading live cases…</p>}
          </div>

          <footer className="queue-pagination">
            <button
              type="button"
              aria-label="Previous case page"
              disabled={pagedQueue.page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              ←
            </button>
            <span>{pagedQueue.page} of {pagedQueue.totalPages}</span>
            <button
              type="button"
              aria-label="Next case page"
              disabled={pagedQueue.page === pagedQueue.totalPages}
              onClick={() => setPage((current) => Math.min(pagedQueue.totalPages, current + 1))}
            >
              →
            </button>
          </footer>
        </aside>

        <div
          className={`queue-scrim${queueOpen ? ' is-open' : ''}`}
          role="presentation"
          onClick={() => setQueueOpen(false)}
        />

        <div className="case-canvas">
          {reviewCase ? (
            <LiveReviewWorkspace
              key={reviewCase.caseId}
              sdk={sdk}
              reviewCase={reviewCase}
              linkedTask={linkedTask}
              selectedTask={selectedTask}
              busy={busy}
              completedOutcome={completedOutcome}
              onDecision={complete}
            />
          ) : (
            <main className="empty-canvas">
              <Shield />
              <h1>No case selected</h1>
              <p>Trigger the Maestro flow or choose an available Data Fabric case.</p>
            </main>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider config={authConfig}>
      <Cockpit />
    </AuthProvider>
  );
}
