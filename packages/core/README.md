# Brocante core

Private workspace package shared by the web app, CLI, and bb plugin. It owns the GitHub adapter, pull-request types and shop state, scoped search, retry parsing, and report generation. It has no dependency on Astro, React, Node filesystem APIs, or bb.

The CLI and plugin bundle this package into their distributable artifacts. It is not published to npm. The web app imports its TypeScript source through workspace exports.

`generateReport` fetches pages sequentially, deduplicates PR numbers, and stops on the first error. It marks capped pagination and GitHub's 1,000-result search limit as incomplete. Counts and PRs are snapshots, not an atomic view of a changing repository. `renderReport` produces offline HTML, Markdown, or versioned JSON; HTML escapes GitHub text and loads no external assets or scripts.
