import { useEffect, useMemo, useState } from 'react';
import {
  CodedActionAppService,
  MessageSeverity,
} from '@uipath/coded-action-app';
import { UiPath } from '@uipath/uipath-typescript/core';
import { ReviewWorkspace } from './ReviewWorkspace';
import { taskReviewCase } from './model';
import { useWireSentinelCopilot } from './useWireSentinelCopilot';
import type { ReviewCase, ReviewOutcome, RecordValue } from './model';
import './action-app.css';

const actionApp = new CodedActionAppService();
const sdk = new UiPath();

function ActionReview({
  title,
  reviewCase,
  busy,
  canDecide,
  decisionUnavailableReason,
  completedOutcome,
  onDecision,
}: {
  title: string;
  reviewCase: ReviewCase;
  busy: boolean;
  canDecide: boolean;
  decisionUnavailableReason?: string;
  completedOutcome?: ReviewOutcome;
  onDecision: (outcome: ReviewOutcome, rationale: string) => Promise<void>;
}) {
  const copilot = useWireSentinelCopilot({ sdk, reviewCase });
  return (
    <ReviewWorkspace
      reviewCase={reviewCase}
      surface="action"
      taskLabel={title}
      busy={busy}
      canDecide={canDecide}
      decisionUnavailableReason={decisionUnavailableReason}
      completedOutcome={completedOutcome}
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

export function WireSentinelActionApp() {
  const [title, setTitle] = useState('WireSentinel review');
  const [data, setData] = useState<RecordValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [canDecide, setCanDecide] = useState(false);
  const [decisionUnavailableReason, setDecisionUnavailableReason] = useState(
    'Checking the Action Center task status.',
  );
  const [completedOutcome, setCompletedOutcome] = useState<ReviewOutcome>();

  useEffect(() => {
    actionApp.getTask()
      .then((task) => {
        setTitle(task.title || 'WireSentinel review');
        setData((task.data ?? {}) as RecordValue);
        const isPending = task.status === 'Pending' && !task.isReadOnly;
        setCanDecide(isPending);
        if (!isPending) {
          setDecisionUnavailableReason(
            task.status === 'Completed'
              ? 'This Action Center task is completed and is now read only.'
              : 'This Action Center task is read only for the current reviewer.',
          );
        }
        if (
          task.status === 'Completed'
          && (task.action === 'Approve' || task.action === 'Reject' || task.action === 'Escalate')
        ) {
          setCompletedOutcome(task.action);
        }
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to read the Action Center task.'))
      .finally(() => setLoading(false));
  }, []);

  const reviewCase = useMemo(() => data ? taskReviewCase(data) : null, [data]);

  async function complete(outcome: ReviewOutcome, rationale: string) {
    if (!data) throw new Error('The task data is unavailable.');
    if (!canDecide) throw new Error(decisionUnavailableReason);
    setBusy(true);
    setError('');
    const taskData = { ...data, reviewerRationale: rationale, reviewOutcome: outcome };
    try {
      await actionApp.setTaskData(taskData);
      const response = await actionApp.completeTask(outcome, taskData);
      if (!response.success) throw new Error(response.errorMessage || 'Action Center rejected the completion.');
      setCompletedOutcome(outcome);
      actionApp.showMessage(
        `${outcome} recorded. Maestro is resuming the WireSentinel case.`,
        MessageSeverity.Success,
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to complete the task.';
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="action-state">
        <div className="action-monogram">WS</div>
        <div className="action-spinner" />
        <h1>Opening the decision packet</h1>
        <p>Connecting Action Center, IXP evidence, Maestro, and the grounded conversational agent.</p>
      </main>
    );
  }
  if (!reviewCase) {
    return <main className="action-state action-error"><div className="action-monogram">WS</div><h1>Task could not be opened</h1><p>{error || 'No task data was provided.'}</p></main>;
  }

  return (
    <>
      {error && <div className="action-error-banner" role="alert">{error}</div>}
      <ActionReview
        key={reviewCase.caseId}
        title={title}
        reviewCase={reviewCase}
        busy={busy}
        canDecide={canDecide}
        decisionUnavailableReason={decisionUnavailableReason}
        completedOutcome={completedOutcome}
        onDecision={complete}
      />
    </>
  );
}
