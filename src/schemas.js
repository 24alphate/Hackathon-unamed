export const EvidenceAnalysisSchema = {
  required: ["project_type", "domain_context", "implemented_features", "technical_artifacts", "proof_signals", "weak_signals", "missing_evidence", "authenticity_risks"]
};

export const EvidenceGraphSchema = {
  required: ["nodes", "edges"]
};

export const SkillInferenceSchema = {
  array: true,
  required: ["skill_name", "category", "confidence_score", "evidence_used", "why_it_proves_skill", "what_would_increase_confidence", "level"]
};

export const ClaimProofSchema = {
  array: true,
  required: ["skill", "claim", "observed_evidence", "derived_features", "inference", "confidence", "risk_if_wrong"]
};

export const RubricEvaluationSchema = {
  array: true,
  required: ["dimension", "score", "reasoning"]
};

export const BadgeDecisionSchema = {
  array: true,
  required: ["badge_name", "badge_level", "required_evidence", "evidence_satisfied", "confidence", "why_awarded", "why_not_higher_level"]
};

export const JobParsingSchema = {
  required: ["role_title", "business_context", "required_deliverables", "required_capabilities", "technical_skills", "soft_contextual_skills", "must_have", "nice_to_have", "required_skills", "nice_to_have_skills", "deliverables", "test_challenge", "matching_weights", "ambiguity_questions", "uncertainty"]
};

export const MatchExplanationSchema = {
  required: ["totalMatchScore", "mustHaveCoverage", "niceToHaveCoverage", "riskScore", "missingCriticalRequirements", "evidenceBackedMatches", "recommendation"]
};

export function conforms(schema, value) {
  if (schema.array) {
    return Array.isArray(value) && value.every((item) => hasRequired(schema.required, item));
  }
  return hasRequired(schema.required, value);
}

function hasRequired(required, value) {
  return Boolean(value && typeof value === "object" && required.every((key) => key in value));
}
