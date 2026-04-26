import "dotenv/config";
import cors from "cors";
import express from "express";
import { initDb, getDb } from "./db.js";
import { runEvaluationPipeline, runJobParseRequest, stripMetadata } from "./evaluationCore.js";
import { generateChallengePrompt } from "./prompts.js";
import { buildCandidateText, getOrComputeEmbedding, computeJobEmbedding, invalidateEmbedding } from "./embeddings.js";
import { aggregateProofStrength, detectNegativeEvidence } from "./negativeEvidence.js";
import { normalizeSkillName } from "./skillOntology.js";
import {
  persistSubmissionEvaluation,
  buildProfileFromDb,
  getTalentRosterForMatching,
  createVerificationTestsForSubmission,
  getVerificationTests,
  completeVerificationTest,
  getSubmissionBadgeState
} from "./persistence.js";
import { matchTalentToJob, getAverageScore } from "./matchService.js";
import { seedExtraChallenges, seedExtraUsers, seedDemoJobs } from "./seed.js";

initDb();
seedExtraChallenges(getDb());
seedExtraUsers(getDb());
seedDemoJobs(getDb());

const app = express();
const port = Number(process.env.API_PORT || 3001);
const listenHost = process.env.API_HOST?.trim() || "127.0.0.1";

// Vite may use 5173, 5174, 5175, … — reflect any local dev origin so login/API works.
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      try {
        const u = new URL(origin);
        const local =
          u.protocol === "http:" &&
          (u.hostname === "127.0.0.1" ||
            u.hostname === "localhost" ||
            u.hostname === "[::1]" ||
            u.hostname === "::1");
        return callback(null, local ? origin : false);
      } catch {
        return callback(null, false);
      }
    }
  })
);
app.use(express.json({ limit: "2mb" }));

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function getEvidencePayload(body = {}) {
  return {
    projectDescription: String(body.projectDescription || "").trim(),
    githubUrl: String(body.githubUrl || "").trim(),
    liveUrl: String(body.liveUrl || "").trim(),
    explanation: String(body.explanation || "").trim(),
    videoUrl: String(body.videoUrl || "").trim() || null
  };
}

function hasAnyEvidence(payload) {
  return Boolean(payload.projectDescription || payload.explanation || payload.githubUrl || payload.liveUrl);
}

/**
 * Skills to use for challenge matching — wider than badge gating.
 * In postProcessEvaluation, hypotheses are forced to "weak" when GitHub is not
 * repo-verified; the old recommend filter (likely|possible only) dropped ALL of them,
 * so challenge scores ignored steps 1–2 and fell back to employer-demand noise.
 */
function extractSkillsForChallengeRecommend(evaluation) {
  if (!evaluation) return [];
  const out = [];
  const seen = new Set();
  const add = (name) => {
    const n = String(name || "").trim();
    if (!n) return;
    const key = n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(n);
  };
  for (const h of evaluation.skillHypotheses || []) {
    if (h?.skill && ["likely", "possible", "weak"].includes(h.status)) add(h.skill);
  }
  for (const s of evaluation.skillScores || []) {
    if (s?.skill && (Number(s.score) || 0) >= 65) add(s.skill);
  }
  const inferred = evaluation.proofAnalysis?.skills_inferred;
  if (Array.isArray(inferred)) for (const x of inferred) add(x);
  return out;
}

