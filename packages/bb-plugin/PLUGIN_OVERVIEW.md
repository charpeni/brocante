# Brocante

Turn a repository’s open pull requests into a portable 3D flea market, using the same scene and UI
as the hosted Brocante app. Explore shops, filter reviews, and read PR details locally.

Open **Brocante** in bb’s sidebar to preview saved markets, load the demo, or capture a repository.
The repository select lists your bb projects’ GitHub repositories.
The preview includes the full 3D scene, filters, search, and PR details. Download the HTML for an offline copy.

You can also run `bb brocante report owner/repo` to get preview and download links. The HTML works
offline without a GitHub App or server. Capture live data with the bb server’s existing `gh` login,
or set an optional GitHub token override in the plugin’s secret settings.
Use `bb brocante report --demo` without credentials.

`--search` and `--max-pages` control the capture. Markdown and JSON exports are available with
`--format`; those text exports return up to 60 PRs and omit descriptions.

The plugin retains its ten most recent downloads. Saved files contain no tokens but may contain
private repository data. Snapshots remain unchanged until you generate a new one.
