"""Deterministic evidence extraction layer (first AI stage)."""
from __future__ import annotations

import re
from typing import Any


def _has_url(value: str) -> bool:
    return bool(re.match(r"^https?://", value.strip(), re.I))


def extract_evidence(submission: dict[str, str], github_evidence: dict[str, Any]) -> dict[str, Any]:
    text = (
        f"{submission.get('projectDescription', '')} "
        f"{submission.get('explanation', '')} "
        f"{github_evidence.get('readme', '')} "
        f"{' '.join(github_evidence.get('fileStructure') or [])}"
    ).lower()

    project_type = (
        "dashboard"
        if "dashboard" in text or "analytics" in text
        else "api_app"
        if ("api" in text or "endpoint" in text) and "landing" not in text
        else "landing_page"
    )

    features_detected = [
        "responsive_layout" if ("responsive" in text or "mobile" in text) else "",
        "api_data_loading" if ("api" in text or "fetch" in text or "endpoint" in text) else "",
        "async_data_rendering" if ("async" in text or "loading state" in text or "await" in text) else "",
        "form_validation" if ("form" in text or "validation" in text or "contact" in text) else "",
        "dashboard_navigation" if ("dashboard" in text or "transaction" in text) else "",
        "component_structure" if ("component" in text or "src/components" in text or "react" in text) else "",
        "live_deployment" if _has_url(submission.get("liveUrl", "")) else "",
    ]
    features_detected = [x for x in features_detected if x]

    technical_artifacts = (github_evidence.get("fileStructure") or [])[:150]

    github_url = (submission.get("githubUrl") or "").strip()
    live_url = (submission.get("liveUrl") or "").strip()
    explanation = (submission.get("explanation") or "").strip()
    source = github_evidence.get("source")

    proof_signals = [
        "github_url_present" if _has_url(github_url) else "",
        "live_url_present" if _has_url(live_url) else "",
        "readme_fetched" if source == "github" and bool(github_evidence.get("readme")) else "",
        "file_tree_fetched" if source == "github" and len(technical_artifacts) > 0 else "",
        "candidate_explanation_present" if explanation else "",
    ]
    proof_signals = [x for x in proof_signals if x]

    missing_evidence = []
    if not _has_url(github_url):
        missing_evidence.append("missing_github_url")
    if not _has_url(live_url):
        missing_evidence.append("missing_live_url")
    if not explanation:
        missing_evidence.append("missing_candidate_explanation")
    if len(technical_artifacts) == 0:
        missing_evidence.append("missing_repository_file_structure")
    if not github_evidence.get("readme"):
        missing_evidence.append("missing_readme_content")

    authenticity_risks = []
    if source == "simulated":
        authenticity_risks.append("repository_evidence_simulated")
    if source == "none":
        authenticity_risks.append("no_repository_evidence")
    if _has_url(github_url) and source != "github":
        authenticity_risks.append("github_link_not_verified_by_api")
    if _has_url(live_url):
        authenticity_risks.append("live_app_not_runtime_tested_in_platform")
    else:
        authenticity_risks.append("runtime_behavior_unverified")
    if len(explanation) < 140:
        authenticity_risks.append("short_or_low_detail_explanation")

    return {
        "project_type": project_type,
        "features_detected": features_detected,
        "technical_artifacts": technical_artifacts,
        "proof_signals": proof_signals,
        "missing_evidence": missing_evidence,
        "authenticity_risks": authenticity_risks,
    }
