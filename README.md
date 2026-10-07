# Brocante

A 3D marketplace for your repository’s pull requests, with local reports and a bb plugin.

## Workspace

All packages live in `packages/`:

| Directory                                            | Package                                  | Purpose                                                               |
| ---------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| [`packages/web`](packages/web/README.md)             | `@brocante/web` (private)                | Astro, React, and Three.js web app; Cloudflare Worker                 |
| [`packages/core`](packages/core/README.md)           | `@brocante/core` (private)               | Shared GitHub adapter, search, models, and report generation          |
| [`packages/cli`](packages/cli/README.md)             | `brocante` · `1.0.0`                     | Publishable npm CLI for local HTML, Markdown, and JSON reports        |
| [`packages/bb-plugin`](packages/bb-plugin/README.md) | `bb-plugin-brocante` (private) · `1.0.0` | Git-distributed bb command and bundled skill for pull-request reports |

Use Node 24 (minimum 22.12) and the pnpm version pinned in `package.json`. There is one lockfile. The CLI and plugin bundle the private core; installing them does not require this monorepo.

## Web development

```sh
pnpm install
pnpm dev
```

Open http://localhost:4321. The server also listens on the LAN. The demo works without credentials. Local GitHub configuration belongs in `packages/web/.dev.vars`; see the [web guide](packages/web/README.md) for OAuth, optional public-token browsing, and deployment. Existing migrated local secrets are preserved; an ignored root `.dev.vars` symlink keeps existing setup tools compatible.

```sh
pnpm setup:github
pnpm build:web
pnpm deploy
```

`deploy` builds and deploys only the web app. For Cloudflare commands, use `pnpm --filter @brocante/web exec wrangler ...` so Wrangler uses the web package’s configuration. Hosted build settings should use the repository root, `pnpm install --frozen-lockfile`, then `pnpm build:web`; deployment runs with the web package as its working directory. No production deployment is performed by installation or validation.

## Local CLI

```sh
pnpm build:cli
node packages/cli/dist/cli.js --demo --output /tmp/brocante.html
node packages/cli/dist/cli.js withastro/astro --format markdown
```

Authentication uses `GH_TOKEN`, `GITHUB_TOKEN`, or `gh auth login`. HTML reports open directly in a browser. They contain a PR table and historical summary; the interactive 3D marketplace remains in the web app. See the [CLI guide](packages/cli/README.md) for search, pagination, output formats, and retry behavior.

## bb plugin

```sh
pnpm build:plugin
bb plugin install ./packages/bb-plugin
bb brocante report withastro/astro
```

Configure the GitHub read-only token in Brocante’s bb plugin settings first. The plugin returns one page of Markdown or JSON and observes GitHub rate-limit cooldowns. The root `.bb/plugins.json` also indexes the package for bb collection discovery. See the [plugin guide](packages/bb-plugin/README.md).

## Validation and release

```sh
pnpm validate
pnpm --filter @brocante/web exec playwright install chromium
pnpm test:e2e
pnpm --filter brocante pack --pack-destination /tmp/brocante-packages
```

`pnpm validate` checks formatting, lint, all package types and unit tests, and builds the web app, CLI, and plugin. The plugin build tool is pinned to bb 0.45.0 and the SDK to 0.6.15. Its optional desktop file-watcher and terminal native build scripts are disabled because this workspace only uses the plugin builder.

The CLI starts at `1.0.0` and is the only npm package. Packing builds its artifacts first. The bb plugin is private and releases through Git tags scoped to its package: `bb-plugin/v1.0.0`, `bb-plugin/v1.0.1`, and so on. Its generated `server.js` is version-controlled so a Git install needs no private workspace dependencies; CI checks that it matches the sources. See the [plugin release instructions](packages/bb-plugin/README.md#git-releases). The web app, core, plugin, and workspace root cannot be published to npm. No package has been published and no release tag has been created by this migration.

The [web guide](packages/web/README.md) documents the application’s behavior, privacy model, and remaining live GitHub validation needs.
