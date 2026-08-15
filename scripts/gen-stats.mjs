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

// Octicon paths on a 16x16 grid. A null color defers to the theme-aware .icon rule.
const ICONS = {
  star: {
    color: "#ffd700",
    path: "M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z",
  },
  commits: {
    color: null,
    path: "M10.5 7.75a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm1.43.75a4.002 4.002 0 01-7.86 0H.75a.75.75 0 110-1.5h3.32a4.001 4.001 0 017.86 0h3.32a.75.75 0 110 1.5h-3.32z",
  },
  followers: {
    color: null,
    path: "M5.5 3.5a2 2 0 100 4 2 2 0 000-4zM2 5.5a3.5 3.5 0 115.898 2.549 5.507 5.507 0 013.034 4.084.75.75 0 11-1.482.235 4.001 4.001 0 00-7.9 0 .75.75 0 01-1.482-.236A5.507 5.507 0 013.102 8.05 3.49 3.49 0 012 5.5zM11 4a.75.75 0 100 1.5 1.5 1.5 0 01.666 2.844.75.75 0 00-.416.672v.352a.75.75 0 00.574.73c1.2.289 2.162 1.2 2.522 2.372a.75.75 0 101.434-.44 5.01 5.01 0 00-2.56-3.012A3 3 0 0011 4z",
  },
};

const rows = [
  ["star", "Total Stars Earned", stars],
  ["commits", "Total Commits (past year)", user.contributionsCollection.totalCommitContributions],
  ["followers", "Followers", user.followers.totalCount],
];

const format = (n) =>
  n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);

const escape = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ROW_HEIGHT = 26;
const HEADER = 62;
const height = HEADER + rows.length * ROW_HEIGHT + 12;

const lines = rows
  .map(([icon, label, value], i) => {
    const y = HEADER + i * ROW_HEIGHT;
    const { color, path } = ICONS[icon];
    const paint = color ? `fill="${color}"` : `class="icon"`;
    // Icon box is 16px tall; -12 from the text baseline centres it on the row.
    return `    <g transform="translate(25 ${y - 12})"><path ${paint} fill-rule="evenodd" d="${path}"/></g>
    <text x="51" y="${y}" class="label">${escape(label)}</text>
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
    .icon { fill: #4c71f2; }
    @media (prefers-color-scheme: dark) {
      .card { fill: #0d1117; stroke: #30363d; }
      .title { fill: #58a6ff; }
      .label, .value { fill: #c9d1d9; }
      .icon { fill: #58a6ff; }
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
