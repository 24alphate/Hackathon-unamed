/**
 * Unmapped Skill Ontology
 *
 * Three-layer normalization:
 *  Layer 1: CANONICAL_SKILLS — source of truth with aliases
 *  Layer 2: DEP_TO_SKILL    — npm/pip package → canonical skill (tier: direct)
 *  Layer 3: FILE_PATTERNS   — file path patterns → canonical skill (tier: inferred)
 *
 * Inference tiers:
 *  "direct"   — package.json/requirements.txt dependency proves the skill
 *  "inferred" — file structure pattern is consistent with the skill
 *  "claimed"  — explanation/README mentions skill, no artifact confirms it
 */

export const CANONICAL_SKILLS = [
  {
    id: "responsive_ui",
    canonical: "Responsive UI Design",
    category: "UI/Frontend",
    aliases: [
      "responsive design", "mobile-first design", "mobile responsive", "adaptive layout",
      "responsive layout", "responsive ui", "media queries", "responsive frontend",
      "responsive interface", "responsive sections", "responsive hero", "responsive patterns",
      "responsive web", "fluid layout", "responsive css"
    ],
    parent: null,
    implies: []
  },
  {
    id: "api_integration",
    canonical: "API Integration",
    category: "Backend/API",
    aliases: [
      "rest api", "rest api calls", "api usage", "frontend api calls", "rest connection",
      "http requests", "data fetching", "axios integration", "api-backed data loading",
      "fetch api", "rest endpoint consumption", "xhr", "api calls", "data fetching layer",
      "api-powered", "api-backed", "endpoint integration", "graphql", "api requests",
      "api data", "api call", "external api", "api consumption"
    ],
    parent: null,
    implies: []
  },
  {
    id: "form_handling",
    canonical: "Form Handling",
    category: "UI/Frontend",
    aliases: [
      "form submission", "form ux", "input handling", "controlled inputs",
      "form state management", "form fields", "user input", "input form",
      "form flow", "form ui", "form design"
    ],
    parent: null,
    implies: []
  },
  {
    id: "form_validation",
    canonical: "Form Validation",
    category: "UI/Frontend",
    aliases: [
      "input validation", "field validation", "form error handling", "validation rules",
      "schema validation", "form constraints", "validated form", "validate inputs",
      "client-side validation", "validation logic", "form checking"
    ],
    parent: "form_handling",
    implies: ["form_handling"]
  },
  {
    id: "component_structure",
    canonical: "Component Structure",
    category: "System Design",
    aliases: [
      "reusable components", "component architecture", "ui components", "component design",
      "component organisation", "componentized", "component-based", "reusable ui",
      "modular ui", "component reuse", "ui architecture", "component hierarchy"
    ],
    parent: null,
    implies: []
  },
  {
    id: "dashboard_ui",
    canonical: "Dashboard UI",
    category: "UI/Frontend",
    aliases: [
      "analytics dashboard", "dashboard layout", "admin dashboard", "merchant dashboard",
      "dashboard interface", "dashboard design", "dashboard and navigation",
      "dashboard layout and navigation", "reporting dashboard", "metrics dashboard"
    ],
    parent: null,
    implies: ["responsive_ui", "component_structure"]
  },
  {
    id: "data_visualization",
    canonical: "Data Visualization",
    category: "Data Handling",
    aliases: [
      "charts", "graphs", "chart rendering", "data charts", "data visualization",
      "metrics visualization", "analytics charts", "charting", "visual data"
    ],
    parent: null,
    implies: []
  },
  {
    id: "financial_data_presentation",
    canonical: "Financial Data Presentation",
    category: "Data Handling",
    aliases: [
      "transaction data", "financial ui", "transaction list", "financial data presentation",
      "transaction or financial data presentation", "payment data", "fintech ui",
      "transaction display", "money display", "financial table", "transaction rows"
    ],
    parent: null,
    implies: ["data_visualization"]
  },
  {
    id: "mobile_first",
    canonical: "Mobile-first Design",
    category: "UI/Frontend",
    aliases: [
      "mobile first", "small screen", "touch-friendly", "mobile layout",
      "mobile optimization", "small screen design", "mobile ui", "mobile-first"
    ],
    parent: "responsive_ui",
    implies: ["responsive_ui"]
  },
  {
    id: "deployment_literacy",
    canonical: "Deployment Literacy",
    category: "System Design",
    aliases: [
      "deployment", "live deployment", "hosting", "deployment literacy",
      "shipped", "production deployment", "live app", "deployed app", "ci/cd"
    ],
    parent: null,
    implies: []
  },
  {
    id: "react",
    canonical: "React",
    category: "UI/Frontend",
    aliases: ["reactjs", "react.js", "react framework", "react development", "react app"],
    parent: null,
    implies: ["component_structure"]
  },
  {
    id: "typescript",
    canonical: "TypeScript",
    category: "UI/Frontend",
    aliases: ["ts", "typed javascript", "typescript development", "strongly typed"],
    parent: null,
    implies: []
  },
  {
    id: "testing",
    canonical: "Testing",
    category: "Quality",
    aliases: [
      "unit tests", "integration tests", "test coverage", "testing practices",
      "test-driven", "automated tests", "test suite", "e2e tests"
    ],
    parent: null,
    implies: []
  },
  {
    id: "node_backend",
    canonical: "Node.js Backend",
    category: "Backend",
    aliases: [
      "node.js", "nodejs", "express", "express.js", "backend api",
      "node backend", "server-side javascript", "rest api server"
    ],
    parent: null,
    implies: []
  },
  {
    id: "database_integration",
    canonical: "Database Integration",
    category: "Backend",
    aliases: [
      "database", "sql", "nosql", "database queries", "orm", "data persistence",
      "database connection", "db integration", "query builder"
    ],
    parent: null,
    implies: []
  },
  {
    id: "checkout_ui",
    canonical: "Checkout UI",
    category: "UI/Frontend",
    aliases: [
      "checkout flow", "payment ui", "checkout page", "payment form",
      "multi-step checkout", "order flow", "purchase flow", "cart ui",
      "remittance checkout", "payment checkout"
    ],
    parent: null,
    implies: ["form_validation", "form_handling"]
  }
];

