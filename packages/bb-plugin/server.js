// src/server.ts
import { cliCommand, defineCli, PluginCliError } from "@get-bb/plugin-sdk";

// ../core/src/market.ts
var stateLabels = {
  awaiting: "Review welcome",
  requested: "Review requested",
  draft: "Draft",
  author: "Changes requested",
  ready: "Approved"
};
function shopState(pr) {
  if (pr.state !== "OPEN") return null;
  if (pr.isDraft) return "draft";
  if (pr.reviewDecision === "CHANGES_REQUESTED") return "author";
  if (pr.requestedCount > 0 || pr.reviewDecision === "REVIEW_REQUIRED") return "requested";
  if (pr.reviewDecision === "APPROVED") return "ready";
  return "awaiting";
}
function parseRepository(input) {
  let value = input.trim();
  if (value.startsWith("https://github.com/")) value = value.slice(19);
  value = value.replace(/\/$/, "");
  const match = /^([a-z\d](?:[a-z\d-]{0,38}))\/([a-z\d_.-]{1,100})$/i.exec(value);
  if (!match || [".", ".."].includes(match[2])) return null;
  return { owner: match[1], repo: match[2] };
}

// ../core/src/retry.ts
function retryAfterMs(value, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1e3 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

// ../core/src/market-search.ts
var MAX_SEARCH_LENGTH = 256;
function githubSearchQuery(repository, input) {
  const search = input.trim();
  if (search.length > MAX_SEARCH_LENGTH)
    throw new Error(`Keep your search under ${MAX_SEARCH_LENGTH + 1} characters.`);
  if (search.includes("\\"))
    throw new Error("Use plain quotation marks without backslashes in your search.");
  let quoted = false;
  let depth = 0;
  for (const character of search) {
    if (character === '"') quoted = !quoted;
    if (quoted) continue;
    if (character === "(" && ++depth > 4)
      throw new Error("Use at most four levels of parentheses in your search.");
    if (character === ")" && --depth < 0)
      throw new Error("Close each opening parenthesis and quotation mark in your search.");
  }
  if (quoted || depth)
    throw new Error("Close each opening parenthesis and quotation mark in your search.");
  const scope = `repo:${repository} is:pr is:open`;
  return search ? `(${scope}) AND (${search})` : scope;
}

// ../core/src/github.ts
var GitHubError = class extends Error {
  constructor(message, status2, retryAfter) {
    super(message);
    this.status = status2;
    this.retryAfter = retryAfter;
  }
  status;
  retryAfter;
};
function rateLimited(response) {
  const reset = Number(response.headers.get("x-ratelimit-reset")) * 1e3 - Date.now();
  const delay = Math.max(
    retryAfterMs(response.headers.get("retry-after")),
    response.headers.get("x-ratelimit-remaining") === "0" && Number.isFinite(reset) ? reset : 0,
    6e4
  );
  return new GitHubError(
    "GitHub\u2019s request limit has been reached. Please wait before trying again.",
    429,
    Math.ceil(delay / 1e3)
  );
}
async function github(token, path, init = {}, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "brocante",
        ...init.headers
      },
      signal: AbortSignal.timeout(2e4)
    });
  } catch (error) {
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))
      throw new GitHubError("The GitHub request timed out. Please try again.", 504);
    if (error instanceof TypeError)
      throw new GitHubError("Unable to reach GitHub. Check your network and try again.", 503);
    throw error;
  }
  if (!response.ok) {
    if (response.status === 401)
      throw new GitHubError("Your GitHub session expired. Please sign in again.", 401);
    if (response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0" || response.status === 403 && (response.headers.has("retry-after") || /secondary rate limit|API rate limit exceeded/i.test(await response.clone().text())))
      throw rateLimited(response);
    if (response.status === 403 || response.status === 404)
      throw new GitHubError(
        "This repository is unavailable. Check its name and your GitHub credentials and permissions.",
        403
      );
    throw new GitHubError(
      "GitHub is temporarily unavailable. Please try again.",
      502,
      Math.ceil(Math.max(6e4, retryAfterMs(response.headers.get("retry-after"))) / 1e3)
    );
  }
  return response;
}
var pullRequestFields = `
  number title url body createdAt updatedAt isDraft state reviewDecision
  additions deletions changedFiles
  author { login }
  labels(first: 10) { nodes { name } }
  reviewRequests(first: 10) { totalCount nodes { requestedReviewer { ... on User { login } __typename ... on Mannequin { login } } } }
`;
var activityVariables = "$opened: String!, $merged: String!, $previousOpened: String!, $previousMerged: String!";
var activityFields = `
  activityOpened: search(query: $opened, type: ISSUE_ADVANCED, first: 1) { issueCount }
  activityMerged: search(query: $merged, type: ISSUE_ADVANCED, first: 1) { issueCount }
  activityPreviousOpened: search(query: $previousOpened, type: ISSUE_ADVANCED, first: 1) { issueCount }
  activityPreviousMerged: search(query: $previousMerged, type: ISSUE_ADVANCED, first: 1) { issueCount }
`;
var activityRoots = [
  "activityOpened",
  "activityMerged",
  "activityPreviousOpened",
  "activityPreviousMerged"
];
var marketQuery = `query Market($owner: String!, $repo: String!, $cursor: String, ${activityVariables}) {
  repository(owner: $owner, name: $repo) {
    nameWithOwner url isPrivate visibility
    pullRequests(first: 60, after: $cursor, states: OPEN, orderBy: {field: CREATED_AT, direction: ASC}) {
      totalCount pageInfo { hasNextPage endCursor }
      nodes {
        ${pullRequestFields}
      }
    }
  }
  ${activityFields}
}`;
var marketSearchQuery = `query MarketSearch($owner: String!, $repo: String!, $cursor: String, $search: String!, ${activityVariables}) {
  repository(owner: $owner, name: $repo) { nameWithOwner url isPrivate visibility }
  search(query: $search, type: ISSUE_ADVANCED, first: 60, after: $cursor) {
    issueCount pageInfo { hasNextPage endCursor }
    nodes { __typename ... on PullRequest {
      ${pullRequestFields}
      repository { nameWithOwner }
    } }
  }
  ${activityFields}
}`;
async function loadMarket(token, owner, repo, cursor, fetcher = fetch, search = "") {
  const timestamp = (time) => new Date(time).toISOString().replace(".000Z", "Z");
  const asOf = timestamp(Math.floor(Date.now() / 1e3) * 1e3);
  const since = timestamp(Date.parse(asOf) - 30 * 864e5);
  const previousSince = timestamp(Date.parse(asOf) - 60 * 864e5);
  const recentEnd = timestamp(Date.parse(asOf) - 1e3);
  const previousEnd = timestamp(Date.parse(since) - 1e3);
  const scope = `repo:${owner}/${repo} is:pr`;
  const activity = {
    opened: `${scope} created:${since}..${recentEnd}`,
    merged: `${scope} is:merged merged:${since}..${recentEnd}`,
    previousOpened: `${scope} created:${previousSince}..${previousEnd}`,
    previousMerged: `${scope} is:merged merged:${previousSince}..${previousEnd}`
  };
  let query;
  if (search.trim()) {
    try {
      query = githubSearchQuery(`${owner}/${repo}`, search);
    } catch (error) {
      throw new GitHubError(error.message, 400);
    }
  }
  const response = await github(
    token,
    "/graphql",
    {
      method: "POST",
      body: JSON.stringify({
        query: query ? marketSearchQuery : marketQuery,
        variables: { owner, repo, cursor, ...activity, ...query ? { search: query } : {} }
      })
    },
    fetcher
  );
  const result = await response.json().catch(() => {
    throw new GitHubError("GitHub returned an unreadable response. Please try again.", 502);
  });
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new GitHubError("GitHub returned an unreadable response. Please try again.", 502);
  if (result.errors?.some((error) => error.type === "RATE_LIMITED")) throw rateLimited(response);
  const connection = query ? result.data?.search : result.data?.repository?.pullRequests;
  const errors = result.errors?.filter((error) => {
    const originalPath = error.path;
    if (originalPath && activityRoots.includes(String(originalPath[0]))) return false;
    const validRoot = query ? originalPath?.[0] === "search" : originalPath?.[0] === "repository" && originalPath[1] === "pullRequests";
    const path = originalPath?.slice(query ? 1 : 2);
    return !(error.type === "FORBIDDEN" && path && validRoot && (path.length === 6 || path.length === 7 && ["login", "__typename"].includes(String(path[6]))) && path[0] === "nodes" && Number.isInteger(path[1]) && Number(path[1]) >= 0 && path[2] === "reviewRequests" && path[3] === "nodes" && Number.isInteger(path[4]) && Number(path[4]) >= 0 && path[5] === "requestedReviewer" && !!connection?.nodes?.[Number(path[1])]?.reviewRequests?.nodes?.[Number(path[4])]);
  });
  if (errors?.length) {
    if (query && errors.some(
      (error) => ["INVALID", "UNPROCESSABLE", "UNPROCESSABLE_ENTITY"].includes(error.type ?? "") || error.path?.[0] === "search" && /invalid.*query|parse|syntax/i.test(error.message ?? "")
    ))
      throw new GitHubError(
        "GitHub could not understand this search. Check the qualifiers and try again.",
        400
      );
    const accessFailure = errors.every(
      (error) => ["FORBIDDEN", "NOT_FOUND"].includes(error.type ?? "") && error.path?.length === 1 && error.path[0] === "repository"
    );
    throw new GitHubError(
      accessFailure ? "Unable to read this repository. Check its name and your GitHub credentials and permissions." : "GitHub could not return complete pull-request data. Please try again.",
      accessFailure ? 403 : 502,
      accessFailure ? void 0 : 60
    );
  }
  if (!result.data?.repository)
    throw new GitHubError(
      "Unable to read this repository. Check its name and your GitHub credentials and permissions.",
      403
    );
  const source = result.data.repository;
  if (!connection)
    throw new GitHubError(
      "GitHub could not return complete pull-request data. Please try again.",
      502,
      60
    );
  if (query && connection.nodes.some(
    (pr) => pr && (pr.__typename !== "PullRequest" || pr.repository?.nameWithOwner.toLowerCase() !== source.nameWithOwner.toLowerCase())
  ))
    throw new GitHubError(
      "Search only open pull requests in this repository. Remove conflicting repository or state qualifiers.",
      400
    );
  return {
    repository: source.nameWithOwner,
    url: source.url,
    isPrivate: source.isPrivate,
    visibility: source.visibility,
    repositoryStats: !result.errors?.some((error) => activityRoots.includes(String(error.path?.[0]))) && result.data.activityOpened && result.data.activityMerged && result.data.activityPreviousOpened && result.data.activityPreviousMerged ? {
      opened: result.data.activityOpened.issueCount,
      merged: result.data.activityMerged.issueCount,
      previousOpened: result.data.activityPreviousOpened.issueCount,
      previousMerged: result.data.activityPreviousMerged.issueCount,
      since,
      previousSince,
      asOf
    } : void 0,
    total: query ? result.data.search.issueCount : source.pullRequests.totalCount,
    searchLimited: query ? result.data.search.issueCount > 1e3 : false,
    nextCursor: connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    pullRequests: connection.nodes.filter((pr) => !!pr && pr.state === "OPEN").map((pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.url,
      body: pr.body.slice(0, 6e3),
      bodyTruncated: pr.body.length > 6e3,
      additions: pr.additions ?? null,
      deletions: pr.deletions ?? null,
      changedFiles: pr.changedFiles ?? null,
      author: pr.author?.login ?? "deleted-user",
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
      isDraft: pr.isDraft,
      state: pr.state,
      reviewDecision: pr.reviewDecision,
      requestedCount: pr.reviewRequests.totalCount,
      requestedReviewers: pr.reviewRequests.nodes.map(
        ({ requestedReviewer: r }) => r?.login ?? (r?.__typename === "Team" ? "A team" : "A reviewer")
      ),
      labels: pr.labels.nodes.map((label) => label.name)
    }))
  };
}

