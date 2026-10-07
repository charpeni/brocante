# Brocante

Turn a repository’s open pull requests into a portable 3D flea market, using the same scene and UI
as the hosted Brocante app. Explore shops, filter reviews, and read PR details locally.

Run `bb brocante report owner/repo`, download the HTML, and open it in your browser. The file works
offline without a GitHub App or server. Set a read-only GitHub token in the plugin’s secret settings
to capture live data, or use `bb brocante report --demo` without credentials.

`--search` and `--max-pages` control the capture. Markdown and JSON exports are available with
`--format`; those text exports return up to 60 PRs and omit descriptions.

The plugin retains its ten most recent downloads. Saved files contain no tokens but may contain
private repository data. Snapshots remain unchanged until you generate a new one.
