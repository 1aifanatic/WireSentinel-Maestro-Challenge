export type CaseQueueFilter = 'review' | 'all' | 'closed';

export type CaseQueueItem<T = unknown> = {
  id: string;
  caseKey: string;
  requestId: string;
  beneficiary: string;
  beneficiaryCountry: string;
  amount: number;
  currency: string;
  riskLevel: string;
  riskScore: number;
  status: string;
  actionReady: boolean;
  hasPendingTask: boolean;
  record: T;
};

export const CASES_PER_PAGE = 10;

export function isClosedCase(item: CaseQueueItem) {
  return /closed|complete|released|rejected|approved|cancelled|resolved/i.test(item.status);
}

export function isReviewNowCase(item: CaseQueueItem) {
  return (
    item.actionReady
    || item.hasPendingTask
    || /pending|review|verification|hold|escalat/i.test(item.status)
  ) && !isClosedCase(item);
}

export function sortCaseQueue<T>(items: CaseQueueItem<T>[]) {
  return [...items].sort((left, right) => {
    const actionDelta = Number(right.actionReady) - Number(left.actionReady);
    if (actionDelta) return actionDelta;
    const pendingDelta = Number(right.hasPendingTask) - Number(left.hasPendingTask);
    if (pendingDelta) return pendingDelta;
    const reviewDelta = Number(isReviewNowCase(right)) - Number(isReviewNowCase(left));
    if (reviewDelta) return reviewDelta;
    return right.riskScore - left.riskScore;
  });
}

export function filterCaseQueue<T>(
  items: CaseQueueItem<T>[],
  search: string,
  filter: CaseQueueFilter,
) {
  const query = search.trim().toLowerCase();
  return items.filter((item) => {
    if (filter === 'review' && !isReviewNowCase(item)) return false;
    if (filter === 'closed' && !isClosedCase(item)) return false;
    if (!query) return true;
    return [item.caseKey, item.requestId, item.beneficiary]
      .some((value) => value.toLowerCase().includes(query));
  });
}

export function paginateCaseQueue<T>(
  items: CaseQueueItem<T>[],
  requestedPage: number,
  pageSize = CASES_PER_PAGE,
) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (page - 1) * pageSize;
  return {
    page,
    totalPages,
    totalItems: items.length,
    items: items.slice(start, start + pageSize),
  };
}