// ─── DEP_TO_SKILL ─────────────────────────────────────────────────────────────
// npm package name → { skillId, base confidence }
// These are DIRECT evidence — package in lockfile = skill is present in the codebase

export const DEP_TO_SKILL = {
  // React ecosystem
  "react":                    { skillId: "react",                    base: 0.92 },
  "react-dom":                { skillId: "react",                    base: 0.92 },
  "next":                     { skillId: "react",                    base: 0.90 },
  "gatsby":                   { skillId: "react",                    base: 0.88 },
  "@remix-run/react":         { skillId: "react",                    base: 0.90 },
  // API / data fetching
  "axios":                    { skillId: "api_integration",           base: 0.90 },
  "swr":                      { skillId: "api_integration",           base: 0.88 },
  "react-query":              { skillId: "api_integration",           base: 0.90 },
  "@tanstack/react-query":    { skillId: "api_integration",           base: 0.90 },
  "ky":                       { skillId: "api_integration",           base: 0.82 },
  "got":                      { skillId: "api_integration",           base: 0.80 },
  "node-fetch":               { skillId: "api_integration",           base: 0.78 },
  // Forms
  "react-hook-form":          { skillId: "form_validation",           base: 0.94 },
  "formik":                   { skillId: "form_validation",           base: 0.92 },
  "react-final-form":         { skillId: "form_validation",           base: 0.88 },
  "yup":                      { skillId: "form_validation",           base: 0.90 },
  "zod":                      { skillId: "form_validation",           base: 0.88 },
  "vee-validate":             { skillId: "form_validation",           base: 0.87 },
  "@hookform/resolvers":      { skillId: "form_validation",           base: 0.92 },
  // Data visualization
  "recharts":                 { skillId: "data_visualization",        base: 0.93 },
  "chart.js":                 { skillId: "data_visualization",        base: 0.92 },
  "react-chartjs-2":          { skillId: "data_visualization",        base: 0.93 },
  "d3":                       { skillId: "data_visualization",        base: 0.88 },
  "victory":                  { skillId: "data_visualization",        base: 0.88 },
  "nivo":                     { skillId: "data_visualization",        base: 0.88 },
  "apexcharts":               { skillId: "data_visualization",        base: 0.88 },
  "react-apexcharts":         { skillId: "data_visualization",        base: 0.90 },
  "highcharts":               { skillId: "data_visualization",        base: 0.88 },
  // TypeScript
  "typescript":               { skillId: "typescript",                base: 0.96 },
  // Testing
  "jest":                     { skillId: "testing",                   base: 0.93 },
  "vitest":                   { skillId: "testing",                   base: 0.93 },
  "cypress":                  { skillId: "testing",                   base: 0.91 },
  "@testing-library/react":   { skillId: "testing",                   base: 0.93 },
  "@testing-library/jest-dom":{ skillId: "testing",                   base: 0.91 },
  "mocha":                    { skillId: "testing",                   base: 0.88 },
  "playwright":               { skillId: "testing",                   base: 0.90 },
  // Node backend
  "express":                  { skillId: "node_backend",              base: 0.94 },
  "fastify":                  { skillId: "node_backend",              base: 0.92 },
  "koa":                      { skillId: "node_backend",              base: 0.88 },
  "hapi":                     { skillId: "node_backend",              base: 0.87 },
  "@hapi/hapi":               { skillId: "node_backend",              base: 0.87 },
  // Database
  "prisma":                   { skillId: "database_integration",      base: 0.93 },
  "mongoose":                 { skillId: "database_integration",      base: 0.91 },
  "pg":                       { skillId: "database_integration",      base: 0.89 },
  "better-sqlite3":           { skillId: "database_integration",      base: 0.88 },
  "sequelize":                { skillId: "database_integration",      base: 0.89 },
  "knex":                     { skillId: "database_integration",      base: 0.87 },
  "drizzle-orm":              { skillId: "database_integration",      base: 0.90 },
  // Deployment signals
  "vite":                     { skillId: "deployment_literacy",       base: 0.70 },
  "webpack":                  { skillId: "deployment_literacy",       base: 0.68 },
  "@vercel/node":             { skillId: "deployment_literacy",       base: 0.88 },
};

