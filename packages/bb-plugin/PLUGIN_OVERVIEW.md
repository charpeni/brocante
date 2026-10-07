Browse a repository's open pull requests and recent activity from a bb terminal or agent thread.

## What you get

`bb brocante report owner/repository` returns a Markdown report with PR titles, authors, review states, change sizes, and available opened/merged counts for the last 30 days compared with the previous 30. Use `--format json` for structured output or `--search` for GitHub qualifiers within the repository's open PRs.

## How it works

Each request reads up to 60 PRs from GitHub. Reports identify when more results remain; descriptions are omitted to keep output bounded. There is no background polling, persistent report cache, or write to GitHub. Rate limits stop requests until GitHub's retry deadline.

## Requirements

Install from this repository’s package-scoped `bb-plugin/` Git tags. The plugin is not published on npm. Requires bb 0.45 or newer and a GitHub read-only token configured in the plugin's secret settings. Requests run on the bb server using that token's access. The separate Brocante CLI can generate larger local HTML reports.
