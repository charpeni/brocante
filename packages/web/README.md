# Brocante web

A marketplace for pull requests.

Brocante turns your GitHub repository’s open pull requests into a 3D flea market. Browse the shops,
spot aging PRs, and find your next review.

Built with Astro, React, and Three.js on Cloudflare Workers. Shop signs show review status, and older
PRs become overgrown. A list view supports browsers without WebGL.

## Run locally

Use Node.js 24 (minimum 22.12) and the pnpm version pinned in the root `package.json`.
Run this guide’s commands from `packages/web`:

```sh
pnpm install
pnpm dev
```

Open http://localhost:4321. The demo contains 24 fictional PRs and works without credentials.
From the repository root, use `pnpm dev`, `pnpm build:web`, `pnpm setup:github`, or `pnpm deploy`.

```sh
pnpm validate      # Lint, formatting, type checks, unit tests, and build
pnpm exec playwright install chromium
pnpm test:e2e      # Desktop and mobile browser tests
```

## Connect GitHub

In bb, run `pnpm setup:github` in an interactive terminal for guided local setup. The wizard requires
Bash, Node.js, and the `bb` CLI, saves configuration in `.dev.vars`, and requests the client secret
through bb’s secure form.

For manual setup, create a GitHub App with these settings:

| Setting                                        | Value                                                       |
| ---------------------------------------------- | ----------------------------------------------------------- |
| Homepage and Setup URL                         | Your application origin (`APP_URL`)                         |
| Callback URL                                   | `<APP_URL>/auth/callback`                                   |
| Repository permissions                         | Metadata: read; Pull requests: read                         |
| Expiring user access tokens                    | Enabled                                                     |
| Request user authorization during installation | Disabled                                                    |
| Device Flow and webhooks                       | Disabled                                                    |
| Visibility                                     | Any account, if other accounts or organizations need access |

Use `http://localhost:4321` for sign-in on the server’s machine or an HTTPS URL for remote access.
HTTP LAN previews support the demo and public browsing. Start sign-in at the origin registered with
GitHub; alternate hosts redirect to that origin. Use a separate GitHub App for production.

```sh
cp .dev.vars.example .dev.vars
openssl rand -base64 32
```

Set `APP_URL`, `GITHUB_CLIENT_ID`, and `GITHUB_APP_SLUG` in `.dev.vars`. Add the generated base64 key
as `SESSION_KEY` and the app’s client secret as `GITHUB_CLIENT_SECRET`. Keep credentials out of source
control and client/public-prefixed variables. An app private key is unnecessary.

Restart the server, sign in, and enter `owner/repository` or its GitHub URL. Public repositories need
no app installation. Private repositories require both an installation selecting the repository and
the user’s own access; organization policy may require installation approval.

### Public browsing without sign-in

Optionally add `GITHUB_PUBLIC_TOKEN` to `.dev.vars` using a fine-grained token restricted to
**Public repositories (read-only)**. Public browsing works without OAuth configuration; anonymous
visitors share the token’s rate allowance. Monitor its expiry and rotate it when needed.

In bb, request it through the secure form:

```sh
bb secret request GITHUB_PUBLIC_TOKEN --purpose "Enable public repository browsing" --describe GITHUB_PUBLIC_TOKEN "Server-only GitHub token for public read-only access" --write-env .dev.vars
```

Restart the server after adding the token. Keep it out of `wrangler.jsonc` and client variables.
Signed-out requests reject private repositories; `@me` searches require sign-in. Signed-in visitors
use their own token.

## Deploy to Cloudflare

Customize `env.production` in `wrangler.jsonc` with your Worker name, HTTPS `APP_URL`, and domain.
For a `workers.dev` address, remove `routes` and set `workers_dev: true`. Register
`<APP_URL>/auth/callback` with your production GitHub App.

Run from the repository root:

```sh
pnpm --filter @brocante/web exec wrangler login
CLOUDFLARE_ENV=production pnpm build:web
pnpm --filter @brocante/web exec wrangler deploy --env production
```

Set `GITHUB_CLIENT_ID` and `GITHUB_APP_SLUG` as Worker runtime variables, and
`GITHUB_CLIENT_SECRET` and a separate production `SESSION_KEY` as secrets. Optionally add
`GITHUB_PUBLIC_TOKEN`. Local `.dev.vars` files are not deployed.

For GitHub deployments, connect your repository through Cloudflare Workers Builds. Use the
repository root, Node.js 24, and the pinned pnpm version. Install with
`pnpm install --frozen-lockfile`, then use the build and deploy commands above.

Verify sign-in, sign-out, and repository access after deployment. No database is required.

## Behavior and privacy

PRs load 60 at a time, oldest first. Search covers the repository’s open PRs, up to GitHub’s
1,000-result limit; sidebar state filters apply to the current page. Historical counts compare the
last 30 days with the preceding 30 days, independently of list filters, and may lag GitHub activity.

Drafts and changes requested show “Back soon.” PRs awaiting review show “Open”; approved PRs without
outstanding requests show “Closed.” These display states indicate review status, not readiness to merge
or reviewer availability.

Visible tabs refresh about once per minute and on focus. Retryable failures keep the last snapshot
visible; rate limits pause requests until the retry time. Anonymous cooldowns apply per Worker isolate.
Authorization failures and account or repository changes clear the snapshot. Ambient motion respects
Pause life, tab visibility, and reduced-motion preferences.

Requests use read-only GitHub access. Tokens stay in encrypted HttpOnly cookies, with state and PKCE
protecting sign-in. Sessions expire within eight hours or when the token expires; refresh tokens are
discarded. Stateless sessions cannot be revoked individually on the server. Private responses use
`no-store`, and browser snapshots stay in memory. Logging is disabled by default.

PR descriptions disable raw HTML, sanitize links, and load images on request. Before launch, test live
OAuth, private-repository access, team review requests, and repositories with required-review rules;
automated tests use synthetic data.