function tokenizeForMatch(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function collectEmployerDemandTerms(db) {
  const rows = db.prepare("SELECT raw_description, parsed_job_json FROM jobs ORDER BY id DESC LIMIT 50").all();
  const terms = new Map();
  const addTerm = (term, weight = 1) => {
    const normalized = normalizeSkillName(String(term || "").trim().toLowerCase());
    if (!normalized || normalized.length < 3) return;
    terms.set(normalized, (terms.get(normalized) || 0) + weight);
  };

  for (const row of rows) {
    tokenizeForMatch(row.raw_description || "").forEach((t) => addTerm(t, 0.5));
    let parsed = null;
    try { parsed = row.parsed_job_json ? JSON.parse(row.parsed_job_json) : null; } catch { parsed = null; }
    if (!parsed) continue;
    const skillBuckets = [
      ...(Array.isArray(parsed.requiredSkills) ? parsed.requiredSkills : []),
      ...(Array.isArray(parsed.required_skills) ? parsed.required_skills : []),
      ...(Array.isArray(parsed.mustHaveSkills) ? parsed.mustHaveSkills : []),
      ...(Array.isArray(parsed.skills) ? parsed.skills : [])
    ];
    skillBuckets.forEach((s) => addTerm(s, 2));
  }

  return terms;
}

function scoreChallengesForCandidate({
  challenges,
  userText,
  inferredSkills,
  employerDemandTerms,
  demandScale = 1
}) {
  const rawTokenSet = new Set(tokenizeForMatch(userText));
  const inferredSet = new Set((inferredSkills || [])
    .map((s) => normalizeSkillName(String(s).toLowerCase()))
    .filter(Boolean));
  const tokenSet = new Set([...rawTokenSet]
    .map((t) => normalizeSkillName(t))
    .filter(Boolean));

  return challenges
    .map((challenge) => {
      const targets = Array.isArray(challenge.skill_targets) ? challenge.skill_targets : [];
      const reasons = [];
      let score = 0;

      for (const target of targets) {
        const targetTokens = tokenizeForMatch(target);
        const directOverlap = targetTokens.filter((token) => rawTokenSet.has(token)).length;
        if (directOverlap > 0) {
          score += Math.min(24, directOverlap * 8);
          reasons.push(`Direct keyword overlap: ${target}`);
        }
        const normalizedTarget = normalizeSkillName(String(target || "").toLowerCase());
        if (!normalizedTarget) continue;
        if (inferredSet.has(normalizedTarget)) {
          score += 32;
          reasons.push(`Aligned with proof engine skills: ${target}`);
          continue;
        }
        if (tokenSet.has(normalizedTarget)) {
          score += 18;
          reasons.push(`Matches your profile text: ${target}`);
        }
        const demand = (employerDemandTerms.get(normalizedTarget) || 0) * demandScale;
        if (demand > 0) {
          score += Math.min(8, demand);
          reasons.push(`Employer market signal: ${target}`);
        }
      }

      const titleDesc = `${challenge.title || ""} ${challenge.description || ""}`.toLowerCase();
      const lexicalHits = [...rawTokenSet].filter((token) => token.length >= 4 && titleDesc.includes(token)).length;
      if (lexicalHits > 0) {
        score += Math.min(20, lexicalHits * 3);
        reasons.push("Challenge text overlaps your profile");
      }

      return {
        ...challenge,
        recommendation_score: Number(score.toFixed(2)),
        recommendation_reasons: [...new Set(reasons)].slice(0, 4)
      };
    })
    .sort((a, b) => (b.recommendation_score - a.recommendation_score) || (a.id - b.id));
}

/** Tiny tie-break only — large jitter was overriding real score gaps from user profile. */
function sessionOrderTieBreak(ranked, sessionSeed) {
  const s = Math.abs(parseInt(String(sessionSeed), 10) || 0);
  return [...ranked].sort((a, b) => {
    const diff = b.recommendation_score - a.recommendation_score;
    if (Math.abs(diff) > 0.15) return diff;
    const ja = ((Number(a.id) * 13 + s * 17) % 23) * 0.003;
    const jb = ((Number(b.id) * 13 + s * 17) % 23) * 0.003;
    return b.recommendation_score + jb - (a.recommendation_score + ja);
  });
}

app.get("/api/health", (_req, res) => {
  let ok = true;
  try {
    getDb().prepare("SELECT 1").get();
  } catch {
    ok = false;
  }
  res.json({
    ok,
    db: ok,
    host: listenHost,
    port,
    evaluator: process.env.OPENAI_API_KEY ? "openai" : "mock",
    github: process.env.GITHUB_TOKEN ? "token" : "public_rate_limit"
  });
});

app.get("/api/demo-readiness", async (_req, res) => {
  const checks = [];
  const push = (name, status, detail = "") => checks.push({ name, status, detail });

  try {
    getDb().prepare("SELECT 1").get();
    push("database", "ready", "SQLite is reachable.");
  } catch (error) {
    push("database", "failed", error?.message || "SQLite check failed.");
  }

  push(
    "llm_evaluator",
    process.env.OPENAI_API_KEY ? "ready" : "fallback",
    process.env.OPENAI_API_KEY
      ? "OPENAI_API_KEY is configured; LLM evaluation will be attempted."
      : "No OPENAI_API_KEY configured; schema-compatible mock evaluator will be used."
  );

  push(
    "github_evidence",
    process.env.GITHUB_TOKEN ? "ready" : "limited",
    process.env.GITHUB_TOKEN
      ? "GITHUB_TOKEN is configured; GitHub API rate limits are higher."
      : "No GITHUB_TOKEN configured; public GitHub rate limits apply and private repos will fall back."
  );

  if (String(process.env.ENABLE_PLAYWRIGHT_VERIFY || "").trim() === "1") {
    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      await browser.close();
      push("runtime_demo_verifier", "ready", "Playwright Chromium can launch for live demo inspection.");
    } catch (error) {
      push("runtime_demo_verifier", "failed", `Playwright is enabled but cannot launch: ${error?.message || "unknown error"}`);
    }
  } else {
    push("runtime_demo_verifier", "disabled", "ENABLE_PLAYWRIGHT_VERIFY is not set to 1.");
  }

  const routeNames = [
    "POST /api/analyze-proof",
    "POST /api/submissions",
    "POST /api/generate-tests",
    "POST /api/evaluate-test",
    "POST /api/award-badge",
    "POST /api/parse-job",
    "POST /api/jobs",
    "POST /api/jobs/:id/match"
  ];
  push("core_routes", "ready", routeNames.join(", "));

  const failed = checks.filter((check) => check.status === "failed").length;
  const fallback = checks.filter((check) => ["fallback", "limited", "disabled"].includes(check.status)).length;
  const overall = failed ? "blocked" : fallback ? "demo_ready_with_limits" : "ready";

  res.json({
    overall,
    checks,
    recommendedDemoPath: [
      "Submit candidate proof",
      "Generate targeted verification tests",
      "Submit one artifact-backed test answer",
      "Unlock badge",
      "Parse company job",
      "Run match and hiring decision"
    ]
  });
});

app.get("/api/bootstrap", (_req, res) => {
  const db = getDb();
  const challenge = db.prepare("SELECT * FROM challenges ORDER BY id ASC LIMIT 1").get();
  const company = db
    .prepare(
      `SELECT c.id as id, c.company_name, c.industry, c.country, c.user_id, u.name as contact_name, u.email
       FROM companies c
       JOIN users u ON u.id = c.user_id
       LIMIT 1`
    )
    .get();
  const talents = getTalentRosterForMatching();
  res.json({
    challenge,
    company,
    talents,
    demoTalentUserId: 1,
    demoCompanyId: company?.id
  });
});

app.get("/api/challenges", (_req, res) => {
  const rows = getDb().prepare("SELECT * FROM challenges ORDER BY id").all();
  res.json(rows);
});

app.get("/api/challenges/catalog", (_req, res) => {
  const rows = getDb().prepare("SELECT * FROM challenges ORDER BY id").all();
  res.json(rows.map((r) => ({
    ...r,
    rubric: (() => { try { return JSON.parse(r.rubric_json); } catch { return null; } })(),
    skill_targets: (() => { try { return JSON.parse(r.skill_targets); } catch { return []; } })()
  })));
});

app.post("/api/challenges/recommend", async (req, res) => {
  const db = getDb();
  const payload = {
    talentClaims: String(req.body?.talentClaims || "").trim(),
    explanation: String(req.body?.explanation || "").trim(),
    githubUrl: String(req.body?.githubUrl || "").trim(),
    liveUrl: String(req.body?.liveUrl || "").trim(),
    videoUrl: String(req.body?.videoUrl || "").trim()
  };

  const rows = db.prepare("SELECT * FROM challenges ORDER BY id").all();
  const challenges = rows.map((r) => ({
    ...r,
    rubric: (() => { try { return JSON.parse(r.rubric_json); } catch { return null; } })(),
    skill_targets: (() => { try { return JSON.parse(r.skill_targets); } catch { return []; } })()
  }));
  if (!challenges.length) return res.json({ challenges: [] });

  let inferredSkills = [];
  const projectDescription = [payload.talentClaims, payload.explanation].filter(Boolean).join("\n\n");
  let evaluationForMeta = null;
  if (hasAnyEvidence({
    projectDescription,
    explanation: payload.explanation,
    githubUrl: payload.githubUrl,
    liveUrl: payload.liveUrl
  })) {
    try {
      const pipeline = await runEvaluationPipeline({
        projectDescription,
        explanation: payload.explanation,
        githubUrl: payload.githubUrl,
        liveUrl: payload.liveUrl,
        videoUrl: payload.videoUrl || null
      });
      evaluationForMeta = pipeline?.evaluation || null;
      inferredSkills = extractSkillsForChallengeRecommend(evaluationForMeta);
    } catch {
      // Fallback to lexical ranking if evaluator is unavailable/rate-limited.
      inferredSkills = [];
    }
  }

  const userFullContext = [payload.talentClaims, payload.explanation, payload.githubUrl, payload.liveUrl, payload.videoUrl]
    .filter(Boolean)
    .join("\n");
  const demandScale =
    inferredSkills.length >= 2 || userFullContext.length > 120
      ? 0.28
      : 0.55;

  const employerDemandTerms = collectEmployerDemandTerms(db);
  const ranked = scoreChallengesForCandidate({
    challenges,
    userText: userFullContext,
    inferredSkills,
    employerDemandTerms,
    demandScale
  });

  const diversifySeed = req.body?.diversifySeed ?? req.body?.refreshToken;
  const ordered = sessionOrderTieBreak(ranked, diversifySeed);
  const mp = parseId(req.body?.maxPicks);
  const maxPicks = mp > 0 ? Math.min(20, mp) : 5;

  // A challenge is relevant only if it has at least one signal that came from the
  // user's own input (proof engine skill, direct keyword, profile text, or lexical hit).
  // Pure "Employer market signal" reasons mean the challenge has nothing to do with
  // what the user described — exclude those.
  const hasPersonalSignal = (ch) => (ch.recommendation_reasons || []).some(
    (r) => !String(r).startsWith("Employer market signal")
  );
  const relevant = ordered.filter(hasPersonalSignal);
  const picks = (relevant.length > 0 ? relevant : []).slice(0, maxPicks);

  res.json({
    picks,
    allRanked: ordered,
    challenges: picks,
    meta: {
      inferredSkills: inferredSkills.slice(0, 8),
      employerSignalsCount: employerDemandTerms.size,
      totalInCatalog: challenges.length,
      matchedCount: relevant.length,
      noMatchReason: relevant.length === 0 && userFullContext.trim().length > 20
        ? "None of the current challenges match your described focus. The catalog covers fintech, dashboards, checkout flows, and mobile UI. If your work is outside these areas, describe your proof directly in step 4."
        : null,
      maxPicks,
      diversifySeed: diversifySeed ?? null,
      skillsSource:
        evaluationForMeta
          ? "proof_engine+text"
          : userFullContext
            ? "text_only"
            : "none"
    }
  });
});

