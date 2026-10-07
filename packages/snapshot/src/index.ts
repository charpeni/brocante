import type { Report } from '@brocante/core';
import { script, styles } from './generated-template.js';

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

export function renderSnapshot(report: Report): string {
  // JSON in a script element is still HTML: a PR body must never close that element.
  const json = JSON.stringify(report).replace(
    /[<>&\u2028\u2029]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="description" content="A portable snapshot of Brocante’s 3D pull-request marketplace.">
<title>${escapeHtml(report.repository)} · Brocante</title><style>${styles}</style></head>
<body><div id="brocante"></div><noscript>This marketplace requires JavaScript.</noscript>
<script type="application/json" id="brocante-data">${json}</script><script>${script}</script></body></html>\n`;
}
