/// <reference types="vitest/globals" />
import {
  filterCaseQueue,
  paginateCaseQueue,
  sortCaseQueue,
  type CaseQueueItem,
} from './caseQueue';

function item(overrides: Partial<CaseQueueItem> = {}): CaseQueueItem {
  return {
    id: '1',
    caseKey: 'WS-001',
    requestId: 'REQ-001',
    beneficiary: 'Acme Trading',
    beneficiaryCountry: 'US',
    amount: 250000,
    currency: 'USD',
    riskLevel: 'Medium',
    riskScore: 55,
    status: 'Pending customer verification',
    actionReady: false,
    hasPendingTask: false,
    record: {},
    ...overrides,
  };
}

describe('case queue', () => {
  it('searches case, request, and beneficiary fields', () => {
    const items = [
      item(),
      item({ id: '2', caseKey: 'WS-002', requestId: 'REQ-ALPHA', beneficiary: 'Northstar GmbH' }),
    ];

    expect(filterCaseQueue(items, 'northstar', 'all')).toHaveLength(1);
    expect(filterCaseQueue(items, 'req-alpha', 'all')[0].caseKey).toBe('WS-002');
    expect(filterCaseQueue(items, 'ws-001', 'all')[0].beneficiary).toBe('Acme Trading');
  });

  it('puts action-ready work first and separates closed work', () => {
    const closed = item({ id: 'closed', status: 'Released', riskScore: 99 });
    const ready = item({ id: 'ready', actionReady: true, riskScore: 20 });
    const review = item({ id: 'review', status: 'On hold', riskScore: 80 });
    const sorted = sortCaseQueue([closed, review, ready]);

    expect(sorted[0].id).toBe('ready');
    expect(filterCaseQueue(sorted, '', 'review').map((entry) => entry.id)).toEqual([
      'ready',
      'review',
    ]);
    expect(filterCaseQueue(sorted, '', 'closed').map((entry) => entry.id)).toEqual(['closed']);
  });

  it('paginates ten cases and clamps an invalid selected page', () => {
    const items = Array.from({ length: 23 }, (_, index) => item({ id: String(index) }));

    expect(paginateCaseQueue(items, 2).items).toHaveLength(10);
    expect(paginateCaseQueue(items, 99)).toMatchObject({
      page: 3,
      totalPages: 3,
      totalItems: 23,
    });
  });
});
