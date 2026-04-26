/**
 * GitHub evidence resolver — fetches README, file tree, package.json dependencies,
 * commit metadata, and fork status for a submitted repository.
 *
 * Also exports validateLiveUrl() for HTTP liveness checks.
 */

const USER_AGENT = "Unmapped-MVP/0.1 (proof-of-work evaluation)";

function parseGithubRepoUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, repo] = parts;
    const cleanRepo = repo.replace(/\.git$/i, "");
    if (!owner || !cleanRepo) return null;
    return { owner, repo: cleanRepo };
  } catch {
    return null;
  }
}

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN?.trim();
  const h = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": USER_AGENT
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: githubHeaders(), signal: AbortSignal.timeout(6000) });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchReadmeText(owner, repo, defaultBranch) {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
      headers: { ...githubHeaders(), Accept: "application/vnd.github.raw" },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) return (await res.text()).slice(0, 12000);
    if (defaultBranch) {
      const raw = await fetch(
        `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/README.md`,
        { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(4000) }
      );
      if (raw.ok) return (await raw.text()).slice(0, 12000);
    }
  } catch {}
  return "";
}

async function fetchPackageDeps(owner, repo, defaultBranch) {
  const filesToTry = ["package.json", "requirements.txt", "pyproject.toml", "Gemfile"];
  const deps = [];

  for (const file of filesToTry) {
    try {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${file}`;
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) continue;
      const text = await res.text();

      if (file === "package.json") {
        try {
          const pkg = JSON.parse(text);
          const allDeps = [
            ...Object.keys(pkg.dependencies || {}),
            ...Object.keys(pkg.devDependencies || {})
          ];
          deps.push(...allDeps);
        } catch {}
      } else if (file === "requirements.txt") {
        const lines = text.split("\n").map((l) => l.split(/[>=<!]/)[0].trim()).filter(Boolean);
        deps.push(...lines.map((d) => d.toLowerCase()));
      }

      if (deps.length) break; // found one, stop
    } catch {}
  }

  return deps;
}

async function fetchCommitMeta(owner, repo) {
  try {
    // Fetch up to 30 commits to count them and get the first commit date
    const commits = await fetchJson(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=30`
    );
    const count = Array.isArray(commits) ? commits.length : 0;
    const lastCommitAt = commits?.[0]?.commit?.committer?.date || null;
    const firstCommitAt = commits?.[count - 1]?.commit?.committer?.date || null;
    return { count, lastCommitAt, firstCommitAt, hasMoreThan30: count === 30 };
  } catch {
    return { count: 0, lastCommitAt: null, firstCommitAt: null, hasMoreThan30: false };
  }
}

function pickRelevantPaths(paths) {
  const scorePath = (p) => {
    const lower = p.toLowerCase();
    let s = 0;
    if (p.startsWith("src/") || p.startsWith("app/") || p.startsWith("lib/")) s += 3;
    if (lower.endsWith("package.json")) s += 4;
    if (lower.match(/\.(jsx?|tsx?|css|html|vue|svelte|ts)$/)) s += 2;
    if (lower.includes("component")) s += 1;
    if (lower.includes(".test.") || lower.includes(".spec.")) s += 2;
    if (lower.includes(".github/workflows")) s += 3;
    return s;
  };
  return [...paths]
    .filter((p) => p && !p.includes("node_modules/") && !p.includes(".git/"))
    .sort((a, b) => scorePath(b) - scorePath(a))
    .slice(0, 120);
}

function extractPathsFromTree(tree) {
  if (!Array.isArray(tree?.tree)) return [];
  return tree.tree.filter((n) => n.type === "blob" && n.path).map((n) => n.path);
}

