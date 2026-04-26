import { getDb } from "./db.js";
import { buildPriorTestHistory } from "./negativeEvidence.js";
import { validateLiveUrl } from "./github.js";

const USER_AGENT = "UnmappedProofEngine/1.0";

function getOrCreateSkill(db, name, category = "General") {
  const row = db.prepare("SELECT id FROM skills WHERE name = ?").get(name);
  if (row) return row.id;
  return db
    .prepare("INSERT INTO skills (name, category, ontology_source) VALUES (?,?,?)")
    .run(name, category, "inferred")
    .lastInsertRowid;
}

function scoreToLevel(score) {
  if (score >= 90) return "advanced";
  if (score >= 75) return "intermediate";
  return "beginner";
}

function proofStrengthLabel(score) {
  if (score >= 75) return "Verified Strong";
  if (score >= 55) return "Strong";
  if (score >= 35) return "Moderate";
  return "Weak";
}

/**
 * Persists evaluation outputs into normalized tables.
 */
export function persistSubmissionEvaluation({
  talentId,
  challengeId,
  projectDescription,
  githubUrl,
  liveUrl,
  explanation,
  videoUrl,
  evaluation,
  githubEvidenceMeta
}) {
  const db = getDb();
  return db.transaction(() => {
    const subR = db
      .prepare(
        `INSERT INTO submissions (challenge_id, talent_id, project_description, github_url, live_url, explanation, video_url)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(
        challengeId,
        talentId,
        projectDescription,
        githubUrl,
        liveUrl,
        explanation,
        videoUrl || null
      );
    const submissionId = Number(subR.lastInsertRowid);

    const pa = evaluation.proofAnalysis;
    const authRisk = githubEvidenceMeta?.source === "github" ? "low" : evaluation.uncertainty?.missing?.length > 2 ? "high" : "medium";

    db.prepare(
      `INSERT INTO evidence_analyses (submission_id, project_type, detected_features_json, file_structure_json, readme_signal, authenticity_risk, confidence_score, full_eval_json)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(
      submissionId,
      pa.project_type,
      JSON.stringify(pa.features_detected),
      JSON.stringify(pa.file_structure),
      pa.github_readme_excerpt || "",
      authRisk,
      pa.confidence_score,
      JSON.stringify(evaluation)
    );

    db.prepare("DELETE FROM inferred_skills WHERE submission_id = ?").run(submissionId);
    for (const row of evaluation.skillScores || []) {
      const skId = getOrCreateSkill(db, row.skill, "Inferred");
      const conf = Math.min(1, Math.max(0, Number(row.score) / 100));
      db.prepare(
        `INSERT INTO inferred_skills (talent_id, submission_id, skill_id, confidence, evidence_json, level)
         VALUES (?,?,?,?,?,?)`
      ).run(
        talentId,
        submissionId,
        skId,
        conf,
        JSON.stringify({ evidence: row.evidence, score: row.score }),
        scoreToLevel(Number(row.score))
      );
    }

    db.prepare("DELETE FROM awarded_badges WHERE submission_id = ?").run(submissionId);
    for (const b of evaluation.earnedBadges || []) {
      const badge = db.prepare("SELECT id FROM badges WHERE name = ?").get(b.title);
      if (badge) {
        db.prepare(
          `INSERT INTO awarded_badges (talent_id, badge_id, submission_id, confidence, proof_strength_score)
           VALUES (?,?,?,?,?)`
        ).run(
          talentId,
          badge.id,
          submissionId,
          Math.min(1, Number(b.score) / 100),
          Number(b.score)
        );
      } else {
        const skill = db.prepare("SELECT id FROM skills WHERE name = ?").get(b.title.replace(/^Verified /, ""));
        const bid = db
          .prepare(
            `INSERT INTO badges (name, skill_id, level, threshold_rules_json) VALUES (?,?,?,?)`
          )
          .run(b.title, skill?.id || null, "1", '{"dynamic":true}')
          .lastInsertRowid;
        db.prepare(
          `INSERT INTO awarded_badges (talent_id, badge_id, submission_id, confidence, proof_strength_score)
           VALUES (?,?,?,?,?)`
        ).run(
          talentId,
          Number(bid),
          submissionId,
          Math.min(1, Number(b.score) / 100),
          Number(b.score)
        );
      }
    }

    return { submissionId };
  })();
}

function extractSubmissionContext(submission = {}, evaluation = {}) {
  const projectDescription = String(submission.project_description || "").trim();
  const explanation = String(submission.explanation || "").trim();
  const combined = `${projectDescription} ${explanation}`.toLowerCase();
  const proofAnalysis = evaluation?.proofAnalysis || {};
  const evidenceObject = evaluation?.evidenceObject || {};
  const hypotheses = Array.isArray(evaluation?.skillHypotheses) ? evaluation.skillHypotheses : [];
  const likelyHypotheses = hypotheses
    .filter((h) => h.status === "likely" || h.status === "possible")
    .slice(0, 4)
    .map((h) => h.skill);

  let domainHint = "general product";
  if (/fintech|payment|transaction|wallet|bank/.test(combined)) domainHint = "fintech/payments";
  else if (/ecommerce|e-commerce|marketplace|cart|checkout|ebay|shop/.test(combined)) domainHint = "ecommerce/marketplace";
  else if (/dashboard|analytics|report/.test(combined)) domainHint = "dashboard/analytics";
  else if (/booking|reservation|travel/.test(combined)) domainHint = "booking/travel";

  const featureHints = [
    ...(Array.isArray(proofAnalysis.features_detected) ? proofAnalysis.features_detected : []),
    ...(Array.isArray(evidenceObject.implemented_features) ? evidenceObject.implemented_features : [])
  ]
    .filter(Boolean)
    .slice(0, 5);

  const claimHints = String(projectDescription || explanation)
    .split(/[.!?\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  return {
    domainHint,
    featureHints,
    likelyHypotheses,
    claimHints,
    githubProvided: Boolean(submission.github_url),
    liveProvided: Boolean(submission.live_url)
  };
}

// ─── Adaptive test tier ────────────────────────────────────────────────────────

/**
 * Returns the difficulty tier for a verification test based on skill confidence.
 *
 *  depth       (≥88): skill already well-evidenced; test production-grade depth
 *  proof       (68–87): standard — demonstrate the skill concretely
 *  foundational(45–67): simpler scope — prove basic capability exists
 *  evidence    (<45): too uncertain for a formal test; request more evidence
 */
function buildAdaptiveTier(confidence) {
  const c = Number(confidence || 0);
  if (c >= 88) return "depth";
  if (c >= 68) return "proof";
  if (c >= 45) return "foundational";
  return "evidence";
}

function tierLabel(tier) {
  return { depth: "Depth Challenge", proof: "Proof Test", foundational: "Foundational Test", evidence: "Evidence Needed" }[tier] || "Proof Test";
}

function buildVerificationPrompt(skillName, challengeTitle = "", context = null, tier = "proof") {
  const skill = String(skillName || "").toLowerCase();
  const challenge = challengeTitle || "the selected challenge";
  const domainContext = context?.domainHint ? ` Domain context: ${context.domainHint}.` : "";
  const evidenceContext = context?.featureHints?.length
    ? ` Evidence hints from candidate proof: ${context.featureHints.join(", ")}.`
    : "";
  const hypothesisContext = context?.likelyHypotheses?.length
    ? ` Current likely skills: ${context.likelyHypotheses.join(", ")}.`
    : "";

  const tierPrefix = {
    depth: `[DEPTH CHALLENGE — high confidence] Your ${skillName} signals are strong. Prove production-grade understanding: `,
    proof: `[PROOF TEST — standard] `,
    foundational: `[FOUNDATIONAL TEST — establish baseline] Prove that you have basic ${skillName} capability: `,
    evidence: `[EVIDENCE NEEDED — confidence too low for a formal test] Before a timed test, provide more evidence for ${skillName}: submit a real GitHub link or live demo that demonstrates this capability.`
  }[tier] || "";

  if (tier === "evidence") return tierPrefix;

  const depthSuffix = tier === "depth"
    ? " Then explain one production concern, performance tradeoff, or accessibility consideration relevant to this implementation."
    : "";
  const foundationalSuffix = tier === "foundational"
    ? " Keep scope minimal — show that the core behavior works."
    : "";

  if (skill.includes("api") || skill.includes("integration") || skill.includes("data")) {
    return `${tierPrefix}Targeted API test for ${skillName} in ${challenge}: connect to a mock endpoint, render data, implement loading and error states, and document retry/fallback behavior.${domainContext}${evidenceContext}${hypothesisContext}${depthSuffix}${foundationalSuffix}`;
  }
  if (skill.includes("responsive") || skill.includes("ui") || skill.includes("layout")) {
    return `${tierPrefix}Targeted responsive UI test for ${skillName} in ${challenge}: build mobile/tablet/desktop variants, preserve layout integrity at breakpoints, and explain accessibility choices.${domainContext}${evidenceContext}${hypothesisContext}${depthSuffix}${foundationalSuffix}`;
  }
  if (skill.includes("form") || skill.includes("validation")) {
    return `${tierPrefix}Targeted form-handling test for ${skillName} in ${challenge}: implement validated inputs, submission flow, user-facing error messaging, and edge-case handling.${domainContext}${evidenceContext}${hypothesisContext}${depthSuffix}${foundationalSuffix}`;
  }
  return `${tierPrefix}Verification test for ${skillName}: demonstrate this skill explicitly in ${challenge}. Include concrete output, edge-case handling, and a short explanation of tradeoffs.${domainContext}${evidenceContext}${hypothesisContext}${depthSuffix}${foundationalSuffix}`;
}

function buildVerificationSpec(skillName, challengeTitle = "", context = null, tier = "proof") {
  const skill = String(skillName || "").toLowerCase();
  const challenge = challengeTitle || "this challenge";
  const domain = context?.domainHint || "general product";
  const featureHints = context?.featureHints?.length ? context.featureHints : ["core feature behavior described by candidate proof"];
  const claimHints = context?.claimHints?.length ? context.claimHints : ["Candidate-provided implementation summary."];
  const scenarioTarget = domain === "ecommerce/marketplace" ? "listings, cart/checkout, and pricing behavior"
    : domain === "fintech/payments" ? "transactions, balances, and payment-state behavior"
    : domain === "dashboard/analytics" ? "dashboard metrics, filtering, and data states"
    : "core product flows and user-facing states";

  // Evidence-needed tier: no formal test, just a request for more links
  if (tier === "evidence") {
    return {
      test_title: `Evidence Needed — ${skillName}`,
      requirements: [
        `Provide a GitHub repository link that demonstrates ${skillName}`,
        "Include a live demo URL or recorded walkthrough",
        "Explain specifically where in the codebase this skill appears"
      ],
      acceptance_criteria: [
        "A real GitHub URL pointing to relevant source files is provided",
        "Brief explanation maps file paths or commits to the claimed skill"
      ],
      time_limit_minutes: 0,
      rubric: [{ criterion: "Evidence quality", weight: 100 }],
      evidence_required: ["code", "explanation"],
      challenge_context: `Evidence collection | Skill: ${skillName} | Confidence too low for timed test`,
      adaptive_tier: "evidence",
      adaptive_reason: "Confidence below 45%. A timed test would be unreliable. More proof links needed first."
    };
  }

  // Depth-tier additions
  const depthReqs = tier === "depth" ? [
    "Explain at least one architecture decision or tradeoff in your implementation",
    "Cover a non-obvious edge case (e.g., race condition, accessibility failure, API timeout)"
  ] : [];
  const depthCriteria = tier === "depth" ? [
    "Architecture reasoning is clearly explained and grounded in the implementation"
  ] : [];
  const timeMultiplier = tier === "depth" ? 1.4 : tier === "foundational" ? 0.65 : 1.0;
  const evidenceRequired = tier === "foundational"
    ? ["code", "explanation"]
    : ["code", "runtime", "explanation"];

  if (skill.includes("api") || skill.includes("integration") || skill.includes("data")) {
    return {
      test_title: `${tierLabel(tier)}: API Integration — ${skillName}`,
      requirements: [
        `Connect to a provided/mock API endpoint aligned to ${scenarioTarget}`,
        "Render returned data in a user-facing UI state",
        "Handle loading, empty, and error states",
        ...depthReqs
      ],
      acceptance_criteria: [
        "At least one network request is visible in runtime or code",
        "Loading and error states are implemented",
        `Notes explain fallback/retry strategy: ${featureHints[0]}`,
        ...depthCriteria
      ],
      time_limit_minutes: Math.round(90 * timeMultiplier),
      rubric: [
        { criterion: "Correct API request and response handling", weight: tier === "depth" ? 25 : 35 },
        { criterion: "Loading/error/empty states quality", weight: 30 },
        { criterion: "Code clarity and implementation notes", weight: tier === "depth" ? 20 : 20 },
        { criterion: "Edge-case handling and resilience", weight: tier === "depth" ? 15 : 15 },
        ...(tier === "depth" ? [{ criterion: "Architecture decisions and tradeoffs", weight: 10 }] : [])
      ],
      evidence_required: evidenceRequired,
      challenge_context: `${challenge} | Domain: ${domain} | Tier: ${tier} | Context: ${claimHints[0]}`,
      adaptive_tier: tier,
      adaptive_reason: `Confidence tier: ${tier}`
    };
  }
  if (skill.includes("responsive") || skill.includes("ui") || skill.includes("layout")) {
    return {
      test_title: `${tierLabel(tier)}: Responsive UI — ${skillName}`,
      requirements: [
        `Implement mobile/tablet/desktop layouts for ${scenarioTarget}`,
        "Preserve content hierarchy across breakpoints",
        `Document accessibility: ${featureHints.slice(0, 2).join(", ")}`,
        ...depthReqs
      ],
      acceptance_criteria: [
        "Layout usable at mobile (360px), tablet (768px), and desktop (1280px)",
        "Responsive behavior observable in screenshots or runtime",
        "Accessibility notes include keyboard/contrast/form labeling",
        ...depthCriteria
      ],
      time_limit_minutes: Math.round(75 * timeMultiplier),
      rubric: [
        { criterion: "Breakpoint coverage and visual consistency", weight: tier === "depth" ? 30 : 40 },
        { criterion: "Usability and interaction quality", weight: 25 },
        { criterion: "Accessibility alignment", weight: 20 },
        { criterion: "Implementation explanation quality", weight: tier === "depth" ? 15 : 15 },
        ...(tier === "depth" ? [{ criterion: "Architecture and performance considerations", weight: 10 }] : [])
      ],
      evidence_required: evidenceRequired,
      challenge_context: `${challenge} | Domain: ${domain} | Tier: ${tier} | Claim: ${claimHints[0]}`,
      adaptive_tier: tier,
      adaptive_reason: `Confidence tier: ${tier}`
    };
  }
  if (skill.includes("form") || skill.includes("validation")) {
    return {
      test_title: `${tierLabel(tier)}: Form Validation — ${skillName}`,
      requirements: [
        `Implement validated form fields tied to ${scenarioTarget}`,
        "Show user-facing validation feedback",
        "Handle submit success/failure states",
        ...depthReqs
      ],
      acceptance_criteria: [
        "Invalid input is blocked with clear user-facing feedback",
        "Submit success/failure states are visible",
        `Validation logic explained: ${featureHints[0]}`,
        ...depthCriteria
      ],
      time_limit_minutes: Math.round(60 * timeMultiplier),
      rubric: [
        { criterion: "Validation correctness", weight: 40 },
        { criterion: "Error/success UX quality", weight: tier === "depth" ? 25 : 30 },
        { criterion: "State handling reliability", weight: 15 },
        { criterion: "Implementation explanation quality", weight: tier === "depth" ? 10 : 15 },
        ...(tier === "depth" ? [{ criterion: "Schema design and edge-case coverage", weight: 10 }] : [])
      ],
      evidence_required: evidenceRequired,
      challenge_context: `${challenge} | Domain: ${domain} | Tier: ${tier} | Claim: ${claimHints[0]}`,
      adaptive_tier: tier,
      adaptive_reason: `Confidence tier: ${tier}`
    };
  }
  return {
    test_title: `${tierLabel(tier)}: ${skillName}`,
    requirements: [
      "Demonstrate concrete implementation of claimed skill",
      tier === "foundational" ? "Show that the core behavior works in any working implementation" : "Include edge-case handling",
      `Implementation notes tied to evidence: ${featureHints[0]}`,
      ...depthReqs
    ],
    acceptance_criteria: [
      "Output demonstrates required skill behavior",
      "Notes explain tradeoffs and edge cases",
      ...depthCriteria
    ],
    time_limit_minutes: Math.round(60 * timeMultiplier),
    rubric: [
      { criterion: "Core functionality", weight: 45 },
      { criterion: "Robustness and edge cases", weight: tier === "foundational" ? 20 : 30 },
      { criterion: "Explanation quality", weight: 25 },
      ...(tier === "depth" ? [{ criterion: "Architecture reasoning", weight: 10 }] : [])
    ],
    evidence_required: evidenceRequired,
    challenge_context: `${challenge} | Domain: ${domain} | Tier: ${tier}`,
    adaptive_tier: tier,
    adaptive_reason: `Confidence tier: ${tier}`
  };
}

function parseJsonSafe(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function mapTestRow(row) {
  return {
    ...row,
    testSpec: parseJsonSafe(row.testSpecJson, null)
  };
}

function extractGithubRepoPairs(text = "") {
  const pairs = [];
  const re = /https?:\/\/(?:www\.)?github\.com\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)/ig;
  let match;
  while ((match = re.exec(String(text)))) {
    pairs.push({
      owner: match[1].toLowerCase(),
      repo: match[2].replace(/\.git$/i, "").toLowerCase()
    });
  }
  return pairs;
}

function extractLiveUrls(text = "") {
  const urls = String(text).match(/https?:\/\/[^\s)]+/ig) || [];
  return urls.filter((url) => !/https?:\/\/(?:www\.)?github\.com\//i.test(url));
}

function extractFilePaths(text = "") {
  const matches = String(text).match(/\b(?:src|app|lib|server|components)\/[\w./-]+\.(?:jsx?|tsx?|css|html|py)\b/ig) || [];
  return [...new Set(matches.map((path) => path.replace(/\\/g, "/")))];
}

function sameHostOrUrl(candidateUrl, expectedUrl) {
  if (!candidateUrl || !expectedUrl) return false;
  try {
    const candidate = new URL(candidateUrl);
    const expected = new URL(expectedUrl);
    return candidate.href.replace(/\/$/, "") === expected.href.replace(/\/$/, "") ||
      candidate.hostname.toLowerCase() === expected.hostname.toLowerCase();
  } catch {
    return false;
  }
}

async function fetchReferencedGithubFiles({ owner, repo, branch, submittedFilePaths = [], knownFilePaths = [] }) {
  if (!owner || !repo || !branch || !submittedFilePaths.length) {
    return {
      checked: false,
      verifiedFiles: [],
      missingFiles: submittedFilePaths,
      snippets: [],
      reason: "missing_repo_or_file_references"
    };
  }

  const known = new Set((knownFilePaths || []).map((path) => String(path).replace(/\\/g, "/").toLowerCase()));
  const candidates = [...new Set(submittedFilePaths.map((path) => String(path).replace(/\\/g, "/")))]
    .filter((path) => known.size === 0 || known.has(path.toLowerCase()))
    .slice(0, 6);
  const missingFromTree = submittedFilePaths.filter((path) => known.size && !known.has(String(path).toLowerCase()));
  const verifiedFiles = [];
  const missingFiles = [...missingFromTree];
  const snippets = [];

  for (const path of candidates) {
    try {
      const raw = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(5000)
      });
      if (!raw.ok) {
        missingFiles.push(path);
        continue;
      }
      const body = await raw.text();
      verifiedFiles.push(path);
      snippets.push({ path, text: body.slice(0, 5000) });
    } catch {
      missingFiles.push(path);
    }
  }

  return {
    checked: Boolean(candidates.length),
    verifiedFiles,
    missingFiles: [...new Set(missingFiles)],
    snippets,
    reason: candidates.length ? "checked_raw_github_files" : "no_referenced_files_in_known_tree"
  };
}

function detectCodePatternMatches({ skillName, output, snippets = [], staticSignals = {} }) {
  const skillLower = String(skillName || "").toLowerCase();
  const corpus = `${output || ""}\n${snippets.map((item) => item.text || "").join("\n")}`.toLowerCase();
  const checks = [
    {
      name: "API integration",
      applies: /api|endpoint|integration|data/.test(skillLower),
      matched: /fetch\s*\(|axios\.|usequery|graphql|\/api\/|async\s+function|await\s+fetch/.test(corpus) || Boolean(staticSignals.api_usage_detected),
      evidence: "fetch/axios/API request pattern"
    },
    {
      name: "Responsive UI",
      applies: /responsive|mobile|ui|layout/.test(skillLower),
      matched: /sm:|md:|lg:|xl:|grid-cols|flex-wrap|@media|clamp\(|minmax\(|responsive/.test(corpus) || Boolean(staticSignals.responsive_classes_detected),
      evidence: "responsive class/media-query pattern"
    },
    {
      name: "Form handling",
      applies: /form|validation|input/.test(skillLower),
      matched: /<form|onchange|onsubmit|handleSubmit|validation|zod|yup|required|input/.test(corpus) || Boolean(staticSignals.form_handling_detected),
      evidence: "form/input/validation handling pattern"
    },
    {
      name: "Component structure",
      applies: /component|ui|frontend|react|layout/.test(skillLower),
      matched: /function\s+[A-Z]\w+|const\s+[A-Z]\w+\s*=\s*\(|export\s+default|return\s*\(|className=/.test(corpus),
      evidence: "component/module structure pattern"
    }
  ];

  return checks
    .filter((check) => check.applies)
    .map(({ applies, ...check }) => check);
}

function findUnsupportedExplanationClaims(output, patternMatches = []) {
  const lower = String(output || "").toLowerCase();
  const matchedNames = new Set(patternMatches.filter((m) => m.matched).map((m) => m.name.toLowerCase()));
  const claims = [
    { claim: "API integration", regex: /api|endpoint|fetch|axios|graphql/, pattern: "api integration" },
    { claim: "Responsive UI", regex: /responsive|mobile|breakpoint|media query/, pattern: "responsive ui" },
    { claim: "Form handling", regex: /form|validation|input|submit/, pattern: "form handling" },
    { claim: "Component structure", regex: /component|reusable|modular/, pattern: "component structure" }
  ];
  return claims
    .filter((item) => item.regex.test(lower) && !matchedNames.has(item.pattern))
    .map((item) => item.claim);
}

async function buildEvidenceVerifiedGradingReport({
  output,
  skillName,
  submittedFilePaths,
  evidenceRefs,
  staticSignals,
  runtimeSignals
}) {
  const fileRefetch = await fetchReferencedGithubFiles({
    owner: evidenceRefs?.githubOwner,
    repo: evidenceRefs?.githubRepo,
    branch: evidenceRefs?.defaultBranch || "main",
    submittedFilePaths,
    knownFilePaths: evidenceRefs?.filePaths || []
  });
  const patternMatches = detectCodePatternMatches({
    skillName,
    output,
    snippets: fileRefetch.snippets,
    staticSignals
  });
  const liveUrls = extractLiveUrls(output);
  const expectedLiveUrl = evidenceRefs?.liveUrl;
  const liveUrlToCheck = liveUrls.find((url) => sameHostOrUrl(url, expectedLiveUrl)) || expectedLiveUrl;
  const liveMeta = liveUrlToCheck ? await validateLiveUrl(liveUrlToCheck) : { reachable: false, reason: "no_live_url" };
  const runtimeChecks = [
    {
      name: "Live demo reachable",
      passed: Boolean(liveMeta.reachable),
      detail: liveMeta.reason || "unknown",
      url: liveUrlToCheck || null
    },
    {
      name: "Prior runtime inspection available",
      passed: Boolean(runtimeSignals?.inspected),
      detail: runtimeSignals?.inspected ? "Playwright runtime evidence exists from proof analysis." : "No Playwright runtime inspection attached to this test."
    }
  ];
  const unsupportedClaims = findUnsupportedExplanationClaims(output, patternMatches);
  const verifiedArtifacts = [
    ...(fileRefetch.verifiedFiles || []).map((path) => ({ type: "github_file", value: path })),
    ...(liveMeta.reachable ? [{ type: "live_url", value: liveUrlToCheck }] : [])
  ];
  const missingArtifacts = [
    ...(fileRefetch.missingFiles || []).map((path) => ({ type: "github_file", value: path })),
    ...(!liveMeta.reachable ? [{ type: "live_url", value: liveUrlToCheck || expectedLiveUrl || "missing" }] : [])
  ];
  const confidence = Math.max(
    0,
    Math.min(
      100,
      45 +
        verifiedArtifacts.length * 14 +
        patternMatches.filter((m) => m.matched).length * 12 +
        runtimeChecks.filter((c) => c.passed).length * 8 -
        missingArtifacts.length * 10 -
        unsupportedClaims.length * 12
    )
  );
  const finalDecision = confidence >= 72 && !unsupportedClaims.length
    ? "pass"
    : confidence >= 55
      ? "review"
      : "fail";

  return {
    verified_artifacts: verifiedArtifacts,
    missing_artifacts: missingArtifacts,
    code_pattern_matches: patternMatches,
    runtime_checks: runtimeChecks,
    explanation_cross_check: {
      unsupported_claims: unsupportedClaims,
      passed: unsupportedClaims.length === 0
    },
    confidence,
    limitations: [
      "This submission is evidence-verified but not fully executed in a sandbox.",
      "Pattern checks validate observable code signals, not complete runtime correctness."
    ],
    final_decision: finalDecision,
    refetch: {
      checked: fileRefetch.checked,
      reason: fileRefetch.reason
    }
  };
}

function evaluateVerificationOutput({
  output,
  skillName,
  challengePrompt,
  baseConfidence,
  integrityRisk,
  testSpec = null,
  staticSignals = {},
  runtimeSignals = {},
  evidenceRefs = {},
  gradingReport = null
}) {
  const text = String(output || "").trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const lower = text.toLowerCase();
  const keywords = String(skillName || "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const keywordHits = keywords.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0);
  const hasEdgeCaseSignals = /edge|error|fallback|empty|invalid|loading|retry/.test(lower);
  const hasImplementationSignals = /implemented|built|added|coded|tested|deployed|hook|component|api|state/.test(lower);
  const hasApiSignals = /fetch|axios|endpoint|http|loading|error state|retry|status code/.test(lower);
  const hasResponsiveSignals = /mobile|desktop|breakpoint|media query|responsive|sm:|md:|lg:/.test(lower);
  const hasFormSignals = /validation|form|submit|field|invalid|schema|zod|yup/.test(lower);
  const hasTestSignals = /test|unit|integration|jest|vitest|spec/.test(lower);
  const hasProofSignals = /github|repo|live demo|screenshot|commit|pull request/.test(lower);
  const hasRepoLink = /https?:\/\/(www\.)?github\.com\/[a-z0-9_.-]+\/[a-z0-9_.-]+/i.test(text);
  const hasLiveLink = /https?:\/\/[^\s)]+/i.test(text) && !hasRepoLink;
  const hasCodeBlock = /```[\s\S]{20,}```|`[^`]{12,}`/.test(text);
  const hasFilePath = /\b(src|app|lib|server|components)\/[\w./-]+\.(jsx?|tsx?|css|html|py)\b/i.test(text);
  const hasCommitReference = /\b(commit|sha|pull request|pr #?|branch|diff)\b/i.test(lower);
  const repoPairs = extractGithubRepoPairs(text);
  const expectedOwner = String(evidenceRefs?.githubOwner || "").toLowerCase();
  const expectedRepo = String(evidenceRefs?.githubRepo || "").toLowerCase();
  const repoLinkMatchesEvidence = Boolean(expectedOwner && expectedRepo) &&
    repoPairs.some((pair) => pair.owner === expectedOwner && pair.repo === expectedRepo);
  const submittedFilePaths = extractFilePaths(text);
  const knownFilePaths = new Set((evidenceRefs?.filePaths || []).map((path) => String(path).replace(/\\/g, "/").toLowerCase()));
  const filePathMatchesEvidence = submittedFilePaths.some((path) => knownFilePaths.has(path.toLowerCase()));
  const fileRefetchVerified = Boolean(gradingReport?.verified_artifacts?.some((item) => item.type === "github_file"));
  const liveLinkMatchesEvidence = extractLiveUrls(text).some((url) => sameHostOrUrl(url, evidenceRefs?.liveUrl));
  const liveRechecked = Boolean(gradingReport?.runtime_checks?.some((item) => item.name === "Live demo reachable" && item.passed));
  const repoVerified = Boolean(evidenceRefs?.repoVerified);
  const hasCodeArtifactSignal = repoLinkMatchesEvidence || filePathMatchesEvidence || fileRefetchVerified || (repoVerified && (hasCodeBlock || hasCommitReference));
  const hasRuntimeArtifactSignal = liveLinkMatchesEvidence || liveRechecked || Boolean(runtimeSignals?.inspected);
  const challengeTokenHits = String(challengePrompt || "")
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4)
    .reduce((acc, token) => acc + (lower.includes(token) ? 1 : 0), 0);

  const lengthScore = Math.min(100, words >= 180 ? 100 : words >= 110 ? 82 : words >= 70 ? 65 : words >= 45 ? 45 : 20);
  const skillAlignment = Math.min(100, Math.round((keywordHits / Math.max(1, keywords.length)) * 100));
  const challengeAlignment = Math.min(100, challengeTokenHits * 7);
  const qualitySignals = (hasEdgeCaseSignals ? 20 : 0) + (hasImplementationSignals ? 20 : 0);
  const integrityPenalty = integrityRisk === "high" ? 20 : integrityRisk === "medium" ? 10 : 0;
  const skillLower = String(skillName || "").toLowerCase();
  const skillSpecificChecks = {
    api: !/api|endpoint|integration|data/.test(skillLower)
      ? true
      : hasApiSignals && (Boolean(staticSignals?.api_usage_detected) || hasCodeArtifactSignal),
    responsive: !/responsive|mobile|ui|layout/.test(skillLower)
      ? true
      : hasResponsiveSignals && (Boolean(staticSignals?.responsive_classes_detected) || hasRuntimeArtifactSignal || hasCodeArtifactSignal),
    form: !/form|validation|input/.test(skillLower)
      ? true
      : hasFormSignals && (Boolean(staticSignals?.form_handling_detected) || hasCodeArtifactSignal),
    testing: !/test|quality|qa/.test(skillLower) ? true : hasTestSignals
  };
  const mandatoryChecksPassed = Object.values(skillSpecificChecks).every(Boolean);
  const evidenceRequired = Array.isArray(testSpec?.evidence_required) ? testSpec.evidence_required : [];
  const evidenceRequiredChecks = {
    code: !evidenceRequired.includes("code") || hasCodeArtifactSignal,
    runtime: !evidenceRequired.includes("runtime") || hasRuntimeArtifactSignal || Boolean(runtimeSignals?.inspected),
    explanation: !evidenceRequired.includes("explanation") || words >= 45
  };
  const evidenceRequirementsPassed = Object.values(evidenceRequiredChecks).every(Boolean);
  const rubricItems = Array.isArray(testSpec?.rubric) ? testSpec.rubric : [];
  const rubricSignals = rubricItems.map((item) => {
    const textBits = String(item.criterion || "").toLowerCase().split(/\W+/).filter((w) => w.length > 4);
    const hit = textBits.some((bit) => lower.includes(bit));
    return {
      criterion: item.criterion,
      weight: Number(item.weight || 0),
      hit
    };
  });
  const totalWeight = rubricSignals.reduce((sum, item) => sum + item.weight, 0) || 1;
  const hitWeight = rubricSignals.filter((item) => item.hit).reduce((sum, item) => sum + item.weight, 0);
  const rubricScore = Math.round((hitWeight / totalWeight) * 100);
  const specificityPenalty = mandatoryChecksPassed ? 0 : 15;
  const weakProofPenalty = hasProofSignals ? 0 : 6;
  const artifactPenalty = evidenceRequirementsPassed ? 0 : 18;
  const gradingReportPenalty = gradingReport?.final_decision === "fail" ? 16 : gradingReport?.final_decision === "review" ? 7 : 0;

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        0.35 * lengthScore +
        0.35 * skillAlignment +
        0.20 * challengeAlignment +
        0.10 * qualitySignals +
        0.20 * rubricScore +
        0.10 * Number(gradingReport?.confidence || 0) +
        0.15 * Number(baseConfidence || 0) -
        integrityPenalty -
        specificityPenalty -
        weakProofPenalty -
        artifactPenalty -
        gradingReportPenalty
      )
    )
  );
  const passed = score >= 70 &&
    mandatoryChecksPassed &&
    evidenceRequirementsPassed &&
    (rubricItems.length ? rubricScore >= 60 : true) &&
    gradingReport?.final_decision !== "fail";
  return {
    score,
    passed,
    checks: {
      lengthScore,
      skillAlignment,
      challengeAlignment,
      qualitySignals,
      integrityRisk,
      mandatoryChecksPassed,
      skillSpecificChecks,
      evidenceRequirementsPassed,
      evidenceRequiredChecks,
      artifactSignals: {
        hasRepoLink,
        hasLiveLink,
        hasCodeBlock,
        hasFilePath,
        hasCommitReference,
        hasCodeArtifactSignal,
        hasRuntimeArtifactSignal
      },
      artifactVerification: {
        repoLinkMatchesEvidence,
        filePathMatchesEvidence,
        fileRefetchVerified,
        liveLinkMatchesEvidence,
        liveRechecked,
        repoVerified,
        submittedFilePaths
      },
      gradingReport,
      rubricScore,
      rubricSignals
    }
  };
}

export function createVerificationTestsForSubmission({ submissionId, talentId, evaluation, challengeTitle }) {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM skill_verification_tests WHERE submission_id = ?")
    .all(submissionId);
  if (existing.length) {
    return db
      .prepare("SELECT id, skill_name as skillName, badge_title as badgeTitle, challenge_prompt as challengePrompt, status, score, badge_stage as badgeStage, candidate_output as candidateOutput, test_spec_json as testSpecJson FROM skill_verification_tests WHERE submission_id = ? ORDER BY id")
      .all(submissionId)
      .map(mapTestRow);
  }

  // Build candidate skill pool from hypotheses → provisional badges
  const hypothesisTests = (evaluation?.skillHypotheses || [])
    .filter((h) => h.status === "likely" || h.status === "possible")
    .map((h) => ({ skillName: h.skill, badgeTitle: `Verified ${h.skill}`, confidence: Number(h.confidence || 70) }));

  const source = hypothesisTests.length
    ? hypothesisTests
    : (evaluation?.provisionalBadges?.length
      ? evaluation.provisionalBadges.map((b) => ({
          skillName: String(b.title || "").replace(/^Verified\s+/i, "").trim(),
          badgeTitle: b.title,
          confidence: Number(b.score || 70)
        }))
      : []);

  const submission = db
    .prepare("SELECT project_description, explanation, github_url, live_url FROM submissions WHERE id = ?")
    .get(submissionId);
  const context = extractSubmissionContext(submission, evaluation);

  // Load prior test history so we can carry forward already-verified skills
  const priorHistory = buildPriorTestHistory(db, talentId, submissionId);

  for (const b of source) {
    const badgeTitle = b.badgeTitle || `Verified ${b.skillName || "Skill"}`;
    const skillName = b.skillName || badgeTitle.replace(/^Verified\s+/i, "").trim();
    const skillKey = skillName.toLowerCase().trim();
    const confidence = Number(b.confidence || 70);

    // Carry forward: if this skill was already verified in a prior submission, mark as pre-passed
    const prior = priorHistory.get(skillKey);
    if (prior?.status === "passed" && Number(prior.score || 0) >= 70) {
      db.prepare(
        `INSERT INTO skill_verification_tests
         (submission_id, talent_id, skill_name, badge_title, challenge_prompt, status, score, badge_stage, test_spec_json)
         VALUES (?,?,?,?,?, 'passed', ?, 'verified', ?)`
      ).run(
        submissionId, talentId, skillName, badgeTitle,
        `[CARRIED FORWARD from submission #${prior.submissionId}] ${skillName} was verified previously.`,
        prior.score,
        JSON.stringify({
          test_title: `Carried forward — ${skillName}`,
          adaptive_tier: "carried_forward",
          adaptive_reason: `Previously passed at ${Math.round(prior.score)}% in submission #${prior.submissionId}. Not re-tested.`,
          prior_submission_id: prior.submissionId,
          prior_score: prior.score
        })
      );
      continue;
    }

    // Determine difficulty tier from confidence
    const tier = buildAdaptiveTier(confidence);

    const spec = buildVerificationSpec(skillName, challengeTitle, context, tier);
    db.prepare(
      `INSERT INTO skill_verification_tests (submission_id, talent_id, skill_name, badge_title, challenge_prompt, status, test_spec_json)
       VALUES (?,?,?,?,?, 'pending', ?)`
    ).run(
      submissionId, talentId, skillName, badgeTitle,
      buildVerificationPrompt(skillName, challengeTitle, context, tier),
      JSON.stringify(spec)
    );
  }

  return db
    .prepare("SELECT id, skill_name as skillName, badge_title as badgeTitle, challenge_prompt as challengePrompt, status, score, badge_stage as badgeStage, candidate_output as candidateOutput, test_spec_json as testSpecJson FROM skill_verification_tests WHERE submission_id = ? ORDER BY id")
    .all(submissionId)
    .map(mapTestRow);
}

export function getVerificationTests(submissionId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, skill_name as skillName, badge_title as badgeTitle, challenge_prompt as challengePrompt,
              status, score, badge_stage as badgeStage, test_spec_json as testSpecJson, candidate_output as candidateOutput, evaluation_json as evaluationJson,
              result_notes as resultNotes, completed_at as completedAt
       FROM skill_verification_tests
       WHERE submission_id = ?
       ORDER BY id`
    )
    .all(submissionId)
    .map(mapTestRow);
}

export async function completeVerificationTest({ submissionId, testId, output = "", notes = "" }) {
  const db = getDb();
  const test = db
    .prepare("SELECT * FROM skill_verification_tests WHERE id = ? AND submission_id = ?")
    .get(testId, submissionId);
  if (!test) return { error: "test_not_found" };

  const ea = db.prepare("SELECT full_eval_json FROM evidence_analyses WHERE submission_id = ?").get(submissionId);
  const full = ea?.full_eval_json ? JSON.parse(ea.full_eval_json) : {};
  const hypotheses = full.skillHypotheses || [];
  const hypothesis = hypotheses.find((h) => String(h.skill || "").toLowerCase() === String(test.skill_name || "").toLowerCase());
  const integrityRisk = full.integritySummary?.risk || "medium";
  const githubEvidenceSource = String(full?.githubEvidence?.source || "");
  const repoVerified = githubEvidenceSource === "github";
  const submission = db
    .prepare("SELECT github_url, live_url FROM submissions WHERE id = ?")
    .get(submissionId);
  const spec = parseJsonSafe(test.test_spec_json, null);
  const staticSignals = full?.proofAnalysis?.static_signals || {};
  const runtimeSignals = full?.proofAnalysis?.live_demo_analysis || {};
  const filePaths = Array.isArray(full?.proofAnalysis?.file_structure) ? full.proofAnalysis.file_structure : [];
  const submittedFilePaths = extractFilePaths(output);
  const evidenceRefs = {
    repoVerified,
    githubOwner: full?.githubEvidence?.owner,
    githubRepo: full?.githubEvidence?.repo,
    defaultBranch: full?.githubEvidence?.defaultBranch,
    liveUrl: submission?.live_url,
    filePaths
  };
  const gradingReport = await buildEvidenceVerifiedGradingReport({
    output,
    skillName: test.skill_name,
    submittedFilePaths,
    evidenceRefs,
    staticSignals,
    runtimeSignals
  });
  const evalResult = evaluateVerificationOutput({
      output,
      skillName: test.skill_name,
      challengePrompt: test.challenge_prompt,
      baseConfidence: hypothesis?.confidence || 60,
      integrityRisk,
      testSpec: spec,
      staticSignals,
      runtimeSignals,
      evidenceRefs,
      gradingReport
    });

  return db.transaction(() => {
    const status = evalResult.passed ? "passed" : "failed";
    const badgeStage = status === "passed" ? "tested" : "detected";
    db.prepare(
      `UPDATE skill_verification_tests
       SET status = ?, score = ?, badge_stage = ?, candidate_output = ?, evaluation_json = ?, result_notes = ?, completed_at = datetime('now')
       WHERE id = ?`
    ).run(
      status,
      evalResult.score,
      badgeStage,
      String(output || ""),
      JSON.stringify(evalResult.checks),
      String(notes || ""),
      testId
    );

    // Unlock badges per skill only when that skill's test is passed.
    const provisional = full.provisionalBadges || full.earnedBadges || [];
    const tests = getVerificationTests(submissionId);
    const passedSkillMap = new Map(
      tests
        .filter((t) => t.status === "passed")
        .map((t) => [String(t.skillName).toLowerCase(), Number(t.score || 0)])
    );

    const unlocked = provisional.filter((b) => {
      const skill = String((b.title || "").replace(/^Verified\s+/i, "")).toLowerCase();
      const testScore = passedSkillMap.get(skill);
      if (testScore == null) return false;
      const confidenceOk = Number(b.score || 0) >= 75;
      const integrityOk = integrityRisk !== "high";
      const repoVerifiedOk = repoVerified;
      const needsApi = /api|integration|data/.test(skill);
      const needsResponsive = /responsive|mobile|ui|layout/.test(skill);
      const needsForm = /form|validation/.test(skill);
      const liveReachable = Boolean(full?.proofAnalysis?.artifact_summary?.live_url_reachable);
      const runtimeInspected = Boolean(runtimeSignals?.inspected);
      const codeSignalOk =
        (!needsApi || Boolean(staticSignals.api_usage_detected)) &&
        (!needsResponsive || Boolean(staticSignals.responsive_classes_detected || runtimeSignals.responsiveEvidence)) &&
        (!needsForm || Boolean(staticSignals.form_handling_detected || runtimeSignals.formDetected));
      // Runtime signal: accept either actual Playwright inspection OR deterministic static signal
      // (allows badge when Playwright is disabled but code evidence is strong)
      const runtimeSignalOk =
        (!needsApi || Boolean(runtimeInspected ? runtimeSignals.apiRequestDetected : staticSignals.api_usage_detected)) &&
        (!needsResponsive || Boolean(runtimeInspected ? runtimeSignals.responsiveEvidence : staticSignals.responsive_classes_detected)) &&
        (!needsForm || Boolean(runtimeInspected ? runtimeSignals.formDetected : staticSignals.form_handling_detected));
      // Hard gate for API badge: repo verified + live reachable + (Playwright confirmed OR static code signal found)
      const apiHardGateOk = !needsApi || (
        repoVerifiedOk && liveReachable && (runtimeInspected || Boolean(staticSignals.api_usage_detected))
      );
      return testScore >= 70 && confidenceOk && integrityOk && repoVerifiedOk && codeSignalOk && runtimeSignalOk && apiHardGateOk;
    }).map((b) => {
      const skill = String((b.title || "").replace(/^Verified\s+/i, "")).toLowerCase();
      const testScore = passedSkillMap.get(skill) || 0;
      const stage = Number(b.level || 1) >= 3 && testScore >= 86 ? "advanced" : "verified";
      return { ...b, badgeStage: stage };
    });

    db.prepare("DELETE FROM awarded_badges WHERE submission_id = ?").run(submissionId);
    const subRow = db.prepare("SELECT talent_id FROM submissions WHERE id = ?").get(submissionId);
    const talentId = subRow?.talent_id;
    for (const b of unlocked) {
      const badge = db.prepare("SELECT id FROM badges WHERE name = ?").get(b.title);
      let badgeId = badge?.id;
      if (!badgeId) {
        const skillRow = db.prepare("SELECT id FROM skills WHERE name = ?").get(String(b.title).replace(/^Verified /, ""));
        badgeId = Number(
          db.prepare("INSERT INTO badges (name, skill_id, level, threshold_rules_json) VALUES (?,?,?,?)")
            .run(b.title, skillRow?.id || null, String(b.level || 1), '{"verification_required":true}')
            .lastInsertRowid
        );
      }
      if (talentId && badgeId) {
        db.prepare(
          `INSERT INTO awarded_badges (talent_id, badge_id, submission_id, confidence, proof_strength_score)
           VALUES (?,?,?,?,?)
           ON CONFLICT(talent_id, badge_id, submission_id) DO UPDATE SET
             confidence = excluded.confidence,
             proof_strength_score = excluded.proof_strength_score`
        ).run(
          talentId,
          badgeId,
          submissionId,
          Math.min(1, Number(b.score || 0) / 100),
          Number(b.score || 0)
        );
      }
    }

    const testedSkillSet = new Set(tests.filter((t) => t.status === "passed").map((t) => String(t.skillName).toLowerCase()));
    full.skillHypotheses = (full.skillHypotheses || []).map((h) => {
      const skillKey = String(h.skill || "").toLowerCase();
      const isVerified = unlocked.some((b) => String((b.title || "").replace(/^Verified\s+/i, "")).toLowerCase() === skillKey);
      if (isVerified) return { ...h, status: "verified" };
      if (testedSkillSet.has(skillKey)) return { ...h, status: "tested" };
      return h;
    });
    full.earnedBadges = unlocked;
    full.badgeUnlockStatus = {
      totalCandidates: provisional.length,
      unlocked: unlocked.length,
      pending: Math.max(0, provisional.length - unlocked.length),
      repoVerified
    };
    db.prepare("UPDATE evidence_analyses SET full_eval_json = ? WHERE submission_id = ?").run(JSON.stringify(full), submissionId);

    return { tests: getVerificationTests(submissionId), earnedBadges: unlocked, badgeUnlockStatus: full.badgeUnlockStatus };
  })();
}

export function getSubmissionBadgeState(submissionId) {
  const db = getDb();
  const ea = db.prepare("SELECT full_eval_json FROM evidence_analyses WHERE submission_id = ?").get(submissionId);
  const full = ea?.full_eval_json ? JSON.parse(ea.full_eval_json) : {};
  const badgeRows = db
    .prepare(
      `SELECT b.name as title, ab.confidence * 100 as score, b.name as evidence,
              COALESCE(ab.evaluator_source, 'mock') as evaluatorSource,
              COALESCE(ab.badge_level, 1) as level
       FROM awarded_badges ab
       JOIN badges b ON b.id = ab.badge_id
       WHERE ab.submission_id = ?`
    )
    .all(submissionId);

  return {
    earnedBadges: badgeRows.map((b) => ({
      title: b.title,
      score: b.score,
      evidence: b.evidence,
      evaluatorSource: b.evaluatorSource,
      level: b.level
    })),
    badgeUnlockStatus: full.badgeUnlockStatus || {
      totalCandidates: (full.provisionalBadges || []).length,
      unlocked: badgeRows.length,
      pending: Math.max(0, (full.provisionalBadges || []).length - badgeRows.length)
    },
    tests: getVerificationTests(submissionId)
  };
}

export function buildProfileFromDb(db, talentId) {
  const sub = db
    .prepare(
      "SELECT id, github_url, live_url, explanation FROM submissions WHERE talent_id = ? ORDER BY submitted_at DESC LIMIT 1"
    )
    .get(talentId);
  if (!sub) {
    return { skillScores: [], earnedBadges: [], proofAnalysis: null, employerSummary: "", uncertainty: { missing: [] } };
  }

  const skills = db
    .prepare(
      `SELECT s.name as skill, i.confidence * 100 as score, json_extract(i.evidence_json, '$.evidence') as evidence,
              COALESCE(i.tier, 'claimed') as tier
       FROM inferred_skills i
       JOIN skills s ON s.id = i.skill_id
       WHERE i.submission_id = ?`
    )
    .all(sub.id);

  const allSkillRows = db
    .prepare(
      `SELECT s.name as skill, i.confidence * 100 as score,
              json_extract(i.evidence_json, '$.evidence') as evidence,
              COALESCE(i.tier, 'claimed') as tier,
              i.submission_id,
              c.title as challenge_title
       FROM inferred_skills i
       JOIN skills s ON s.id = i.skill_id
       JOIN submissions sub ON sub.id = i.submission_id
       LEFT JOIN challenges c ON c.id = sub.challenge_id
       WHERE i.talent_id = ?`
    )
    .all(talentId);

  const badgeRows = db
    .prepare(
      `SELECT b.name as title, ab.confidence * 100 as score, b.name as evidence,
              COALESCE(ab.evaluator_source, 'mock') as evaluatorSource,
              COALESCE(ab.badge_level, 1) as level
       FROM awarded_badges ab
       JOIN badges b ON b.id = ab.badge_id
       WHERE ab.submission_id = ?`
    )
    .all(sub.id);

  const earnedBadges = badgeRows.map((b) => ({
    title: b.title,
    score: b.score,
    evidence: b.evidence,
    evaluatorSource: b.evaluatorSource,
    level: b.level
  }));

  const ea = db
    .prepare("SELECT * FROM evidence_analyses WHERE submission_id = ?")
    .get(sub.id);
  const full = ea?.full_eval_json ? JSON.parse(ea.full_eval_json) : null;

  const conf = ea?.confidence_score != null ? Number(ea.confidence_score) : 70;
  const confidence100 = conf <= 1 ? conf * 100 : conf;

  // Compute proof strength from available signals (no network call needed)
  const hasGithub = Boolean(sub.github_url);
  const hasLive = Boolean(sub.live_url);
  const explanationWords = (sub.explanation || "").split(/\s+/).filter(Boolean).length;
  const storedProofStrength = full?.proofStrength || full?.proofAnalysis?.proof_strength || null;
  const proofStrength = storedProofStrength != null
    ? Number(storedProofStrength)
    : Math.round(
        (hasLive ? 30 : 0) +
        (hasGithub ? 20 : 0) +
        (ea?.readme_signal ? 18 : 0) +
        (explanationWords >= 50 ? 12 : explanationWords >= 20 ? 6 : 0) +
        (JSON.parse(ea?.file_structure_json || "[]").length > 3 ? 10 : 0)
      );

  return {
    skillScores: skills.map((r) => ({
      skill: r.skill,
      score: r.score,
      evidence: r.evidence || "",
      tier: r.tier || "claimed",
      supportingProjects: new Set(allSkillRows.filter((row) => row.skill === r.skill).map((row) => row.submission_id)).size || 1,
      strongestEvidence: (allSkillRows
        .filter((row) => row.skill === r.skill)
        .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0]?.evidence) || r.evidence || "",
      proofStrengthLabel: proofStrengthLabel(Number(r.score || 0))
    })),
    skillProofs: Object.values(allSkillRows.reduce((acc, row) => {
      const key = row.skill;
      const current = acc[key] || {
        skill: row.skill,
        score: 0,
        label: "Weak",
        supportingProjects: 0,
        strongestEvidence: "",
        projectTitles: [],
        tier: row.tier || "claimed"
      };
      current.supportingProjects = new Set([
        ...current.projectTitles,
        row.challenge_title || `Submission ${row.submission_id}`
      ]).size;
      current.projectTitles = [...new Set([...current.projectTitles, row.challenge_title || `Submission ${row.submission_id}`])];
      if (Number(row.score || 0) >= current.score) {
        current.score = Math.round(Number(row.score || 0));
        current.strongestEvidence = row.evidence || current.strongestEvidence || "Evidence recorded in submitted project.";
        current.tier = row.tier || current.tier;
      }
      current.label = proofStrengthLabel(current.score);
      acc[key] = current;
      return acc;
    }, {})).sort((a, b) => b.score - a.score),
    earnedBadges,
    proofStrength,
    source: full?.source || (ea ? "stored" : "none"),
    evaluatorSource: full?.evaluatorSource || full?.source || "mock",
    proofAnalysis: full?.proofAnalysis || {
      project_type: ea?.project_type || "web",
      complexity_level: "intermediate",
      confidence_score: confidence100,
      proof_strength: proofStrength,
      file_structure: JSON.parse(ea?.file_structure_json || "[]"),
      github_readme_excerpt: ea?.readme_signal
    },
    employerSummary: full?.employerSummary || "",
    uncertainty: full?.uncertainty || { missing: [] }
  };
}

export function getTalentRosterForMatching() {
  const db = getDb();
  return db
    .prepare(
      `SELECT u.id, u.name, u.country, tp.headline
       FROM users u
       JOIN talent_profiles tp ON tp.user_id = u.id
       WHERE u.role = 'talent'
       ORDER BY u.id`
    )
    .all();
}
