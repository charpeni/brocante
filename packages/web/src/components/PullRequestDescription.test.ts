import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import PullRequestDescription from './PullRequestDescription';

function render(body: string) {
  return renderToStaticMarkup(
    createElement(PullRequestDescription, { body, url: 'https://github.com/team/repo/pull/42' }),
  );
}

it('renders GitHub-flavored descriptions with headings, code, tables, and read-only tasks', () => {
  const html = render(
    [
      '# Summary',
      '',
      '**Bold** and ~~removed~~ with `code`.',
      '',
      '- [x] Tested',
      '- [ ] Pending',
      '',
      '> A note',
      '',
      '```js',
      'const n = 1 < 2;',
      '```',
      '',
      '| Change | Status |',
      '| --- | --- |',
      '| Markdown | Ready |',
    ].join('\n'),
  );
  expect(html).toContain('<h4>Summary</h4>');
  expect(html).toContain('<strong>Bold</strong>');
  expect(html).toContain('<del>removed</del>');
  expect(html).toContain('<code>code</code>');
  expect(html).toContain('type="checkbox" disabled="" checked=""');
  expect(html).toContain('<blockquote>');
  expect(html).toContain('const n = 1 &lt; 2;');
  expect(html).toContain('<table>');
  expect(html).toContain('<td>Ready</td>');
});

it('discards raw HTML and unsafe URLs without enabling executable content', () => {
  const html = render(
    [
      '<script>alert(1)</script>',
      '',
      '<img src="x" onerror="alert(1)">',
      '',
      '[bad](javascript:alert%281%29)',
      '',
      '![bad image](data:text/html,unsafe)',
      '',
      '[safe](https://example.com)',
    ].join('\n'),
  );
  expect(html).not.toMatch(/<script|onerror|javascript:|data:text\/html|<img/);
  expect(html).toContain('href="https://example.com/"');
  expect(html).toContain('rel="noopener noreferrer"');
});

it('resolves relative links on GitHub instead of the application host', () => {
  const html = render('[comment](#issuecomment-1) [issue](/team/repo/issues/3)');
  expect(html).toContain('href="https://github.com/team/repo/pull/42#issuecomment-1"');
  expect(html).toContain('href="https://github.com/team/repo/issues/3"');
});

it('keeps the empty-description fallback', () => {
  expect(render(' \n ')).toContain('No description was provided.');
});

it('does not fetch external images until requested and keeps footnotes local', () => {
  const html = render(
    '![Screenshot](https://images.example/test.png)\n\nA note[^1].\n\n[^1]: Footnote',
  );
  expect(html).not.toContain('<img');
  expect(html).toContain('Load image: Screenshot');
  expect(html).toContain('href="#user-content-fn-1"');
  expect(html).toContain('id="user-content-fnref-1"');
});
