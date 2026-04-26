import { z } from "zod";

export const EvidenceAnalysisZod = z
  .object({
    project_type: z.string(),
    domain_context: z.string(),
    implemented_features: z.array(z.string()),
    technical_artifacts: z.array(z.string()),
    proof_signals: z.array(z.string()),
    weak_signals: z.array(z.string()),
    missing_evidence: z.array(z.string()),
    authenticity_risks: z.array(z.string())
  })
  .strict();

export const SkillInferenceZod = z
  .array(
    z
      .object({
        skill_name: z.string(),
        category: z.enum(["UI/Frontend", "Backend/API", "Data Handling", "System Design"]),
        confidence_score: z.number(),
        evidence_used: z.array(z.string()),
        why_it_proves_skill: z.string(),
        what_would_increase_confidence: z.string(),
        level: z.enum(["beginner", "intermediate", "advanced"])
      })
      .strict()
  );

export const RubricEvaluationZod = z
  .array(
    z
      .object({
        dimension: z.string(),
        score: z.number(),
        reasoning: z.string()
      })
      .strict()
  );

export const BadgeDecisionZod = z
  .array(
    z
      .object({
        badge_name: z.string(),
        badge_level: z.enum(["beginner", "intermediate", "advanced"]),
        required_evidence: z.array(z.string()),
        evidence_satisfied: z.array(z.string()),
        confidence: z.number(),
        why_awarded: z.string(),
        why_not_higher_level: z.string()
      })
      .strict()
  );

export const JobParsingZod = z
  .object({
    role_title: z.string(),
    business_context: z.string(),
    required_deliverables: z.array(z.string()),
    required_capabilities: z.array(z.string()),
    technical_skills: z.array(z.string()),
    soft_contextual_skills: z.array(z.string()),
    must_have: z.array(z.string()),
    nice_to_have: z.array(z.string()),
    required_skills: z.array(z.string()),
    nice_to_have_skills: z.array(z.string()),
    deliverables: z.array(z.string()),
    test_challenge: z.string(),
    matching_weights: z
      .object({
        required_skills: z.number(),
        nice_to_have_skills: z.number(),
        deliverables: z.number(),
        proof_quality: z.number()
      })
      .strict(),
    ambiguity_questions: z.array(z.string()),
    uncertainty: z
      .object({
        known: z.array(z.string()),
        assumptions: z.array(z.string()),
        missing: z.array(z.string()),
        human_review_needed: z.array(z.string())
      })
      .strict()
  })
  .strict();

export const MatchResultZod = z
  .object({
    weightedMatchScore: z.number(),
    hybridMatchScore: z.number(),
    skillOverlapScore: z.number(),
    missingSkills: z.array(z.string()),
    strongMatches: z.array(z.string()),
    hybridComponents: z
      .object({
        mustHaveSkillOverlap: z.number(),
        semanticSimilarity: z.number(),
        proofStrength: z.number(),
        domainRelevance: z.number(),
        integrityConfidence: z.number(),
        formula: z.string()
      })
      .strict(),
    explainableMatch: z
      .object({
        totalMatchScore: z.number(),
        mustHaveCoverage: z.number(),
        niceToHaveCoverage: z.number(),
        riskScore: z.number(),
        missingCriticalRequirements: z.array(z.string()),
        evidenceBackedMatches: z.array(
          z.object({ requirement: z.string(), evidence: z.string() }).strict()
        ),
        recommendation: z.string()
      })
      .strict(),
    hiringDecision: z
      .object({
        recommendation: z.string(),
        recommendationKey: z.string(),
        confidence: z.number(),
        justification: z.string(),
        riskAnalysis: z.array(z.string()),
        nextStep: z.string()
      })
      .strict(),
    matchExplanation: z.string()
  })
  .passthrough();

export function parseWithZod(schema, payload) {
  return schema.safeParse(payload);
}
