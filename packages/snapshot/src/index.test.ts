import { expect, it } from 'vitest';
import { demoMarket } from '@brocante/core/demo';
import { reportFromSnapshot } from '@brocante/core';
import { renderSnapshot } from './index';

it('embeds untrusted GitHub content as inert, round-trippable JSON', () => {
  const report = reportFromSnapshot(demoMarket());
  report.repository = '</title><script>globalThis.pwned=true</script>';
  report.pullRequests[0].title = '</script><script>globalThis.pwned=true</script>';
  report.pullRequests[0].body = '<img src=x onerror="globalThis.pwned=true"> & \u2028\u2029';
  const html = renderSnapshot(report);
  const embedded = html.match(
    /<script type="application\/json" id="brocante-data">(.*?)<\/script>/s,
  )![1];
  expect(JSON.parse(embedded)).toEqual(report);
  expect(embedded).not.toMatch(/[<>&\u2028\u2029]/);
  expect(html).not.toContain('<script>globalThis.pwned');
  expect(html.match(/<\/script>/g)).toHaveLength(2);
});

it('bundles the actual marketplace without external scripts, stylesheets, or fonts', () => {
  const html = renderSnapshot(reportFromSnapshot(demoMarket()));
  expect(html).toContain("connect-src 'none'");
  expect(html).toContain('SIL OPEN FONT LICENSE');
  expect(html).toContain('DM Sans Project Authors');
  expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+(?:href|rel)=/);
  const css = html.match(/<style>(.*?)<\/style>/s)![1];
  expect([...css.matchAll(/url\((.*?)\)/g)].length).toBeGreaterThan(0);
  for (const [, url] of css.matchAll(/url\((.*?)\)/g)) expect(url).toMatch(/^["']?data:/);
});
