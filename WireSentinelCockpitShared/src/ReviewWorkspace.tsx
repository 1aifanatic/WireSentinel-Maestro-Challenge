import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CopilotConnectionState } from './useWireSentinelCopilot';
import type { CopilotMessage, ReviewCase, ReviewOutcome } from './model';
import { money, parseJson, shortDate, text } from './model';
import './review-workspace.css';

// This shared source is compiled by both Vite 7 and the Coded Apps Vite 8 plugin.
// Retain the classic JSX runtime binding so both consumers produce a valid bundle.
void React;

export type ReviewWorkspaceProps = {
  reviewCase: ReviewCase;
  surface: 'web' | 'action';
  taskLabel?: string;
  busy?: boolean;
  completedOutcome?: ReviewOutcome;
  canDecide?: boolean;
  decisionUnavailableReason?: string;
  actionCenterUrl?: string;
  defaultCopilotOpen?: boolean;
  copilotState: CopilotConnectionState;
  copilotStatusLabel: string;
  copilotAgentLabel: string;
  copilotStreamingText?: string;
  onRetryCopilot?: () => void;
  onDecision: (outcome: ReviewOutcome, rationale: string) => Promise<void>;
  onAskCopilot: (question: string) => Promise<string>;
};

type Section = 'overview' | 'documents' | 'audit';
type IconName = 'spark' | 'close' | 'external' | 'note' | 'check' | 'file' | 'clock';

const prompts = [
  { label: 'Summarize case', prompt: 'Summarize this case with policy and evidence citations.' },
  { label: 'Explain recommendation', prompt: 'What evidence supports the deterministic recommendation?' },
  { label: 'Draft escalation', prompt: 'Draft a concise rationale for escalation. Do not make the decision.' },
];

const preferredPolicyKeys = [
  'deterministic',
  'hard_stop',
  'country_risk',
  'new_beneficiary',
  'invoice_amount_mismatch',
  'required_missing',
];

function confidence(value?: number) {
  if (!Number.isFinite(value)) return 'Not scored';
  const normalized = Number(value) <= 1 ? Number(value) * 100 : Number(value);
  return `${Math.round(normalized)}%`;
}

function riskTone(risk: string) {
  const value = risk.toLowerCase();
  if (value === 'critical') return 'critical';
  if (value === 'high') return 'high';
  if (value === 'medium') return 'medium';
  if (value === 'low') return 'low';
  return 'neutral';
}

function humanizeKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function readableValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map((item) => text(item)).join(', ') : 'None';
  if (typeof value === 'object') return 'See technical details';
  return text(value);
}

function policyFacts(policy: Record<string, unknown>) {
  return Object.entries(policy)
    .sort(([left], [right]) => {
      const leftIndex = preferredPolicyKeys.indexOf(left);
      const rightIndex = preferredPolicyKeys.indexOf(right);
      if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    })
    .filter(([key, value]) => (
      !['summary', 'explanation', 'decision', 'reasons', 'reasonCodes', 'reason_codes', 'keys'].includes(key)
      && typeof value !== 'object'
    ))
    .slice(0, 8);
}

function MarkdownAnswer({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ node: _node, ...props }) => (
          <a {...props} target="_blank" rel="noreferrer" />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function Icon({ name }: { name: IconName }) {
  if (name === 'close') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
  }
  if (name === 'external') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-9 9M19 13v6H5V5h6" /></svg>;
  }
  if (name === 'note') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></svg>;
  }
  if (name === 'check') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
  }
  if (name === 'file') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 13h6M9 17h6" /></svg>;
  }
  if (name === 'clock') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z" /></svg>;
}