app.get("/api/challenges/:id", (req, res) => {
  const row = getDb().prepare("SELECT * FROM challenges WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Challenge not found." });
  res.json(row);
});

app.post("/api/submissions", async (req, res) => {
  const talentId = parseId(req.body?.talentId);
  const challengeId = parseId(req.body?.challengeId);
  if (!talentId || !challengeId) {
    return res.status(400).json({ error: "talentId and challengeId are required." });
  }
  const { projectDescription, githubUrl, liveUrl, explanation, videoUrl } = getEvidencePayload(req.body);

  if (!hasAnyEvidence({ projectDescription, githubUrl, liveUrl, explanation })) {
    return res.status(400).json({ error: "Add project evidence before submitting." });
  }

  // Security boundary: always compute evaluation server-side; never trust client-supplied evaluation.
  const evaluation = (await runEvaluationPipeline({
    projectDescription,
    githubUrl,
    liveUrl,
    explanation,
    videoUrl
  })).evaluation;

  const meta = {
    source: evaluation.githubEvidence?.source,
    owner: evaluation.githubEvidence?.owner,
    repo: evaluation.githubEvidence?.repo
  };

  const hypothesisCandidates = (evaluation.skillHypotheses || [])
    .filter((h) => h.status === "likely" || h.status === "possible")
    .map((h) => ({
      title: `Verified ${h.skill}`,
      score: Number(h.confidence || 0),
      evidence: h.evidence || "Hypothesis from proof inspection.",
      level: Number(h.confidence || 0) >= 90 ? 3 : Number(h.confidence || 0) >= 80 ? 2 : 1,
      levelLabel: "Detected",
      evaluatorSource: evaluation.evaluatorSource || evaluation.source || "mock",
      proofStrength: evaluation.proofStrength || 0,
      badgeStage: "detected"
    }));
  const evaluationForPersistence = {
    ...evaluation,
    provisionalBadges: hypothesisCandidates.length ? hypothesisCandidates : (evaluation.earnedBadges || []),
    earnedBadges: []
  };

  const saved = persistSubmissionEvaluation({
    talentId,
    challengeId,
    projectDescription,
    githubUrl,
    liveUrl,
    explanation,
    videoUrl,
    evaluation: evaluationForPersistence,
    githubEvidenceMeta: meta
  });
  // Invalidate cached embedding so next match re-computes from fresh evidence
  try { invalidateEmbedding(getDb(), talentId); } catch { /* non-critical */ }

  const provisionalBadges = (evaluationForPersistence.provisionalBadges || []).map((b) => ({ ...b, badgeStage: "detected" }));
  const verificationLockedEval = {
    ...evaluation,
    provisionalBadges,
    earnedBadges: [],
    badgeUnlockStatus: {
      totalCandidates: provisionalBadges.length,
      unlocked: 0,
      pending: provisionalBadges.length
    }
  };
  getDb()
    .prepare("UPDATE evidence_analyses SET full_eval_json = ? WHERE submission_id = ?")
    .run(JSON.stringify(verificationLockedEval), saved.submissionId);
  const challengeTitle = getDb().prepare("SELECT title FROM challenges WHERE id = ?").get(challengeId)?.title || "";
  const verificationPlan = createVerificationTestsForSubmission({
    submissionId: saved.submissionId,
    talentId,
    evaluation: verificationLockedEval,
    challengeTitle
  });

  res.json({
    submissionId: saved.submissionId,
    evaluation: verificationLockedEval,
    verificationPlan,
    githubEvidence: evaluation.githubEvidence
  });
});

app.post("/api/analyze-proof", async (req, res) => {
  const { projectDescription, githubUrl, liveUrl, explanation, videoUrl } = getEvidencePayload(req.body);
  if (!hasAnyEvidence({ projectDescription, githubUrl, liveUrl, explanation })) {
    return res.status(400).json({ error: "Add project evidence before analysis." });
  }
  const { evaluation } = await runEvaluationPipeline({
    projectDescription,
    githubUrl,
    liveUrl,
    explanation,
    videoUrl
  });
  const hypothesisCandidates = (evaluation.skillHypotheses || [])
    .filter((h) => h.status === "likely" || h.status === "possible")
    .map((h) => ({
      title: `Verified ${h.skill}`,
      score: Number(h.confidence || 0),
      evidence: h.evidence || "Hypothesis from proof inspection.",
      level: Number(h.confidence || 0) >= 90 ? 3 : Number(h.confidence || 0) >= 80 ? 2 : 1,
      levelLabel: "Detected",
      evaluatorSource: evaluation.evaluatorSource || evaluation.source || "mock",
      proofStrength: evaluation.proofStrength || 0,
      badgeStage: "detected"
    }));
  const locked = {
    ...evaluation,
    provisionalBadges: hypothesisCandidates.length ? hypothesisCandidates : [],
    earnedBadges: [],
    badgeUnlockStatus: {
      totalCandidates: hypothesisCandidates.length,
      unlocked: 0,
      pending: hypothesisCandidates.length
    }
  };
  res.json({ evaluation: locked });
});

