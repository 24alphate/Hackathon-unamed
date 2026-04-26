/**
 * Negative evidence detection — signals that REDUCE skill confidence.
 *
 * Designed to be called after the main evaluation pipeline.
 * Returns structured flags with severity, penalty, and explanation.
 *
 * Also exports proof-strength aggregation across multiple submissions.
 */

// ─── Negative evidence detector ───────────────────────────────────────────────

/**
 * @param {object} artifacts  — from extractArtifacts()
 * @param {object} evaluation — from postProcessEvaluation()
 * @param {object[]} allTests — skill_verification_tests rows for this talent
 */
export function detectNegativeEvidence(artifacts = {}, evaluation = {}, allTests = []) {
  const flags = [];
  let totalPenalty = 0;

  const push = (signal, severity, penalty, description) => {
    flags.push({ signal, severity, penalty, description });
    totalPenalty += penalty;
  };

  // ── Authenticity ─────────────────────────────────────────────────────────────
  if (artifacts.isFork && artifacts.commitCount < 5) {
    push(
      "fork_low_commits", "high", 22,
      `Forked repository with only ${artifacts.commitCount} commit(s). Original authorship cannot be verified.`
    );
  } else if (artifacts.isFork) {
    push("fork_detected", "medium", 8, "Repository is a fork. Verify the diff from upstream shows original work.");
  }

  if (artifacts.originalityRisk === "high") {
    push("originality_risk_high", "high", 20, "README phrase found in multiple other repositories — likely copied or templated content.");
  } else if (artifacts.originalityRisk === "medium") {
    push("originality_risk_medium", "medium", 9, "Moderate originality risk. README or structure resembles other public repositories.");
  }

  if (artifacts.daysSinceCreated !== undefined && artifacts.daysSinceCreated < 1 && artifacts.hasGithubUrl) {
    push("repo_just_created", "high", 22, "Repository was created less than 24 hours ago — likely created only for this submission.");
  } else if (artifacts.daysSinceCreated !== undefined && artifacts.daysSinceCreated < 3 && artifacts.hasGithubUrl) {
    push("repo_very_recent", "medium", 8, "Repository is less than 3 days old. Development history is extremely limited.");
  }

  // ── Evidence gaps ─────────────────────────────────────────────────────────────
  if (artifacts.githubSource === "simulated" && artifacts.hasGithubUrl) {
    push("repo_fetch_failed", "high", 16, "GitHub URL was provided but repository contents could not be fetched. All code claims are unverified.");
  }

  if (artifacts.liveUrlReachable === false && artifacts.hasLiveUrl) {
    push("live_url_unreachable", "medium", 11, "Live demo URL was provided but returned an error or timed out. Runtime behavior cannot be confirmed.");
  }

  if (artifacts.commitCount < 2 && artifacts.hasGithubUrl && !artifacts.isFork && artifacts.githubSource === "github") {
    push("near_zero_commits", "medium", 12, `Repository has ${artifacts.commitCount} commit(s). Insufficient development history to assess authorship.`);
  }

  if (artifacts.explanationWordCount < 20) {
    push("thin_explanation", "low", 6, "Explanation is very short. Evaluator has minimal context to assess implementation intent.");
  }

  // ── Skill tier quality ────────────────────────────────────────────────────────
  const skillScores = evaluation.skillScores || [];
  const claimedCount = skillScores.filter((s) => s.tier === "claimed").length;
  if (skillScores.length > 0 && claimedCount / skillScores.length > 0.65) {
    push(
      "high_claimed_ratio", "medium", 9,
      `${claimedCount} of ${skillScores.length} detected skills are claim-only with no artifact backing.`
    );
  }

  // ── Verification test failures ────────────────────────────────────────────────
  const failedTests = allTests.filter((t) => t.status === "failed");
  if (failedTests.length > 0) {
    const pen = Math.min(18, failedTests.length * 6);
    push(
      "verification_test_failures", "medium", pen,
      `${failedTests.length} targeted verification test(s) were attempted and failed: ${failedTests.map((t) => t.skill_name).join(", ")}.`
    );
  }

  // ── Rubric quality ────────────────────────────────────────────────────────────
  const rubric = evaluation.rubricEvaluation || [];
  const lowDims = rubric.filter((r) => Number(r.score || 0) < 50);
  if (lowDims.length >= 2) {
    push(
      "multiple_low_rubric_scores", "medium", 10,
      `${lowDims.length} rubric dimensions scored below 50%: ${lowDims.map((r) => r.dimension).join(", ")}.`
    );
  }

  // ── Deterministic signal absence ─────────────────────────────────────────────
  const staticSignals = evaluation.proofAnalysis?.static_signals || {};
  const highConfidenceSkills = skillScores.filter((s) => s.score >= 80 && s.tier !== "claimed");
  for (const skill of highConfidenceSkills) {
    const label = String(skill.skill || "").toLowerCase();
    if (label.includes("api") && staticSignals.api_usage_detected === false) {
      push("api_claim_no_static_signal", "medium", 10, `"${skill.skill}" scored ${Math.round(skill.score)}% but no deterministic API usage signal found in code/deps.`);
      break;
    }
    if ((label.includes("form") || label.includes("validation")) && staticSignals.form_handling_detected === false) {
      push("form_claim_no_static_signal", "low", 6, `"${skill.skill}" scored ${Math.round(skill.score)}% but no form-handling library or pattern detected.`);
      break;
    }
  }

  const cappedPenalty = Math.min(55, Math.round(totalPenalty));
  const highCount = flags.filter((f) => f.severity === "high").length;
  const medCount = flags.filter((f) => f.severity === "medium").length;

  let summary;
  if (flags.length === 0) {
    summary = "No negative evidence signals detected.";
  } else if (highCount > 0) {
    summary = `${highCount} high-severity signal(s) require review before proceeding. Total confidence penalty: −${cappedPenalty} pts.`;
  } else {
    summary = `${flags.length} signal(s) detected (${medCount} medium). Total confidence penalty: −${cappedPenalty} pts.`;
  }

  return {
    flags,
    totalPenalty: cappedPenalty,
    highRiskCount: highCount,
    mediumRiskCount: medCount,
    summary
  };
}