function pickKeyFiles(paths = []) {
  const interesting = paths
    .filter((p) => /\.(jsx?|tsx?|py|go|java|rb)$/i.test(p))
    .filter((p) => /^src\/|^app\/|^lib\/|^server\//i.test(p))
    .filter((p) => !/\.test\.|\.spec\.|__tests__|node_modules/i.test(p));
  return interesting.slice(0, 3);
}

async function fetchKeyFileSnippets(owner, repo, defaultBranch, paths = []) {
  const keyFiles = pickKeyFiles(paths);
  const out = [];
  for (const path of keyFiles) {
    try {
      const raw = await fetch(
        `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${path}`,
        { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(4000) }
      );
      if (!raw.ok) continue;
      const text = await raw.text();
      out.push({
        path,
        snippet: text.slice(0, 1600)
      });
    } catch {
      // best-effort only
    }
  }
  return out;
}

function pickReadmeSearchPhrase(readme = "") {
  const lines = String(readme)
    .split(/\r?\n/)
    .map((line) => line.replace(/[`*_#>\-[\]()]/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 45 && line.length <= 120)
    .filter((line) => !/^install|usage|license|npm|yarn|pnpm|clone|cd /i.test(line));
  return lines[0] || "";
}

async function searchReadmePhrase(owner, repo, readme) {
  const phrase = pickReadmeSearchPhrase(readme);
  if (!phrase || !process.env.GITHUB_TOKEN?.trim()) {
    return {
      searched: false,
      phrase: phrase ? phrase.slice(0, 120) : "",
      totalCount: null,
      externalMatches: [],
      reason: phrase ? "github_token_required_for_code_search" : "no_distinct_readme_phrase"
    };
  }
  try {
    const q = encodeURIComponent(`"${phrase}" in:file filename:README.md`);
    const data = await fetchJson(`https://api.github.com/search/code?q=${q}&per_page=5`);
    const items = Array.isArray(data.items) ? data.items : [];
    const externalMatches = items
      .map((item) => ({
        repository: item.repository?.full_name || "",
        path: item.path || "",
        html_url: item.html_url || ""
      }))
      .filter((item) => item.repository.toLowerCase() !== `${owner}/${repo}`.toLowerCase());
    return {
      searched: true,
      phrase: phrase.slice(0, 120),
      totalCount: Number(data.total_count || 0),
      externalMatches
    };
  } catch (error) {
    return {
      searched: false,
      phrase: phrase.slice(0, 120),
      totalCount: null,
      externalMatches: [],
      reason: (error?.message || "readme_search_failed").slice(0, 200)
    };
  }
}

async function fetchOriginalitySignals(owner, repo, repoInfo, readme, commitMeta) {
  const readmeSearch = await searchReadmePhrase(owner, repo, readme);
  const riskFactors = [];
  if (repoInfo.fork) riskFactors.push("repository_is_fork");
  if ((commitMeta?.count || 0) < 3) riskFactors.push("very_low_commit_count");
  if (readmeSearch.externalMatches?.length) riskFactors.push("readme_phrase_found_in_other_repos");
  const parent = repoInfo.parent ? {
    fullName: repoInfo.parent.full_name,
    htmlUrl: repoInfo.parent.html_url
  } : null;
  const source = repoInfo.source ? {
    fullName: repoInfo.source.full_name,
    htmlUrl: repoInfo.source.html_url
  } : null;
  const riskLevel = riskFactors.includes("repository_is_fork") && riskFactors.includes("very_low_commit_count")
    ? "high"
    : riskFactors.includes("readme_phrase_found_in_other_repos") || riskFactors.length >= 2
      ? "medium"
      : "low";
  return {
    riskLevel,
    riskFactors,
    parent,
    source,
    readmeSearch,
    note: riskFactors.length
      ? "Originality risk signals found; require manual review before trusting repo authorship."
      : "No obvious fork/copy originality risk detected from available GitHub metadata."
  };
}

/**
 * Ping a live URL and return liveness metadata.
 * Never throws — always returns a result object.
 */
export async function validateLiveUrl(url) {
  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    return { reachable: false, statusCode: null, responseMs: null, reason: "no_url" };
  }
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
      redirect: "follow"
    });
    const responseMs = Date.now() - start;
    return {
      reachable: res.status >= 200 && res.status < 400,
      statusCode: res.status,
      responseMs,
      reason: res.status >= 200 && res.status < 400 ? "ok" : `http_${res.status}`
    };
  } catch (err) {
    return {
      reachable: false,
      statusCode: null,
      responseMs: Date.now() - start,
      reason: err?.name === "TimeoutError" ? "timeout" : "network_error"
    };
  }
}

/**
 * Resolve full GitHub evidence including README, file tree, dependencies, and commit metadata.
 */