export function ReviewWorkspace({
  reviewCase,
  surface,
  taskLabel,
  busy = false,
  completedOutcome,
  canDecide = true,
  decisionUnavailableReason,
  actionCenterUrl,
  defaultCopilotOpen = false,
  copilotState,
  copilotStatusLabel,
  copilotAgentLabel,
  copilotStreamingText = '',
  onRetryCopilot,
  onDecision,
  onAskCopilot,
}: ReviewWorkspaceProps) {
  const [section, setSection] = useState<Section>('overview');
  const [rationale, setRationale] = useState('');
  const [showRationale, setShowRationale] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [validation, setValidation] = useState('');
  const [copilotOpen, setCopilotOpen] = useState(defaultCopilotOpen);
  const tone = riskTone(reviewCase.riskLevel);
  const policy = useMemo(() => parseJson(reviewCase.policyEvidence), [reviewCase.policyEvidence]);
  const ixp = useMemo(() => parseJson(reviewCase.ixpEvidence), [reviewCase.ixpEvidence]);
  const facts = useMemo(() => policyFacts(policy), [policy]);
  const latestAnswer = [...messages].reverse().find(
    (message) => message.role === 'assistant' && !message.failed,
  );
  const lastQuestion = [...messages].reverse().find((message) => message.role === 'user')?.content;
  const isStreaming = asking || (copilotState === 'thinking' && Boolean(copilotStreamingText));

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setCopilotOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function decide(outcome: ReviewOutcome) {
    if (!canDecide) {
      setValidation(decisionUnavailableReason ?? 'This case has no pending human task.');
      return;
    }
    const clean = rationale.trim();
    if ((outcome === 'Reject' || outcome === 'Escalate') && clean.length < 8) {
      setShowRationale(true);
      setValidation(`Add a short rationale before choosing ${outcome}.`);
      return;
    }
    setValidation('');
    try {
      await onDecision(outcome, clean);
    } catch (cause) {
      setValidation(cause instanceof Error ? cause.message : 'The decision could not be submitted.');
    }
  }

  async function ask(nextQuestion?: string) {
    const prompt = (nextQuestion ?? question).trim();
    if (!prompt || asking || copilotState === 'connecting') return;
    setQuestion('');
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content: prompt },
    ]);
    setAsking(true);
    try {
      const answer = await onAskCopilot(prompt);
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'assistant', content: answer },
      ]);
    } catch (cause) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: cause instanceof Error
            ? cause.message
            : 'The conversational agent could not respond.',
          failed: true,
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <section className="ws-review">
      <header className="ws-case-header">
        <div className="ws-case-title">
          <p className="ws-eyebrow">
            {surface === 'action' ? 'Action Center · Human review' : 'Live case workspace'}
          </p>
          <h1 title={reviewCase.caseId}>{reviewCase.caseId}</h1>
          <p className="ws-case-id" title={taskLabel}>
            {taskLabel ?? `${reviewCase.requestId} · ${reviewCase.reviewMode}`}
          </p>
        </div>
        <div className="ws-header-actions">
          <button
            className="ws-button ws-button-primary"
            type="button"
            aria-expanded={copilotOpen}
            onClick={() => setCopilotOpen(true)}
          >
            <Icon name="spark" />
            Ask WireSentinel
          </button>
        </div>
      </header>

      <dl className="ws-case-summary">
        <div>
          <dt>Transfer</dt>
          <dd>{money(reviewCase.amount, reviewCase.currency)}</dd>
        </div>
        <div>
          <dt>Beneficiary</dt>
          <dd title={reviewCase.beneficiaryName}>
            {reviewCase.beneficiaryName} · {reviewCase.beneficiaryCountry}
          </dd>
        </div>
        <div>
          <dt>Risk and status</dt>
          <dd>
            <span className={`ws-risk ws-risk-${tone}`}>{reviewCase.riskLevel}</span>
            {' '}
            <span className="ws-status-line">{reviewCase.status}</span>
          </dd>
        </div>
      </dl>

      <div className="ws-progress-wrap">
        <div className="ws-progress" aria-label="Maestro case progress">
          <span className="ws-progress-step is-complete"><Icon name="check" /> Intake</span>
          <span className="ws-progress-step is-complete"><Icon name="check" /> IXP extraction</span>
          <span className="ws-progress-step is-current"><Icon name="clock" /> Human review</span>
          <span className="ws-progress-step">Banking outcome</span>
        </div>
      </div>

      <nav className="ws-tabs" aria-label="Case information">
        {([
          ['overview', 'Overview'],
          ['documents', `Documents (${reviewCase.documents.length})`],
          ['audit', `Audit (${reviewCase.auditEvents.length})`],
        ] as Array<[Section, string]>).map(([value, label]) => (
          <button
            key={value}
            className={`ws-tab${section === value ? ' is-active' : ''}`}
            type="button"
            aria-selected={section === value}
            onClick={() => setSection(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="ws-content">
        {section === 'overview' && (
          <div className="ws-overview">
            <div className="ws-primary-column">
              <article className="ws-recommendation">
                <div className="ws-recommendation-head">
                  <div className="ws-recommendation-copy">
                    <p className="ws-section-label">Authoritative recommendation</p>
                    <h2>{reviewCase.recommendedDecision}</h2>
                  </div>
                  <span className="ws-confidence">Human authority required</span>
                </div>
                <p>
                  Deterministic policy guidance grounded in the normalized IXP evidence packet.
                  WireSentinel Copilot may explain or draft, but it cannot decide or submit.
                </p>
                <ul className="ws-reason-list" aria-label="Policy reason codes">
                  {reviewCase.reasonCodes.length > 0
                    ? reviewCase.reasonCodes.map((reason) => (
                      <li key={reason}>{humanizeKey(reason)}</li>
                    ))
                    : <li>No routing reason codes returned</li>}
                </ul>
              </article>

              <section className="ws-section">
                <div className="ws-section-heading">
                  <div>
                    <p className="ws-section-label">Transaction</p>
                    <h2>Decision facts</h2>
                  </div>
                  <span className={`ws-risk ws-risk-${tone}`}>
                    {reviewCase.riskScore}/100
                  </span>
                </div>
                <dl className="ws-facts">
                  <div className="ws-fact">
                    <dt>Customer</dt>
                    <dd title={reviewCase.customerId}>
                      {text(reviewCase.customerId, 'Private banking client')}
                    </dd>
                  </div>
                  <div className="ws-fact">
                    <dt>Request</dt>
                    <dd title={reviewCase.requestId}>{reviewCase.requestId}</dd>
                  </div>
                  <div className="ws-fact">
                    <dt>Review mode</dt>
                    <dd>{reviewCase.reviewMode}</dd>
                  </div>
                  <div className="ws-fact">
                    <dt>Correlation</dt>
                    <dd title={reviewCase.correlationId}>{text(reviewCase.correlationId)}</dd>
                  </div>
                  <div className="ws-fact">
                    <dt>Maestro instance</dt>
                    <dd title={reviewCase.maestroInstanceId}>
                      {text(reviewCase.maestroInstanceId)}
                    </dd>
                  </div>
                  <div className="ws-fact">
                    <dt>Current status</dt>
                    <dd>{reviewCase.status}</dd>
                  </div>
                </dl>
              </section>
            </div>

            <div className="ws-secondary-column">
              <section className="ws-section">
                <div className="ws-section-heading">
                  <div>
                    <p className="ws-section-label">Policy controls</p>
                    <h2>Control summary</h2>
                  </div>
                </div>
                {text(policy.summary ?? policy.explanation ?? policy.decision, '') && (
                  <p className="ws-row-copy">
                    {text(policy.summary ?? policy.explanation ?? policy.decision, '')}
                  </p>
                )}
                <dl className="ws-policy-facts">
                  {facts.map(([key, value]) => (
                    <div key={key}>
                      <dt>{humanizeKey(key)}</dt>
                      <dd>{readableValue(value)}</dd>
                    </div>
                  ))}
                  {facts.length === 0 && (
                    <div>
                      <dt>Policy engine</dt>
                      <dd>
                        Completed with {reviewCase.reasonCodes.length} routing signal
                        {reviewCase.reasonCodes.length === 1 ? '' : 's'}.
                      </dd>
                    </div>
                  )}
                </dl>
                <details className="ws-technical">
                  <summary>Show technical policy details</summary>
                  <pre>{JSON.stringify(policy, null, 2)}</pre>
                </details>
              </section>

              <section className="ws-section">
                <div className="ws-section-heading">
                  <div>
                    <p className="ws-section-label">UiPath IXP</p>
                    <h2>Evidence status</h2>
                  </div>
                </div>
                <dl className="ws-policy-facts">
                  <div>
                    <dt>Documents</dt>
                    <dd>{reviewCase.documents.length} linked</dd>
                  </div>
                  <div>
                    <dt>Extraction</dt>
                    <dd>{text(ixp.status ?? ixp.summary, 'Normalized packet available')}</dd>
                  </div>
                </dl>
              </section>
            </div>
          </div>
        )}

        {section === 'documents' && (
          <section className="ws-section">
            <div className="ws-section-heading">
              <div>
                <p className="ws-section-label">UiPath IXP document extraction</p>
                <h2>Evidence linked to this decision</h2>
              </div>
            </div>
            {reviewCase.documents.length > 0 ? (
              <ul className="ws-document-list">
                {reviewCase.documents.map((document) => (
                  <li className="ws-document-row" key={document.id}>
                    <span className="ws-document-icon"><Icon name="file" /></span>
                    <div>
                      <p className="ws-row-title" title={document.fileName}>{document.fileName}</p>
                      <p className="ws-row-meta">
                        {document.documentType} · Classification {confidence(document.classificationConfidence)}
                        {' · '}
                        Extraction {confidence(document.extractionConfidence)}
                      </p>
                      {!document.isSupported && (
                        <p className="ws-row-copy">
                          {text(document.quarantineReason, 'Document requires inspection')}
                        </p>
                      )}
                    </div>
                    <span className={`ws-risk ${document.isSupported ? 'ws-risk-low' : 'ws-risk-medium'}`}>
                      {document.isSupported ? 'Included' : 'Review'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ws-empty">
                No document rows are linked. IXP status: {text(
                  ixp.summary ?? ixp.status,
                  'Available in the decision packet',
                )}
              </p>
            )}
          </section>
        )}

        {section === 'audit' && (
          <section className="ws-section">
            <div className="ws-section-heading">
              <div>
                <p className="ws-section-label">Data Fabric audit trail</p>
                <h2>Every handoff, in order</h2>
              </div>
            </div>
            {reviewCase.auditEvents.length > 0 ? (
              <ol className="ws-audit-list">
                {reviewCase.auditEvents.map((event) => (
                  <li className="ws-audit-row" key={event.id}>
                    <div>
                      <p className="ws-row-meta">{shortDate(event.occurredAt)}</p>
                      <p className="ws-row-meta">{event.actorType} · {event.actor}</p>
                    </div>
                    <div>
                      <p className="ws-row-title">{event.eventType}</p>
                      <p className="ws-row-copy">{event.outcome}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="ws-empty">Maestro will append events as this case advances.</p>
            )}
          </section>
        )}
      </main>

      <footer className="ws-decision-bar">
        {completedOutcome ? (
          <div className="ws-outcome-banner">
            <span className="ws-outcome-icon"><Icon name="check" /></span>
            <div>
              <strong>{completedOutcome} recorded</strong>
              <span>Action Center is read only. Maestro owns the next step.</span>
            </div>
          </div>
        ) : canDecide ? (
          <>
            <div className="ws-decision-summary">
              <strong>Choose the authorized outcome</strong>
              <span>Submission completes this task and resumes Maestro.</span>
            </div>
            <div className="ws-decision-actions">
              <button
                className="ws-button ws-button-primary"
                type="button"
                disabled={busy}
                onClick={() => void decide('Approve')}
              >
                {busy ? 'Submitting…' : 'Approve'}
              </button>
              <button
                className="ws-button ws-button-secondary"
                type="button"
                disabled={busy}
                onClick={() => void decide('Reject')}
              >
                Reject
              </button>
              <button
                className="ws-button ws-button-secondary"
                type="button"
                disabled={busy}
                onClick={() => void decide('Escalate')}
              >
                Escalate
              </button>
              <button
                className="ws-button ws-button-quiet"
                type="button"
                disabled={busy}
                onClick={() => setShowRationale((current) => !current)}
              >
                <Icon name="note" />
                {showRationale ? 'Hide note' : 'Add note'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="ws-decision-summary">
              <strong>Read-only case</strong>
              <span>
                {decisionUnavailableReason ?? 'No pending Action Center task is linked to this case.'}
              </span>
            </div>
            {actionCenterUrl && (
              <a
                className="ws-button ws-button-primary"
                href={actionCenterUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open in Action Center
                <Icon name="external" />
              </a>
            )}
          </>
        )}

        {canDecide && showRationale && (
          <div className="ws-rationale">
            <label htmlFor={`rationale-${reviewCase.caseId}`}>
              Reviewer rationale
              <textarea
                id={`rationale-${reviewCase.caseId}`}
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                placeholder="Required for Reject and Escalate"
                disabled={busy}
                rows={3}
              />
            </label>
          </div>
        )}
        {validation && <p className="ws-validation" role="alert">{validation}</p>}
      </footer>

      {copilotOpen && (
        <>
          <button
            className="ws-copilot-backdrop"
            type="button"
            aria-label="Close WireSentinel assistant"
            onClick={() => setCopilotOpen(false)}
          />
          <aside
            className="ws-copilot-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="WireSentinel conversational agent"
          >
            <header className="ws-drawer-head">
              <div className="ws-drawer-heading">
                <p className="ws-eyebrow">Conversational agent · Read only</p>
                <h2>Ask WireSentinel</h2>
                <p title={copilotAgentLabel}>
                  {copilotAgentLabel} · {copilotStatusLabel}
                </p>
              </div>
              <button
                className="ws-icon-button"
                type="button"
                aria-label="Close WireSentinel assistant"
                onClick={() => setCopilotOpen(false)}
              >
                <Icon name="close" />
              </button>
            </header>

            <div className="ws-prompts">
              {prompts.map((prompt) => (
                <button
                  className="ws-prompt-chip"
                  key={prompt.label}
                  type="button"
                  disabled={asking || copilotState === 'connecting'}
                  onClick={() => void ask(prompt.prompt)}
                >
                  {prompt.label}
                </button>
              ))}
            </div>

            <div className="ws-conversation" aria-live="polite">
              {messages.length === 0 && !isStreaming && (
                <div className="ws-empty">
                  Ask about evidence, policy, or the next human step for {reviewCase.caseId}.
                  WireSentinel can explain and draft, but it cannot decide or submit.
                </div>
              )}
              {messages.map((message) => (
                <article
                  className={`ws-message ws-message-${message.role}`}
                  key={message.id}
                >
                  {message.role === 'assistant' && <p className="ws-message-role">WireSentinel</p>}
                  {message.role === 'assistant' && !message.failed ? (
                    <div className="ws-markdown"><MarkdownAnswer>{message.content}</MarkdownAnswer></div>
                  ) : (
                    <div className={message.failed ? 'ws-copilot-error' : undefined}>
                      {message.content}
                    </div>
                  )}
                </article>
              ))}
              {isStreaming && (
                <article className="ws-message ws-message-assistant">
                  <p className="ws-message-role">WireSentinel</p>
                  {copilotStreamingText ? (
                    <div className="ws-markdown">
                      <MarkdownAnswer>{copilotStreamingText}</MarkdownAnswer>
                    </div>
                  ) : (
                    <span className="ws-streaming">{copilotStatusLabel}</span>
                  )}
                </article>
              )}

              {(copilotState === 'error' || messages.at(-1)?.failed) && (
                <div className="ws-copilot-actions">
                  {onRetryCopilot && (
                    <button
                      className="ws-button ws-button-secondary"
                      type="button"
                      onClick={onRetryCopilot}
                    >
                      Retry connection
                    </button>
                  )}
                  {lastQuestion && (
                    <button
                      className="ws-button ws-button-secondary"
                      type="button"
                      disabled={asking}
                      onClick={() => void ask(lastQuestion)}
                    >
                      Retry answer
                    </button>
                  )}
                </div>
              )}

              {latestAnswer && canDecide && (
                <div className="ws-copilot-actions">
                  <button
                    className="ws-button ws-button-secondary"
                    type="button"
                    onClick={() => {
                      setRationale(latestAnswer.content);
                      setShowRationale(true);
                      setCopilotOpen(false);
                    }}
                  >
                    Use as rationale draft
                  </button>
                </div>
              )}
            </div>

            <form
              className="ws-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void ask();
              }}
            >
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about evidence, policy, or the next human step"
                disabled={asking}
                rows={2}
              />
              <button
                className="ws-button ws-button-primary"
                type="submit"
                disabled={asking || !question.trim() || copilotState === 'connecting'}
              >
                Send
              </button>
            </form>
          </aside>
        </>
      )}
    </section>
  );
}
