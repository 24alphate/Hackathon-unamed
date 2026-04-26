"""Evaluation + job parsing pipeline (parity with server/evaluationCore.js)."""
from __future__ import annotations

import json
import logging
from typing import Any

from openai import AsyncOpenAI

from .config import GITHUB_TOKEN, OPENAI_API_KEY, OPENAI_MODEL
from .evidence_extractor import extract_evidence
from .github_client import resolve_github_evidence
from .mock_engine import mock_evaluate, mock_parse_job, normalize_submission
from .validation_models import validate_evaluation_payload, validate_job_payload

logger = logging.getLogger(__name__)

_COMMON_JSON_RULES = (
    "Return valid JSON only. Do not include markdown, prose outside JSON, comments, or trailing commas. "
    "Use only the evidence provided in the input. Do not browse, invent facts, or assume hidden implementation details. "
    "Distinguish candidate/employer claims from observable proof. "
    "Include confidence scores where the schema asks for scores. Low evidence must produce lower confidence. "
    "Explicitly include missing evidence and uncertainty. "
    "Cite evidence from the provided submission/job text, README text, file structure, URLs, rubric, or prior structured analysis."
)


def _evaluate_system_prompt() -> str:
    return (
        "You are Unmapped's AI Proof Engine for proof-of-work hiring. "
        + _COMMON_JSON_RULES
        + " Task: convert messy candidate project evidence into structured, explainable, trusted skill signals. "
        "Output a single JSON object with these exact top-level keys: "
        "detectedCapabilities, skillScores, earnedBadges, strengths, weaknesses, evidenceExplanation, employerSummary, "
        "proofAnalysis, evidenceObject, inferredSkillsDetailed, rubricEvaluation, badgeDecisions, evidenceGraph, "
        "claimProofAnalysis, uncertainty. "
        "Follow nested structure consistent with: proofAnalysis (project_type, features_detected, complexity_level, skills_inferred, "
        "confidence_score, reasoning, github_readme_excerpt, file_structure, skill_graph with categories UI/Frontend|Backend/API|Data Handling|System Design); "
        "evidenceObject (project_type, domain_context, implemented_features, technical_artifacts, proof_signals, weak_signals, missing_evidence, authenticity_risks); "
        "evidenceGraph (nodes with id,type,label,summary; edges with from,to,type,reason); "
        "claimProofAnalysis, inferredSkillsDetailed, rubricEvaluation (array of dimension/score/reasoning), badgeDecisions, "
        "uncertainty (known, assumptions, missing, human_review_needed arrays)."
    )


def _parse_job_system_prompt() -> str:
    return (
        "You are Unmapped's job parsing engine for proof-of-work hiring. "
        + _COMMON_JSON_RULES
        + " Task: convert a vague employer job post into a structured job schema. "
        "Output JSON with keys: role_title, business_context, required_deliverables, required_capabilities, technical_skills, "
        "soft_contextual_skills, must_have, nice_to_have, required_skills, nice_to_have_skills, deliverables, test_challenge, "
        "matching_weights (required_skills, nice_to_have_skills, deliverables, proof_quality as numbers), ambiguity_questions, uncertainty "
        "(known, assumptions, missing, human_review_needed)."
    )


def attach_github_evidence_meta(evaluation: dict[str, Any], github_resolved: dict[str, Any] | None) -> dict[str, Any]:
    if not github_resolved:
        return evaluation
    fs = github_resolved.get("fileStructure") or []
    return {
        **evaluation,
        "githubEvidence": {
            "source": github_resolved.get("source"),
            "owner": github_resolved.get("owner"),
            "repo": github_resolved.get("repo"),
            "defaultBranch": github_resolved.get("defaultBranch"),
            "fileCount": len(fs) if isinstance(fs, list) else 0,
            "usedGithubToken": bool(GITHUB_TOKEN),
            "fetchError": github_resolved.get("error"),
        },
    }


def validate_evaluation_result(result: Any, _submission: dict[str, str], fallback: dict[str, Any]) -> dict[str, Any]:
    ok, err = validate_evaluation_payload(result)
    if not ok:
        return {
            **fallback,
            "source": "mock",
            "warning": f"AI response failed strict validation, so fallback was used. {err}",
        }
    return result