export async function resolveGithubEvidence(submission) {
  if (!submission?.githubUrl) {
    return {
      source: "none",
      readme: "No GitHub URL was provided.",
      fileStructure: [],
      dependencies: [],
      keyFileSnippets: [],
      commitMeta: { count: 0 },
      isFork: false,
      createdAt: null
    };
  }

  const parsed = parseGithubRepoUrl(submission.githubUrl);
  if (!parsed) {
    return {
      source: "simulated",
      ...simulateFromSubmission(submission),
      dependencies: [],
      keyFileSnippets: [],
      commitMeta: { count: 0 },
      isFork: false,
      createdAt: null,
      error: "URL is not a valid github.com owner/repo link."
    };
  }

  const { owner, repo } = parsed;

  try {
    const repoInfo = await fetchJson(`https://api.github.com/repos/${owner}/${repo}`);
    const defaultBranch = repoInfo.default_branch || "main";
    const isFork = Boolean(repoInfo.fork);
    const createdAt = repoInfo.created_at || null;

    const [readme, treeData, deps, commitMeta] = await Promise.all([
      fetchReadmeText(owner, repo, defaultBranch),
      fetchJson(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`
      ).catch(() => null),
      fetchPackageDeps(owner, repo, defaultBranch),
      fetchCommitMeta(owner, repo)
    ]);

    const allPaths = treeData ? extractPathsFromTree(treeData) : [];
    const fileStructure = pickRelevantPaths(allPaths.length ? allPaths : (readme ? ["README.md"] : []));
    const [keyFileSnippets, originality] = await Promise.all([
      fetchKeyFileSnippets(owner, repo, defaultBranch, allPaths),
      fetchOriginalitySignals(owner, repo, repoInfo, readme || "", commitMeta)
    ]);

    return {
      source: "github",
      owner,
      repo,
      defaultBranch,
      readme: readme || "(No README found.)",
      fileStructure,
      fileCount: allPaths.length,
      dependencies: deps,
      keyFileSnippets,
      commitMeta,
      isFork,
      createdAt,
      originality
    };
  } catch (err) {
    return {
      source: "simulated",
      ...simulateFromSubmission(submission),
      owner,
      repo,
      dependencies: [],
      keyFileSnippets: [],
      commitMeta: { count: 0 },
      isFork: false,
      createdAt: null,
      error: (err?.message || String(err)).slice(0, 400)
    };
  }
}

function simulateFromSubmission(submission) {
  const text = `${submission.projectDescription} ${submission.explanation}`.toLowerCase();
  const hasDashboard = text.includes("dashboard") || text.includes("transaction");
  const hasApi = text.includes("api") || text.includes("fetch") || text.includes("endpoint");
  const hasForm = text.includes("form") || text.includes("validation") || text.includes("contact");
  const hasReact = text.includes("react") || text.includes("component");
  const hasChart = text.includes("chart") || text.includes("graph") || text.includes("visual");
  const hasCheckout = text.includes("checkout") || text.includes("payment");

  const projectName =
    submission.githubUrl?.split("/").filter(Boolean).pop()?.replace(/\.git$/i, "") || "project";

  const readme = [
    `# ${projectName}`,
    submission.projectDescription || "Proof-of-work submission.",
    hasApi ? "Includes API-powered data loading with loading and error states." : "",
    hasForm ? "Includes validated user input forms." : "",
    hasDashboard ? "Includes dashboard or transaction-oriented UI." : "Includes landing page sections.",
    hasChart ? "Includes data visualization components." : "",
    hasCheckout ? "Includes multi-step checkout flow." : ""
  ].filter(Boolean).join("\n");

  const fileStructure = [
    "README.md",
    "package.json",
    hasReact ? "src/App.jsx" : "src/main.js",
    hasReact ? "src/components/Hero.jsx" : "src/index.html",
    hasDashboard ? "src/components/Dashboard.jsx" : "src/components/Landing.jsx",
    hasDashboard ? "src/components/TransactionList.jsx" : "src/components/PricingSection.jsx",
    hasApi ? "src/lib/api.js" : "src/data/content.js",
    hasForm ? "src/components/ContactForm.jsx" : "src/components/CTA.jsx",
    hasChart ? "src/components/Chart.jsx" : "",
    hasCheckout ? "src/components/CheckoutFlow.jsx" : "",
    "src/styles.css"
  ].filter(Boolean);

  return { readme, fileStructure };
}

export { parseGithubRepoUrl };