app.post("/api/generate-tests", (req, res) => {
  const submissionId = parseId(req.body?.submissionId);
  if (!submissionId) return res.status(400).json({ error: "submissionId is required." });
  const db = getDb();
  const sub = db.prepare("SELECT id, talent_id, challenge_id FROM submissions WHERE id = ?").get(submissionId);
  if (!sub) return res.status(404).json({ error: "Submission not found." });
  const ea = db.prepare("SELECT full_eval_json FROM evidence_analyses WHERE submission_id = ?").get(submissionId);
  const evaluation = ea?.full_eval_json ? JSON.parse(ea.full_eval_json) : {};
  const challengeTitle = db.prepare("SELECT title FROM challenges WHERE id = ?").get(sub.challenge_id)?.title || "";
  const tests = createVerificationTestsForSubmission({
    submissionId,
    talentId: sub.talent_id,
    evaluation,
    challengeTitle
  });
  res.json({ submissionId, tests });
});

app.post("/api/evaluate", async (req, res) => {
  const { projectDescription, githubUrl, liveUrl, explanation, videoUrl } = getEvidencePayload(req.body);
  if (!hasAnyEvidence({ projectDescription, githubUrl, liveUrl, explanation })) {
    return res.status(400).json({ error: "Add project evidence before evaluating." });
  }
  const { evaluation } = await runEvaluationPipeline({
    projectDescription,
    githubUrl,
    liveUrl,
    explanation,
    videoUrl
  });
  res.json(evaluation);
});

app.get("/api/submissions/:id/verification-tests", (req, res) => {
  const submissionId = parseId(req.params.id);
  if (!submissionId) return res.status(400).json({ error: "Invalid submission id." });
  const tests = getVerificationTests(submissionId);
  res.json({ submissionId, tests });
});

app.post("/api/submissions/:id/verification-tests/:testId/complete", async (req, res) => {
  const submissionId = parseId(req.params.id);
  const testId = parseId(req.params.testId);
  const output = String(req.body?.output || "").trim();
  const notes = String(req.body?.notes || "").trim();
  if (!submissionId || !testId) return res.status(400).json({ error: "Invalid submission/test id." });
  if (!output) return res.status(400).json({ error: "output is required." });
  const out = await completeVerificationTest({ submissionId, testId, output, notes });
  if (out?.error === "test_not_found") return res.status(404).json({ error: "Verification test not found." });
  res.json({ submissionId, ...out });
});

app.post("/api/evaluate-test", async (req, res) => {
  const submissionId = parseId(req.body?.submissionId);
  const testId = parseId(req.body?.testId);
  const output = String(req.body?.output || "").trim();
  const notes = String(req.body?.notes || "").trim();
  if (!submissionId || !testId) return res.status(400).json({ error: "submissionId and testId are required." });
  if (!output) return res.status(400).json({ error: "output is required." });
  const out = await completeVerificationTest({ submissionId, testId, output, notes });
  if (out?.error === "test_not_found") return res.status(404).json({ error: "Verification test not found." });
  res.json({ submissionId, ...out });
});

app.post("/api/award-badge", (req, res) => {
  const submissionId = parseId(req.body?.submissionId);
  if (!submissionId) return res.status(400).json({ error: "submissionId is required." });
  res.json({ submissionId, ...getSubmissionBadgeState(submissionId) });
});

app.post("/api/parse-job", async (req, res) => {
  const jobPost = String(req.body?.jobPost || "").trim();
  if (!jobPost) return res.status(400).json({ error: "Add a job post before parsing." });
  const result = await runJobParseRequest(jobPost);
  if (result?.error) return res.status(400).json({ error: "Empty job post." });
  res.json(result);
});

app.post("/api/jobs", async (req, res) => {
  const companyId = parseId(req.body?.companyId);
  const raw = String(req.body?.rawDescription || "").trim();
  if (!companyId || !raw) {
    return res.status(400).json({ error: "companyId and rawDescription are required." });
  }
  const db = getDb();
  const company = db.prepare("SELECT id FROM companies WHERE id = ?").get(companyId);
  if (!company) return res.status(404).json({ error: "Company not found." });

  const parsed = await runJobParseRequest(raw);
  if (parsed?.error) return res.status(400).json({ error: "Failed to parse job." });

  const toStore = { ...stripMetadata(parsed), source: parsed.source, model: parsed.model, warning: parsed.warning };
  const r = db
    .prepare(`INSERT INTO jobs (company_id, raw_description, parsed_job_json) VALUES (?,?,?)`)
    .run(companyId, raw, JSON.stringify(toStore));
  res.json({ jobId: r.lastInsertRowid, ...parsed });
});

function jobRowToClient(row) {
  let parsed = null;
  try {
    parsed = row.parsed_job_json ? JSON.parse(row.parsed_job_json) : null;
  } catch {
    parsed = null;
  }
  return { ...row, parsed };
}

app.get("/api/jobs", (req, res) => {
  const companyId = req.query.companyId ? Number(req.query.companyId) : null;
  const db = getDb();
  const q = `SELECT j.*, c.company_name, c.industry as company_industry, c.country as company_country
    FROM jobs j
    JOIN companies c ON c.id = j.company_id`;
  const rows = companyId
    ? db.prepare(`${q} WHERE j.company_id = ? ORDER BY j.id DESC`).all(companyId)
    : db.prepare(`${q} ORDER BY j.id DESC`).all();
  res.json(rows.map(jobRowToClient));
});

app.get("/api/jobs/:id", (req, res) => {
  const row = getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Job not found." });
  if (row.parsed_job_json) {
    try {
      row.parsed = JSON.parse(row.parsed_job_json);
    } catch {
      row.parsed = null;
    }
  }
  res.json(row);
});

