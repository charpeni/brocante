# Brocante

A 3D marketplace for your repository’s pull requests.

A circular weekend bazaar for GitHub pull requests. Older PRs gather near the fountain and their shops gradually become overgrown. Open/closed signs follow GitHub's draft, review-request, and approval data. Characters wander and birds occasionally perch on trees or shops.

**Astro + React + Three.js, deployed as a Cloudflare Worker.** pnpm manages dependencies; Oxlint and Oxfmt handle linting and formatting. GitHub is the only persistent source of PR data. There is no database, KV namespace, manual flag, GitHub write operation, or background sync service.

## Run locally

This private package lives at `packages/web`. Run the commands in this guide from that directory. Root `pnpm dev`, `pnpm build:web`, `pnpm setup:github`, and `pnpm deploy` forward here. Local secrets belong in `packages/web/.dev.vars`; a migrated checkout may retain an ignored root symlink for compatibility.

Use Node 24 (minimum 22.12) and the pnpm version pinned in `package.json`.

```sh
pnpm install
pnpm dev
```

Open http://localhost:4321. The demo works without credentials and contains 24 clearly identified fictional PRs. The list view is available alongside the 3D scene, including when WebGL is unavailable.

```sh
pnpm lint          # Oxlint; warnings fail
pnpm format        # Oxfmt, including Astro files
pnpm format:check
pnpm check         # Astro + TypeScript
pnpm test          # State, authentication, and GitHub adapter tests
pnpm build         # Cloudflare Worker + client assets
pnpm validate      # All of the above, excluding browser tests
pnpm exec playwright install chromium
pnpm test:e2e      # Desktop + mobile browser workflows
```

TypeScript is pinned to the compatible 6.x line because the installed Astro check tool does not support TypeScript 7. Build scripts are explicitly allowed for esbuild, workerd, and sharp in `pnpm-workspace.yaml`.

## Connect GitHub

For guided local setup in bb, run `pnpm setup:github` in an interactive terminal. The wizard opens GitHub registration, explains the required settings, saves public configuration to ignored `.dev.vars`, generates a session key, and requests the client secret through bb's secure form. It requires Bash, Node, and the `bb` CLI. It does not deploy or change Cloudflare production secrets.

Choose a canonical origin first. `http://localhost:4321` works only in a browser on the server's machine. To sign in from another device, use an HTTPS development URL or deployment; the HTTP LAN preview supports the demo and optional public browsing, but not GitHub sign-in. Register `<APP_URL>/auth/callback` exactly, and start sign-in at that same origin. An alternate host redirects to the configured origin before creating the login cookie. Sign-in preserves the repository and search through a validated local return path in the sealed login transaction.

Create a **GitHub App**, not an OAuth App. Set:

- Visibility: **Any account**, if other accounts/organizations should connect repositories.
- Homepage: your application URL.
- Callback URL: `http://localhost:4321/auth/callback` for local development.
- Repository permissions: **Metadata: read** and **Pull requests: read**.
- Keep expiring user access tokens enabled.
- Leave **Request user authorization (OAuth) during installation** disabled: Brocante starts its own state-and-PKCE login flow. Set **Setup URL** to the application origin so installation returns to Brocante.
- Leave Device Flow disabled.
- Disable webhook delivery. No webhooks are consumed.

Use a separate GitHub App for production. A Marketplace listing is unnecessary. The app does not request Contents, organization-membership, email, or write permissions.

For local development, set `APP_URL`, `GITHUB_CLIENT_ID`, and `GITHUB_APP_SLUG` in `.dev.vars`; these override `wrangler.jsonc`. For deployment, set those public variables in `wrangler.jsonc`. Keep `APP_URL` at the canonical origin registered for the callback.

```sh
cp .dev.vars.example .dev.vars
openssl rand -base64 32
```

Put the generated 32-byte base64 key in `SESSION_KEY` and the GitHub App client secret in `GITHUB_CLIENT_SECRET` inside `.dev.vars`. Do not put credentials in public/client-prefixed variables or commit `.dev.vars`. No app private key is needed: signed-in requests use the person's user token. Optional public access uses the server token described below.

Restart the development server. Sign in, enter `owner/repository` or a `https://github.com/owner/repository` URL, and open the market.

