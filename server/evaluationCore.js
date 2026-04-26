import { resolveGithubEvidence, validateLiveUrl } from "./github.js";
import { analyzeLiveDemo } from "./liveDemoAnalyzer.js";
import { analyzeVideoEvidence } from "./videoEvidence.js";
import { evaluateProjectPrompt, parseJobPrompt } from "./prompts.js";
import { detectNegativeEvidence, aggregateProofStrength } from "./negativeEvidence.js";
import {
  inferSkillsFromDeps,
  inferSkillsFromFilePaths,
  normalizeSkillName,
  getCanonicalSkill,
  computeDeterministicConfidence,
  computeProofStrength
} from "./skillOntology.js";
import {
  BadgeDecisionSchema,
  ClaimProofSchema,
  EvidenceGraphSchema,
  EvidenceAnalysisSchema,
  JobParsingSchema,
  RubricEvaluationSchema,
  SkillInferenceSchema,
  uncertaintySchema,
  validateSchema
} from "./schemas.js";

const evaluationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "detectedCapabilities",
    "skillScores",
    "earnedBadges",
    "strengths",
    "weaknesses",
    "evidenceExplanation",
    "employerSummary",
    "proofAnalysis",
    "evidenceObject",
    "inferredSkillsDetailed",
    "rubricEvaluation",
    "badgeDecisions",
    "evidenceGraph",
    "claimProofAnalysis",
    "uncertainty"
  ],
  properties: {
    claimProofAnalysis: ClaimProofSchema,
    evidenceGraph: EvidenceGraphSchema,
    evidenceObject: EvidenceAnalysisSchema,
    inferredSkillsDetailed: SkillInferenceSchema,
    rubricEvaluation: RubricEvaluationSchema,
    badgeDecisions: BadgeDecisionSchema,
    uncertainty: uncertaintySchema(),
    proofAnalysis: {
      type: "object",
      additionalProperties: false,
      required: [
        "project_type",
        "features_detected",
        "complexity_level",
        "skills_inferred",
        "confidence_score",
        "reasoning",
        "github_readme_excerpt",
        "file_structure",
        "skill_graph"
      ],
      properties: {
        project_type: { type: "string" },
        features_detected: { type: "array", items: { type: "string" } },
        complexity_level: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
        skills_inferred: { type: "array", items: { type: "string" } },
        confidence_score: { type: "number" },
        reasoning: { type: "string" },
        github_readme_excerpt: { type: "string" },
        file_structure: { type: "array", items: { type: "string" } },
        skill_graph: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["category", "score", "skills"],
            properties: {
              category: { type: "string", enum: ["UI/Frontend", "Backend/API", "Data Handling", "System Design"] },
              score: { type: "number" },
              skills: { type: "array", items: { type: "string" } }
            }
          }
        }
      }
    },
    detectedCapabilities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "evidence"],
        properties: {
          name: { type: "string" },
          evidence: { type: "string" }
        }
      }
    },
    skillScores: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["skill", "score", "evidence"],
        properties: {
          skill: { type: "string" },
          score: { type: "number" },
          evidence: { type: "string" }
        }
      }
    },
    earnedBadges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "score", "evidence"],
        properties: {
          title: { type: "string" },
          score: { type: "number" },
          evidence: { type: "string" }
        }
      }
    },
    strengths: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" } },
    evidenceExplanation: { type: "string" },
    employerSummary: { type: "string" }
  }
};

const jobParserSchema = JobParsingSchema;



function normalizeSubmission(body = {}) {
  return {
    projectDescription: String(body.projectDescription || "").trim(),
    githubUrl: String(body.githubUrl || "").trim(),
    liveUrl: String(body.liveUrl || "").trim(),
    explanation: String(body.explanation || "").trim(),
    videoUrl: String(body.videoUrl || "").trim()
  };
}

// Strip prompt-injection patterns from untrusted content (README, candidate text) before
// injecting into the LLM prompt. Removes instruction-injection prefixes without altering
// content semantics for genuine projects.
function sanitizeForPrompt(text, maxLen = 12000) {
  if (!text || typeof text !== "string") return "";
  return text
    .slice(0, maxLen)
    .replace(/^\s*(?:ignore|disregard|forget)\s+(?:previous|prior|all|above)\s+instructions?/gim, "[redacted]")
    .replace(/^\s*(?:system|user|assistant)\s*:/gim, "[redacted]:")
    .replace(/<\s*\/?(?:s|system|inst|instruction)[^>]*>/gi, "")
    .replace(/\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>/g, "")
    .replace(/^\s*You are (now )?(an? )?(?:jailbroken|DAN|evil|unfiltered)/gim, "[redacted]");
}

async function evaluateWithOpenAI(submission, githubEvidence, artifacts = {}, directSkills = []) {
  const artifactContext = directSkills.length
    ? `\n\nVERIFIED ARTIFACTS (from package.json analysis — these are facts, not claims):\n${directSkills.map((s) => `- "${s.sourceDep}" → proves ${s.canonical} (direct dependency)`).join("\n")}`
    : "\n\nVERIFIED ARTIFACTS: No package.json found or fetched.";

  const commitContext = artifacts.commitCount != null
    ? `\nCommit count: ${artifacts.commitCount}${artifacts.commitCount >= 30 ? "+" : ""}. Is fork: ${artifacts.isFork}. Days since repo created: ${artifacts.daysSinceCreated ?? "unknown"}.`
    : "";

  const liveContext = artifacts.liveUrlReachable != null
    ? `\nLive URL validation: ${artifacts.liveUrlReachable ? `reachable (HTTP ${artifacts.liveResponseMs}ms)` : "NOT reachable — treat live URL claim as unverified"}.`
    : "";
  const keyFilesContext = Array.isArray(githubEvidence.keyFileSnippets) && githubEvidence.keyFileSnippets.length
    ? `\n\nKEY SOURCE FILE SNIPPETS (first ~1600 chars each):\n${githubEvidence.keyFileSnippets
      .map((f) => `--- ${f.path} ---\n${sanitizeForPrompt(f.snippet, 1600)}`)
      .join("\n\n")}`
    : "\n\nKEY SOURCE FILE SNIPPETS: none fetched.";
  const staticSignals = detectStaticSignals(artifacts);
  const staticSignalsContext = `\n\nSTATIC SIGNALS (deterministic, non-LLM):\n${JSON.stringify(staticSignals, null, 2)}`;

  const safeDescription = sanitizeForPrompt(submission.projectDescription, 3000);
  const safeExplanation = sanitizeForPrompt(submission.explanation, 3000);
  const safeReadme = sanitizeForPrompt(githubEvidence.readme, 8000);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      instructions: evaluateProjectPrompt(),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Project description: ${safeDescription || "Not provided"}
GitHub URL: ${submission.githubUrl || "Not provided"}
Live URL: ${submission.liveUrl || "Not provided"}
Optional video URL: ${submission.videoUrl || "Not provided"}
Candidate explanation: ${safeExplanation || "Not provided"}
README evidence: ${safeReadme}
File structure evidence:
${githubEvidence.fileStructure.join("\n")}${artifactContext}${commitContext}${liveContext}${keyFilesContext}${staticSignalsContext}

IMPORTANT: Skills with direct artifact evidence (listed above) are PROVEN. Skills only mentioned in the explanation or README are CLAIMED — mark them with lower confidence.`
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "unmapped_evaluation",
          strict: true,
          schema: evaluationSchema
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const outputText = data.output_text || extractOutputText(data);
  const evaluation = JSON.parse(outputText);

  return {
    ...evaluation,
    source: "openai",
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini"
  };
}

function attachGithubEvidenceMeta(evaluation, githubResolved) {
  if (!githubResolved) return evaluation;
  return {
    ...evaluation,
    githubEvidence: {
      source: githubResolved.source,
      owner: githubResolved.owner || null,
      repo: githubResolved.repo || null,
      defaultBranch: githubResolved.defaultBranch || null,
      fileCount: Array.isArray(githubResolved.fileStructure) ? githubResolved.fileStructure.length : 0,
      usedGithubToken: Boolean(process.env.GITHUB_TOKEN?.trim()),
      fetchError: githubResolved.error || null,
      originality: githubResolved.originality || null
    }
  };
}

async function parseJobWithOpenAI(jobPost) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      instructions: parseJobPrompt(),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Employer job post: ${jobPost}`
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "unmapped_job_parse",
          strict: true,
          schema: jobParserSchema
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const outputText = data.output_text || extractOutputText(data);
  const parsedJob = JSON.parse(outputText);

  return {
    ...parsedJob,
    source: "openai",
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini"
  };
}