app.post("/api/jobs/:id/match", async (req, res) => {
  const jobId = parseId(req.params.id);
  const db = getDb();
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
  if (!job) return res.status(404).json({ error: "Job not found." });
  let parsed;
  try {
    parsed = JSON.parse(job.parsed_job_json);
  } catch {
    return res.status(400).json({ error: "Invalid stored job parse." });
  }
  if (!parsed?.required_skills) {
    return res.status(400).json({ error: "Job is missing required_skills in parsed data." });
  }

  const roster = getTalentRosterForMatching();

  // Compute job embedding once for the whole roster
  let jobEmbedding = null;
  try {
    jobEmbedding = await computeJobEmbedding(parsed);
  } catch { /* non-critical */ }

  const out = [];
  for (const t of roster) {
    const profile = buildProfileFromDb(db, t.id);
    const earnedBadges = profile.earnedBadges || [];
    const latestSub = db.prepare(
      "SELECT github_url, live_url FROM submissions WHERE talent_id = ? ORDER BY submitted_at DESC LIMIT 1"
    ).get(t.id);
    const liveUrl = latestSub?.live_url || null;
    const isDemoProfile = Boolean(liveUrl?.includes(".example.com")) ||
      earnedBadges.some((b) => b.evaluatorSource === "seed") ||
      (earnedBadges.length > 0 && !profile.proofAnalysis?.confidence_score);

    // Aggregate proof strength across all submissions
    const allSubs = db.prepare(`
      SELECT s.id, s.submitted_at, ea.full_eval_json
      FROM submissions s
      LEFT JOIN evidence_analyses ea ON ea.submission_id = s.id
      WHERE s.talent_id = ?
      ORDER BY s.submitted_at DESC
    `).all(t.id);
    const subsWithStrength = allSubs.map((s) => {
      let ps = 0;
      try { const f = JSON.parse(s.full_eval_json || "{}"); ps = f.proofStrength || f.proofAnalysis?.proof_strength || 0; } catch {}
      return { id: s.id, proofStrength: ps, submittedAt: s.submitted_at };
    });
    const aggregated = aggregateProofStrength(subsWithStrength);

    // Attach negative evidence from latest evaluation to profile
    let latestNegEv = null;
    if (allSubs.length) {
      try { latestNegEv = JSON.parse(allSubs[0].full_eval_json || "{}")?.negativeEvidence || null; } catch {}
    }
    const enrichedProfile = {
      ...profile,
      aggregatedProofStrength: aggregated.aggregatedScore,
      proofStrengthTrend: aggregated.trend,
      negativeEvidence: latestNegEv || {}
    };

    // Candidate embedding (cached per talent)
    let talentEmbedding = null;
    try {
      const text = buildCandidateText(enrichedProfile);
      talentEmbedding = text ? await getOrComputeEmbedding(db, t.id, text) : null;
    } catch { /* non-critical */ }

    const candidate = {
      name: t.name,
      country: t.country,
      proof: t.headline || "Verified work",
      badges: earnedBadges.map((b) => b.title),
      earnedBadges,
      isDemoProfile,
      githubUrl: latestSub?.github_url || null,
      liveUrl
    };

    const matchRow = matchTalentToJob(candidate, enrichedProfile, parsed, { jobEmbedding, talentEmbedding });
    const mustHave = matchRow.explainableMatch?.mustHaveCoverage ?? 0;
    const risk = matchRow.explainableMatch?.riskScore ?? 50;
    const expl = {
      matchExplanation: matchRow.matchExplanation,
      hiringDecision: matchRow.hiringDecision,
      explainableMatch: matchRow.explainableMatch,
      strongMatches: matchRow.strongMatches,
      missingSkills: matchRow.missingSkills
    };
    db.prepare(
      `INSERT INTO matches (job_id, talent_id, match_score, must_have_score, semantic_score, risk_score, explanation_json)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(job_id, talent_id) DO UPDATE SET
         match_score = excluded.match_score,
         must_have_score = excluded.must_have_score,
         semantic_score = excluded.semantic_score,
         risk_score = excluded.risk_score,
         explanation_json = excluded.explanation_json`
    ).run(
      jobId, t.id, matchRow.weightedMatchScore, mustHave, matchRow.semanticScore ?? matchRow.embeddingSimilarity ?? 0, risk,
      JSON.stringify(expl)
    );
    out.push({
      talentId: t.id, ...t, ...matchRow, talent_id: t.id,
      skills: enrichedProfile.skillProofs || enrichedProfile.skillScores || [],
      proofStrengthTrend: aggregated.trend,
      aggregatedProofStrength: aggregated.aggregatedScore,
      negativeEvidence: latestNegEv || {}
    });
  }
  res.json({ jobId, candidates: out.sort((a, b) => b.weightedMatchScore - a.weightedMatchScore) });
});

