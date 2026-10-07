# Brocante

A marketplace for pull requests.

Brocante turns your GitHub repository’s open pull requests into a 3D flea market. Browse the shops,
spot aging PRs, and find your next review.

<p align="center">
  <img src=".github/assets/brocante-demo.png" width="760" alt="Brocante’s 3D demo marketplace, with pull-request shops and review-status signs around a central fountain">
</p>

## Quick start

Use the Node.js version in [`.nvmrc`](.nvmrc) and the pnpm version pinned in `package.json`.

```sh
pnpm install
pnpm dev
```

Open http://localhost:4321. The demo works without credentials. To connect GitHub, run
`pnpm setup:github` in bb or follow the [web setup guide](packages/web/README.md#connect-github).

## Packages

| Package                                   | Purpose                                                          |
| ----------------------------------------- | ---------------------------------------------------------------- |
| [Web](packages/web/README.md)             | Astro, React, and Three.js app deployed to Cloudflare Workers    |
| [Core](packages/core/README.md)           | Shared GitHub access, search, shop states, and report generation |
| [CLI](packages/cli/README.md)             | Portable 3D markets, plus Markdown and JSON exports              |
| [bb plugin](packages/bb-plugin/README.md) | Portable 3D markets from bb                                      |
| [Snapshot](packages/snapshot/README.md)   | Shared, self-contained build of the web marketplace              |

The CLI and bb plugin bundle the shared marketplace and core. Their snapshots open locally without
a GitHub App or server; GitHub credentials are needed only to capture repository data.

## Development

Run these commands from the repository root:

```sh
pnpm validate        # Lint, formatting, type checks, unit tests, and all builds
pnpm --filter @brocante/web exec playwright install chromium
pnpm test:e2e        # Desktop and mobile browser tests
pnpm build:cli
pnpm build:plugin
```

`pnpm build:web` builds the web app; `pnpm deploy` builds and deploys it to Cloudflare.
See the package guides for [deployment](packages/web/README.md#deploy-to-cloudflare),
[CLI packaging](packages/cli/README.md#development), and
[plugin releases](packages/bb-plugin/README.md#git-releases).
