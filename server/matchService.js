/**
 * Unmapped hybrid matching engine — v3
 *
 * Scoring formula (100 pts):
 *   30% must-have canonical coverage   (rule-based, canonical skill ontology)
 *   18% proof strength                 (aggregated across submissions)
 *   14% nice-to-have coverage          (rule-based)
 *   12% badge quality                  (verified badges × tier × level)
 *   12% embedding semantic similarity  (OpenAI text-embedding-3-small, or 0 if unavailable)
 *   10% deliverable / domain fit       (token overlap fallback)
 *    4% integrity bonus                (low-risk candidates rewarded, not just penalized)
 *
 * Penalties applied after weighted sum:
 *   − confidence gap penalty   (talent confidence < 75)
 *   − integrity risk penalty   (fork/low-commits/originality)
 *   − negative evidence total  (from negativeEvidence.js)
 *   − mock evaluator penalty   (−4 if all badges are keyword-fallback)
 *
 * Hard gate: must_have_coverage < 40% → score capped at 39
 */

import {
  normalizeSkillName,
  getCanonicalSkill,
  expandWithImplied,
  computeProofStrength
} from "./skillOntology.js";
import { cosineSimilarity } from "./embeddings.js";

export function getAverageScore(profile) {
  const scores = profile?.skillScores || [];
  if (!scores.length) return 0;
  return Math.round(scores.reduce((sum, s) => sum + Number(s.score || 0), 0) / scores.length);
}

// ─── Canonical skill matching ──────────────────────────────────────────────────

function canonicalMatchScore(requirement, candidateSkills) {
  const reqId = normalizeSkillName(requirement);

  if (reqId) {
    const reqExpanded = expandWithImplied([reqId]);
    let bestScore = 0;
    let bestEvidence = "";

    for (const cs of candidateSkills) {
      const csId = cs.skillId || normalizeSkillName(cs.skill || cs.canonical || "");
      if (!csId) continue;
      const csExpanded = expandWithImplied([csId]);

      if (csId === reqId) {
        const tierMult = { direct: 1.0, inferred: 0.85, claimed: 0.45 }[cs.tier] ?? 0.65;
        const lvlBonus = cs.level === "advanced" ? 0.12 : cs.level === "intermediate" ? 0.05 : 0;
        const s = Math.min(1.0, (Number(cs.score || cs.confidence || 0) / 100) * tierMult + lvlBonus);
        if (s > bestScore) { bestScore = s; bestEvidence = cs.evidence || ""; }
        continue;
      }

      const hasOverlap = reqExpanded.some((r) => csExpanded.includes(r));
      if (hasOverlap) {
        const tierMult = { direct: 0.85, inferred: 0.72, claimed: 0.38 }[cs.tier] ?? 0.55;
        const s = Math.min(0.88, (Number(cs.score || cs.confidence || 0) / 100) * tierMult);
        if (s > bestScore) { bestScore = s; bestEvidence = cs.evidence || ""; }
      }
    }

    if (bestScore > 0) return { matched: bestScore >= 0.32, confidence: bestScore, evidence: bestEvidence };
  }

  return tokenOverlapMatch(requirement, candidateSkills);
}

function tokenOverlapMatch(requirement, candidateSkills) {
  const reqTokens = tokenize(expandSkillTerms(requirement));
  let best = { score: 0, evidence: "" };
  for (const cs of candidateSkills) {
    const label = cs.skill || cs.canonical || "";
    const csTokens = tokenize(expandSkillTerms(`${label} ${cs.evidence || ""}`));
    const overlap = reqTokens.filter((t) => csTokens.includes(t)).length;
    const score = reqTokens.length ? overlap / reqTokens.length : 0;
    if (score > best.score) best = { score, evidence: cs.evidence || "" };
  }
  return { matched: best.score >= 0.30, confidence: best.score, evidence: best.evidence };
}

function tokenize(v) {
  return String(v).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2 && !["and", "with", "for", "the", "url", "that"].includes(t));
}

