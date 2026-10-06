import { describe, expect, it } from 'vitest';
import {
  shopState,
  parseRepository,
  ageHours,
  pullRequestDiff,
  shopSize,
  toSceneShop,
  type PullRequest,
} from './market';
import { demoMarket } from './demo';
const base = demoMarket().pullRequests[0];
const pr = (patch: Partial<PullRequest>): PullRequest => ({
  ...base,
  isDraft: false,
  requestedCount: 0,
  reviewDecision: null,
  ...patch,
});
describe('GitHub-derived shop state', () => {
  it.each(['CLOSED', 'MERGED'] as const)(
    'removes %s PRs even when they still have review requests',
    (state) => {
      expect(shopState(pr({ state, requestedCount: 3 }))).toBeNull();
    },
  );
  it('keeps a draft closed even when reviews are requested', () => {
    expect(shopState(pr({ isDraft: true, requestedCount: 2 }))).toBe('draft');
  });
  it('shows changes requested before outstanding requests', () => {
    expect(shopState(pr({ reviewDecision: 'CHANGES_REQUESTED', requestedCount: 2 }))).toBe(
      'author',
    );
  });
  it('keeps an approved PR open when another reviewer is requested', () => {
    expect(shopState(pr({ reviewDecision: 'APPROVED', requestedCount: 1 }))).toBe('requested');
  });
  it('shows approved only when there are no outstanding requests', () => {
    expect(shopState(pr({ reviewDecision: 'APPROVED' }))).toBe('ready');
  });
  it('recognizes required review without named reviewers', () => {
    expect(shopState(pr({ reviewDecision: 'REVIEW_REQUIRED' }))).toBe('requested');
  });
  it('does not turn a missing review decision into approval', () => {
    expect(shopState(pr({}))).toBe('awaiting');
  });
});
describe('repository input', () => {
  it.each(['owner/project', 'https://github.com/owner/project/'])('accepts %s', (input) => {
    expect(parseRepository(input)).toEqual({ owner: 'owner', repo: 'project' });
  });
  it.each([
    'https://evil.test/a/b',
    '../repo',
    'owner/..',
    'owner/repo/pulls',
    'owner/repo?token=secret',
    'owner/repo#x',
    '//github.com/o/r',
    'a/b/c',
  ])('rejects %s', (input) => {
    expect(parseRepository(input)).toBeNull();
  });
  it('bounds future creation dates at zero age', () => {
    expect(ageHours('2030-01-01', 0)).toBe(0);
  });
});

describe('conservative shop size', () => {
  it('uses additions plus deletions and a fixed file guard', () => {
    expect(shopSize({ additions: 40, deletions: 9, changedFiles: 3 })).toBe('compact');
    expect(shopSize({ additions: 40, deletions: 10, changedFiles: 3 })).toBe('standard');
    expect(shopSize({ additions: 10, deletions: 5, changedFiles: 4 })).toBe('standard');
    expect(shopSize({ additions: 20000, deletions: 10000, changedFiles: 80 })).toBe('standard');
    expect(toSceneShop(pr({ additions: 10, deletions: 5, changedFiles: 2 })).size).toBe('compact');
  });
  it.each([
    {},
    { additions: null, deletions: 0, changedFiles: 1 },
    { additions: 1, deletions: undefined, changedFiles: 1 },
    { additions: 1, deletions: 0, changedFiles: null },
    { additions: -1, deletions: 0, changedFiles: 1 },
    { additions: NaN, deletions: 0, changedFiles: 1 },
    { additions: Infinity, deletions: 0, changedFiles: 1 },
    { additions: 1, deletions: 0, changedFiles: 0.5 },
    { additions: Number.MAX_SAFE_INTEGER, deletions: 1, changedFiles: 1 },
  ])('defaults unavailable or invalid metadata to the current size: %j', (stats) => {
    expect(pullRequestDiff(stats)).toBeNull();
    expect(shopSize(stats)).toBe('standard');
  });
  it('does not infer a small textual change from empty or file-only diffs', () => {
    expect(shopSize({ additions: 0, deletions: 0, changedFiles: 3 })).toBe('standard');
    expect(shopSize({ additions: 1, deletions: 0, changedFiles: 0 })).toBe('standard');
    expect(shopSize({ additions: 1, deletions: 0, changedFiles: 3 })).toBe('standard');
  });
});
