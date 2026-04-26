import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runEvaluationPipeline } from "../server/evaluationCore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const benchmarkPath = path.join(__dirname, "..", "benchmarks", "evaluation-benchmark.json");
const cases = JSON.parse(fs.readFileSync(benchmarkPath, "utf8"));

function norm(v) {
  return String(v || "").toLowerCase().trim();
}

function hasSkill(skills, target) {
  const t = norm(target);
  return skills.some((s) => norm(s).includes(t) || t.includes(norm(s)));
}

async function run() {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let shouldNotAwardViolations = 0;

  const details = [];
  for (const c of cases) {
    const out = await runEvaluationPipeline(c.submission);
    const inferred = (out.evaluation.skillScores || []).map((s) => s.skill);
    const badges = (out.evaluation.earnedBadges || []).map((b) => b.title.replace(/^Verified\s+/i, ""));

    const caseExpected = c.expected_skills || [];
    const caseNegative = c.should_not_award || [];

    const matchedExpected = caseExpected.filter((s) => hasSkill(inferred, s));
    const missedExpected = caseExpected.filter((s) => !hasSkill(inferred, s));
    const overAwarded = caseNegative.filter((s) => hasSkill(badges, s));

    tp += matchedExpected.length;
    fn += missedExpected.length;
    fp += overAwarded.length;
    shouldNotAwardViolations += overAwarded.length;

    details.push({
      name: c.name,
      inferredTop: inferred.slice(0, 6),
      badges,
      matchedExpected,
      missedExpected,
      overAwarded
    });
  }

  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;

  const summary = {
    totalCases: cases.length,
    precision: Number(precision.toFixed(3)),
    recall: Number(recall.toFixed(3)),
    falsePositives: fp,
    shouldNotAwardViolations
  };

  console.log(JSON.stringify({ summary, details }, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

