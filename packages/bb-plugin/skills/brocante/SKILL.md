---
name: brocante
description: Generate a GitHub pull-request report in bb with Brocante, including scoped searches and recent opened/merged counts.
---

Run `bb brocante report owner/repository`. Use `--search 'label:bug'` to filter with GitHub syntax and `--format json` for structured output.

Each report includes at most 60 PRs. Preserve its partial-report notice when summarizing. Descriptions are omitted. Historical counts cover the entire repository, independently of the search.

If credentials are missing, direct the user to Brocante's GitHub read-only token setting in bb. Keep credentials in that secret setting. Rate limits include a retry delay; wait until the deadline before another request. The plugin runs on the bb server and returns text without writing local files.
