# Brocante for bb

Read GitHub pull-request reports in bb. Requires bb 0.45 or newer with Plugin SDK 0.6.15 (the 0.6 series).

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
bb brocante report withastro/astro --search 'label:bug' --format json
```

Each command returns up to 60 open PRs as Markdown or JSON, with available repository-wide historical
counts and a notice when pagination is incomplete. Descriptions are omitted. Use the
[CLI](../cli/README.md) for larger reports or local HTML files.

Commands run on the bb server and return text. Read failures stop the command; rate limits block
further requests until the reported retry time. The plugin has no background polling or persistent cache.

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
