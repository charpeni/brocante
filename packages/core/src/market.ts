export type ShopState = 'awaiting' | 'requested' | 'draft' | 'author' | 'ready';
export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
export interface PullRequest {
  number: number;
  title: string;
  url: string;
  body: string;
  bodyTruncated?: boolean;
  additions?: number | null;
  deletions?: number | null;
  changedFiles?: number | null;
  author: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  reviewDecision: ReviewDecision;
  requestedCount: number;
  requestedReviewers: string[];
  labels: string[];
}
export interface MarketData {
  repository: string;
  url: string;
  isPrivate: boolean;
  visibility?: 'PUBLIC' | 'PRIVATE' | 'INTERNAL';
  total: number;
  pullRequests: PullRequest[];
  nextCursor: string | null;
  fetchedAt: string;
  searchLimited?: boolean;
  repositoryStats?: {
    opened: number;
    merged: number;
    previousOpened: number;
    previousMerged: number;
    since: string;
    previousSince: string;
    asOf: string;
  };
}
export const stateLabels: Record<ShopState, string> = {
  awaiting: 'Review welcome',
  requested: 'Review requested',
  draft: 'Draft',
  author: 'Changes requested',
  ready: 'Approved',
};
export function shopState(pr: PullRequest): ShopState | null {
  if (pr.state !== 'OPEN') return null;
  if (pr.isDraft) return 'draft';
  if (pr.reviewDecision === 'CHANGES_REQUESTED') return 'author';
  if (pr.requestedCount > 0 || pr.reviewDecision === 'REVIEW_REQUIRED') return 'requested';
  if (pr.reviewDecision === 'APPROVED') return 'ready';
  return 'awaiting';
}
export const shopDoor = (state: ShopState) =>
  state === 'author' || state === 'draft' ? 'BACK SOON' : state === 'ready' ? 'CLOSED' : 'OPEN';

export const isOpen = (state: ShopState) => state === 'awaiting' || state === 'requested';
export function ageHours(createdAt: string, now = Date.now()) {
  return Math.max(0, (now - new Date(createdAt).getTime()) / 3_600_000);
}
export function ageText(createdAt: string) {
  const hours = ageHours(createdAt);
  return hours < 1
    ? 'Just opened'
    : hours < 24
      ? `${Math.floor(hours)}h old`
      : `${Math.floor(hours / 24)}d old`;
}
export function parseRepository(input: string): { owner: string; repo: string } | null {
  let value = input.trim();
  if (value.startsWith('https://github.com/')) value = value.slice(19);
  value = value.replace(/\/$/, '');
  const match = /^([a-z\d](?:[a-z\d-]{0,38}))\/([a-z\d_.-]{1,100})$/i.exec(value);
  if (!match || ['.', '..'].includes(match[2])) return null;
  return { owner: match[1], repo: match[2] };
}
export function pullRequestDiff(pr: Pick<PullRequest, 'additions' | 'deletions' | 'changedFiles'>) {
  const { additions, deletions, changedFiles } = pr;
  if (
    typeof additions !== 'number' ||
    !Number.isSafeInteger(additions) ||
    additions < 0 ||
    typeof deletions !== 'number' ||
    !Number.isSafeInteger(deletions) ||
    deletions < 0 ||
    typeof changedFiles !== 'number' ||
    !Number.isSafeInteger(changedFiles) ||
    changedFiles < 1 ||
    !Number.isSafeInteger(additions + deletions)
  )
    return null;
  return { additions, deletions, changedFiles, lines: additions + deletions };
}

// Fixed bands stay stable when users filter, paginate, or switch repositories.
// Sparse large-PR evidence does not justify enlarging the existing plot envelope.
export function shopSize(
  pr: Pick<PullRequest, 'additions' | 'deletions' | 'changedFiles'>,
): 'compact' | 'standard' {
  const diff = pullRequestDiff(pr);
  return diff &&
    diff.lines > 0 &&
    diff.lines < 50 &&
    diff.changedFiles <= 3 &&
    diff.changedFiles <= diff.lines
    ? 'compact'
    : 'standard';
}

export function toSceneShop(pr: PullRequest) {
  // Palette is decorative; labels in the UI always come directly from GitHub.
  const colors = ['Frontend', 'API', 'Security', 'Data', 'Infra'];
  return {
    id: pr.number,
    title: pr.title,
    skill: colors[pr.number % colors.length],
    openedAtHours: -ageHours(pr.createdAt),
    size: shopSize(pr),
    status: shopState(pr) ?? 'ready',
  };
}