function extractOutputText(data) {
  return data.output
    ?.flatMap((item) => item.content || [])
    ?.filter((content) => content.type === "output_text")
    ?.map((content) => content.text)
    ?.join("") || "{}";
}

async function mockEvaluate(submission, githubEvidence, artifacts = {}, directSkills = []) {
  const text = `${submission.projectDescription} ${submission.explanation}`.toLowerCase();
  const hasGithub = /^https?:\/\/(www\.)?github\.com\//i.test(submission.githubUrl);
  const hasLive = artifacts.liveUrlReachable ?? /^https?:\/\//i.test(submission.liveUrl);

  const signals = [
    {
      skill: "Responsive UI Design",
      keywords: ["responsive", "mobile", "desktop", "layout", "landing page"],
      evidence: "Submission describes a responsive interface and landing-page sections."
    },
    {
      skill: "API Integration",
      keywords: ["api", "fetch", "endpoint", "integration", "data"],
      evidence: "Submission mentions API-powered data or endpoint integration."
    },
    {
      skill: "Form Handling",
      keywords: ["form", "validation", "contact", "submit", "email"],
      evidence: "Submission describes a user input or contact form flow."
    },
    {
      skill: "Component Structure",
      keywords: ["component", "react", "reuse", "section", "state"],
      evidence: "Submission references React structure or reusable UI sections."
    },
    {
      skill: "Deployment Literacy",
      keywords: ["deploy", "live", "vite", "vercel", "netlify"],
      evidence: "Submission includes a live URL or describes deployment."
    }
  ];

  const skillScores = signals.map((signal) => {
    const matches = signal.keywords.filter((keyword) => text.includes(keyword)).length;
    const proofBonus = (hasGithub ? 12 : 0) + (hasLive ? 10 : 0);
    const score = Math.min(96, Math.max(35, 42 + matches * 11 + proofBonus));
    return {
      skill: signal.skill,
      score,
      evidence: matches > 0 || proofBonus > 0
        ? signal.evidence
        : "Limited observable detail was provided for this capability."
    };
  }).sort((a, b) => b.score - a.score);

  const detectedCapabilities = skillScores
    .filter((skill) => skill.score >= 58)
    .map((skill) => ({ name: skill.skill, evidence: skill.evidence }));

  const earnedBadges = skillScores
    .filter((skill) => skill.score >= 72)
    .slice(0, 3)
    .map((skill) => ({
      title: `Verified ${skill.skill}`,
      score: skill.score,
      evidence: skill.evidence
    }));

  const strengths = [
    hasGithub ? "Includes a GitHub proof link for code inspection." : "Explains the project intent in a structured way.",
    hasLive ? "Includes a live URL that an employer can inspect." : "The written explanation gives an initial review path.",
    "Capabilities are inferred from project artifacts and described behaviors."
  ];

  const weaknesses = [
    !hasGithub ? "No GitHub URL was provided, so code structure cannot be verified." : "",
    !hasLive ? "No live demo URL was provided, so runtime behavior cannot be checked." : "",
    text.length < 180 ? "The explanation is short; richer evidence would improve confidence." : ""
  ].filter(Boolean);

  return {
    evidenceObject: buildEvidenceObject(submission, githubEvidence),
    evidenceGraph: buildEvidenceGraph(submission, githubEvidence, skillScores),
    claimProofAnalysis: buildClaimProofAnalysis(submission, githubEvidence, skillScores),
    inferredSkillsDetailed: buildDetailedSkills(skillScores, githubEvidence),
    rubricEvaluation: buildRubricEvaluation(submission, githubEvidence, skillScores),
    badgeDecisions: buildBadgeDecisions(skillScores, submission, githubEvidence),
    uncertainty: buildEvaluationUncertainty(submission, githubEvidence),
    proofAnalysis: buildMockProofAnalysis(submission, githubEvidence, skillScores),
    detectedCapabilities,
    skillScores,
    earnedBadges,
    strengths,
    weaknesses,
    evidenceExplanation: "Fallback evaluation used keyword and proof-link signals from the project description, GitHub URL, live URL, and explanation. It does not accept the candidate's labels as proof by themselves.",
    employerSummary: `This candidate shows observable evidence for ${detectedCapabilities.slice(0, 3).map((skill) => skill.name).join(", ") || "early-stage frontend capability"}. Review the submitted links and use a final work sample before hiring.`,
    source: "mock"
  };
}

function validateEvaluationResult(result, submission, fallbackEval) {
  const fallback = fallbackEval;
  const checks = [
    validateSchema(EvidenceAnalysisSchema, result?.evidenceObject),
    validateSchema(EvidenceGraphSchema, result?.evidenceGraph),
    validateSchema(ClaimProofSchema, result?.claimProofAnalysis),
    validateSchema(SkillInferenceSchema, result?.inferredSkillsDetailed),
    validateSchema(RubricEvaluationSchema, result?.rubricEvaluation),
    validateSchema(BadgeDecisionSchema, result?.badgeDecisions)
  ];
  const valid = checks.every((check) => check.valid);
  return valid
    ? result
    : {
        ...fallback,
        source: "mock",
        warning: `AI response failed schema validation, so the schema-compatible fallback was used. ${checks.flatMap((check) => check.errors).slice(0, 3).join(" ")}`
      };
}

function validateParsedJobResult(result, jobPost) {
  const fallback = mockParseJob(jobPost);
  const check = validateSchema(JobParsingSchema, stripMetadata(result));
  return check.valid ? result : { ...fallback, source: "mock", warning: `AI job parse failed schema validation, so the schema-compatible fallback was used. ${check.errors.slice(0, 3).join(" ")}` };
}

function stripMetadata(result = {}) {
  const { source, model, warning, ...payload } = result;
  return payload;
}