// ../core/src/report.ts
async function generateReport(options) {
  const repository = parseRepository(options.repository);
  if (!repository) throw new Error("Use a repository in owner/name format.");
  if (!options.token.trim()) throw new Error("A GitHub token is required.");
  const maxPages = options.maxPages ?? 10;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100)
    throw new Error("maxPages must be an integer from 1 to 100.");
  const search = options.search?.trim() ?? "";
  const requests = /* @__PURE__ */ new Map();
  const cursors = /* @__PURE__ */ new Set();
  let cursor = null;
  let snapshot;
  let pagesFetched = 0;
  do {
    const page = await loadMarket(
      options.token,
      repository.owner,
      repository.repo,
      cursor,
      options.fetcher,
      search
    );
    if (snapshot && (page.repository !== snapshot.repository || page.isPrivate !== snapshot.isPrivate))
      throw new GitHubError("Repository access changed during the report. Please retry.", 403);
    snapshot ??= page;
    for (const pr of page.pullRequests) requests.set(pr.number, pr);
    pagesFetched++;
    cursor = page.nextCursor;
    if (cursor && cursors.has(cursor))
      throw new GitHubError("GitHub repeated a page cursor. Please retry.", 502, 60);
    if (cursor) cursors.add(cursor);
  } while (cursor && pagesFetched < maxPages);
  return reportFromSnapshot(
    { ...snapshot, pullRequests: [...requests.values()], nextCursor: cursor },
    search,
    pagesFetched
  );
}
function reportFromSnapshot(data, search = "", pagesFetched = 1) {
  const { nextCursor, ...snapshot } = data;
  return {
    ...snapshot,
    searchLimited: data.searchLimited ?? false,
    pullRequests: data.pullRequests.map((pr) => ({
      ...pr,
      bodyTruncated: pr.bodyTruncated ?? false
    })),
    schemaVersion: 1,
    search,
    pagesFetched,
    complete: nextCursor === null && !data.searchLimited
  };
}
var escapeHtml = (value) => String(value).replace(
  /[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
);
var escapeMarkdown = (value) => String(value).replace(/[\r\n\t]/g, " ").replace(/[\\`*_{}[\]()#+!|<>~]/g, "\\$&");
var status = (pr) => stateLabels[shopState(pr) ?? "ready"];
var githubUrl = (report, number) => {
  const repository = parseRepository(report.repository);
  if (!repository) throw new Error("Invalid report repository.");
  return `https://github.com/${repository.owner}/${repository.repo}${number === void 0 ? "" : `/pull/${Number(number)}`}`;
};
function renderReport(report, format, options = {}) {
  if (format === "json") return JSON.stringify(report, null, 2) + "\n";
  const count = `${report.pullRequests.length} of ${report.total} matching open pull requests`;
  const coverage = report.complete ? "All available pages fetched." : `Partial report: more results may be available. ${options.partialHint ?? "Increase --max-pages or narrow --search."}`;
  const stats = report.repositoryStats;
  const history = stats ? `Last 30 days: ${stats.opened} opened, ${stats.merged} merged. Previous 30 days: ${stats.previousOpened} opened, ${stats.previousMerged} merged.` : "Historical counts unavailable.";
  const footer = report.demo ? "Fictional demo for exploring Brocante. No live GitHub data." : "Snapshot of GitHub data; counts can lag and requests can change during pagination.";
  if (format === "markdown")
    return [
      `# Brocante \u2014 ${escapeMarkdown(report.repository)}`,
      "",
      ...report.demo ? ["Fictional demo. No live GitHub data.", ""] : [],
      `${count}. ${coverage}`,
      "",
      `Fetched: ${escapeMarkdown(report.fetchedAt)}${report.isPrivate ? " \xB7 Private repository" : ""}`,
      ...report.search ? ["", `Search: ${escapeMarkdown(report.search)}`] : [],
      "",
      history,
      "",
      "| Pull request | Author | Review state | Changes |",
      "| --- | --- | --- | --- |",
      ...report.pullRequests.map(
        (pr) => `| ${report.demo ? `#${pr.number} ${escapeMarkdown(pr.title)}` : `[#${pr.number} ${escapeMarkdown(pr.title)}](${githubUrl(report, pr.number)})`} | ${escapeMarkdown(pr.author)} | ${status(pr)} | ${pr.additions == null || pr.deletions == null ? "Unknown" : `+${pr.additions} / \u2212${pr.deletions}`} |`
      ),
      "",
      footer,
      ""
    ].join("\n");
  if (format !== "html") throw new Error("Choose html, markdown, or json.");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Brocante \u2014 ${escapeHtml(report.repository)}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;color:#264b3d;background:#f6f1e6;margin:auto;padding:32px;max-width:1100px}h1{font:2.2em Georgia,serif}a{color:inherit}header,p{max-width:75ch}.table{overflow:auto}table{width:100%;border-collapse:collapse;background:#fff9}th,td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #264b3d30}th{white-space:nowrap}.note{border-left:3px solid #b64e36;padding-left:12px}footer{margin-top:32px;font-size:.85em}@media(max-width:600px){body{padding:16px}}</style></head>
<body><header><p>Brocante \xB7 A marketplace for pull requests</p>${report.demo ? '<p class="note">Fictional demo. No live GitHub data.</p>' : ""}<h1>${escapeHtml(report.repository)}</h1>
<p>${escapeHtml(count)} \xB7 ${report.isPrivate ? "Private repository" : "Public repository"}</p>
<p>Fetched ${escapeHtml(report.fetchedAt)}</p>${report.search ? `<p>Search: ${escapeHtml(report.search)}</p>` : ""}
<p class="note">${escapeHtml(coverage)}</p><p>${escapeHtml(history)}</p></header>
<main class="table"><table><caption>Open pull requests</caption><thead><tr><th>Pull request</th><th>Author</th><th>Review state</th><th>Changes</th></tr></thead><tbody>
${report.pullRequests.map((pr) => `<tr><td>${report.demo ? `#${pr.number} ${escapeHtml(pr.title)}` : `<a href="${escapeHtml(githubUrl(report, pr.number))}" rel="noreferrer">#${pr.number} ${escapeHtml(pr.title)}</a>`}</td><td>${escapeHtml(pr.author)}</td><td>${escapeHtml(status(pr))}</td><td>${pr.additions == null || pr.deletions == null ? "Unknown" : `+${pr.additions} / \u2212${pr.deletions}`}</td></tr>`).join("\n")}
</tbody></table></main><footer>${escapeHtml(footer)}${report.demo ? "" : ` <a href="${escapeHtml(githubUrl(report))}" rel="noreferrer">View repository on GitHub</a>`}</footer></body></html>
`;
}

// src/server.ts
function plugin(bb) {
  const settings = bb.settings.define({
    githubToken: { type: "string", label: "GitHub read-only token", secret: true }
  });
  let retryAt = 0;
  bb.cli.register(
    defineCli({
      name: "brocante",
      summary: "Read GitHub pull-request reports",
      commands: {
        report: cliCommand({
          summary: "Report on a repository\u2019s open pull requests",
          positionals: [
            { name: "repository", description: "GitHub owner/repository", required: true }
          ],
          options: {
            format: {
              type: "enum",
              values: ["markdown", "json"],
              default: "markdown",
              description: "Report output format"
            },
            search: {
              type: "string",
              description: "Search this repository\u2019s open pull requests (max 256 characters)"
            }
          },
          async run(input) {
            const { githubToken } = await settings.get();
            if (!githubToken)
              throw new PluginCliError(
                "Configure a GitHub token in the Brocante plugin settings.",
                { code: "missing_token" }
              );
            if (Date.now() < retryAt)
              throw new PluginCliError(
                `GitHub is rate limited. Retry after ${Math.ceil((retryAt - Date.now()) / 1e3)} seconds.`,
                { code: "rate_limited" }
              );
            try {
              const report = await generateReport({
                repository: input.positionals.repository,
                token: githubToken,
                search: input.options.search,
                maxPages: 1
              });
              report.pullRequests = report.pullRequests.map((pr) => ({
                ...pr,
                body: "",
                bodyTruncated: pr.bodyTruncated || pr.body.length > 0
              }));
              return {
                exitCode: 0,
                stdout: renderReport(report, input.options.format, {
                  partialHint: "Narrow --search, or use the standalone brocante CLI for more pages."
                })
              };
            } catch (error) {
              if (error instanceof GitHubError && error.status === 429)
                retryAt = Date.now() + (error.retryAfter ?? 60) * 1e3;
              const message = error instanceof GitHubError ? `${error.status === 401 ? "GitHub rejected the configured token." : error.message}${error.retryAfter ? ` Retry after ${error.retryAfter} seconds.` : ""}` : error instanceof TypeError ? "Unable to reach GitHub. Please retry." : error instanceof Error ? error.message : "Report generation failed.";
              throw new PluginCliError(message, {
                code: error instanceof GitHubError && error.status === 429 ? "rate_limited" : "report_failed"
              });
            }
          }
        })
      }
    })
  );
}
export {
  plugin as default
};