def validate_parsed_job_result(result: Any, job_post: str) -> dict[str, Any]:
    fallback = mock_parse_job(job_post)
    ok, err = validate_job_payload(result)
    if not ok:
        return {**fallback, "source": "mock", "warning": f"AI job parse failed strict validation, fallback used. {err}"}
    return result


def strip_metadata(result: dict[str, Any] | None) -> dict[str, Any]:
    if not result:
        return {}
    return {k: v for k, v in result.items() if k not in ("source", "model", "warning", "error")}


async def _evaluate_with_openai(submission: dict[str, str], github_evidence: dict[str, Any]) -> dict[str, Any]:
    if not OPENAI_API_KEY:
        raise RuntimeError("no key")
    readme = github_evidence.get("readme") or ""
    files = "\n".join(github_evidence.get("fileStructure") or [])
    deterministic_extraction = extract_evidence(submission, github_evidence)
    user = f"""Project description: {submission.get('projectDescription') or 'Not provided'}
GitHub URL: {submission.get('githubUrl') or 'Not provided'}
Live URL: {submission.get('liveUrl') or 'Not provided'}
Candidate explanation: {submission.get('explanation') or 'Not provided'}
README evidence: {readme}
File structure evidence:
{files}
Deterministic extraction seed (must be refined, not ignored): {json.dumps(deterministic_extraction)}"""
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    comp = await client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "system", "content": _evaluate_system_prompt()}, {"role": "user", "content": user}],
        response_format={"type": "json_object"},
    )
    text = (comp.choices[0].message.content or "").strip()
    data = json.loads(text)
    return {**data, "source": "openai", "model": OPENAI_MODEL}


async def _parse_job_with_openai(job_post: str) -> dict[str, Any]:
    if not OPENAI_API_KEY:
        raise RuntimeError("no key")
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    comp = await client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": _parse_job_system_prompt()},
            {"role": "user", "content": f"Employer job post: {job_post}"},
        ],
        response_format={"type": "json_object"},
    )
    text = (comp.choices[0].message.content or "").strip()
    data = json.loads(text)
    return {**data, "source": "openai", "model": OPENAI_MODEL}


async def run_evaluation_pipeline(submission: dict[str, Any]) -> dict[str, Any]:
    payload = normalize_submission(submission)
    github_resolved = await resolve_github_evidence(payload)
    extraction = extract_evidence(payload, github_resolved)
    fallback_eval = mock_evaluate(payload, github_resolved)
    if not OPENAI_API_KEY:
        return {
            "payload": payload,
            "githubResolved": github_resolved,
            "evaluation": attach_github_evidence_meta(
                {
                    **validate_evaluation_result(fallback_eval, payload, fallback_eval),
                    "evidenceExtraction": extraction,
                },
                github_resolved,
            ),
        }
    try:
        result = await _evaluate_with_openai(payload, github_resolved)
        ev = {
            **validate_evaluation_result(result, payload, fallback_eval),
            "evidenceExtraction": extraction,
        }
        return {
            "payload": payload,
            "githubResolved": github_resolved,
            "evaluation": attach_github_evidence_meta(ev, github_resolved),
        }
    except Exception as e:
        logger.exception("LLM evaluation failed, using mock: %s", e)
        fe = {
            **fallback_eval,
            "source": "mock",
            "warning": "OpenAI evaluation failed, so the fallback evaluator was used.",
            "evidenceExtraction": extraction,
        }
        return {
            "payload": payload,
            "githubResolved": github_resolved,
            "evaluation": attach_github_evidence_meta(fe, github_resolved),
        }


async def run_job_parse_request(job_post: str) -> dict[str, Any]:
    text = (job_post or "").strip()
    if not text:
        return {"error": "empty"}
    try:
        if not OPENAI_API_KEY:
            result = mock_parse_job(text)
        else:
            result = await _parse_job_with_openai(text)
        return validate_parsed_job_result(result, text)
    except Exception as e:
        logger.exception("LLM job parsing failed, using mock: %s", e)
        return {**mock_parse_job(text), "source": "mock", "warning": "OpenAI job parsing failed, so the fallback parser was used."}