// ─── Proof strength aggregation ───────────────────────────────────────────────

/**
 * Aggregate proof strength across multiple submissions with recency weighting.
 * Most recent submission: weight 1.0. Each older step decays by 0.18.
 *
 * @param {Array<{id, proofStrength, submittedAt, confidenceScore}>} submissions
 */
export function aggregateProofStrength(submissions = []) {
  const valid = submissions
    .filter((s) => typeof s.proofStrength === "number" && s.proofStrength >= 0)
    .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))
    .slice(0, 6);

  if (!valid.length) return { aggregatedScore: 0, submissionCount: submissions.length, trend: "none", contributions: [] };

  let totalWeight = 0;
  let weightedSum = 0;

  const contributions = valid.map((s, i) => {
    const weight = Math.max(0.20, 1.0 - i * 0.18);
    totalWeight += weight;
    weightedSum += s.proofStrength * weight;
    return { submissionId: s.id, proofStrength: s.proofStrength, weight: Math.round(weight * 100) / 100 };
  });

  const aggregatedScore = Math.round(weightedSum / totalWeight);

  const trend = valid.length < 2 ? "single"
    : valid[0].proofStrength > valid[1].proofStrength + 4 ? "improving"
    : valid[0].proofStrength < valid[1].proofStrength - 4 ? "declining"
    : "stable";

  // Best-ever proof strength (for ceiling estimation)
  const peak = Math.max(...valid.map((s) => s.proofStrength));

  return { aggregatedScore, submissionCount: submissions.length, trend, contributions, peak };
}

// ─── Cross-submission skill history ────────────────────────────────────────────

/**
 * Build a map of skill → best test result across ALL prior submissions for a talent.
 * Used by adaptive testing to skip re-testing skills already verified.
 *
 * @param {object} db
 * @param {number} talentId
 * @param {number} currentSubmissionId  — excluded from lookup
 * @returns {Map<string, {status, score, submissionId}>}
 */
export function buildPriorTestHistory(db, talentId, currentSubmissionId) {
  const rows = db.prepare(`
    SELECT svt.skill_name, svt.status, svt.score, svt.submission_id
    FROM skill_verification_tests svt
    WHERE svt.talent_id = ?
      AND svt.submission_id != ?
      AND svt.status IN ('passed', 'failed')
    ORDER BY svt.score DESC
  `).all(talentId, currentSubmissionId);

  const history = new Map();
  for (const row of rows) {
    const key = String(row.skill_name || "").toLowerCase().trim();
    if (!history.has(key)) {
      history.set(key, { status: row.status, score: row.score, submissionId: row.submission_id });
    }
  }
  return history;
}
