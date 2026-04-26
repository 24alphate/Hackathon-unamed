"""Strict JSON validation models (Python equivalent to Zod strictness)."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError


class MatchingWeightsModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    required_skills: float
    nice_to_have_skills: float
    deliverables: float
    proof_quality: float


class UncertaintyModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    known: list[str]
    assumptions: list[str]
    missing: list[str]
    human_review_needed: list[str]


class EvaluationModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    detectedCapabilities: list[dict[str, Any]]
    skillScores: list[dict[str, Any]]
    earnedBadges: list[dict[str, Any]]
    strengths: list[str]
    weaknesses: list[str]
    evidenceExplanation: str
    employerSummary: str
    proofAnalysis: dict[str, Any]
    evidenceObject: dict[str, Any]
    inferredSkillsDetailed: list[dict[str, Any]]
    rubricEvaluation: list[dict[str, Any]]
    badgeDecisions: list[dict[str, Any]]
    evidenceGraph: dict[str, Any]
    claimProofAnalysis: list[dict[str, Any]]
    uncertainty: UncertaintyModel


class ParsedJobModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role_title: str
    business_context: str
    required_deliverables: list[str]
    required_capabilities: list[str]
    technical_skills: list[str]
    soft_contextual_skills: list[str]
    must_have: list[str]
    nice_to_have: list[str]
    required_skills: list[str]
    nice_to_have_skills: list[str]
    deliverables: list[str]
    test_challenge: str
    matching_weights: MatchingWeightsModel
    ambiguity_questions: list[str]
    uncertainty: UncertaintyModel


def validate_evaluation_payload(payload: Any) -> tuple[bool, str]:
    try:
        EvaluationModel.model_validate(payload)
        return True, ""
    except ValidationError as e:
        return False, str(e)[:500]


def validate_job_payload(payload: Any) -> tuple[bool, str]:
    try:
        ParsedJobModel.model_validate(payload)
        return True, ""
    except ValidationError as e:
        return False, str(e)[:500]