app.get("/api/jobs/:id/matches", (req, res) => {
  const jobId = Number(req.params.id);
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT m.*, u.name, u.country, tp.headline
       FROM matches m
       JOIN users u ON u.id = m.talent_id
       JOIN talent_profiles tp ON tp.user_id = u.id
       WHERE m.job_id = ?
       ORDER BY m.match_score DESC`
    )
    .all(jobId);
  for (const r of rows) {
    try {
      r.parsed = JSON.parse(r.explanation_json || "{}");
    } catch {
      r.parsed = {};
    }
  }
  res.json(rows);
});

app.post("/api/match-outcomes", (req, res) => {
  const jobId = parseId(req.body?.jobId);
  const talentId = parseId(req.body?.talentId);
  const action = String(req.body?.action || "").trim();
  const allowed = new Set(["viewed", "shortlisted", "challenge_sent", "challenge_completed", "hired", "rejected", "ignored"]);
  if (!jobId || !talentId || !allowed.has(action)) {
    return res.status(400).json({ error: "jobId, talentId, and valid action are required." });
  }
  const db = getDb();
  const match = db
    .prepare("SELECT match_score FROM matches WHERE job_id = ? AND talent_id = ?")
    .get(jobId, talentId);
  const rankRows = db
    .prepare("SELECT talent_id FROM matches WHERE job_id = ? ORDER BY match_score DESC")
    .all(jobId);
  const initialRank = rankRows.findIndex((row) => Number(row.talent_id) === talentId) + 1 || null;
  const rejectionReason = String(req.body?.rejectionReason || req.body?.rejection_reason || "").trim() || null;
  const performanceRating = req.body?.performanceRating == null ? null : Number(req.body.performanceRating);
  const r = db.prepare(
    `INSERT INTO match_outcomes
      (job_id, talent_id, initial_match_score, initial_rank, action, rejection_reason, performance_rating)
     VALUES (?,?,?,?,?,?,?)`
  ).run(
    jobId,
    talentId,
    match?.match_score ?? null,
    initialRank,
    action,
    rejectionReason,
    Number.isFinite(performanceRating) ? performanceRating : null
  );
  res.json({
    id: r.lastInsertRowid,
    jobId,
    talentId,
    action,
    initialMatchScore: match?.match_score ?? null,
    initialRank
  });
});

app.get("/api/match-outcomes", (req, res) => {
  const jobId = req.query.jobId ? parseId(req.query.jobId) : 0;
  const db = getDb();
  const rows = jobId
    ? db.prepare("SELECT * FROM match_outcomes WHERE job_id = ? ORDER BY action_at DESC").all(jobId)
    : db.prepare("SELECT * FROM match_outcomes ORDER BY action_at DESC LIMIT 200").all();
  res.json(rows);
});

app.post("/api/final-challenges", (req, res) => {
  const jobId = Number(req.body?.jobId);
  const talentId = Number(req.body?.talentId);
  const challengeText = String(req.body?.challengeText || "").trim();
  const status = String(req.body?.status || "sent");
  if (!jobId || !talentId || !challengeText) {
    return res.status(400).json({ error: "jobId, talentId, and challengeText are required." });
  }
  const r = getDb()
    .prepare(
      `INSERT INTO final_challenges (job_id, talent_id, challenge_text, status) VALUES (?,?,?,?)`
    )
    .run(jobId, talentId, challengeText, status);
  res.json({ id: r.lastInsertRowid });
});

app.get("/api/final-challenges", (req, res) => {
  const jobId = req.query.jobId ? Number(req.query.jobId) : null;
  const db = getDb();
  if (jobId) {
    return res.json(db.prepare("SELECT * FROM final_challenges WHERE job_id = ?").all(jobId));
  }
  res.json(db.prepare("SELECT * FROM final_challenges ORDER BY id DESC").all());
});

app.post("/api/payments", (req, res) => {
  const companyId = Number(req.body?.companyId);
  const talentId = Number(req.body?.talentId);
  const amount = Number(req.body?.amount);
  const status = String(req.body?.status || "pending");
  const payoutMethod = String(req.body?.payoutMethod || req.body?.payout_method || "mobile_money");
  if (!companyId || !talentId) return res.status(400).json({ error: "companyId and talentId required." });
  const r = getDb()
    .prepare(
      `INSERT INTO payments (company_id, talent_id, amount, status, payout_method) VALUES (?,?,?,?,?)`
    )
    .run(companyId, talentId, amount || 0, status, payoutMethod);
  res.json({ id: r.lastInsertRowid, status, amount, payoutMethod });
});

app.get("/api/users", (_req, res) => {
  res.json(getDb().prepare("SELECT id, name, email, country, role, created_at FROM users").all());
});

// ─── Auth ───────────────────────────────────────────────────────────────────

app.post("/api/auth/signup", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const country = String(req.body?.country || "").trim();
  const role = String(req.body?.role || "talent").trim();
  const companyName = String(req.body?.company_name || "").trim();

  if (!name || !email) return res.status(400).json({ error: "Name and email are required." });
  if (!["talent", "company"].includes(role)) return res.status(400).json({ error: "Role must be talent or company." });

  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "Email already registered. Use the Log In tab instead." });

  const r = db.prepare("INSERT INTO users (name, email, country, role) VALUES (?,?,?,?)").run(name, email, country, role);
  const userId = Number(r.lastInsertRowid);

  let profileId = null;
  if (role === "talent") {
    const pr = db.prepare("INSERT INTO talent_profiles (user_id, headline, country, bio, portfolio_links) VALUES (?,?,?,?,?)").run(userId, "", country, "", "[]");
    profileId = Number(pr.lastInsertRowid);
  } else {
    const cn = companyName || `${name}'s Company`;
    const pr = db.prepare("INSERT INTO companies (user_id, company_name, country) VALUES (?,?,?)").run(userId, cn, country);
    profileId = Number(pr.lastInsertRowid);
  }

  const user = db.prepare("SELECT id, name, email, country, role, created_at FROM users WHERE id = ?").get(userId);
  res.json({ user, profileId });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "Email is required." });

  const db = getDb();
  const user = db.prepare("SELECT id, name, email, country, role, created_at FROM users WHERE email = ?").get(email);
  if (!user) return res.status(404).json({ error: "No account found. Check the email or sign up." });

  let profileId = null;
  if (user.role === "talent") {
    const tp = db.prepare("SELECT id FROM talent_profiles WHERE user_id = ?").get(user.id);
    profileId = tp?.id || null;
  } else if (user.role === "company") {
    const co = db.prepare("SELECT id FROM companies WHERE user_id = ?").get(user.id);
    profileId = co?.id || null;
  }

  res.json({ user, profileId });
});

// ─── Talent profile & history ────────────────────────────────────────────────

app.get("/api/talent/:id/profile", (req, res) => {
  const talentId = Number(req.params.id);
  const db = getDb();
  const user = db.prepare("SELECT id, name, email, country, role FROM users WHERE id = ? AND role = 'talent'").get(talentId);
  if (!user) return res.status(404).json({ error: "Talent not found." });

  const profile = db.prepare("SELECT * FROM talent_profiles WHERE user_id = ?").get(talentId);
  const proofProfile = buildProfileFromDb(db, talentId);
  const badges = db.prepare(`
    SELECT ab.id, ab.confidence, ab.proof_strength_score, ab.awarded_at,
           b.name as badge_name, s.name as skill_name, s.category
    FROM awarded_badges ab
    JOIN badges b ON b.id = ab.badge_id
    LEFT JOIN skills s ON s.id = b.skill_id
    WHERE ab.talent_id = ?
    ORDER BY ab.awarded_at DESC
  `).all(talentId);
  const submissions = db.prepare(`
    SELECT s.id, s.challenge_id, s.github_url, s.live_url, s.explanation,
           s.submitted_at, c.title as challenge_title, c.description as challenge_description,
           ea.confidence_score, ea.project_type
    FROM submissions s
    JOIN challenges c ON c.id = s.challenge_id
    LEFT JOIN evidence_analyses ea ON ea.submission_id = s.id
    WHERE s.talent_id = ?
    ORDER BY s.submitted_at DESC
  `).all(talentId);

  res.json({ user, profile: { ...(profile || {}), ...proofProfile }, badges, submissions });
});

app.get("/api/talent/:id/submissions", (req, res) => {
  const talentId = Number(req.params.id);
  const rows = getDb().prepare(`
    SELECT s.*, c.title as challenge_title
    FROM submissions s
    JOIN challenges c ON c.id = s.challenge_id
    WHERE s.talent_id = ? ORDER BY s.submitted_at DESC
  `).all(talentId);
  res.json(rows);
});

app.get("/api/talent/:id/final-challenges", (req, res) => {
  const talentId = Number(req.params.id);
  const rows = getDb().prepare(`
    SELECT fc.*, j.raw_description, co.company_name
    FROM final_challenges fc
    JOIN jobs j ON j.id = fc.job_id
    JOIN companies co ON co.id = j.company_id
    WHERE fc.talent_id = ?
    ORDER BY fc.id DESC
  `).all(talentId);
  res.json(rows);
});

// ─── Final challenge status ──────────────────────────────────────────────────

app.patch("/api/final-challenges/:id/status", (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || "").trim();
  if (!["pending", "sent", "completed", "cancelled"].includes(status)) {
    return res.status(400).json({ error: "Invalid status. Must be pending, sent, completed, or cancelled." });
  }
  const r = getDb().prepare("UPDATE final_challenges SET status = ? WHERE id = ?").run(status, id);
  if (r.changes === 0) return res.status(404).json({ error: "Final challenge not found." });
  res.json({ id, status });
});

// ─── Company dashboard ───────────────────────────────────────────────────────