function expandSkillTerms(v) {
  return String(v).toLowerCase()
    .replaceAll("api", "api fetch endpoint integration data")
    .replaceAll("dashboard", "dashboard layout navigation transaction data table")
    .replaceAll("transaction", "transaction financial payment fintech data")
    .replaceAll("responsive", "responsive mobile desktop layout")
    .replaceAll("form", "form validation input submit")
    .replaceAll("checkout", "checkout payment cart purchase form validation");
}

function fallbackSemanticScore(profile, parsedJob, candidateSkills) {
  const jobText = [
    parsedJob?.role_title,
    parsedJob?.business_context,
    ...(parsedJob?.required_skills || []),
    ...(parsedJob?.required_capabilities || []),
    ...(parsedJob?.technical_skills || []),
    ...(parsedJob?.deliverables || parsedJob?.required_deliverables || [])
  ].filter(Boolean).join(" ");
  const candidateText = [
    profile?.employerSummary,
    profile?.proofAnalysis?.project_type,
    profile?.proofAnalysis?.complexity_level,
    ...(candidateSkills || []).map((skill) => `${skill.skill || skill.canonical || ""} ${skill.evidence || ""}`),
    ...(profile?.earnedBadges || []).map((badge) => `${badge.title || ""} ${badge.evidence || ""}`)
  ].filter(Boolean).join(" ");
  const jobTokens = new Set(tokenize(expandSkillTerms(jobText)));
  const candidateTokens = new Set(tokenize(expandSkillTerms(candidateText)));
  if (!jobTokens.size || !candidateTokens.size) return 35;
  const overlap = [...jobTokens].filter((token) => candidateTokens.has(token)).length;
  const coverage = overlap / jobTokens.size;
  const balance = overlap / Math.max(1, Math.sqrt(jobTokens.size * candidateTokens.size));
  return Math.round(Math.max(20, Math.min(85, (coverage * 70 + balance * 30) * 100)));
}

function semanticExplanation(score, source, strongMatches = [], missingSkills = []) {
  const fit = score >= 78 ? "strong semantic alignment" : score >= 58 ? "moderate semantic alignment" : "limited semantic alignment";
  const sourceText = source === "openai" ? "OpenAI embeddings" : "fallback keyword similarity";
  const matched = strongMatches.length ? ` It overlaps around ${strongMatches.slice(0, 3).join(", ")}.` : "";
  const gap = missingSkills.length ? ` Missing semantic evidence for ${missingSkills.slice(0, 2).join(", ")}.` : "";
  return `${score}% ${fit} from ${sourceText}.${matched}${gap}`;
}

// ─── Proof strength from profile ──────────────────────────────────────────────

function proofStrengthFromProfile(profile) {
  // Prefer aggregated proof strength (computed across all submissions)
  if (profile?.aggregatedProofStrength != null) return Number(profile.aggregatedProofStrength);
  if (profile?.proofStrength != null) return Number(profile.proofStrength);
  if (profile?.proofAnalysis?.proof_strength != null) return Number(profile.proofAnalysis.proof_strength);
  const pa = profile?.proofAnalysis || {};
  return computeProofStrength({
    liveUrlReachable: Boolean(pa.live_url_reachable || pa.artifact_summary?.live_url_reachable),
    hasGithubUrl: Boolean(pa.github_readme_excerpt),
    hasMeaningfulDeps: (pa.artifact_summary?.deps_found || 0) >= 2,
    hasReadme: Boolean(pa.github_readme_excerpt),
    explanationWordCount: 60,
    hasVideo: false,
    commitCount: pa.artifact_summary?.commit_count || 0,
    isFork: pa.artifact_summary?.is_fork || false
  });
}

// ─── Badge quality ─────────────────────────────────────────────────────────────

