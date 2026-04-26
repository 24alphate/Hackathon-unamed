"""Evidence -> Feature -> Skill -> Confidence -> Badge inference."""
from __future__ import annotations

from typing import Any

from .esco_taxonomy import normalize_skill_name

FEATURE_TO_SKILL = {
    "api_data_loading": ("Frontend API Consumption", "API Integration"),
    "async_data_rendering": ("Async Data Rendering", "API Integration"),
    "form_validation": ("Form Validation", "Form Handling"),
    "responsive_layout": ("Responsive UI Design", "Responsive UI Design"),
    "component_structure": ("Component Structure", "Component Structure"),
    "dashboard_navigation": ("Dashboard Layout and Navigation", "Dashboard Layout and Navigation"),
    "live_deployment": ("Deployment Literacy", "Deployment Literacy"),
}


def _has_real_proof(extraction: dict[str, Any]) -> bool:
    proof = set(extraction.get("proof_signals") or [])
    return bool({"readme_fetched", "file_tree_fetched", "live_url_present"} & proof)


def infer_skills_from_evidence(extraction: dict[str, Any]) -> dict[str, Any]:
    features = extraction.get("features_detected") or []
    proof = set(extraction.get("proof_signals") or [])
    risks = set(extraction.get("authenticity_risks") or [])
    missing = set(extraction.get("missing_evidence") or [])
    real_proof = _has_real_proof(extraction)

    chains: list[dict[str, Any]] = []
    by_skill: dict[str, dict[str, Any]] = {}
    for feature in features:
        mapping = FEATURE_TO_SKILL.get(feature)
        if not mapping:
            continue
        raw_skill_name, raw_badge_base = mapping
        skill_name = normalize_skill_name(raw_skill_name)
        badge_base = normalize_skill_name(raw_badge_base)

        # Claims alone are not enough: no repository/live proof => sharply lower confidence.
        confidence = 50
        if real_proof:
            confidence += 18
        if "file_tree_fetched" in proof:
            confidence += 8
        if "readme_fetched" in proof:
            confidence += 8
        if "live_url_present" in proof:
            confidence += 6
        if "repository_evidence_simulated" in risks:
            confidence -= 10
        if "github_link_not_verified_by_api" in risks:
            confidence -= 8
        if "short_or_low_detail_explanation" in risks:
            confidence -= 4
        if "missing_repository_file_structure" in missing:
            confidence -= 8
        if feature == "async_data_rendering":
            confidence += 4

        confidence = max(35, min(96, confidence))
        level = (
            "Level 3" if confidence >= 90 else "Level 2" if confidence >= 82 else "Level 1"
        )
        badge = f"Verified {badge_base} {level}" if confidence >= 72 else None
        evidence_note = (
            f"Feature '{feature}' observed with proof signals: "
            f"{', '.join(sorted(proof)) or 'none'}."
        )
        chain = {
            "feature": feature,
            "skill": skill_name,
            "confidence": confidence,
            "badge": badge,
            "evidence": evidence_note,
        }
        chains.append(chain)
        if (
            skill_name not in by_skill
            or confidence > float(by_skill[skill_name]["confidence"])
        ):
            by_skill[skill_name] = chain

    skill_scores = [
        {
            "skill": skill,
            "score": round(item["confidence"]),
            "evidence": item["evidence"],
        }
        for skill, item in by_skill.items()
    ]
    skill_scores.sort(key=lambda x: -float(x["score"]))

    earned_badges = []
    for item in sorted(by_skill.values(), key=lambda x: -float(x["confidence"])):
        if item["badge"]:
            earned_badges.append(
                {
                    "title": item["badge"],
                    "score": round(item["confidence"]),
                    "evidence": item["evidence"],
                }
            )
        if len(earned_badges) >= 3:
            break

    return {
        "chains": chains,
        "skillScores": skill_scores,
        "earnedBadges": earned_badges,
    }