function buildEvidenceObject(submission, githubEvidence) {
  const text = `${submission.projectDescription} ${submission.explanation} ${githubEvidence.readme}`.toLowerCase();
  const projectType = text.includes("dashboard") ? "dashboard" : text.includes("api") && !text.includes("landing") ? "API app" : "landing page";
  const domain = text.includes("fintech") || text.includes("payment") || text.includes("transaction") ? "fintech / payments" : "general web product";
  const implemented = [
    text.includes("responsive") || text.includes("mobile") ? "responsive layout" : "",
    text.includes("api") || text.includes("fetch") ? "API-backed data loading" : "",
    text.includes("form") || text.includes("validation") ? "validated form flow" : "",
    text.includes("dashboard") || text.includes("transaction") ? "transaction/dashboard interface" : "",
    text.includes("component") || text.includes("react") ? "componentized UI" : ""
  ].filter(Boolean);
  return {
    project_type: projectType,
    domain_context: domain,
    implemented_features: implemented.length ? implemented : ["basic project flow described"],
    technical_artifacts: githubEvidence.fileStructure,
    proof_signals: [
      submission.githubUrl ? "GitHub URL submitted" : "",
      submission.liveUrl ? "Live demo URL submitted" : "",
      githubEvidence.readme && githubEvidence.source === "github"
        ? "README content fetched from GitHub"
        : githubEvidence.readme && githubEvidence.source === "simulated"
          ? "README content simulated (GitHub fetch unavailable)"
          : "",
      githubEvidence.fileStructure.length
        ? githubEvidence.source === "github"
          ? "Repository file tree fetched from GitHub"
          : "Repository file structure simulated or partial"
        : "",
      githubEvidence.keyFileSnippets?.length
        ? `Inspected ${githubEvidence.keyFileSnippets.length} key source files`
        : "",
      submission.explanation ? "Candidate explanation submitted" : ""
    ].filter(Boolean),
    weak_signals: [
      githubEvidence.source === "simulated" && submission.githubUrl
        ? "Repository contents are simulated: GitHub API fetch failed, URL invalid, or repo is private"
        : "",
      submission.explanation.length < 180 ? "Candidate explanation is short" : ""
    ].filter(Boolean),
    missing_evidence: [
      !submission.githubUrl ? "No GitHub repository link" : "",
      !submission.liveUrl ? "No live demo link" : "",
      !submission.explanation ? "No implementation explanation" : ""
    ].filter(Boolean),
    authenticity_risks: [
      githubEvidence.source === "github"
        ? "README/tree fetched via public API; code was not executed in Unmapped's sandbox"
        : githubEvidence.source === "simulated" && submission.githubUrl
          ? "Repository text was not fetched from GitHub; verify the link manually"
          : "",
      !submission.liveUrl ? "Runtime behavior cannot be inspected" : ""
    ].filter(Boolean)
  };
}

function buildEvidenceGraph(submission, githubEvidence, skillScores) {
  const evidenceNodes = [
    {
      id: "submission_explanation",
      type: "evidence",
      label: "Candidate explanation",
      summary: submission.explanation || "No explanation submitted"
    },
    {
      id: "readme",
      type: "evidence",
      label: "README evidence",
      summary: githubEvidence.readme
    },
    {
      id: "file_structure",
      type: "evidence",
      label: "File structure",
      summary: githubEvidence.fileStructure.length ? githubEvidence.fileStructure.join(", ") : "No file structure available"
    }
  ];
  const featureNodes = inferFeatureNodes(submission, githubEvidence);
  const skillNodes = skillScores
    .filter((skill) => skill.score >= 58)
    .map((skill) => ({
      id: slug(skill.skill),
      type: "skill",
      label: skill.skill,
      summary: skill.evidence
    }));
  const riskNodes = [
    githubEvidence.source === "simulated" && submission.githubUrl
      ? { id: "simulated_repo_risk", type: "risk", label: "Simulated repository evidence", summary: "README and file structure were not fetched from GitHub; treat as low-trust until verified." }
      : githubEvidence.source === "github"
        ? { id: "unexecuted_code_risk", type: "risk", label: "Evidence not executed", summary: "Unmapped read public metadata only; a human should still run the app and read code before hire." }
        : null
  ].filter(Boolean);
  const edges = [];

  for (const feature of featureNodes) {
    edges.push({
      from: feature.source,
      to: feature.id,
      type: "indicates",
      reason: feature.reason
    });
  }

  for (const skill of skillNodes) {
    const linkedFeatures = featureNodes.filter((feature) => featureMatchesSkill(feature.label, skill.label));
    for (const feature of linkedFeatures.length ? linkedFeatures : featureNodes.slice(0, 1)) {
      edges.push({
        from: feature.id,
        to: skill.id,
        type: linkedFeatures.length ? "proves" : "supports",
        reason: linkedFeatures.length
          ? `${feature.label} is observable evidence for ${skill.label}.`
          : `${feature.label} weakly supports ${skill.label}, but more direct proof would increase confidence.`
      });
    }
  }

  if (githubEvidence.source === "simulated" && submission.githubUrl) {
    edges.push({
      from: "simulated_repo_risk",
      to: "file_structure",
      type: "limits_confidence",
      reason: "File list was not confirmed against GitHub, so a human should verify the real repository."
    });
  } else if (githubEvidence.source === "github") {
    edges.push({
      from: "unexecuted_code_risk",
      to: "readme",
      type: "limits_confidence",
      reason: "Fetched text does not prove runtime behavior; open the live demo to raise confidence."
    });
  }

  return {
    nodes: [...evidenceNodes, ...featureNodes.map(({ source, reason, ...node }) => node), ...skillNodes, ...riskNodes],
    edges
  };
}

function buildClaimProofAnalysis(submission, githubEvidence, skillScores) {
  const text = `${submission.projectDescription} ${submission.explanation}`.toLowerCase();
  const features = inferFeatureNodes(submission, githubEvidence);
  return skillScores
    .filter((skill) => skill.score >= 58)
    .map((skill) => {
      const relatedFeatures = features
        .filter((feature) => featureMatchesSkill(feature.label, skill.skill))
        .map((feature) => feature.label);
      return {
        skill: skill.skill,
        claim: text.includes(skill.skill.toLowerCase().split(" ")[0])
          ? `Candidate text appears to claim or reference ${skill.skill}.`
          : `Candidate did not explicitly name ${skill.skill}; inference is based on project evidence.`,
        observed_evidence: [
          skill.evidence,
          githubEvidence.readme && githubEvidence.source !== "none" ? "README/file evidence references related implementation" : "",
          submission.liveUrl ? "Live demo URL provided for employer inspection" : ""
        ].filter(Boolean),
        derived_features: relatedFeatures.length ? relatedFeatures : ["Related implementation feature inferred from submission"],
        inference: `${skill.skill} is inferred because observed evidence maps to ${relatedFeatures.join(", ") || "related implementation behavior"}, not because of a standalone claim.`,
        confidence: skill.score,
        risk_if_wrong: skill.score >= 85 ? "low" : skill.score >= 70 ? "medium" : "high"
      };
    });
}

function inferFeatureNodes(submission, githubEvidence) {
  const text = `${submission.projectDescription} ${submission.explanation} ${githubEvidence.readme} ${githubEvidence.fileStructure.join(" ")}`.toLowerCase();
  return [
    text.includes("api") || text.includes("fetch") || text.includes("endpoint")
      ? { id: "api_calls", type: "feature", label: "API calls", summary: "Project evidence references API/fetch behavior.", source: "readme", reason: "README/explanation mention API-backed data loading or endpoint integration." }
      : null,
    text.includes("responsive") || text.includes("mobile")
      ? { id: "responsive_layout", type: "feature", label: "Responsive layout", summary: "Project evidence references mobile/responsive layout behavior.", source: "submission_explanation", reason: "Candidate explanation describes responsive or mobile-first behavior." }
      : null,
    text.includes("form") || text.includes("validation") || text.includes("contact")
      ? { id: "form_handling", type: "feature", label: "Form handling", summary: "Project evidence references validated forms or contact submission.", source: "readme", reason: "README/explanation mention form validation or contact flow." }
      : null,
    text.includes("component") || text.includes("src/components")
      ? { id: "component_structure", type: "feature", label: "Component structure", summary: "File structure suggests reusable UI components.", source: "file_structure", reason: "File structure includes component-oriented source paths." }
      : null
  ].filter(Boolean);
}

