# Brocante for bb

Read pull-request reports with `bb brocante report owner/repository`.

Build from the monorepo root and install the package:

```sh
pnpm build:plugin
bb plugin install ./packages/bb-plugin
```

Requires bb 0.45 or newer with Plugin SDK 0.6.15 (the 0.6 series). Set **GitHub read-only token** in Brocante's plugin settings. The secret is stored by bb on the server. Use a token with access only to the repositories you intend to read. The plugin does not use the invoking machine's GitHub CLI credentials.

```sh
bb brocante report withastro/astro
bb brocante report withastro/astro --search 'label:bug' --format json
```

Each command fetches one page of up to 60 open pull requests, with optional repository-wide historical counts. Reports explicitly identify incomplete pagination. Descriptions are omitted from plugin output to keep responses bounded; PR links lead to GitHub. Use the standalone `brocante` CLI for larger local HTML, JSON, or Markdown files.

Commands run on the bb server and return text; they do not write to the invoking machine. Read failures stop the command. Rate limits report the retry delay and block further plugin requests until the deadline. The plugin has no background polling or persistent report cache.

## Git releases

This package is `private: true`. It is distributed from Git, not npm. Tags are scoped to this package: `bb-plugin/v1.0.0`, `bb-plugin/v1.0.1`, and so on. The version in `package.json` must match the tag version.

The build bundles the private core into the version-controlled `server.js`, then runs `bb plugin build` to validate the manifest and produce SDK metadata. The generated entry imports only the SDK supplied by bb; Git installs can build it without sibling packages or a workspace install. The build-time source imports the core’s public entry through a relative path; the generated entry contains that code. Its devDependencies intentionally contain no `workspace:` references, because bb installs Git packages with npm.

Before creating a release tag:

```sh
pnpm install --frozen-lockfile
pnpm validate
pnpm --filter bb-plugin-brocante verify:bundle
```

Commit the source, package version, and regenerated `packages/bb-plugin/server.js` together. Then, as an explicit release action, create and push an annotated `bb-plugin/v1.0.0` tag. Each release gets a new tag; existing release tags stay immutable. CI runs `verify:bundle` before rebuilding to detect stale committed output. On a `bb-plugin/` tag, CI also verifies that the tag version matches this package’s manifest.

Users install from the repository URL with the collection selector and package tag prefix (replace the example URL with this repository’s actual Git remote):

```sh
bb plugin install 'git:https://github.com/OWNER/REPOSITORY.git@^1.0.0' --plugin brocante --tag-prefix bb-plugin/
```

`--subdirectory packages/bb-plugin` can replace `--plugin brocante`. `bb plugin outdated` and `bb plugin update brocante` discover compatible releases with that prefix. Building this workspace does not install the plugin or create/push a tag.
