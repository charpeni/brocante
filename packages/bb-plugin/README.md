# Brocante for bb

Save portable 3D pull-request markets from bb, using the same marketplace as the hosted app.
No GitHub App required. Requires bb 0.45 or newer with Plugin SDK 0.6.15 (the 0.6 series).

## Install and use

Build and install from the repository root:

```sh
pnpm build:plugin
bb plugin install ./packages/bb-plugin
```

Set **GitHub read-only token** in Brocante’s plugin settings, scoped to the repositories you need.
bb stores the token on its server; the plugin uses it instead of local GitHub CLI credentials.

```sh
bb brocante report withastro/astro
bb brocante report --demo
bb brocante report withastro/astro --search 'label:bug' --format json
```

The default command returns a download link. Save the HTML and open it in your browser: its 3D scene,
filters, PR details, and list view work offline. Credentials stay on the bb server. Snapshots may contain
private repository data, so share them carefully. Description images remain external links.

HTML captures up to ten pages of 60 PRs; use `--max-pages` (1–100) or `--search` to change coverage.
Markdown and JSON exports return one page, omit descriptions, and flag incomplete results.
Search within the saved HTML covers captured PRs; generate another snapshot to refresh them.

The plugin retains the ten most recent downloads in its own storage. Downloaded files work independently
of bb. Downloads use bb’s local authentication. Read failures stop the command; rate limits block requests
until the reported retry time. The plugin does not poll GitHub in the background.

## Git releases

This private package is distributed through `bb-plugin/v<version>` Git tags. Each tag must match
`package.json`; release tags are immutable. The committed `server.js` bundles core so Git installs
can build without the workspace. Keep the plugin’s devDependencies free of `workspace:` references.

Before tagging, run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter bb-plugin-brocante verify:bundle
pnpm validate
```

If the bundle is stale, run `pnpm build:plugin` and repeat verification. Commit the sources, package
version, and regenerated `server.js` together, then create and push an annotated release tag.
CI checks the committed bundle and validates the package version on `bb-plugin/` tags.

Install a tagged release with:

```sh
bb plugin install 'git:https://github.com/charpeni/brocante.git@^1.0.0' --plugin brocante --tag-prefix bb-plugin/
```

`--subdirectory packages/bb-plugin` can replace `--plugin brocante`. Use `bb plugin outdated` and
`bb plugin update brocante` to discover and install compatible releases.
