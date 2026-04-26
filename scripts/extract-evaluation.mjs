import fs from "fs";

const s = fs.readFileSync("server/index.js", "utf8");
const i0 = s.indexOf("const evaluationSchema =");
const i1 = s.indexOf("app.get(\"/api/health\"");
const i2 = s.indexOf("function normalizeSubmission");
const i3 = s.indexOf("app.listen(");
if (i0 < 0 || i1 < 0 || i2 < 0 || i3 < 0) {
  throw new Error("extraction markers failed");
}
const schemaBlock = s.slice(i0, i1);
const codeBlock = s.slice(i2, i3);
const out = `import { resolveGithubEvidence } from "./github.js";
import { evaluateProjectPrompt, parseJobPrompt } from "./prompts.js";
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

${schemaBlock}

${codeBlock}

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

export async function runEvaluationPipeline(submission) {
  const payload = normalizeSubmission(submission);
  const githubResolved = await resolveGithubEvidence(payload);
  const fallbackEval = await mockEvaluate(payload, githubResolved);
  try {
    const result = process.env.OPENAI_API_KEY
      ? await evaluateWithOpenAI(payload, githubResolved)
      : fallbackEval;
    return {
      payload,
      githubResolved,
      evaluation: attachGithubEvidenceMeta(validateEvaluationResult(result, payload, fallbackEval), githubResolved)
    };
  } catch (error) {
    console.error("LLM evaluation failed. Falling back to mock evaluator.", error);
    return {
      payload,
      githubResolved,
      evaluation: attachGithubEvidenceMeta(
        { ...fallbackEval, source: "mock", warning: "OpenAI evaluation failed, so the fallback evaluator was used." },
        githubResolved
      )
    };
  }
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
`;
fs.writeFileSync("server/evaluationCore.js", out);
console.log("Wrote server/evaluationCore.js", out.length);