Public repositories can be viewed with the user token without installing the App on them. Private repositories require an installation selecting the repository **and** the user's own access. Organization policy may require an owner to approve installation. The UI links to installation setup when `GITHUB_APP_SLUG` is configured.

### Public repositories without sign-in

Optionally set `GITHUB_PUBLIC_TOKEN` in `.dev.vars`. Use a fine-grained personal access token restricted to **Public repositories (read-only)**, with no private-repository or write access. This works without configuring OAuth. GitHub GraphQL still requires a token; anonymous visitors share this token's rate allowance. Keep track of its expiry and rotate it when needed.

In bb, enter it through the secure form:

```sh
bb secret request GITHUB_PUBLIC_TOKEN --purpose "Enable public repository browsing" --describe GITHUB_PUBLIC_TOKEN "Server-only GitHub token for public read-only access" --write-env .dev.vars
```

Never put the token in `wrangler.jsonc`, a client/public-prefixed variable, or source control. For deployment, use `pnpm exec wrangler secret put GITHUB_PUBLIC_TOKEN`. Restart the development server after adding it if Wrangler does not reload the binding.

Signed-out requests reject private or missing repository visibility even if the token is accidentally overprivileged. Personal `@me` searches require sign-in. Signed-in visitors always use their own token, and private repository data is never reused when switching to public access.

GitHub rate limits return 429 and `Retry-After`. The browser preserves an existing snapshot, shows a countdown, and blocks polling, focus refreshes, searches, and manual retries until recovery. Each Worker isolate also shares a cooldown across anonymous requests, deduplicates simultaneous identical reads, and caps concurrent public reads at four. This is not a globally synchronized quota manager: separate isolates can each encounter the limit before learning its reset time. There is no persistent cache or additional Cloudflare binding. A revoked or expired public token produces a service error rather than logging visitors out.

## Deploy to Cloudflare

This is a Worker application, not a static ZIP/Drop upload.

1. Authenticate the CLI with `pnpm exec wrangler login` or configure a suitably scoped CI API token.
2. Choose the Worker name and Cloudflare account in the deployment configuration.
3. Set `APP_URL` to the production HTTPS origin and use the production GitHub App client ID/slug in `wrangler.jsonc`. Register that exact origin plus `/auth/callback` with GitHub. The application deliberately does not trust incoming Host headers for OAuth redirects.
4. Build and perform an initial deployment with `pnpm deploy` to establish the Worker. Before setting secrets, it serves the demo with sign-in disabled.
5. Add secrets interactively with `pnpm exec wrangler secret put GITHUB_CLIENT_SECRET` and `pnpm exec wrangler secret put SESSION_KEY`. Never pass their values on the command line.
6. Verify a public repo, a private repo, and a user who cannot access that private repo. Optional: configure a custom domain, updating APP_URL and the GitHub callback together.

No D1, KV, R2, Queues, or Durable Objects binding is configured. Astro has `session: false` so the Cloudflare adapter does not provision KV sessions. Images use passthrough to avoid a Cloudflare Images binding. No Cloudflare account or production deployment is included in this checkout.

## How the app works