// ─── FILE PATTERNS → skill (tier: inferred) ───────────────────────────────────

export const FILE_PATTERNS = [
  { regex: /\.(jsx|tsx)$/i,                      skillId: "react",                    base: 0.76 },
  { regex: /\/components?\//i,                   skillId: "component_structure",      base: 0.74 },
  { regex: /\/api\/|api\.(js|ts)$/i,             skillId: "api_integration",          base: 0.72 },
  { regex: /chart|graph|visual/i,                skillId: "data_visualization",       base: 0.70 },
  { regex: /dashboard|analytics/i,               skillId: "dashboard_ui",             base: 0.74 },
  { regex: /checkout|payment|cart/i,             skillId: "checkout_ui",              base: 0.74 },
  { regex: /form|contact/i,                      skillId: "form_handling",            base: 0.68 },
  { regex: /transaction|fintech|wallet/i,        skillId: "financial_data_presentation", base: 0.72 },
  { regex: /\.test\.|\.spec\./i,                 skillId: "testing",                  base: 0.88 },
  { regex: /\.github\/workflows/i,               skillId: "deployment_literacy",      base: 0.82 },
  { regex: /vercel\.json|netlify\.toml/i,        skillId: "deployment_literacy",      base: 0.85 },
  { regex: /\.ts$|tsconfig\.json/i,              skillId: "typescript",               base: 0.80 },
  { regex: /mobile|responsive/i,                 skillId: "mobile_first",             base: 0.66 },
];

// ─── Build alias lookup at startup ────────────────────────────────────────────

export const ALIAS_MAP = {};
for (const skill of CANONICAL_SKILLS) {
  ALIAS_MAP[skill.canonical.toLowerCase()] = skill.id;
  ALIAS_MAP[skill.id] = skill.id;
  for (const alias of skill.aliases) {
    ALIAS_MAP[alias.toLowerCase().trim()] = skill.id;
  }
}

// ─── Implied skills (child → parent implications) ─────────────────────────────

const IMPLIES_MAP = {};
for (const skill of CANONICAL_SKILLS) {
  if (skill.implies?.length) {
    IMPLIES_MAP[skill.id] = skill.implies;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getCanonicalSkill(skillId) {
  return CANONICAL_SKILLS.find((s) => s.id === skillId) || null;
}

/** Normalize a free-text skill name to its canonical skill ID. Returns null if unknown. */
export function normalizeSkillName(rawName) {
  if (!rawName) return null;
  const key = String(rawName).toLowerCase().trim();

  if (ALIAS_MAP[key]) return ALIAS_MAP[key];

  // Substring match
  for (const [alias, skillId] of Object.entries(ALIAS_MAP)) {
    if (key.includes(alias) && alias.length > 4) return skillId;
    if (alias.includes(key) && key.length > 4) return skillId;
  }

  return null;
}

/** Expand a set of skill IDs to include implied parents. */
export function expandWithImplied(skillIds) {
  const expanded = new Set(skillIds);
  for (const id of skillIds) {
    for (const implied of (IMPLIES_MAP[id] || [])) {
      expanded.add(implied);
    }
  }
  return [...expanded];
}

/** Infer skills from a dependency list with tier = "direct". */
export function inferSkillsFromDeps(deps = []) {
  const found = new Map();
  for (const dep of deps) {
    const d = dep.toLowerCase().trim();
    const entry = DEP_TO_SKILL[d];
    if (entry) {
      const { skillId, base } = entry;
      if (!found.has(skillId) || found.get(skillId).base < base) {
        found.set(skillId, { base, sourceDep: dep });
      }
    }
  }

  const results = [];
  for (const [skillId, { base, sourceDep }] of found) {
    const skill = getCanonicalSkill(skillId);
    results.push({
      skillId,
      canonical: skill?.canonical || skillId,
      category: skill?.category || "General",
      tier: "direct",
      baseConfidence: base,
      sourceDep,
      evidence: `"${sourceDep}" found in package dependencies — direct artifact proof.`
    });
    // Add implied skills at slightly lower confidence
    for (const impliedId of (IMPLIES_MAP[skillId] || [])) {
      if (!found.has(impliedId)) {
        const impliedSkill = getCanonicalSkill(impliedId);
        results.push({
          skillId: impliedId,
          canonical: impliedSkill?.canonical || impliedId,
          category: impliedSkill?.category || "General",
          tier: "inferred",
          baseConfidence: base * 0.85,
          sourceDep,
          evidence: `Implied by "${sourceDep}" dependency — ${skill?.canonical} requires ${impliedSkill?.canonical}.`
        });
      }
    }
  }

  return results;
}

/** Infer skills from file paths with tier = "inferred". */
export function inferSkillsFromFilePaths(filePaths = []) {
  const found = new Map();

  for (const filePath of filePaths) {
    for (const { regex, skillId, base } of FILE_PATTERNS) {
      if (regex.test(filePath)) {
        if (!found.has(skillId) || found.get(skillId).base < base) {
          found.set(skillId, { base, sourceFile: filePath });
        }
      }
    }
  }

  return [...found.entries()].map(([skillId, { base, sourceFile }]) => {
    const skill = getCanonicalSkill(skillId);
    return {
      skillId,
      canonical: skill?.canonical || skillId,
      category: skill?.category || "General",
      tier: "inferred",
      baseConfidence: base,
      sourceFile,
      evidence: `File pattern "${sourceFile}" matches ${skill?.canonical || skillId} structure.`
    };
  });
}

/**
 * Compute a deterministic confidence score — NOT from the LLM.
 * Based purely on physical evidence signals.
 */
export function computeDeterministicConfidence(artifacts) {
  let score = 50;

  if (artifacts.liveUrlReachable)          score += 14;
  if (artifacts.hasMeaningfulDeps)         score += 12;
  if (artifacts.commitCount >= 5)          score += 10;
  if (artifacts.commitCount >= 10)         score += 5;
  if (artifacts.hasTestFiles)              score += 10;
  if (artifacts.hasCiConfig)              score += 5;
  if (artifacts.hasEnvExample)            score += 3;
  if (artifacts.hasReadme)               score += 6;
  if (artifacts.explanationWordCount >= 80)  score += 5;
  if (artifacts.explanationWordCount >= 150) score += 3;
  if (artifacts.depCount >= 4)           score += 4;

  // Penalties
  if (artifacts.isFork && artifacts.commitCount < 3)  score -= 22;
  if (artifacts.isFork)                               score -= 8;
  if (artifacts.daysSinceCreated < 1)                score -= 16;
  if (artifacts.commitCount < 2)                      score -= 10;
  if (!artifacts.hasGithubUrl)                        score -= 8;
  if (!artifacts.hasLiveUrl)                          score -= 6;
  if (artifacts.liveUrlReachable === false)           score -= 8;

  return Math.max(10, Math.min(98, Math.round(score)));
}

/**
 * Compute a deterministic proof strength score [0-100].
 */
export function computeProofStrength(artifacts) {
  let score = 0;
  score += artifacts.liveUrlReachable ? 30 : 0;
  score += (artifacts.hasMeaningfulDeps && artifacts.hasGithubUrl) ? 25 : artifacts.hasGithubUrl ? 15 : 0;
  score += artifacts.hasReadme ? 18 : 0;
  score += artifacts.explanationWordCount >= 50 ? 12 : 0;
  score += artifacts.hasVideo ? 8 : 0;
  score += artifacts.commitCount >= 5 ? 7 : 0;
  score -= artifacts.isFork ? 15 : 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}
