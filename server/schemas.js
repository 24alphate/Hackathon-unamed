export const EvidenceAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["project_type", "domain_context", "implemented_features", "technical_artifacts", "proof_signals", "weak_signals", "missing_evidence", "authenticity_risks"],
  properties: {
    project_type: { type: "string" },
    domain_context: { type: "string" },
    implemented_features: { type: "array", items: { type: "string" } },
    technical_artifacts: { type: "array", items: { type: "string" } },
    proof_signals: { type: "array", items: { type: "string" } },
    weak_signals: { type: "array", items: { type: "string" } },
    missing_evidence: { type: "array", items: { type: "string" } },
    authenticity_risks: { type: "array", items: { type: "string" } }
  }
};

export const EvidenceGraphSchema = {
  type: "object",
  additionalProperties: false,
  required: ["nodes", "edges"],
  properties: {
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "label", "summary"],
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["evidence", "feature", "skill", "risk"] },
          label: { type: "string" },
          summary: { type: "string" }
        }
      }
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "type", "reason"],
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          type: { type: "string", enum: ["indicates", "supports", "proves", "limits_confidence", "requires_review"] },
          reason: { type: "string" }
        }
      }
    }
  }
};

export const SkillInferenceSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["skill_name", "category", "confidence_score", "evidence_used", "why_it_proves_skill", "what_would_increase_confidence", "level"],
    properties: {
      skill_name: { type: "string" },
      category: { type: "string", enum: ["UI/Frontend", "Backend/API", "Data Handling", "System Design"] },
      confidence_score: { type: "number" },
      evidence_used: { type: "array", items: { type: "string" } },
      why_it_proves_skill: { type: "string" },
      what_would_increase_confidence: { type: "string" },
      level: { type: "string", enum: ["beginner", "intermediate", "advanced"] }
    }
  }
};

export const ClaimProofSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["skill", "claim", "observed_evidence", "derived_features", "inference", "confidence", "risk_if_wrong"],
    properties: {
      skill: { type: "string" },
      claim: { type: "string" },
      observed_evidence: { type: "array", items: { type: "string" } },
      derived_features: { type: "array", items: { type: "string" } },
      inference: { type: "string" },
      confidence: { type: "number" },
      risk_if_wrong: { type: "string", enum: ["low", "medium", "high"] }
    }
  }
};

export const RubricEvaluationSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["dimension", "score", "reasoning"],
    properties: {
      dimension: { type: "string" },
      score: { type: "number" },
      reasoning: { type: "string" }
    }
  }
};

export const BadgeDecisionSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["badge_name", "badge_level", "required_evidence", "evidence_satisfied", "confidence", "why_awarded", "why_not_higher_level"],
    properties: {
      badge_name: { type: "string" },
      badge_level: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
      required_evidence: { type: "array", items: { type: "string" } },
      evidence_satisfied: { type: "array", items: { type: "string" } },
      confidence: { type: "number" },
      why_awarded: { type: "string" },
      why_not_higher_level: { type: "string" }
    }
  }
};

export const JobParsingSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "role_title",
    "business_context",
    "required_deliverables",
    "required_capabilities",
    "technical_skills",
    "soft_contextual_skills",
    "must_have",
    "nice_to_have",
    "required_skills",
    "nice_to_have_skills",
    "deliverables",
    "test_challenge",
    "matching_weights",
    "ambiguity_questions",
    "uncertainty"
  ],
  properties: {
    role_title: { type: "string" },
    business_context: { type: "string" },
    required_deliverables: { type: "array", items: { type: "string" } },
    required_capabilities: { type: "array", items: { type: "string" } },
    technical_skills: { type: "array", items: { type: "string" } },
    soft_contextual_skills: { type: "array", items: { type: "string" } },
    must_have: { type: "array", items: { type: "string" } },
    nice_to_have: { type: "array", items: { type: "string" } },
    required_skills: { type: "array", items: { type: "string" } },
    nice_to_have_skills: { type: "array", items: { type: "string" } },
    deliverables: { type: "array", items: { type: "string" } },
    test_challenge: { type: "string" },
    matching_weights: {
      type: "object",
      additionalProperties: false,
      required: ["required_skills", "nice_to_have_skills", "deliverables", "proof_quality"],
      properties: {
        required_skills: { type: "number" },
        nice_to_have_skills: { type: "number" },
        deliverables: { type: "number" },
        proof_quality: { type: "number" }
      }
    },
    ambiguity_questions: { type: "array", items: { type: "string" } },
    uncertainty: uncertaintySchema()
  }
};

export const MatchExplanationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["totalMatchScore", "mustHaveCoverage", "niceToHaveCoverage", "riskScore", "missingCriticalRequirements", "evidenceBackedMatches", "recommendation"],
  properties: {
    totalMatchScore: { type: "number" },
    mustHaveCoverage: { type: "number" },
    niceToHaveCoverage: { type: "number" },
    riskScore: { type: "number" },
    missingCriticalRequirements: { type: "array", items: { type: "string" } },
    evidenceBackedMatches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["requirement", "evidence"],
        properties: {
          requirement: { type: "string" },
          evidence: { type: "string" }
        }
      }
    },
    recommendation: { type: "string" }
  }
};

export function uncertaintySchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["known", "assumptions", "missing", "human_review_needed"],
    properties: {
      known: { type: "array", items: { type: "string" } },
      assumptions: { type: "array", items: { type: "string" } },
      missing: { type: "array", items: { type: "string" } },
      human_review_needed: { type: "array", items: { type: "string" } }
    }
  };
}

export function validateSchema(schema, value, path = "$") {
  const errors = [];
  validateNode(schema, value, path, errors);
  return { valid: errors.length === 0, errors };
}

function validateNode(schema, value, path, errors) {
  if (!schema) return;
  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be array`);
      return;
    }
    value.forEach((item, index) => validateNode(schema.items, item, `${path}[${index}]`, errors));
    return;
  }
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${path} must be object`);
      return;
    }
    for (const key of schema.required || []) {
      if (!(key in value)) errors.push(`${path}.${key} is required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!schema.properties?.[key]) errors.push(`${path}.${key} is not allowed`);
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (key in value) validateNode(childSchema, value[key], `${path}.${key}`, errors);
    }
    return;
  }
  if (schema.type === "string" && typeof value !== "string") errors.push(`${path} must be string`);
  if (schema.type === "number" && typeof value !== "number") errors.push(`${path} must be number`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} must be one of ${schema.enum.join(", ")}`);
}
