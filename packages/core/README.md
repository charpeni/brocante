# Brocante core

Private TypeScript package shared by the web app, CLI, and bb plugin. It provides GitHub access,
pull-request models, shop states, search, retry handling, and report generation.

The web app imports its source through workspace exports. The CLI and plugin bundle core into their
distributable artifacts.

`generateReport` fetches pages sequentially, deduplicates PR numbers, and stops on errors. It marks
capped pagination and GitHub’s 1,000-result search limit as incomplete. Counts and PRs are snapshots
and may differ as the repository changes.

`renderReport` produces standalone HTML, Markdown, or versioned JSON. HTML escapes GitHub text and
loads no external assets or scripts.
