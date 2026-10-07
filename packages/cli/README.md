# Brocante CLI

Save a portable 3D snapshot of your repository’s open pull requests, using the same marketplace
as the hosted app. No GitHub App or local server required. Markdown and JSON exports are also available.
Requires Node.js 22.12 or newer.

```sh
npm install -g brocante
brocante withastro/astro
brocante withastro/astro --search 'label:bug' --format markdown
brocante withastro/astro --format json --output report.json
brocante --demo --output demo.html
```

## Authentication

The CLI checks `GH_TOKEN`, then `GITHUB_TOKEN`, then `gh auth token`. Run `gh auth login` or provide a
read-only token in your environment. GitHub requires authentication for public repositories too.
Snapshots contain no tokens, but may contain private repository data.

## Output and limits

HTML defaults to `brocante-owner-repo.html`. Open the file in your browser: the 3D scene, fonts,
filters, PR details, and list view work offline, without a server or external assets.
Search and pagination cover the captured PRs. Generate a new snapshot to refresh the data;
description images remain links to their original hosts.
Markdown and JSON print to stdout unless `--output` is supplied. Use `--output -` to print HTML and
`--force` to overwrite an existing file. New files use owner-only permissions where supported.

Text exports include PR summaries and available 30-day historical counts. JSON includes descriptions,
capped at 6,000 characters with a `bodyTruncated` flag. HTML includes these descriptions in PR details.

The default limit is ten pages of 60 PRs. Set `--max-pages` from 1 to 100 to change it. Capped reports
are marked partial; GitHub search returns at most 1,000 matches. Historical counts may lag activity.

GitHub errors stop the run without writing a report. Exit codes are `2` for unrecognized options or
missing option values, `3` for rate limits, and `1` for other failures, including invalid arguments.
Rate-limit messages include the retry delay; retries are manual.
Run `brocante --help` for all options.

## Development

From the repository root:

```sh
pnpm build:cli
node packages/cli/dist/cli.js --demo --output /tmp/brocante.html
pnpm --filter brocante pack --pack-destination /tmp
```

Packing builds the shared marketplace and bundles it into the CLI. The npm package contains the
bundled CLI, license, and this README, with no workspace runtime dependencies.

## Releases

Publishing runs only through the [Publish CLI workflow](../../.github/workflows/publish-cli.yml).
Update the package version, then push its matching tag, such as `cli/v1.1.0`. The workflow validates,
packs with pnpm, tests the tarball, and publishes it with OIDC authentication and provenance.
Prereleases use the `next` npm tag; stable releases use `latest`.

In npm’s package settings, configure a GitHub Actions trusted publisher for this repository and
`publish-cli.yml`, allowing `npm publish`. No npm token is needed. The repository must be public
for provenance.