function badgeQualityScore(profile, requiredSkillIds) {
  const badges = profile?.earnedBadges || [];
  if (!badges.length || !requiredSkillIds.length) return 0;
  const relevant = badges.filter((b) => {
    const bId = normalizeSkillName(b.title?.replace(/^Verified /, "") || "");
    return bId && requiredSkillIds.includes(bId);
  });
  if (!relevant.length) return 0;
  const avg = relevant.reduce((sum, b) => {
    const conf = Number(b.score || 0) / 100;
    const lvlBonus = (b.level || 1) === 3 ? 0.15 : (b.level || 1) === 2 ? 0.08 : 0;
    return sum + Math.min(1, conf + lvlBonus);
  }, 0) / relevant.length;
  return Math.round(avg * 100);
}

// ─── Integrity tier ────────────────────────────────────────────────────────────

function computeIntegrityTier(profile) {
  const pa = profile?.proofAnalysis?.artifact_summary || {};
  const negEv = profile?.negativeEvidence || {};
  const isFork = Boolean(pa.is_fork);
  const commitCount = Number(pa.commit_count || 0);
  const origRisk = profile?.integritySummary?.originalityRisk || "unknown";
  const highNeg = Number(negEv.highRiskCount || 0);

  if (highNeg >= 2 || (isFork && commitCount < 2) || origRisk === "high") return "high_risk";
  if (highNeg === 1 || (isFork && commitCount < 6) || origRisk === "medium") return "medium_risk";
  return "low_risk";
}

// ─── Main match function ───────────────────────────────────────────────────────

