# Brocante

Generate a local report of a GitHub repository's open pull requests.

```sh
npm install -g brocante
brocante withastro/astro
brocante withastro/astro --search 'label:bug' --format markdown
brocante withastro/astro --format json --output report.json
brocante --demo --output demo.html
```

Requires Node.js 22.12 or newer. Authentication uses `GH_TOKEN`, then `GITHUB_TOKEN`, then the GitHub CLI's `gh auth token`. Run `gh auth login` or supply a read-only token through your environment. No token is stored in a report. GitHub GraphQL requires authentication even for public repositories.

The default output is a standalone HTML report named `brocante-owner-repo.html`. It opens directly in a browser without a server or external assets. This report is a table and historical summary; the interactive 3D marketplace is in the web app. Markdown and JSON print to stdout unless `--output` is supplied. Use `--output -` to print HTML. Existing files are preserved unless `--force` is given; new files use owner-only permissions where supported.

The default limit is ten pages of 60 PRs. Use `--max-pages 1` through `100` to change it. Capped reports are explicitly marked partial; GitHub search exposes at most 1,000 matches. Descriptions in JSON are capped at 6,000 characters, with `bodyTruncated` identifying shortened content. HTML and Markdown include the PR list and available 30-day historical counts, not descriptions. Counts may lag GitHub activity.

GitHub failures stop the run without writing a partial report. Rate limits exit with code 3 and print the required retry delay. Malformed command syntax exits with code 2 and points to `--help`. Other errors exit with code 1. The CLI does not automatically retry. Reports can contain private repository information: store and share them accordingly.

## Development

From the repository root:

```sh
pnpm build:cli
node packages/cli/dist/cli.js --demo --output /tmp/brocante.html
pnpm --filter brocante pack --pack-destination /tmp
```

Version starts at `1.0.0`. The published package contains the bundled CLI and this README, with no workspace runtime dependencies. Publishing is a separate release step.
