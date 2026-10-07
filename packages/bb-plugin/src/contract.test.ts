import { expect, it } from 'vitest';
import { rpcContract } from './contract';

it('preserves capture defaults and trims repository and search input', () => {
  expect(
    rpcContract.capture.input.parse({ repository: ' team/repo ', search: ' label:bug ' }),
  ).toEqual({ repository: 'team/repo', search: 'label:bug', maxPages: 10, demo: false });
});

it.each([
  { maxPages: 0 },
  { maxPages: 101 },
  { maxPages: 1.5 },
  { maxPages: '10' },
  { demo: 'true' },
  { repository: 'x'.repeat(257) },
  { search: 'x'.repeat(257) },
  { token: 'client-supplied-token' },
])('rejects invalid capture input %j', (input) => {
  expect(rpcContract.capture.input.safeParse(input).success).toBe(false);
});
