export type ReviewOutcome = 'Approve' | 'Reject' | 'Escalate';

export type EvidenceDocument = {
  id: string;
  fileName: string;
  documentType: string;
  classificationConfidence?: number;
  extractionConfidence?: number;
  isSupported: boolean;
  quarantineReason?: string;
};

export type AuditEvent = {
  id: string;
  eventType: string;
  outcome: string;
  actor: string;
  actorType: string;
  occurredAt: string;
};

export type ReviewCase = {
  caseId: string;
  requestId: string;
  customerId?: string;
  amount: number;
  currency: string;
  beneficiaryName: string;
  beneficiaryCountry: string;
  riskScore: number;
  riskLevel: string;
  status: string;
  finalDecision?: string;
  recommendedDecision: string;
  reasonCodes: string[];
  policyEvidence: string;
  ixpEvidence: string;
  reviewMode: string;
  correlationId?: string;
  maestroInstanceId?: string;
  documents: EvidenceDocument[];
  auditEvents: AuditEvent[];
};

export type CopilotMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  failed?: boolean;
};

export type RecordValue = Record<string, unknown>;

export function text(value: unknown, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

export function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseJson(value: unknown): RecordValue {
  if (value && typeof value === 'object') return value as RecordValue;
  try {
    const parsed = JSON.parse(String(value ?? '{}')) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as RecordValue) : {};
  } catch {
    return {};
  }
}

export function readReasonCodes(policyEvidence: unknown): string[] {
  const policy = parseJson(policyEvidence);
  const reasons = policy.reasons ?? policy.reasonCodes ?? policy.reason_codes;
  if (Array.isArray(reasons)) return reasons.map((reason) => text(reason)).filter(Boolean);
  if (typeof reasons === 'string') {
    return reasons.split(/[,\n]/).map((reason) => reason.trim()).filter(Boolean);
  }
  return [];
}

export function recommendedDecision(riskLevel: unknown, finalDecision?: unknown) {
  const current = text(finalDecision, '');
  if (current && !/pending/i.test(current)) return current;
  const risk = text(riskLevel, 'Unknown').toLowerCase();
  if (risk === 'critical') return 'Hold and file SAR';
  if (risk === 'high') return 'Escalate for compliance review';
  if (risk === 'medium') return 'Verify customer before release';
  if (risk === 'low') return 'Release';
  return 'Review required';
}

export function taskReviewCase(data: RecordValue): ReviewCase {
  const reasonCodes = Array.isArray(data.reasonCodes)
    ? data.reasonCodes.map((reason) => text(reason))
    : readReasonCodes(data.policyEvidence);
  return {
    caseId: text(data.caseId),
    requestId: text(data.requestId),
    customerId: text(data.customerId, ''),
    amount: number(data.amount),
    currency: text(data.currency, 'USD'),
    beneficiaryName: text(data.beneficiaryName),
    beneficiaryCountry: text(data.beneficiaryCountry),
    riskScore: number(data.riskScore),
    riskLevel: text(data.riskLevel, 'Unknown'),
    status: text(data.status, 'Awaiting review'),
    finalDecision: text(data.finalDecision, ''),
    recommendedDecision: text(
      data.recommendedDecision,
      recommendedDecision(data.riskLevel, data.finalDecision),
    ),
    reasonCodes,
    policyEvidence: text(data.policyEvidence, '{}'),
    ixpEvidence: text(data.ixpEvidence, '{}'),
    reviewMode: text(data.reviewMode, 'Unified review'),
    correlationId: text(data.correlationId, ''),
    maestroInstanceId: text(data.maestroInstanceId, ''),
    documents: Array.isArray(data.documents) ? (data.documents as EvidenceDocument[]) : [],
    auditEvents: Array.isArray(data.auditEvents) ? (data.auditEvents as AuditEvent[]) : [],
  };
}

export function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || 'USD'} ${amount.toLocaleString()}`;
  }
}

export function shortDate(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.valueOf())) return text(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