export function matchTalentToJob(candidate, profile, parsedJob, opts = {}) {
  const { jobEmbedding = null, talentEmbedding = null } = opts;

  const requiredSkills = parsedJob.required_skills || parsedJob.required_capabilities || [];
  const niceSkills = parsedJob.nice_to_have_skills || parsedJob.nice_to_have_capabilities || [];
  const deliverables = parsedJob.deliverables || parsedJob.required_deliverables || [];

  // Build unified candidate skill list: verified badges first, then scored skills
  const verifiedSkills = (profile?.earnedBadges || []).map((b) => ({
    skill: String(b.title || "").replace(/^Verified\s+/, ""),
    skillId: normalizeSkillName(String(b.title || "").replace(/^Verified\s+/, "")),
    score: Number(b.score || 0),
    evidence: b.evidence || b.title,
    tier: "direct",
    level: b.level === 3 ? "advanced" : b.level === 2 ? "intermediate" : "beginner"
  }));
  const candidateSkills = verifiedSkills.length ? verifiedSkills : (profile?.skillScores || []);

  const requiredSkillIds = requiredSkills.map((r) => normalizeSkillName(r)).filter(Boolean);

  // ── S1: Must-have coverage (30%) ──────────────────────────────────────────────
  const requiredMatches = requiredSkills.map((req) => ({
    label: req,
    ...canonicalMatchScore(req, candidateSkills)
  }));
  const mustHaveCoverage = requiredMatches.length
    ? requiredMatches.filter((m) => m.matched).length / requiredMatches.length
    : 0;
  const belowThreshold = mustHaveCoverage < 0.40;

  // ── S2: Proof strength (18%) ───────────────────────────────────────────────────
  const S2_proof = proofStrengthFromProfile(profile);

  // ── S3: Nice-to-have (14%) ────────────────────────────────────────────────────
  const niceMatches = niceSkills.map((req) => ({
    label: req,
    ...canonicalMatchScore(req, candidateSkills)
  }));
  const S3_nice = niceMatches.length
    ? (niceMatches.filter((m) => m.matched).length / niceMatches.length) * 100
    : 50;

  // ── S4: Badge quality (12%) ───────────────────────────────────────────────────
  const S4_badge = badgeQualityScore(profile, requiredSkillIds);

  // ── S5: Embedding semantic similarity (12%) ───────────────────────────────────
  let S5_embed = fallbackSemanticScore(profile, parsedJob, candidateSkills);
  let semanticSource = "fallback_keywords";
  if (jobEmbedding && talentEmbedding) {
    const rawSim = cosineSimilarity(jobEmbedding, talentEmbedding);
    // Map cosine [-1,1] → [0,100] with a mild emphasis on high similarity
    S5_embed = Math.round(Math.max(0, Math.min(100, (rawSim + 1) * 50)));
    semanticSource = "openai";
  }

  // ── S6: Deliverable / domain fit (10%) ────────────────────────────────────────
  const deliverableMatches = deliverables.map((req) => ({
    label: req,
    ...tokenOverlapMatch(req, candidateSkills)
  }));
  const S6_domain = deliverableMatches.length
    ? (deliverableMatches.filter((m) => m.matched).length / deliverableMatches.length) * 100
    : 40;

  // ── S7: Integrity bonus (4%) ──────────────────────────────────────────────────
  const integrityTier = computeIntegrityTier(profile);
  const S7_integrity = integrityTier === "low_risk" ? 100 : integrityTier === "medium_risk" ? 55 : 15;

  // ── Raw composite ─────────────────────────────────────────────────────────────
  const ruleRaw =
    0.42 * mustHaveCoverage * 100 +
    0.20 * S2_proof +
    0.14 * S3_nice +
    0.10 * S4_badge +
    0.10 * S6_domain +
    0.04 * S7_integrity;

  // ── Penalties ─────────────────────────────────────────────────────────────────
  const confidence = profile?.proofAnalysis?.confidence_score || 65;
  const P_confidence = Math.max(0, (70 - confidence) * 0.5);

  const P_integrity = integrityTier === "high_risk" ? 14 : integrityTier === "medium_risk" ? 6 : 0;

  // Negative evidence total penalty (already capped at 55 in negativeEvidence.js)
  const negEv = profile?.negativeEvidence || {};
  const P_negative = Math.min(20, Math.round((negEv.totalPenalty || 0) * 0.35));

  const isMockEval = (profile?.source || profile?.evaluatorSource) === "mock" ||
    (profile?.earnedBadges || []).every((b) => b.evaluatorSource === "mock" || b.evaluatorSource === "seed");
  const P_mock = isMockEval ? 5 : 0;

  const verifiedBadgePenalty = verifiedSkills.length ? 0 : 6;

  // ── Final score ───────────────────────────────────────────────────────────────
  const ruleMatchScore = Math.max(0, Math.min(100, Math.round(
    ruleRaw - P_confidence - P_integrity - P_negative - P_mock - verifiedBadgePenalty
  )));
  let weightedMatchScore = Math.round(0.6 * ruleMatchScore + 0.4 * S5_embed);
  if (belowThreshold) weightedMatchScore = Math.min(weightedMatchScore, 39);
  weightedMatchScore = Math.max(0, Math.min(100, weightedMatchScore));

  const skillOverlapScore = Math.round(mustHaveCoverage * 100);
  const matchedRequired = requiredMatches.filter((m) => m.matched).map((m) => m.label);
  const strongMatches = requiredMatches.filter((m) => m.matched && m.confidence >= 0.55).map((m) => m.label);
  const missingSkills = requiredMatches.filter((m) => !m.matched).map((m) => m.label);
  const semanticMatchExplanation = semanticExplanation(
    Math.round(S5_embed),
    semanticSource,
    strongMatches.length ? strongMatches : matchedRequired,
    missingSkills
  );

  const hiringDecision = buildHiringDecision({
    candidate, profile, parsedJob, weightedMatchScore, skillOverlapScore,
    strongMatches: strongMatches.length ? strongMatches : matchedRequired.slice(0, 3),
    missingSkills, belowThreshold, integrityTier
  });

  const explainableMatch = {
    totalMatchScore: weightedMatchScore,
    mustHaveCoverage: Math.round(mustHaveCoverage * 100),
    niceToHaveCoverage: Math.round(niceMatches.length ? niceMatches.filter((m) => m.matched).length / niceMatches.length * 100 : 0),
    proofStrength: S2_proof,
    badgeQuality: S4_badge,
    embeddingSimilarity: Math.round(S5_embed),
    semanticScore: Math.round(S5_embed),
    semanticMatchScore: Math.round(S5_embed),
    semanticSource,
    semanticExplanation: semanticMatchExplanation,
    riskScore: Math.round(P_confidence + P_integrity + P_negative + P_mock),
    integrityTier,
    belowThreshold,
    missingCriticalRequirements: missingSkills,
    evidenceBackedMatches: requiredMatches
      .filter((m) => m.matched)
      .slice(0, 6)
      .map((m) => ({ requirement: m.label, evidence: m.evidence || "Canonical skill ontology match." })),
    recommendation: belowThreshold
      ? "Below must-have threshold. Do not proceed unless role requirements are relaxed."
      : weightedMatchScore >= 82 && mustHaveCoverage >= 0.75
        ? "Proceed with high confidence. Verify remaining gaps in a short final screen."
        : weightedMatchScore >= 65
          ? "Proceed with a targeted final challenge focused on missing critical requirements."
          : "Do not proceed unless the role requirements are relaxed or new proof is submitted."
  };

  const decisionTrace = {
    version: "match_v4_semantic_60_40",
    hardGates: { mustHaveCoverageMinimum: 40, belowThreshold },
    scoreComponents: {
      ruleMatch:            { weight: 0.60, score: ruleMatchScore, source: "canonical_rules" },
      semanticSimilarity:   { weight: 0.40, score: Math.round(S5_embed), source: semanticSource },
      mustHaveCoverage:     { weight: 0.42, score: Math.round(mustHaveCoverage * 100), group: "rule" },
      proofStrength:        { weight: 0.20, score: S2_proof, group: "rule" },
      niceToHaveCoverage:   { weight: 0.14, score: Math.round(S3_nice), group: "rule" },
      badgeQuality:         { weight: 0.10, score: S4_badge, group: "rule" },
      domainFit:            { weight: 0.10, score: Math.round(S6_domain), group: "rule" },
      integrityBonus:       { weight: 0.04, score: S7_integrity, tier: integrityTier, group: "rule" }
    },
    penalties: {
      confidencePenalty: Math.round(P_confidence * 10) / 10,
      integrityPenalty: P_integrity,
      negativeEvidencePenalty: P_negative,
      mockEvaluatorPenalty: P_mock
    },
    ruleRawScore: Math.round(ruleRaw * 10) / 10,
    ruleMatchScore,
    semanticScore: Math.round(S5_embed),
    semanticSource,
    rawScore: Math.round((0.6 * ruleMatchScore + 0.4 * S5_embed) * 10) / 10,
    finalScore: weightedMatchScore
  };

  const growthPath = buildGrowthPath(candidate, missingSkills, parsedJob);

  return {
    ...candidate,
    match: weightedMatchScore,
    weightedMatchScore,
    skillOverlapScore,
    proofStrength: S2_proof,
    badgeQualityScore: S4_badge,
    embeddingSimilarity: Math.round(S5_embed),
    semanticScore: Math.round(S5_embed),
    semanticMatchScore: Math.round(S5_embed),
    semanticSource,
    semanticExplanation: semanticMatchExplanation,
    ruleMatchScore,
    integrityTier,
    missingSkills,
    belowThreshold,
    growthPath,
    strongMatches: strongMatches.length ? strongMatches : matchedRequired.slice(0, 3),
    matchedSkills: matchedRequired,
    hiringDecision,
    explainableMatch,
    decisionTrace,
    matchExplanation: buildMatchExplanation(
      candidate, weightedMatchScore,
      strongMatches.length ? strongMatches : matchedRequired,
      missingSkills, profile, parsedJob, belowThreshold, S2_proof
    )
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildHiringDecision({ candidate, profile, parsedJob, weightedMatchScore, skillOverlapScore, strongMatches, missingSkills, belowThreshold, integrityTier }) {
  let recommendation, recommendationKey;

  if (belowThreshold) {
    recommendation = "Do Not Hire"; recommendationKey = "do-not-hire";
  } else if (integrityTier === "high_risk") {
    recommendation = "Borderline"; recommendationKey = "borderline";
  } else if (weightedMatchScore >= 85 && skillOverlapScore >= 75 && missingSkills.length <= 1) {
    recommendation = "Strong Hire"; recommendationKey = "strong-hire";
  } else if (weightedMatchScore >= 68 && skillOverlapScore >= 55) {
    recommendation = "Hire"; recommendationKey = "hire";
  } else if (weightedMatchScore >= 50) {
    recommendation = "Borderline"; recommendationKey = "borderline";
  } else {
    recommendation = "Do Not Hire"; recommendationKey = "do-not-hire";
  }

  const nextStep = recommendation === "Strong Hire" && missingSkills.length === 0
    ? "Hire directly or run a short culture/availability screen."
    : recommendation === "Strong Hire" || recommendation === "Hire"
      ? "Send a focused final challenge covering the remaining gaps."
      : recommendation === "Borderline"
        ? "Send a scoped final challenge only if other signals are strong."
        : "Reject for this role. Suggest a better-matched challenge path.";

  const risks = [];
  if (missingSkills.length) risks.push(`Skill gaps: ${missingSkills.slice(0, 3).join(", ")}.`);
  if (integrityTier === "high_risk") risks.push("High integrity risk: review repository authenticity before proceeding.");
  else if (integrityTier === "medium_risk") risks.push("Moderate integrity risk — recommend final challenge to verify.");
  if (!risks.length) risks.push("Low risk: core proof signals and required skill overlap are present.");

  const confidence = Math.round(
    weightedMatchScore * 0.5 + skillOverlapScore * 0.3 +
    (profile?.proofAnalysis?.confidence_score || 65) * 0.2
  );

  return {
    recommendation, recommendationKey, confidence, nextStep, riskAnalysis: risks,
    justification: `${candidate.name} is rated ${recommendation} for ${parsedJob?.role_title || "this role"} with ${skillOverlapScore}% must-have coverage and ${weightedMatchScore}% overall match score.`
  };
}

function buildMatchExplanation(candidate, score, matched, missing, profile, parsedJob, belowThreshold, proofStrength) {
  const role = parsedJob?.role_title || "this role";
  const fitLevel = belowThreshold ? "below threshold"
    : score >= 85 ? "strong fit" : score >= 70 ? "promising fit"
    : score >= 55 ? "partial fit" : "early fit";
  if (belowThreshold) {
    return `${candidate.name} is below the must-have threshold for ${role}. Missing: ${missing.slice(0, 3).join(", ")}.`;
  }
  if (!matched.length) {
    return `${candidate.name} is an ${fitLevel} for ${role}. Evidence does not yet map strongly to core requirements. Proof strength: ${proofStrength}/100.`;
  }
  const gapSentence = missing.length
    ? ` Missing evidence for: ${missing.slice(0, 2).join(" and ")} — cover in the final challenge.`
    : " No major required skill gap detected.";
  return `${candidate.name} is a ${fitLevel} for ${role} with proven ${matched.slice(0, 3).join(", ")}. Proof strength: ${proofStrength}/100.${gapSentence}`;
}

function buildGrowthPath(candidate, missingSkills, parsedJob) {
  const nextSteps = missingSkills.length
    ? missingSkills.slice(0, 4).map((s) => `Build proof for: ${s}.`)
    : [`Complete a timed final challenge for ${parsedJob?.role_title || "this role"}.`,
       "Add a technical walkthrough explaining architecture decisions."];
  return {
    summary: missingSkills.length
      ? `${candidate.name} needs to close ${missingSkills.length} gap(s) to fully match this role.`
      : `${candidate.name} has no major skill gap — growth should focus on depth and production quality.`,
    missingSkills: missingSkills.length ? missingSkills : ["No major missing skill from parsed requirements"],
    nextSteps: [...new Set(nextSteps)].slice(0, 5)
  };
}

export function getAverageScoreForProfile(profile) {
  return getAverageScore(profile);
}