app.get("/api/companies/:id/jobs", (req, res) => {
  const companyId = Number(req.params.id);
  const db = getDb();
  const jobs = db.prepare("SELECT * FROM jobs WHERE company_id = ? ORDER BY id DESC").all(companyId);
  const result = jobs.map((j) => {
    let parsed = null;
    try { parsed = JSON.parse(j.parsed_job_json); } catch {}
    const matchCount = db.prepare("SELECT COUNT(*) as c FROM matches WHERE job_id = ?").get(j.id)?.c || 0;
    const hired = db.prepare("SELECT COUNT(*) as c FROM payments WHERE company_id = ?").get(companyId)?.c || 0;
    return { ...j, parsed, matchCount, hired };
  });
  res.json(result);
});

import { existsSync } from "fs";
import { join as pathJoin, dirname as pathDirname } from "path";
import { fileURLToPath as pathFileURLToPath } from "url";

const __serverDir = pathDirname(pathFileURLToPath(import.meta.url));

app.get("/api/screenshots/:filename", (req, res) => {
  const filename = String(req.params.filename || "").replace(/[^a-z0-9._-]/gi, "");
  if (!filename || !filename.endsWith(".png")) return res.status(400).json({ error: "Invalid filename." });
  const filePath = pathJoin(__serverDir, "data", "screenshots", filename);
  if (!existsSync(filePath)) return res.status(404).json({ error: "Screenshot not found." });
  res.setHeader("Content-Type", "image/png");
  res.sendFile(filePath);
});

// ─── Candidate Index ──────────────────────────────────────────────────────────
// GET /api/candidates
// Query params:
//   skills         comma-separated canonical skill IDs or names
//   badges         require all listed badge titles (comma-sep)
//   country        exact country match (case-insensitive)
//   minProofStrength  0-100
//   minConfidence     0-100
//   maxIntegrityRisk  "low"|"medium"|"high"
//   hasBadges      "true" → must have at least one earned badge
//   availability   "open" (default: any)
//   q              free-text search in name, headline, skills
//   sort           "proofStrength"|"confidence"|"badgeCount"|"name" (default: proofStrength)

app.get("/api/candidates", (req, res) => {
  const db = getDb();
  const {
    skills: skillsParam,
    badges: badgesParam,
    country,
    minProofStrength,
    minConfidence,
    maxIntegrityRisk,
    hasBadges,
    availability,
    q,
    sort = "proofStrength"
  } = req.query;

  const requiredSkillIds = skillsParam
    ? skillsParam.split(",").map((s) => normalizeSkillName(s.trim())).filter(Boolean)
    : [];
  const requiredBadges = badgesParam
    ? badgesParam.split(",").map((b) => b.trim().toLowerCase()).filter(Boolean)
    : [];
  const minPS = minProofStrength != null ? Number(minProofStrength) : 0;
  const minConf = minConfidence != null ? Number(minConfidence) : 0;
  const integrityRiskOrder = { low: 0, medium: 1, high: 2 };
  const maxRiskOrdinal = maxIntegrityRisk != null ? (integrityRiskOrder[maxIntegrityRisk] ?? 2) : 2;
  const qLower = q ? String(q).toLowerCase().trim() : "";

  // Load all talent users with their profiles
  const talentUsers = db.prepare(`
    SELECT u.id, u.name, u.email, u.country, u.role, u.created_at,
           tp.headline, tp.bio, tp.availability_status
    FROM users u
    JOIN talent_profiles tp ON tp.user_id = u.id
    WHERE u.role = 'talent'
    ORDER BY u.id
  `).all();

  const results = [];

  for (const user of talentUsers) {
    // Build profile from DB
    const profile = buildProfileFromDb(db, user.id);

    // --- Proof strength: aggregate across ALL submissions ---
    const allSubs = db.prepare(`
      SELECT s.id, s.submitted_at,
             ea.confidence_score,
             ea.full_eval_json
      FROM submissions s
      LEFT JOIN evidence_analyses ea ON ea.submission_id = s.id
      WHERE s.talent_id = ?
      ORDER BY s.submitted_at DESC
    `).all(user.id);

    const subsWithStrength = allSubs.map((s) => {
      let ps = 0;
      try {
        const full = s.full_eval_json ? JSON.parse(s.full_eval_json) : {};
        ps = full.proofStrength || full.proofAnalysis?.proof_strength || 0;
      } catch {}
      return { id: s.id, proofStrength: ps, submittedAt: s.submitted_at, confidenceScore: s.confidence_score || 0 };
    });
    const aggregated = aggregateProofStrength(subsWithStrength);
    const aggregatedProofStrength = aggregated.aggregatedScore;

    // Confidence from most-recent evaluation
    const confidence = profile?.proofAnalysis?.confidence_score || 0;

    // Negative evidence from last eval
    let negEvSummary = { totalPenalty: 0, highRiskCount: 0, flags: [] };
    if (allSubs.length) {
      try {
        const latestFull = JSON.parse(allSubs[0].full_eval_json || "{}");
        negEvSummary = latestFull.negativeEvidence || negEvSummary;
      } catch {}
    }

    // Integrity risk
    const integrityRisk = profile?.integritySummary?.risk ||
      (negEvSummary.highRiskCount >= 2 ? "high" : negEvSummary.highRiskCount >= 1 ? "medium" : "low");
    const integrityOrdinal = integrityRiskOrder[integrityRisk] ?? 1;

    // Skills from DB (most recent submission)
    const skills = (profile.skillScores || []).map((s) => ({
      skill: s.skill,
      skillId: s.skillId || normalizeSkillName(s.skill),
      score: s.score,
      tier: s.tier,
      lifecycleState: s.lifecycleState || (s.tier === "direct" ? "evidence_supported" : s.tier === "inferred" ? "hypothesized" : "claimed"),
      supportingProjects: s.supportingProjects || 1,
      strongestEvidence: s.strongestEvidence || s.evidence || "",
      label: s.proofStrengthLabel || undefined
    }));

    const earnedBadges = profile.earnedBadges || [];
    const badgeCount = earnedBadges.length;

    // ── Filters ──────────────────────────────────────────────────────────────
    if (aggregatedProofStrength < minPS) continue;
    if (confidence < minConf) continue;
    if (integrityOrdinal > maxRiskOrdinal) continue;
    if (hasBadges === "true" && badgeCount === 0) continue;
    if (availability && user.availability_status && user.availability_status !== availability) continue;
    if (country && user.country?.toLowerCase() !== country.toLowerCase()) continue;

    // Skill filter — candidate must have at least one match per required skill
    if (requiredSkillIds.length) {
      const candidateSkillIds = new Set(skills.map((s) => s.skillId).filter(Boolean));
      const matched = requiredSkillIds.filter((id) => candidateSkillIds.has(id));
      if (matched.length === 0) continue;
    }

    // Badge filter
    if (requiredBadges.length) {
      const candidateBadgeTitles = new Set(earnedBadges.map((b) => b.title?.toLowerCase()));
      const allBadgesPresent = requiredBadges.every((b) => candidateBadgeTitles.has(b));
      if (!allBadgesPresent) continue;
    }

    // Free-text search
    if (qLower) {
      const searchText = [user.name, user.country, user.headline, user.bio, ...skills.map((s) => s.skill)].join(" ").toLowerCase();
      if (!searchText.includes(qLower)) continue;
    }

    // ── Per-skill proof strength ─────────────────────────────────────────────
    const skillsWithStrength = skills.map((s) => {
      // Evidence weight: direct=1.0, inferred=0.8, claimed=0.3
      const evWeight = s.tier === "direct" ? 1.0 : s.tier === "inferred" ? 0.8 : 0.3;
      const rawPS = (s.score / 100) * evWeight * aggregatedProofStrength;
      const ps = Math.round(Math.min(100, rawPS));
      const label = ps >= 75 ? "Verified Strong" : ps >= 55 ? "Strong" : ps >= 35 ? "Moderate" : "Weak";
      return { ...s, proofStrength: ps, proofStrengthLabel: label };
    });

    // Domain context from latest eval
    let domainContext = "general";
    try {
      const latestFull = JSON.parse(allSubs[0]?.full_eval_json || "{}");
      domainContext = latestFull.evidenceObject?.domain_context || latestFull.proofAnalysis?.project_type || "general";
    } catch {}

    // ── Profile strength index ────────────────────────────────────────────────
    const profileStrength = Math.round(
      0.35 * aggregatedProofStrength +
      0.25 * Math.min(100, confidence) +
      0.20 * Math.min(100, badgeCount * 20) +
      0.20 * (100 - (negEvSummary.totalPenalty || 0))
    );

    const latestSub = db.prepare("SELECT github_url, live_url FROM submissions WHERE talent_id = ? ORDER BY submitted_at DESC LIMIT 1").get(user.id);

    results.push({
      id: user.id,
      name: user.name,
      country: user.country,
      headline: user.headline || "",
      bio: user.bio || "",
      availability: user.availability_status || "open",
      skills: skillsWithStrength,
      badges: earnedBadges,
      badgeCount,
      proofStrength: aggregatedProofStrength,
      proofStrengthTrend: aggregated.trend,
      confidence,
      integrityRisk,
      negativeEvidence: negEvSummary,
      domainContext,
      profileStrength,
      submissionCount: allSubs.length,
      githubUrl: latestSub?.github_url || null,
      liveUrl: latestSub?.live_url || null
    });
  }

  // ── Sort ──────────────────────────────────────────────────────────────────
  results.sort((a, b) => {
    if (sort === "confidence") return b.confidence - a.confidence;
    if (sort === "badgeCount") return b.badgeCount - a.badgeCount;
    if (sort === "name") return a.name.localeCompare(b.name);
    return b.proofStrength - a.proofStrength; // default
  });

  res.json({
    total: results.length,
    filters: { skills: requiredSkillIds, badges: requiredBadges, country: country || null, minProofStrength: minPS, minConfidence: minConf, q: qLower || null },
    candidates: results
  });
});

