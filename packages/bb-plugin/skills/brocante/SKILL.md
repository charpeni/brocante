---
name: brocante
description: Save portable 3D pull-request markets from bb, or export GitHub PR data as Markdown or JSON.
---

Run `bb brocante report owner/repository` to capture a portable 3D marketplace. Return its preview
link so the user can explore it within bb, plus the download link for an offline copy. Saved markets
appear in the **Brocante** sidebar page. Use `--demo` without a repository for a fictional market that
requires no credentials.

Use `--search 'label:bug'` for GitHub search during capture and `--max-pages` (1–100) to control the
HTML page limit. Preserve partial-snapshot notices. Saved HTML searches captured PRs locally and
includes PR descriptions, shortened to 6,000 characters. Description images remain external links.
Generate a new snapshot to refresh the data.

For data to summarize in a thread, explicitly choose `--format markdown` or `--format json`.
These text exports return at most 60 PRs, omit descriptions, and report incomplete pagination.
Historical counts cover the repository independently of the capture’s search.

Live captures reuse the bb server’s `gh` login, with `GH_TOKEN` / `GITHUB_TOKEN` also supported.
Brocante’s optional **GitHub token override** secret setting takes priority. If credentials are
missing, direct the user to run `gh auth login` on the bb server or set the override.
Credentials stay on the server and are excluded from HTML. Snapshots can contain private
repository data. The plugin retains its ten most recent downloads; downloaded files work independently.

Honor the retry deadline in rate-limit errors before another request. The plugin performs read-only
GitHub requests and has no background polling.
