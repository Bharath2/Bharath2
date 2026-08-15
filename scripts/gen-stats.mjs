// Renders stats.svg from the GitHub GraphQL API.
// Run by .github/workflows/stats.yml with the Actions-provided GITHUB_TOKEN.

const USER = process.env.STATS_USER;
const TOKEN = process.env.GITHUB_TOKEN;

if (!USER || !TOKEN) {
  console.error("STATS_USER and GITHUB_TOKEN must be set");
  process.exit(1);
}

const QUERY = `
query($login: String!, $after: String) {
  user(login: $login) {
    followers { totalCount }
    issues { totalCount }
    contributionsCollection { totalCommitContributions }
    repositories(first: 100, after: $after, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { stargazerCount }
    }
  }
}`;

const fetchPage = async (after) => {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "profile-stats-card",
    },
    body: JSON.stringify({ query: QUERY, variables: { login: USER, after } }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status}: ${await res.text()}`);
  }

  const body = await res.json();
  if (body.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(body.errors)}`);
  }
  return body.data.user;
};

// Stars need every page; the scalar counts are identical on each, so keep the first.
let user;
let stars = 0;
let after = null;
do {
  const page = await fetchPage(after);
  user ??= page;
  stars += page.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0);
  after = page.repositories.pageInfo.hasNextPage
    ? page.repositories.pageInfo.endCursor
    : null;
} while (after);

const rows = [
  ["Total Stars Earned", stars],
  ["Total Commits (past year)", user.contributionsCollection.totalCommitContributions],
  ["Total Issues", user.issues.totalCount],
  ["Public Repos", user.repositories.totalCount],
  ["Followers", user.followers.totalCount],
];

const format = (n) =>
  n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);

const escape = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ROW_HEIGHT = 26;
const HEADER = 62;
const height = HEADER + rows.length * ROW_HEIGHT + 12;

const lines = rows
  .map(([label, value], i) => {
    const y = HEADER + i * ROW_HEIGHT;
    return `    <text x="25" y="${y}" class="label">${escape(label)}</text>
    <text x="455" y="${y}" class="value">${format(value)}</text>`;
  })
  .join("\n");

// Colors follow the reader's OS theme; GitHub renders this file through <img>,
// so the media query is the only styling hook available.
const svg = `<svg width="480" height="${height}" viewBox="0 0 480 ${height}"
     xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="${escape(USER)}'s GitHub stats">
  <style>
    .card { fill: #fffefe; stroke: #e4e2e2; }
    .title { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: #2f80ed; }
    .label { font: 400 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: #434d58; }
    .value { font: 600 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: #434d58; text-anchor: end; }
    @media (prefers-color-scheme: dark) {
      .card { fill: #0d1117; stroke: #30363d; }
      .title { fill: #58a6ff; }
      .label, .value { fill: #c9d1d9; }
    }
  </style>
  <rect class="card" x="0.5" y="0.5" width="479" height="${height - 1}" rx="4.5"/>
  <text x="25" y="35" class="title">${escape(USER)}'s GitHub Stats</text>
${lines}
</svg>
`;

const { writeFile } = await import("node:fs/promises");
await writeFile("stats.svg", svg);
console.log(`stats.svg written: ${stars} stars across ${user.repositories.totalCount} repos`);
