/// <reference types="vitest/globals" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReviewCase } from './model';
import { ReviewWorkspace, type ReviewWorkspaceProps } from './ReviewWorkspace';

const reviewCase: ReviewCase = {
  caseId: 'WS-TEST-001',
  requestId: 'REQ-TEST-001',
  customerId: 'CUST-001',
  amount: 450000,
  currency: 'USD',
  beneficiaryName: 'Example Beneficiary',
  beneficiaryCountry: 'DE',
  riskScore: 61,
  riskLevel: 'Medium',
  status: 'Pending customer verification',
  recommendedDecision: 'Verify customer before release',
  reasonCodes: ['new_beneficiary', 'invoice_amount_mismatch'],
  policyEvidence: JSON.stringify({
    deterministic: true,
    country_risk: 'medium',
    explanation: 'A new beneficiary and invoice mismatch require verification.',
  }),
  ixpEvidence: JSON.stringify({ status: 'Extraction complete' }),
  reviewMode: 'Medium wire review',
  correlationId: 'CORR-001',
  maestroInstanceId: 'INST-001',
  documents: [{
    id: 'DOC-001',
    fileName: 'invoice.pdf',
    documentType: 'Invoice',
    classificationConfidence: 0.98,
    extractionConfidence: 0.94,
    isSupported: true,
  }],
  auditEvents: [{
    id: 'AUD-001',
    eventType: 'IXP extraction completed',
    outcome: 'Evidence normalized',
    actor: 'WireSentinel',
    actorType: 'Automation',
    occurredAt: '2026-07-31T12:00:00Z',
  }],
};

function renderWorkspace(overrides: Partial<ReviewWorkspaceProps> = {}) {
  const props: ReviewWorkspaceProps = {
    reviewCase,
    surface: 'web',
    canDecide: true,
    copilotState: 'ready',
    copilotStatusLabel: 'Grounded agent ready',
    copilotAgentLabel: 'WireSentinel Copilot · v1.0.5',
    onDecision: vi.fn().mockResolvedValue(undefined),
    onAskCopilot: vi.fn().mockResolvedValue('## Evidence\n\n| Key | Value |\n| --- | --- |\n| Risk | Medium |'),
    ...overrides,
  };
  return { ...render(<ReviewWorkspace {...props} />), props };
}

describe('ReviewWorkspace', () => {
  it('validates rationale before Reject and submits Approve without one', async () => {
    const user = userEvent.setup();
    const onDecision = vi.fn().mockResolvedValue(undefined);
    renderWorkspace({ onDecision });

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Add a short rationale');
    expect(onDecision).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Reviewer rationale'), 'Verified by the reviewer.');
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onDecision).toHaveBeenCalledWith('Reject', 'Verified by the reviewer.');
  });

  it('renders completed work as one concise read-only outcome', () => {
    renderWorkspace({ canDecide: false, completedOutcome: 'Approve' });

    expect(screen.getByText('Approve recorded')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('routes specialized tasks to Action Center without generic decision controls', () => {
    renderWorkspace({
      canDecide: false,
      decisionUnavailableReason: 'Specialized compliance review.',
      actionCenterUrl: 'https://staging.uipath.com/example/task/123',
    });

    expect(screen.getByRole('link', { name: /Open in Action Center/ })).toHaveAttribute(
      'href',
      'https://staging.uipath.com/example/task/123',
    );
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('opens the Copilot drawer and renders GFM headings and tables', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: /Ask WireSentinel/ }));
    await user.click(screen.getByRole('button', { name: 'Summarize case' }));

    expect(await screen.findByRole('heading', { name: 'Evidence' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('Medium');
  });

  it('shows streaming Markdown and exposes connection retry', async () => {
    const user = userEvent.setup();
    const onRetryCopilot = vi.fn();
    const { rerender, props } = renderWorkspace({
      copilotState: 'thinking',
      copilotStreamingText: '## Live evidence\n\n- Policy grounded',
      defaultCopilotOpen: true,
      onRetryCopilot,
    });

    expect(screen.getByRole('heading', { name: 'Live evidence' })).toBeInTheDocument();

    rerender(
      <ReviewWorkspace
        {...props}
        copilotState="error"
        copilotStatusLabel="Connection interrupted"
        onRetryCopilot={onRetryCopilot}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Retry connection' }));
    expect(onRetryCopilot).toHaveBeenCalledOnce();
  });
});