function featureMatchesSkill(feature, skill) {
  const pair = `${feature} ${skill}`.toLowerCase();
  return (
    (pair.includes("api") && pair.includes("integration")) ||
    (pair.includes("responsive") && pair.includes("ui")) ||
    (pair.includes("form") && pair.includes("handling")) ||
    (pair.includes("component") && (pair.includes("structure") || pair.includes("design")))
  );
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function buildDetailedSkills(skillScores, githubEvidence) {
  return skillScores
    .filter((skill) => skill.score >= 58)
    .map((skill) => ({
      skill_name: skill.skill,
      category: categorizeSkillName(skill.skill),
      confidence_score: skill.score,
      evidence_used: [skill.evidence, ...githubEvidence.fileStructure.slice(0, 2)],
      why_it_proves_skill: `${skill.evidence} This is observable project evidence, not merely a declared skill.`,
      what_would_increase_confidence: "Fetch and inspect the real repository, run the live demo, and review implementation commits.",
      level: skill.score >= 90 ? "advanced" : skill.score >= 75 ? "intermediate" : "beginner"
    }));
}

function buildRubricEvaluation(submission, githubEvidence, skillScores) {
  const scoreFor = (name, fallback) => skillScores.find((skill) => skill.skill.toLowerCase().includes(name))?.score || fallback;
  return [
    { dimension: "functionality", score: Math.max(scoreFor("api", 62), scoreFor("form", 62)), reasoning: "Scored from described working API/form behavior and submitted proof links." },
    { dimension: "completeness", score: submission.githubUrl && submission.liveUrl ? 86 : 62, reasoning: "Completeness improves when both repository and live proof are available." },
    { dimension: "UI/UX quality", score: scoreFor("responsive", 70), reasoning: "Responsive layout and clear landing/dashboard patterns are observable in the submitted description." },
    { dimension: "responsiveness", score: scoreFor("responsive", 60), reasoning: "Mobile-first or responsive behavior must be present in the output evidence." },
    { dimension: "API/data handling", score: scoreFor("api", 45), reasoning: "API/data score depends on explicit endpoint, fetch, loading, or transaction-data proof." },
    { dimension: "code organization", score: scoreFor("component", githubEvidence.fileStructure.length ? 72 : 45), reasoning: "Component/file structure evidence increases confidence in organization." },
    { dimension: "real-world relevance", score: submission.projectDescription.toLowerCase().includes("fintech") ? 88 : 68, reasoning: "Domain-specific project context increases real-world relevance." },
    { dimension: "evidence quality", score: Math.min(95, 45 + (submission.githubUrl ? 20 : 0) + (submission.liveUrl ? 20 : 0) + (githubEvidence.fileStructure.length ? 10 : 0)), reasoning: "Evidence quality is based on proof links, README/file structure, and explanation depth." }
  ];
}

function buildBadgeDecisions(skillScores, submission, githubEvidence) {
  const rubricAverage = Math.round(buildRubricEvaluation(submission, githubEvidence, skillScores).reduce((sum, item) => sum + item.score, 0) / 8);
  return skillScores
    .filter((skill) => skill.score >= 72 && rubricAverage >= 70)
    .slice(0, 3)
    .map((skill) => ({
      badge_name: `Verified ${skill.skill}`,
      badge_level: skill.score >= 90 && rubricAverage >= 82 ? "advanced" : "intermediate",
      required_evidence: ["observable project feature", "submission explanation", "repository or live proof"],
      evidence_satisfied: [skill.evidence, submission.githubUrl ? "GitHub link present" : "", submission.liveUrl ? "Live demo present" : ""].filter(Boolean),
      confidence: Math.round((skill.score + rubricAverage) / 2),
      why_awarded: `${skill.skill} passed confidence and rubric thresholds using observable project evidence.`,
      why_not_higher_level: skill.score < 90 ? "Higher level requires deeper implementation proof, real repository inspection, and stronger edge-case evidence." : "Higher level would require production usage or reviewer-verified code execution."
    }));
}

function buildEvaluationUncertainty(submission, githubEvidence) {
  return {
    known: ["Submitted project text was analyzed", submission.githubUrl ? "GitHub URL exists" : "", submission.liveUrl ? "Live demo URL exists" : ""].filter(Boolean),
    assumptions: [
      githubEvidence.source === "github"
        ? "README and file tree were fetched from public GitHub metadata"
        : githubEvidence.source === "simulated" && submission.githubUrl
          ? "README and file tree are simulated because GitHub fetch did not complete"
          : "Repository URL absent or not parsed"
    ],
    missing: [!submission.githubUrl ? "Repository code" : "", !submission.liveUrl ? "Runtime behavior" : "", "Human code review"].filter(Boolean),
    human_review_needed: ["Open the live demo", "Inspect repository code and commit history", "Run a final challenge for critical gaps"]
  };
}

function categorizeSkillName(skill) {
  const label = skill.toLowerCase();
  if (label.includes("api") || label.includes("backend") || label.includes("integration")) return "Backend/API";
  if (label.includes("data") || label.includes("transaction") || label.includes("table")) return "Data Handling";
  if (label.includes("structure") || label.includes("deployment") || label.includes("architecture") || label.includes("component")) return "System Design";
  return "UI/Frontend";
}

function describeGithubEvidenceInReasoning(submission, githubEvidence) {
  if (!submission.githubUrl) return "with no repository link";
  if (githubEvidence.source === "github") {
    return "fetched README and repository file tree from GitHub";
  }
  if (githubEvidence.source === "simulated") {
    return "simulated README and file structure (GitHub fetch was not used or failed)";
  }
  return "no repository text";
}

function buildMockProofAnalysis(submission, githubEvidence, skillScores) {
  const text = `${submission.projectDescription} ${submission.explanation} ${githubEvidence.readme}`.toLowerCase();
  const features = [
    text.includes("responsive") || text.includes("mobile") ? "responsive layout" : "",
    text.includes("api") || text.includes("fetch") ? "API-backed data loading" : "",
    text.includes("form") || text.includes("validation") ? "validated form flow" : "",
    text.includes("dashboard") || text.includes("transaction") ? "transaction/dashboard interface" : "",
    text.includes("component") || text.includes("react") ? "componentized UI structure" : "",
    submission.liveUrl ? "live deployment" : ""
  ].filter(Boolean);
  const projectType = text.includes("dashboard")
    ? "dashboard"
    : text.includes("api") && !text.includes("landing")
      ? "API app"
      : "landing page";
  const signalCount = features.length + (submission.githubUrl ? 1 : 0) + (submission.liveUrl ? 1 : 0);
  const complexityLevel = signalCount >= 6 ? "advanced" : signalCount >= 4 ? "intermediate" : "beginner";
  const confidenceScore = Math.min(96, Math.max(42, 38 + signalCount * 8 + (githubEvidence.fileStructure.length ? 8 : 0)));
  const skillsInferred = skillScores.filter((skill) => skill.score >= 58).map((skill) => skill.skill);

  return {
    project_type: projectType,
    features_detected: features.length ? features : ["basic project structure"],
    complexity_level: complexityLevel,
    skills_inferred: skillsInferred,
    confidence_score: confidenceScore,
    reasoning: `The Proof Engine classified this as a ${projectType} because the evidence references ${features.slice(0, 4).join(", ") || "a basic implementation"}. Confidence is based on the written explanation, ${describeGithubEvidenceInReasoning(submission, githubEvidence)}${submission.liveUrl ? " and a live demo link" : " with no live demo link"}.`,
    github_readme_excerpt: githubEvidence.readme.slice(0, 420),
    file_structure: githubEvidence.fileStructure,
    skill_graph: buildSkillGraph(skillScores, features, projectType)
  };
}

function buildSkillGraph(skillScores, features, projectType) {
  const buckets = {
    "UI/Frontend": [],
    "Backend/API": [],
    "Data Handling": [],
    "System Design": []
  };

  for (const skill of skillScores) {
    const label = skill.skill.toLowerCase();
    if (label.includes("api") || label.includes("backend") || label.includes("integration")) {
      buckets["Backend/API"].push(skill);
    } else if (label.includes("data") || label.includes("transaction") || label.includes("table")) {
      buckets["Data Handling"].push(skill);
    } else if (label.includes("structure") || label.includes("deployment") || label.includes("architecture")) {
      buckets["System Design"].push(skill);
    } else {
      buckets["UI/Frontend"].push(skill);
    }
  }

  if (features.some((feature) => feature.includes("data") || feature.includes("transaction"))) {
    buckets["Data Handling"].push({ skill: "Data Presentation", score: projectType === "dashboard" ? 78 : 55 });
  }
  if (features.some((feature) => feature.includes("component"))) {
    buckets["System Design"].push({ skill: "Component Organization", score: 72 });
  }

  return Object.entries(buckets).map(([category, skills]) => ({
    category,
    score: skills.length
      ? Math.round(skills.reduce((sum, skill) => sum + Number(skill.score || 0), 0) / skills.length)
      : 0,
    skills: skills.map((skill) => skill.skill)
  }));
}

function mockParseJob(jobPost) {
  const text = jobPost.toLowerCase();
  const isDashboard = text.includes("dashboard");
  const isFintech = text.includes("fintech") || text.includes("payment") || text.includes("transaction");
  const isFrontend = text.includes("frontend") || text.includes("front-end") || text.includes("ui");
  const needsTS = text.includes("typescript") || text.includes("ts");
  const needsViz = text.includes("visualization") || text.includes("charts") || text.includes("recharts") || text.includes("chart");
  const needsTesting = text.includes("testing") || text.includes("tests") || text.includes("jest");
  const needsCheckout = text.includes("checkout") || text.includes("payment flow") || text.includes("cart");
  const needsNode = text.includes("node") || text.includes("backend") || text.includes("express");
  const needsDB = text.includes("database") || text.includes("prisma") || text.includes("sql");
  const needsMobile = text.includes("mobile") || text.includes("responsive");
  const needsReact = text.includes("react");

  const requiredSkills = [
    ...(needsTS ? ["TypeScript"] : []),
    ...(needsViz ? ["Data Visualization"] : []),
    ...(needsTesting ? ["Testing"] : []),
    ...(needsCheckout ? ["Checkout UI"] : []),
    ...(needsNode ? ["Node.js Backend"] : []),
    ...(needsDB ? ["Database Integration"] : []),
    ...(needsReact ? ["React"] : []),
    isFrontend ? "Responsive UI Design" : "user-facing product interface",
    isDashboard ? "Dashboard UI" : isFintech ? "Financial Data Presentation" : "Component Structure",
    "API Integration",
    ...(needsMobile ? ["Mobile-first Design"] : []),
    "Form Validation"
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 7);

  const niceToHaveSkills = [
    "loading and empty states",
    "accessible interaction patterns",
    "component reuse",
    "deployment hygiene"
  ];

  const deliverables = [
    "Live demo URL",
    "GitHub repository with readable structure",
    isDashboard ? "Transaction list with filters" : "Primary page flow with conversion action",
    "Short implementation explanation"
  ];

  return {
    role_title: isFintech
      ? "Frontend Developer for Fintech Product"
      : "Frontend Developer for Product UI",
    business_context: isFintech ? "Fintech product requiring trusted transaction or payment-facing UI." : "Web product requiring clear user-facing delivery.",
    required_deliverables: deliverables,
    required_capabilities: requiredSkills,
    technical_skills: ["responsive UI implementation", "API integration", "form validation", isDashboard ? "dashboard/data presentation" : "landing page composition"],
    soft_contextual_skills: ["communicates implementation tradeoffs", "understands user trust and clarity", "can work from a vague product brief"],
    must_have: requiredSkills.slice(0, 4),
    nice_to_have: niceToHaveSkills,
    ambiguity_questions: [
      "What API endpoints or sample data will be provided?",
      "Is this a dashboard, landing page, or both?",
      "What level of browser/device support is required?",
      "What payment or compliance constraints matter for the final product?"
    ].filter(
      (question) =>
        jobPost.length < 220 ||
        /api|dashboard|landing|browser|device|payment|compliance/i.test(question)
    ),
    uncertainty: {
      known: [`Employer needs ${isFrontend ? "frontend" : "product UI"} capability`, isFintech ? "Fintech context is stated" : "Business domain is only lightly specified"],
      assumptions: ["Assuming a web-based deliverable", "Assuming proof-of-work challenge should test observable output"],
      missing: ["Exact data source/API contract", "Timeline and seniority expectations", "Design system constraints"],
      human_review_needed: ["Confirm deliverables with employer", "Review final challenge scope before sending"]
    },
    required_skills: requiredSkills,
    nice_to_have_skills: niceToHaveSkills,
    deliverables,
    test_challenge: isDashboard
      ? "Build a transaction dashboard with a responsive layout, filterable transaction list, API-backed data loading, validation for one user action, and a receipt download interaction."
      : "Build a responsive product page with API-backed content, reusable sections, a validated contact form, and a live deployment.",
    matching_weights: {
      required_skills: 0.5,
      nice_to_have_skills: 0.15,
      deliverables: 0.2,
      proof_quality: 0.15
    },
    source: "mock"
  };
}



export {
  evaluationSchema,
  jobParserSchema,
  normalizeSubmission,
  evaluateWithOpenAI,
  parseJobWithOpenAI,
  mockEvaluate,
  mockParseJob,
  validateEvaluationResult,
  validateParsedJobResult,
  stripMetadata,
  attachGithubEvidenceMeta,
  extractOutputText
};

// ─── Artifact extraction ──────────────────────────────────────────────────────

function extractArtifacts(githubEvidence, submission, liveUrlMeta, liveDemoAnalysis) {
  const filePaths = githubEvidence.fileStructure || [];
  const deps = githubEvidence.dependencies || [];
  const commitMeta = githubEvidence.commitMeta || {};
  const keyFileSnippets = githubEvidence.keyFileSnippets || [];

  const hasTestFiles = filePaths.some((p) => /\.test\.|\.spec\./i.test(p));
  const hasCiConfig = filePaths.some((p) => /\.github\/workflows/i.test(p));
  const hasEnvExample = filePaths.some((p) => /\.env\.example/i.test(p));
  const hasReadme = Boolean(githubEvidence.readme && githubEvidence.readme.length > 80);
  const hasMeaningfulDeps = deps.length >= 2;

  const createdAt = githubEvidence.createdAt ? new Date(githubEvidence.createdAt) : null;
  const daysSinceCreated = createdAt
    ? Math.floor((Date.now() - createdAt.getTime()) / 86400000)
    : 99;

  return {
    // Code signals
    filePaths,
    deps,
    depCount: deps.length,
    hasTestFiles,
    hasCiConfig,
    hasEnvExample,
    hasReadme,
    hasMeaningfulDeps,
    componentCount: filePaths.filter((p) => /component/i.test(p)).length,
    // Commit signals
    commitCount: commitMeta.count || 0,
    daysSinceCreated,
    isFork: Boolean(githubEvidence.isFork),
    originality: githubEvidence.originality || null,
    originalityRisk: githubEvidence.originality?.riskLevel || "unknown",
    // Proof signals
    hasGithubUrl: Boolean(submission.githubUrl),
    hasLiveUrl: Boolean(submission.liveUrl),
    liveUrlReachable: liveUrlMeta?.reachable ?? null,
    liveResponseMs: liveUrlMeta?.responseMs ?? null,
    liveDemoAnalysis: liveDemoAnalysis || null,
    hasVideo: Boolean(submission.videoUrl),
    explanationWordCount: (submission.explanation || "").split(/\s+/).filter(Boolean).length,
    githubSource: githubEvidence.source || "none",
    keyFilesInspected: keyFileSnippets.length,
    keyFileSnippets
  };
}

function detectStaticSignals(artifacts = {}) {
  const deps = (artifacts.deps || []).map((d) => String(d).toLowerCase());
  const filePaths = (artifacts.filePaths || []).map((p) => String(p).toLowerCase());
  const snippets = (artifacts.keyFileSnippets || []).map((s) => String(s.snippet || "").toLowerCase()).join("\n");

  const hasDep = (...names) => names.some((n) => deps.includes(String(n).toLowerCase()));
  const hasPath = (rx) => filePaths.some((p) => rx.test(p));
  const hasSnippet = (rx) => rx.test(snippets);

  const framework =
    hasDep("next") ? "Next.js"
      : hasDep("react", "react-dom") ? "React"
        : hasDep("vue") ? "Vue"
          : hasDep("svelte") ? "Svelte"
            : hasDep("express") ? "Express"
              : "Unknown";

  const apiUsageDetected = hasDep("axios", "@tanstack/react-query", "react-query", "swr")
    || hasPath(/\/api\/|api\.(js|ts)$/i)
    || hasSnippet(/\bfetch\s*\(|axios\.|usequery\s*\(|graphql|endpoint/i);

  const formHandlingDetected = hasDep("react-hook-form", "formik", "yup", "zod")
    || hasPath(/form|contact|checkout/i)
    || hasSnippet(/<form|onsubmit|react-hook-form|formik|yup|zod/i);

  const routingDetected = hasDep("react-router", "react-router-dom")
    || hasSnippet(/react-router|next\/router|createrouter|router\./i);

  const stylingApproach = hasDep("tailwindcss")
    ? "tailwind"
    : hasPath(/\.module\.css$|\.scss$|\.sass$/i)
      ? "css_modules_or_scss"
      : hasSnippet(/className=|styled-components|emotion/i)
        ? "class_based_or_css_in_js"
        : "unknown";

  const responsiveClassesDetected = hasDep("tailwindcss")
    ? hasSnippet(/\b(sm:|md:|lg:|xl:)\b/)
    : hasSnippet(/@media|responsive|mobile/i);

  return {
    framework,
    api_usage_detected: Boolean(apiUsageDetected),
    form_handling_detected: Boolean(formHandlingDetected),
    routing_detected: Boolean(routingDetected),
    component_count: Number(artifacts.componentCount || 0),
    test_files: Number((artifacts.filePaths || []).filter((p) => /\.test\.|\.spec\./i.test(p)).length),
    responsive_classes_detected: Boolean(responsiveClassesDetected),
    styling_approach: stylingApproach
  };
}

function computeConfidenceInputs(artifacts = {}) {
  const evidence_strength = Math.max(0, Math.min(100,
    (artifacts.hasMeaningfulDeps ? 28 : 8) +
    (artifacts.commitCount >= 10 ? 24 : artifacts.commitCount >= 4 ? 16 : 6) +
    (artifacts.hasTestFiles ? 18 : 0) +
    (artifacts.keyFilesInspected >= 2 ? 16 : artifacts.keyFilesInspected === 1 ? 8 : 0) +
    (artifacts.isFork ? -10 : 8)
  ));

  const evidence_completeness = Math.max(0, Math.min(100,
    (artifacts.hasGithubUrl ? 34 : 0) +
    (artifacts.hasLiveUrl ? 22 : 0) +
    (artifacts.liveUrlReachable ? 14 : 0) +
    (artifacts.hasReadme ? 16 : 0) +
    (artifacts.explanationWordCount >= 80 ? 14 : artifacts.explanationWordCount >= 30 ? 8 : 2)
  ));

  let inference_risk = 100 - evidence_strength;
  if (!artifacts.hasGithubUrl) inference_risk += 15;
  if (artifacts.liveUrlReachable === false) inference_risk += 10;
  if (artifacts.isFork && artifacts.commitCount < 3) inference_risk += 20;
  if (artifacts.originalityRisk === "medium") inference_risk += 10;
  if (artifacts.originalityRisk === "high") inference_risk += 20;
  inference_risk = Math.max(0, Math.min(100, Math.round(inference_risk)));

  let ambiguity_level = 60;
  if (artifacts.keyFilesInspected >= 2) ambiguity_level -= 18;
  if (artifacts.hasReadme) ambiguity_level -= 10;
  if (artifacts.explanationWordCount >= 80) ambiguity_level -= 12;
  if (!artifacts.hasLiveUrl) ambiguity_level += 12;
  if (artifacts.githubSource === "simulated") ambiguity_level += 18;
  if (artifacts.originalityRisk === "medium") ambiguity_level += 8;
  if (artifacts.originalityRisk === "high") ambiguity_level += 16;
  ambiguity_level = Math.max(0, Math.min(100, Math.round(ambiguity_level)));

  const final_confidence = Math.round(
    0.35 * evidence_strength +
    0.30 * evidence_completeness +
    0.20 * (100 - inference_risk) +
    0.15 * (100 - ambiguity_level)
  );

  return {
    evidence_strength,
    evidence_completeness,
    inference_risk,
    ambiguity_level,
    final_confidence: Math.max(10, Math.min(98, final_confidence))
  };
}

// ─── Multi-gate badge decision ────────────────────────────────────────────────

function multiGateBadgeDecision(skillName, skillScore, artifacts, rubricScore, evaluatorSource) {
  const gates = {
    completeness: false,
    repository_verified: false,
    authenticity: false,
    evidence_quality: false,
    skill_confidence: false,
    rubric: false,
    domain_signal: true
  };
  const staticSignals = detectStaticSignals(artifacts);
  const normalizedSkill = String(skillName || "").toLowerCase();
  const repositoryVerified = artifacts.githubSource === "github";

  // Gate 1: Completeness
  gates.completeness = Boolean(
    (artifacts.hasGithubUrl || artifacts.hasLiveUrl) &&
    artifacts.explanationWordCount >= 20
  );

  // Gate 2: Repository verification
  gates.repository_verified = repositoryVerified;

  // Gate 2: Authenticity
  const isClearFraud = artifacts.isFork && artifacts.commitCount < 2;
  gates.authenticity = repositoryVerified && !isClearFraud;

  // Gate 3: Evidence quality
  const proofStrength = computeProofStrength(artifacts);
  gates.evidence_quality = repositoryVerified && proofStrength >= 60;

  // Gate 4: Skill confidence
  const normalizedScore = Number(skillScore) || 0;
  gates.skill_confidence = normalizedScore >= 75;

  // Gate 5: Rubric score (optional gate — only applies if rubric data available)
  gates.rubric = rubricScore != null ? rubricScore >= 70 : true;
  if (normalizedSkill.includes("api")) gates.domain_signal = staticSignals.api_usage_detected;
  if (normalizedSkill.includes("form")) gates.domain_signal = staticSignals.form_handling_detected;
  if (normalizedSkill.includes("responsive") || normalizedSkill.includes("mobile")) {
    gates.domain_signal = staticSignals.responsive_classes_detected;
  }

  const allPassed = Object.values(gates).every(Boolean);

  // Determine badge level
  let level = 1;
  if (allPassed) {
    if (normalizedScore >= 93 && proofStrength >= 80 && artifacts.hasTestFiles) level = 3;
    else if (normalizedScore >= 83 && proofStrength >= 65) level = 2;
    else level = 1;
  }

  const failedGates = Object.entries(gates).filter(([, v]) => !v).map(([k]) => k);

  return {
    awarded: allPassed,
    level,
    gates,
    failedGates,
    proofStrength,
    evaluatorSource,
    whyNotHigher: level < 3
      ? level === 2
        ? "Level 3 requires test files, proof strength ≥ 80, and confidence ≥ 93."
        : "Level 2 requires confidence ≥ 83 and proof strength ≥ 65."
      : null,
    rejectReason: !allPassed ? `Failed gates: ${failedGates.join(", ")}.` : null
  };
}

function skepticBadgeReview(earnedBadges, normalizedSkillScores, artifacts) {
  const skillByName = new Map(normalizedSkillScores.map((s) => [String(s.skill || "").toLowerCase(), s]));
  const staticSignals = detectStaticSignals(artifacts);
  const removed = [];
  const kept = [];
  for (const badge of earnedBadges) {
    const raw = String(badge.title || "").replace(/^Verified\s+/i, "").toLowerCase();
    const skill = skillByName.get(raw);
    let rejectReason = "";
    if (!skill) rejectReason = "No normalized skill trace found.";
    else if (skill.tier === "claimed") rejectReason = "Claim-only skill without direct/inferred artifact proof.";
    else if (raw.includes("api") && !staticSignals.api_usage_detected) rejectReason = "Missing deterministic API usage signal.";
    else if (raw.includes("form") && !staticSignals.form_handling_detected) rejectReason = "Missing deterministic form-handling signal.";

    if (rejectReason) removed.push({ badge: badge.title, reason: rejectReason });
    else kept.push(badge);
  }
  return { kept, removed };
}

// ─── Post-process evaluation output ──────────────────────────────────────────

async function postProcessEvaluation(evaluation, artifacts, directSkills, inferredSkills, evaluatorSource, submission) {
  const deterministicConfidence = computeDeterministicConfidence(artifacts);
  const proofStrength = computeProofStrength(artifacts);
  const confidenceInputs = computeConfidenceInputs(artifacts);

  // Build tier lookup: skillId → tier from artifact analysis
  const tierMap = {};
  for (const s of directSkills) tierMap[s.skillId] = "direct";
  for (const s of inferredSkills) {
    if (!tierMap[s.skillId]) tierMap[s.skillId] = "inferred";
  }

  // Normalize skill names and add tiers
  const normalizedSkillScores = (evaluation.skillScores || []).map((s) => {
    const canonicalId = normalizeSkillName(s.skill);
    const canonicalSkill = canonicalId ? getCanonicalSkill(canonicalId) : null;
    const tier = canonicalId ? (tierMap[canonicalId] || "claimed") : "claimed";
    const directEntry = directSkills.find((d) => d.skillId === canonicalId);
    const inferredEntry = inferredSkills.find((i) => i.skillId === canonicalId);

    // For direct artifact skills, boost the score slightly if LLM underscored
    let adjustedScore = Number(s.score) || 0;
    if (tier === "direct" && directEntry) {
      adjustedScore = Math.max(adjustedScore, directEntry.baseConfidence * 100);
    }

    return {
      skill: canonicalSkill?.canonical || s.skill,
      skillId: canonicalId || null,
      score: Math.round(adjustedScore),
      evidence: tier === "direct"
        ? (directEntry?.evidence || s.evidence)
        : tier === "inferred"
          ? (inferredEntry?.evidence || s.evidence)
          : s.evidence,
      tier,
      category: canonicalSkill?.category || s.category || "General",
      confidenceBreakdown: {
        evidence_strength: tier === "direct" ? Math.max(confidenceInputs.evidence_strength, 88) : tier === "inferred" ? Math.max(60, confidenceInputs.evidence_strength - 12) : Math.max(35, confidenceInputs.evidence_strength - 28),
        evidence_completeness: confidenceInputs.evidence_completeness,
        ambiguity_level: tier === "direct" ? "low" : tier === "inferred" ? "medium" : "high",
        inference_risk: tier === "direct" ? "low" : confidenceInputs.inference_risk <= 35 ? "medium" : "high",
        final_confidence: Math.round(adjustedScore)
      }
    };
  });

  // Add artifact-detected skills that the LLM missed
  const llmSkillIds = new Set(normalizedSkillScores.map((s) => s.skillId).filter(Boolean));
  for (const ds of directSkills) {
    if (!llmSkillIds.has(ds.skillId)) {
      normalizedSkillScores.push({
        skill: ds.canonical,
        skillId: ds.skillId,
        score: Math.round(ds.baseConfidence * 100),
        evidence: ds.evidence,
        tier: "direct",
        category: ds.category
      });
    }
  }

  // Apply multi-gate badge decisions
  const rubricMap = {};
  for (const r of (evaluation.rubricEvaluation || [])) {
    rubricMap[r.dimension] = r.score;
  }
  const avgRubric = Object.values(rubricMap).length
    ? Math.round(Object.values(rubricMap).reduce((a, b) => a + b, 0) / Object.values(rubricMap).length)
    : null;

  const earnedBadges = [];
  const badgeDecisionTrace = [];
  const skillHypotheses = [];
  const repositoryVerified = artifacts.githubSource === "github";
  for (const skill of normalizedSkillScores) {
    const rawHypothesisStatus = skill.score >= 80
      ? "likely"
      : skill.score >= 65
        ? "possible"
        : skill.score >= 50
          ? "weak"
          : "unproven";
    const hypothesisStatus = repositoryVerified ? rawHypothesisStatus : "weak";
    skillHypotheses.push({
      skill: skill.skill,
      status: hypothesisStatus,
      tier: skill.tier,
      confidence: skill.score,
      evidence: skill.evidence,
      next_action: !repositoryVerified
        ? "provide_reachable_github_repo"
        : hypothesisStatus === "likely" || hypothesisStatus === "possible"
        ? "assign_targeted_test"
        : "collect_more_evidence"
    });

    if (!repositoryVerified || skill.score < 75) {
      badgeDecisionTrace.push({
        skill: skill.skill,
        score: skill.score,
        awarded: false,
        level: 0,
        gates: {
          repository_verified: repositoryVerified,
          skill_confidence: skill.score >= 75
        },
        failedGates: [
          ...(!repositoryVerified ? ["repository_verified"] : []),
          ...(skill.score < 75 ? ["skill_confidence"] : [])
        ],
        rejectReason: !repositoryVerified
          ? "Failed gates: repository_verified. Simulated GitHub evidence cannot create badge candidates."
          : "Failed gates: skill_confidence.",
        proofStrength,
        evaluatorSource
      });
      continue;
    }
    const decision = multiGateBadgeDecision(
      skill.skill, skill.score, artifacts, avgRubric, evaluatorSource
    );
    badgeDecisionTrace.push({
      skill: skill.skill,
      score: skill.score,
      awarded: decision.awarded,
      level: decision.level,
      gates: decision.gates,
      failedGates: decision.failedGates,
      rejectReason: decision.rejectReason,
      proofStrength: decision.proofStrength,
      evaluatorSource: decision.evaluatorSource
    });
    if (decision.awarded) {
      const levelLabel = decision.level === 3 ? "Expert" : decision.level === 2 ? "Proficient" : "Level 1";
      earnedBadges.push({
        title: `Verified ${skill.skill}`,
        score: skill.score,
        evidence: skill.evidence,
        level: decision.level,
        levelLabel,
        evaluatorSource,
        proofStrength: decision.proofStrength,
        whyAwarded: `Gates passed: completeness, authenticity, evidence quality, confidence ≥ 75, rubric ≥ 70. Proof strength: ${decision.proofStrength}/100.`,
        whyNotHigher: decision.whyNotHigher
      });
    }
  }

  const skeptic = skepticBadgeReview(earnedBadges, normalizedSkillScores, artifacts);
  const finalBadges = skeptic.kept;

  // ── Negative evidence detection ──────────────────────────────────────────────
  const negativeEvidence = detectNegativeEvidence(artifacts, evaluation, []);
  // Apply penalty to proof strength (capped so it cannot go below 0)
  const adjustedProofStrength = Math.max(0, proofStrength - Math.round(negativeEvidence.totalPenalty * 0.4));

  // ── Skill lifecycle ──────────────────────────────────────────────────────────
  // Enrich each skill with a lifecycle state based on tier and evidence
  const normalizedWithLifecycle = normalizedSkillScores.map((s) => {
    let lifecycleState;
    if (s.tier === "direct" && s.score >= 75) lifecycleState = "evidence_supported";
    else if (s.tier === "inferred" && s.score >= 65) lifecycleState = "hypothesized";
    else if (s.tier === "claimed") lifecycleState = "claimed";
    else lifecycleState = "hypothesized";
    // Adjust to "verified" only after test pass — handled in persistence.js
    const negPenalty = negativeEvidence.flags
      .filter((f) => {
        const fLabel = f.signal.toLowerCase();
        const sLabel = (s.skill || "").toLowerCase();
        return (fLabel.includes("api") && sLabel.includes("api")) ||
               (fLabel.includes("form") && sLabel.includes("form")) ||
               (fLabel.includes("fork") && s.tier === "inferred");
      })
      .reduce((sum, f) => sum + f.penalty, 0);
    const adjustedScore = Math.max(0, Math.round(s.score - negPenalty * 0.3));
    return {
      ...s,
      score: adjustedScore,
      lifecycleState,
      negativeEvidencePenalty: negPenalty > 0 ? Math.round(negPenalty * 0.3) : 0
    };
  });

  // Override confidence with deterministic formula
  const finalConfidenceScore = Math.max(0, confidenceInputs.final_confidence - Math.round(negativeEvidence.totalPenalty * 0.25));
  const staticSignals = detectStaticSignals(artifacts);
  artifacts.staticSignals = staticSignals;
  const videoEvidence = await analyzeVideoEvidence({
    videoUrl: submission?.videoUrl,
    submission,
    artifacts,
    liveDemoAnalysis: artifacts.liveDemoAnalysis
  });
  const structuredUncertainty = {
    known: [
      `${normalizedSkillScores.filter((s) => s.tier === "direct").length} direct artifact skills detected`,
      `Proof strength score: ${proofStrength}/100`,
      `Calibrated confidence score: ${finalConfidenceScore}/100`,
      `Framework detected: ${staticSignals.framework}`
    ],
    assumptions: [
      "Dependency and file-path mappings are treated as reliable skill signals when canonical mapping exists.",
      "LLM extraction is schema-validated but still depends on available evidence quality."
    ],
    missing: [
      ...(artifacts.liveUrlReachable === false ? ["Live URL was provided but unreachable at evaluation time."] : []),
      ...(!artifacts.hasGithubUrl ? ["No GitHub URL provided."] : []),
      ...(!staticSignals.api_usage_detected ? ["No deterministic API usage signal found in key files/dependencies."] : []),
      ...(artifacts.githubSource === "simulated" ? ["Repository evidence is simulated fallback; manual verification needed."] : []),
      ...(artifacts.originalityRisk === "medium" || artifacts.originalityRisk === "high"
        ? [`Repository originality risk is ${artifacts.originalityRisk}: ${(artifacts.originality?.riskFactors || []).join(", ") || "metadata risk signal"}.`]
        : []),
      ...(skeptic.removed.length ? skeptic.removed.map((r) => `Skeptic rejected ${r.badge}: ${r.reason}`) : []),
      ...(artifacts.explanationWordCount < 40 ? ["Candidate explanation is short; context quality is limited."] : [])
    ],
    human_review_needed: [
      "Open repository and verify claimed implementation quality manually.",
      "Use a scoped final challenge to validate missing or weak signals."
    ]
  };
  const decisionTrace = {
    version: "proof_eval_v2",
    evaluatorSource,
    deterministic: {
      proofStrength,
      confidence: finalConfidenceScore,
      confidenceInputs,
      staticSignals,
      originality: artifacts.originality || null,
      directSkillCount: normalizedSkillScores.filter((s) => s.tier === "direct").length,
      inferredSkillCount: normalizedSkillScores.filter((s) => s.tier === "inferred").length
    },
    badgeSummary: {
      consideredSkills: badgeDecisionTrace.length,
      awardedBadges: finalBadges.length,
      skepticRejectedBadges: skeptic.removed.map((r) => `${r.badge}: ${r.reason}`),
      rejectedSkills: badgeDecisionTrace.filter((d) => !d.awarded).map((d) => d.skill)
    }
  };
  const integrityRisk = artifacts.githubSource === "simulated"
    ? "high"
    : artifacts.originalityRisk === "high"
      ? "high"
      : artifacts.originalityRisk === "medium"
        ? "medium"
        : artifacts.isFork && artifacts.commitCount < 3
          ? "high"
          : artifacts.liveUrlReachable === false
            ? "medium"
            : "low";

  return {
    ...evaluation,
    skillScores: normalizedWithLifecycle.sort((a, b) => b.score - a.score),
    earnedBadges: finalBadges,
    badgeDecisionTrace,
    decisionTrace,
    skillHypotheses: skillHypotheses.sort((a, b) => b.confidence - a.confidence),
    negativeEvidence,
    integritySummary: {
      risk: integrityRisk,
      githubEvidenceSource: artifacts.githubSource,
      liveUrlReachable: artifacts.liveUrlReachable,
      commitCount: artifacts.commitCount,
      originalityRisk: artifacts.originalityRisk,
      originalityFactors: artifacts.originality?.riskFactors || []
    },
    source: evaluatorSource,
    evaluatorSource,
    proofStrength: adjustedProofStrength,
    uncertainty: {
      ...evaluation.uncertainty,
      ...structuredUncertainty
    },
    proofAnalysis: {
      ...(evaluation.proofAnalysis || {}),
      confidence_score: finalConfidenceScore,
      proof_strength: proofStrength,
      static_signals: staticSignals,
      live_demo_analysis: artifacts.liveDemoAnalysis || null,
      video_evidence: videoEvidence,
      artifact_summary: {
        deps_found: artifacts.depCount,
        commit_count: artifacts.commitCount,
        is_fork: artifacts.isFork,
        has_tests: artifacts.hasTestFiles,
        live_url_reachable: artifacts.liveUrlReachable,
        days_since_created: artifacts.daysSinceCreated,
        originality: artifacts.originality || null
      }
    }
  };
}

export async function runEvaluationPipeline(submission) {
  const payload = normalizeSubmission(submission);

  // Stage 1: Parallel evidence collection
  const [githubResolved, liveUrlMeta, liveDemoAnalysis] = await Promise.all([
    resolveGithubEvidence(payload),
    payload.liveUrl ? validateLiveUrl(payload.liveUrl) : Promise.resolve(null),
    payload.liveUrl ? analyzeLiveDemo(payload.liveUrl) : Promise.resolve(null)
  ]);

  // Stage 2: Deterministic artifact extraction
  const artifacts = extractArtifacts(githubResolved, payload, liveUrlMeta, liveDemoAnalysis);

  // Stage 3: Artifact-based skill inference (no AI needed)
  const directSkills = inferSkillsFromDeps(artifacts.deps);
  const inferredSkills = inferSkillsFromFilePaths(artifacts.filePaths);

  // Stage 4: LLM evaluation (with artifact context injected)
  const evaluatorSource = process.env.OPENAI_API_KEY ? "openai" : "mock";
  const fallbackEval = await mockEvaluate(payload, githubResolved, artifacts, directSkills);

  let rawEvaluation;
  try {
    rawEvaluation = process.env.OPENAI_API_KEY
      ? await evaluateWithOpenAI(payload, githubResolved, artifacts, directSkills)
      : fallbackEval;
  } catch (error) {
    console.error("LLM evaluation failed. Falling back to mock evaluator.", error?.message);
    rawEvaluation = { ...fallbackEval, warning: "OpenAI evaluation failed — using artifact-based fallback." };
  }

  const validated = validateEvaluationResult(rawEvaluation, payload, fallbackEval);

  // Stage 5: Post-process — normalize skills, add tiers, override confidence, multi-gate badges
  const processed = await postProcessEvaluation(
    validated, artifacts, directSkills, inferredSkills, evaluatorSource, payload
  );

  return {
    payload,
    githubResolved,
    liveUrlMeta,
    artifacts,
    evaluation: attachGithubEvidenceMeta(processed, {
      ...githubResolved,
      liveUrlMeta
    })
  };
}

export async function runJobParseRequest(jobPost) {
  const text = String(jobPost || "").trim();
  if (!text) return { error: "empty" };
  try {
    const result = process.env.OPENAI_API_KEY
      ? await parseJobWithOpenAI(text)
      : mockParseJob(text);
    return validateParsedJobResult(result, text);
  } catch (error) {
    console.error("LLM job parsing failed. Falling back to mock parser.", error);
    return { ...mockParseJob(text), source: "mock", warning: "OpenAI job parsing failed, so the fallback parser was used." };
  }
}
