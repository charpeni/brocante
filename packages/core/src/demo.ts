import type { MarketData, PullRequest } from './market';

const titles = [
  'Make the command menu keyboard-friendly',
  'Stop retries from charging twice',
  'Keep export links private',
  'A quieter notification inbox',
  'Backfill missing event timestamps',
  'Let preview builds sleep at night',
  'Make CSV imports resumable',
  'Put focus back after a modal closes',
  'Rotate webhook signing secrets',
  'Explain empty search results',
  'Trim the analytics hot path',
  'Roll workers without losing jobs',
  'Keep drafts out of the activity feed',
  'Let the date picker speak',
  'Untangle workspace time zones',
  'Shrink the settings bundle',
  'Give webhooks a second chance',
  'Bring old search indexes up to date',
  'Lock down attachment previews',
  'Make shortcuts easier to discover',
  'Move exports off the request path',
  'Keep deleted projects out of reports',
  'Turn error codes into useful messages',
  'Remember your place in a long list',
];

export function demoMarket(): MarketData {
  const now = Date.now();
  return {
    repository: 'weekend/brocante',
    url: '',
    isPrivate: false,
    visibility: 'PUBLIC',
    total: 24,
    repositoryStats: {
      opened: 42,
      merged: 36,
      previousOpened: 35,
      previousMerged: 40,
      since: new Date(now - 30 * 86_400_000).toISOString(),
      previousSince: new Date(now - 60 * 86_400_000).toISOString(),
      asOf: new Date(now).toISOString(),
    },
    nextCursor: null,
    fetchedAt: new Date(now).toISOString(),
    pullRequests: titles.map((title, i): PullRequest => ({
      number: 410 + i,
      title,
      url: '',
      // Synthetic sizes exercise compact, standard, file-heavy and unknown cases.
      additions: [18, 85, 620, 0, null, 8][i % 6],
      deletions: [7, 24, 140, 0, null, 4][i % 6],
      changedFiles: [2, 5, 28, 3, null, 8][i % 6],
      body: '## Summary\n\nA **fictional pull request** for exploring Brocante. Connected repositories show the author’s actual Markdown description.\n\n### Try it out\n\n- [x] Browse the marketplace\n- [ ] Find a shop that needs a review\n\nUse the `Search pull requests` field to narrow the list.\n\n> Older shops gather near the fountain.',
      author: ['mina', 'theo', 'sam', 'jo', 'noor', 'alex'][i % 6],
      createdAt: new Date(now - (330 - i * 14) * 3_600_000).toISOString(),
      updatedAt: new Date(now - i * 600_000).toISOString(),
      state: 'OPEN',
      isDraft: i % 9 === 7,
      reviewDecision:
        i % 7 === 3
          ? 'CHANGES_REQUESTED'
          : i % 7 === 5
            ? 'APPROVED'
            : i % 3 === 0
              ? 'REVIEW_REQUIRED'
              : null,
      requestedCount: i % 3 === 0 ? 1 : 0,
      requestedReviewers: i % 3 === 0 ? ['ravi'] : [],
      labels: [['frontend', 'accessibility'], ['api'], ['security'], ['ux'], ['data'], ['infra']][
        i % 6
      ],
    })),
  };
}