- Astro serves the shell, OAuth endpoints, and API endpoints.
- One React island owns the filters, list, details, and marketplace selection.
- Three.js owns rendering and its animation loop. Two decorative cats nap, stretch, and wander around the fountain alongside visiting birds and a seated fisher. A parcel balloon passes beyond the trees after 15 seconds of active viewing, then every five minutes. All ambient motion respects Pause life and pauses offscreen, in hidden tabs, and under reduced-motion preferences.
- `/api/market` queries GitHub on behalf of the signed-in user. It never substitutes an installation token with broader access.
- The repository report compares opened and merged PR counts over the last 30 days with the preceding 30 days. Four scoped GitHub search counts accompany the existing GraphQL request; they are independent of list filters, and an optional report failure does not hide the market. Counts follow GitHub's search index and may lag recent events. The report links to `bilan.dev/owner/repository` for more history; demo figures are fictional.
- After the map entrance finishes, the fisher casts, then occasionally casts again. Hovering, focusing, or clicking the parcel balloon reveals its slingshot hint without changing the selected PR.
- A mossy sword stone and an apple crate with a peeking worm and haloed banana are small discoveries around the outer ring. Their hints use the same hover, focus, and click behavior. The worm shares the paused ambient clock; with reduced motion it stays still.
- PRs are fetched 60 at a time, oldest first by default. The top search bar uses GitHub search across the repository’s open pull requests, with quick filters for author and review requests. Submit with Enter or Search; GitHub returns at most 1,000 matches, so narrow large results with additional qualifiers. Sidebar state filters refine only the current page; quick options explicitly search the repository. Demo search filters sample titles, authors, and labels as you type.
- Repository links use `/owner/repository`, with optional `?q=...` search text. Back/forward navigation restores the repository and search; legacy `/?repo=owner%2Frepository` links redirect to the new route. Reserved owners (`api`, `auth`, `brand`, `r`) use `/r/owner/repository` to avoid application-route conflicts.
- Selecting a shop adds a gold ground ring, a diamond quest marker, and a raised selected banner, with a matching list highlight. The indicator stays still while reading and clears when the selection is closed, filtered out, or removed. Search and pagination retain the scene and visibly label previous results while loading; account/repository changes and access denial clear them. Selecting or closing a shop preserves zoom; Reset camera explicitly restores the default view.
- The data adapter uses the full requested-reviewer count for state, even though it previews at most ten reviewers. Team names are not requested; teams and inaccessible reviewer identities use generic labels without changing the outstanding count. Label previews use up to ten GitHub labels per PR; GitHub search uses all labels. PR descriptions render up to 6,000 characters of Markdown, including task lists, tables, and code. Raw HTML is disabled and link schemes are sanitized. Images load only on request, footnotes stay in the description, and shortened bodies link to GitHub. GitHub remains the place to read full content and reviews.
- A visible tab refreshes about once per minute and when focused. GitHub rate limits pause all request triggers until the retry time; repeated outages back off to at most five minutes (or longer if GitHub requires it). Retryable failures keep the last successful snapshot visible with a stale-data notice, preserving the camera and keyboard focus. Authorization failures clear the snapshot; changing identity or repository never reuses another market’s data. The demo never substitutes for failed live data.
- Private responses are `no-store`; snapshots live only in browser memory. There is no localStorage persistence or external font service.

Shop-state priority:

1. Closed/merged PRs leave active discovery.
2. Draft → BACK SOON · Draft.
3. Changes requested → BACK SOON · Changes requested.
4. Outstanding review requests or review required → OPEN · Review requested.
5. Approved without outstanding requests → CLOSED · Approved.
6. Other open PRs → OPEN · Review welcome.

These are display conventions. Changes requested does not mean another reviewer could not help, and Approved does not mean ready to merge. The scene does not claim to show real-time human presence.

## Authentication and privacy

OAuth uses state and PKCE S256. GitHub user tokens are carried only in an authenticated-encrypted HttpOnly cookie; React props and browser JavaScript never receive the token. Cookies use Secure on HTTPS and SameSite=Lax. Login transactions expire after ten minutes; sessions expire no later than the GitHub token (at most eight hours). Refresh tokens are deliberately discarded. Logout clears cookies and requires a same-origin POST.

This stateless design cannot list devices or revoke a single session immediately server-side. GitHub token revocation/expiration still applies. Secrets stay in Workers secrets in production. Observability logging is disabled by default; do not enable logging of tokens, private PR bodies, or complete upstream responses.

## Structure

- `src/pages/`: shell, read-only API, OAuth endpoints.
- `../core/src/market.ts`: shared GitHub-to-shop state model.
- `src/lib/auth.ts`: encrypted cookies and OAuth helpers.
- `../core/src/github.ts`: shared bounded, user-authorized GitHub requests.
- `src/components/`: React UI and scene bridge.
- `src/scene/`: renderer and ambient life adapted from the original standalone prototype.
- `tests/e2e/`: browser checks, including mocked live pagination/revocation.

Live OAuth and a production Cloudflare deployment require your own configuration. Automated tests validate the integration boundaries with synthetic data; they are not a substitute for a live private-repository access test before launch.

Before launch, verify team requests and review decisions on live repositories with and without required-review rules. When GitHub returns no review decision, the app conservatively uses outstanding requests or “Review welcome”.