app.post("/api/generate-challenge", async (req, res) => {
  const parsedJob = req.body?.parsedJob;
  const missingSkills = Array.isArray(req.body?.missingSkills) ? req.body.missingSkills : [];
  const candidateName = String(req.body?.candidateName || "").trim();
  if (!parsedJob?.role_title) {
    return res.status(400).json({ error: "parsedJob with role_title is required." });
  }

  const challengeSchema = {
    type: "object",
    additionalProperties: false,
    required: ["challenge_title", "context", "deliverables", "acceptance_criteria", "time_limit_minutes", "rubric", "evidence_required", "assumptions"],
    properties: {
      challenge_title: { type: "string" },
      context: { type: "string" },
      deliverables: { type: "array", items: { type: "string" } },
      acceptance_criteria: { type: "array", items: { type: "string" } },
      time_limit_minutes: { type: "number" },
      rubric: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["criterion", "weight", "what_to_look_for"],
          properties: {
            criterion: { type: "string" },
            weight: { type: "number" },
            what_to_look_for: { type: "string" }
          }
        }
      },
      evidence_required: { type: "array", items: { type: "string" } },
      assumptions: { type: "array", items: { type: "string" } }
    }
  };

  const promptInput = [
    `Role: ${parsedJob.role_title}`,
    `Business context: ${parsedJob.business_context || "Not specified"}`,
    `Required skills: ${(parsedJob.required_skills || []).join(", ")}`,
    `Candidate skill gaps: ${missingSkills.length ? missingSkills.join(", ") : "None — test depth on required skills"}`,
    candidateName ? `Candidate: ${candidateName}` : ""
  ].filter(Boolean).join("\n");

  if (!process.env.OPENAI_API_KEY) {
    return res.json({
      challenge_title: `Final challenge: ${parsedJob.role_title}`,
      context: parsedJob.business_context || parsedJob.role_title,
      deliverables: ["GitHub repository link", "Live deployment URL", "Short implementation explanation"],
      acceptance_criteria: [
        ...(parsedJob.required_skills || []).slice(0, 3).map((s) => `Demonstrate ${s} with observable output`),
        "All acceptance criteria visible in the submitted links"
      ],
      time_limit_minutes: 120,
      rubric: (parsedJob.required_skills || []).slice(0, 4).map((s, i) => ({
        criterion: s,
        weight: i === 0 ? 35 : i === 1 ? 30 : i === 2 ? 20 : 15,
        what_to_look_for: `Observable implementation of ${s} in submitted artifacts`
      })),
      evidence_required: ["code", "runtime", "explanation"],
      assumptions: parsedJob.uncertainty?.assumptions || ["Assuming web-based deliverable"],
      source: "mock"
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions: generateChallengePrompt(),
        input: [{ role: "user", content: [{ type: "input_text", text: promptInput }] }],
        text: { format: { type: "json_schema", name: "unmapped_challenge", strict: true, schema: challengeSchema } }
      }),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI ${response.status}: ${err.slice(0, 200)}`);
    }
    const data = await response.json();
    const text = data.output_text || data.output?.flatMap((i) => i.content || []).filter((c) => c.type === "output_text").map((c) => c.text).join("") || "{}";
    res.json({ ...JSON.parse(text), source: "openai", model: process.env.OPENAI_MODEL || "gpt-4.1-mini" });
  } catch (error) {
    console.error("Challenge generation failed:", error?.message);
    res.status(500).json({ error: `Challenge generation failed: ${error?.message || "unknown"}` });
  }
});

// Always return JSON on unexpected errors (avoids empty bodies that break `response.json()` in the UI).
app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  if (res.headersSent) return;
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({ error: message || "Internal server error." });
});

app.listen(port, listenHost === "0.0.0.0" ? "0.0.0.0" : listenHost, () => {
  const shown = listenHost === "0.0.0.0" ? "0.0.0.0 (all interfaces)" : listenHost;
  console.log(`Unmapped API running on http://${shown}:${port}`);
});
