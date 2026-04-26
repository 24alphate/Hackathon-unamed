"""Hybrid match engine for proof-of-work hiring."""
from __future__ import annotations

import math
import re
from typing import Any

from .semantic_index import semantic_similarity

def get_average_score(profile: dict[str, Any]) -> float:
    scores = profile.get("skillScores") or []
    if not scores:
        return 0
    return round(sum(float(s.get("score") or 0) for s in scores) / len(scores))


def _tokenize(value: str) -> list[str]:
    text = re.sub(r"[^a-z0-9\s]", " ", str(value).lower())
    stop = {"and", "with", "for", "the", "url"}
    return [t for t in text.split() if len(t) > 2 and t not in stop]


def _expand_skill_terms(value: str) -> str:
    s = str(value).lower()
    s = s.replace("ui", "ui interface frontend")
    s = s.replace("api", "api fetch endpoint integration data")
    s = s.replace("dashboard", "dashboard layout navigation transaction data table")
    s = s.replace("transaction", "transaction financial payment fintech data")
    s = s.replace("transactions", "transaction financial payment fintech data")
    s = s.replace("responsive", "responsive mobile desktop layout")
    s = s.replace("mobile", "mobile responsive small screen")
    s = s.replace("form", "form validation input submit email")
    s = s.replace("forms", "form validation input submit email")
    s = s.replace("deliverable", "live demo github repository explanation proof")
    s = s.replace("github", "github repository code structure")
    s = s.replace("live demo", "live demo deployment url")
    return s


def _get_profile_evidence(profile: dict[str, Any]) -> list[dict[str, Any]]:
    skills = profile.get("skillScores") or []
    badges = profile.get("earnedBadges") or []
    ev: list[dict[str, Any]] = [
        {"label": sk.get("skill"), "evidence": sk.get("evidence"), "score": float(sk.get("score") or 0)}
        for sk in skills
    ]
    ev.extend(
        {"label": b.get("title"), "evidence": b.get("evidence"), "score": float(b.get("score") or 0)}
        for b in badges
    )
    ev.append(
        {
            "label": "Employer summary",
            "evidence": profile.get("employerSummary") or "",
            "score": get_average_score(profile),
        }
    )
    return ev


def _match_items(items: list[str], profile: dict[str, Any]) -> list[dict[str, Any]]:
    evidence = _get_profile_evidence(profile)
    out: list[dict[str, Any]] = []
    for item in items or []:
        item_tokens = _tokenize(_expand_skill_terms(item))
        best = {"score": 0.0, "label": "", "evidence": ""}
        for ev_item in evidence:
            ev_tokens = _tokenize(_expand_skill_terms(f"{ev_item['label']} {ev_item['evidence']}"))
            overlap = sum(1 for t in item_tokens if t in ev_tokens)
            score = overlap / len(item_tokens) if item_tokens else 0.0
            if score > best["score"]:
                best = {**ev_item, "score": score}
        out.append(
            {
                "label": item,
                "matched": best["score"] >= 0.34,
                "confidence": best["score"],
                "evidence": best.get("evidence") or "",
            }
        )
    return out


def _get_match_ratio(matches: list[dict[str, Any]]) -> float:
    if not matches:
        return 0
    return sum(1 for m in matches if m.get("matched")) / len(matches)


def _cosine_similarity(a: str, b: str) -> float:
    ta = _tokenize(_expand_skill_terms(a))
    tb = _tokenize(_expand_skill_terms(b))
    if not ta or not tb:
        return 0.0
    fa: dict[str, float] = {}
    fb: dict[str, float] = {}
    for t in ta:
        fa[t] = fa.get(t, 0) + 1
    for t in tb:
        fb[t] = fb.get(t, 0) + 1
    dot = sum(fa.get(k, 0.0) * fb.get(k, 0.0) for k in set(fa) | set(fb))
    na = math.sqrt(sum(v * v for v in fa.values()))
    nb = math.sqrt(sum(v * v for v in fb.values()))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _semantic_similarity_score(profile: dict[str, Any], parsed_job: dict[str, Any]) -> float:
    job_text = " ".join(
        [
            parsed_job.get("role_title") or "",
            parsed_job.get("business_context") or "",
            " ".join(parsed_job.get("required_skills") or []),
            " ".join(parsed_job.get("nice_to_have_skills") or []),
            " ".join(parsed_job.get("deliverables") or []),
        ]
    )
    pa = profile.get("proofAnalysis") or {}
    profile_text = " ".join(
        [
            profile.get("employerSummary") or "",
            " ".join((s.get("skill") or "") for s in (profile.get("skillScores") or [])),
            " ".join((s.get("evidence") or "") for s in (profile.get("skillScores") or [])),
            " ".join((b.get("title") or "") for b in (profile.get("earnedBadges") or [])),
            pa.get("project_type") or "",
            " ".join(pa.get("features_detected") or []),
            " ".join(pa.get("skills_inferred") or []),
            pa.get("reasoning") or "",
        ]
    )
    candidate_key = "unknown"
    if profile.get("skillScores"):
        candidate_key = str(profile["skillScores"][0].get("skill") or "candidate")
    try:
        return semantic_similarity(job_text, profile_text, candidate_key=candidate_key)
    except Exception:
        # safe fallback when vector services/model are unavailable
        return round(max(0.0, min(1.0, _cosine_similarity(job_text, profile_text))) * 100)


def _proof_strength_score(profile: dict[str, Any]) -> float:
    pa = profile.get("proofAnalysis") or {}
    conf = float(pa.get("confidence_score") or 0)
    if conf <= 1:
        conf *= 100
    conf = max(0.0, min(100.0, conf))
    avg_skill = max(0.0, min(100.0, get_average_score(profile)))
    badge_scores = [float(b.get("score") or 0) for b in (profile.get("earnedBadges") or [])]
    badge_score = sum(badge_scores) / len(badge_scores) if badge_scores else avg_skill * 0.9
    badge_score = max(0.0, min(100.0, badge_score))
    return round(conf * 0.5 + avg_skill * 0.35 + badge_score * 0.15)


def _domain_relevance_score(profile: dict[str, Any], parsed_job: dict[str, Any]) -> float:
    job = " ".join(
        [
            parsed_job.get("business_context") or "",
            parsed_job.get("role_title") or "",
            " ".join(parsed_job.get("required_skills") or []),
        ]
    ).lower()
    pa = profile.get("proofAnalysis") or {}
    evidence = " ".join(
        [
            pa.get("project_type") or "",
            " ".join(pa.get("features_detected") or []),
            pa.get("reasoning") or "",
            profile.get("employerSummary") or "",
        ]
    ).lower()
    domain_pairs = [
        ("fintech", ["transaction", "payment", "remittance", "wallet", "ledger"]),
        ("ecommerce", ["checkout", "cart", "order", "product"]),
        ("dashboard", ["dashboard", "analytics", "kpi", "table", "metrics"]),
        ("api", ["api", "endpoint", "fetch", "integration"]),
    ]
    score = 45.0
    for job_key, ev_keys in domain_pairs:
        if job_key in job:
            score += 15
            if any(k in evidence for k in ev_keys):
                score += 22
            else:
                score -= 8
    return round(max(0.0, min(100.0, score)))


def _integrity_confidence_score(profile: dict[str, Any]) -> float:
    base = 82.0
    unc = profile.get("uncertainty") or {}
    missing = unc.get("missing") or []
    assumptions = " ".join(unc.get("assumptions") or []).lower()
    pa = profile.get("proofAnalysis") or {}
    fs = pa.get("file_structure") or []
    readme = pa.get("github_readme_excerpt") or ""
    base -= min(35, len(missing) * 7)
    if "simulated" in assumptions:
        base -= 22
    if not fs:
        base -= 15
    if not readme:
        base -= 10
    return round(max(5.0, min(100.0, base)))


def _build_explainable_match(
    required_matches: list[dict[str, Any]],
    nice_matches: list[dict[str, Any]],
    deliverable_matches: list[dict[str, Any]],
    total_score: float,
    profile: dict[str, Any],
) -> dict[str, Any]:
    must_have_coverage = round(_get_match_ratio(required_matches) * 100)
    nice_to_have_coverage = round(_get_match_ratio(nice_matches) * 100)
    missing_critical = [m["label"] for m in required_matches if not m.get("matched")]
    evidence_backed = []
    for m in (required_matches + nice_matches + deliverable_matches):
        if m.get("matched"):
            evidence_backed.append(
                {"requirement": m["label"], "evidence": m.get("evidence") or "Matched against evaluated skill/badge evidence."}
            )
        if len(evidence_backed) >= 6:
            break
    unc = profile.get("uncertainty") or {}
    missing = unc.get("missing") or []
    uncertainty_penalty = len(missing) * 5
    risk_score = min(
        100,
        max(0, len(missing_critical) * 18 + uncertainty_penalty + (100 - total_score) * 0.35),
    )
    rec = (
        "Proceed with high confidence, then verify remaining assumptions in a short final screen."
        if total_score >= 80 and risk_score < 35
        else (
            "Proceed with a targeted final challenge focused on missing critical requirements."
            if total_score >= 60
            else "Do not proceed unless the role requirements are relaxed or new proof is submitted."
        )
    )
    return {
        "totalMatchScore": total_score,
        "mustHaveCoverage": must_have_coverage,
        "niceToHaveCoverage": nice_to_have_coverage,
        "riskScore": round(risk_score),
        "missingCriticalRequirements": missing_critical,
        "evidenceBackedMatches": evidence_backed,
        "recommendation": rec,
    }


def _get_hiring_recommendation(
    match_score: float, overlap_score: float, confidence: float, missing_core_count: int
) -> str:
    if match_score >= 88 and overlap_score >= 75 and confidence >= 82 and missing_core_count <= 1:
        return "Strong Hire"
    if match_score >= 72 and overlap_score >= 55 and confidence >= 68 and missing_core_count <= 3:
        return "Hire"
    if match_score >= 52 or overlap_score >= 40:
        return "Borderline"
    return "Do Not Hire"


def _get_suggested_next_step(recommendation: str, missing_core_count: int) -> str:
    if recommendation == "Strong Hire" and missing_core_count == 0:
        return "Hire directly or run a short culture/availability screen."
    if recommendation in ("Strong Hire", "Hire"):
        return "Send a focused final challenge covering the remaining gaps."
    if recommendation == "Borderline":
        return "Send a final challenge only if the candidate is otherwise promising."
    return "Reject for this role and suggest a better-matched challenge path."


def _build_decision_risks(missing_skills: list[str], profile: dict[str, Any], proof_confidence: float) -> list[str]:
    risks: list[str] = []
    if missing_skills:
        risks.append(f"Skill gaps: {', '.join(missing_skills[:3])}.")
    if proof_confidence < 70:
        risks.append("Uncertainty: Proof Engine confidence is below the preferred threshold.")
    pa = profile.get("proofAnalysis") or {}
    fs = pa.get("file_structure")
    if not fs or (isinstance(fs, list) and len(fs) == 0):
        risks.append("Missing proof: repository file structure was not detected.")
    if not pa.get("github_readme_excerpt"):
        risks.append("Missing proof: README signal was not detected.")
    return risks or ["Low risk: core proof signals and required skill overlap are present."]


def _build_hiring_decision(
    candidate: dict[str, Any],
    profile: dict[str, Any],
    parsed_job: dict[str, Any],
    weighted_match_score: float,
    skill_overlap_score: float,
    strong_matches: list[str],
    missing_skills: list[str],
    proof_quality: float,
) -> dict[str, Any]:
    pa = profile.get("proofAnalysis") or {}
    proof_confidence = float(pa.get("confidence_score") or round((proof_quality or 0) * 100))
    confidence = round(weighted_match_score * 0.5 + skill_overlap_score * 0.3 + proof_confidence * 0.2)
    missing_core_count = len(missing_skills)
    recommendation = _get_hiring_recommendation(
        weighted_match_score, skill_overlap_score, confidence, missing_core_count
    )
    recommendation_key = recommendation.lower().replace(" ", "-")
    next_step = _get_suggested_next_step(recommendation, missing_core_count)
    proven = ", ".join(strong_matches) if strong_matches else "general project delivery"
    project_analysis = (
        f"{pa.get('project_type')} at {pa.get('complexity_level')} complexity"
        if pa.get("project_type")
        else "verified project evidence"
    )
    role = parsed_job.get("role_title") or "this role"
    risk_analysis = _build_decision_risks(missing_skills, profile, proof_confidence)
    return {
        "recommendation": recommendation,
        "recommendationKey": recommendation_key,
        "confidence": confidence,
        "justification": f"{candidate.get('name')} is rated {recommendation} for {role} because they have proven {proven}. "
        f"The project analysis shows {project_analysis}, and the match engine found {skill_overlap_score}% overlap with the required skills.",
        "riskAnalysis": risk_analysis,
        "nextStep": next_step,
    }


def _build_match_explanation(
    candidate: dict[str, Any],
    score: float,
    matched_skills: list[str],
    missing_skills: list[str],
    profile: dict[str, Any],
    parsed_job: dict[str, Any],
) -> str:
    role = parsed_job.get("role_title") or "this role"
    eb = profile.get("earnedBadges") or []
    proof = (eb[0].get("evidence") if eb else None) or candidate.get("proof")
    strongest = matched_skills[:3]
    gaps = missing_skills[:2]
    fit_level = (
        "strong fit"
        if score >= 85
        else "promising fit" if score >= 70 else "partial fit" if score >= 55 else "early fit"
    )
    if not matched_skills:
        return (
            f"{candidate.get('name')} is an {fit_level} for {role}. They have verified project proof, but the evidence does not "
            f"strongly overlap with the core requirements yet. A focused follow-up challenge should test "
            f"{', '.join(missing_skills[:3]) or 'the highest-priority job skills'}."
        )
    core = ", ".join(strongest)
    gap_sentence = (
        f" They still need evidence for {' and '.join(gaps)}, so those should be covered in the final challenge."
        if gaps
        else " They meet the core requirements with no major missing skill in the current parse."
    )
    return (
        f"{candidate.get('name')} is a {fit_level} for {role} because they have proven {core} in verified work. "
        f"The strongest evidence comes from {proof}.{gap_sentence}"
    )


def _build_growth_path(candidate: dict[str, Any], missing_skills: list[str], parsed_job: dict[str, Any]) -> dict[str, Any]:
    if missing_skills:
        next_steps = [f"Build proof for: {s}." for s in missing_skills[:4]]
        summary = f"To fully match this role, {candidate.get('name')} should close {len(missing_skills)} gap(s)."
    else:
        next_steps = [
            f"Complete a timed final challenge for {parsed_job.get('role_title') or 'this role'}.",
            "Add a short technical walkthrough explaining architecture and tradeoffs.",
        ]
        summary = f"{candidate.get('name')} has no major parsed skill gap; growth should focus on depth."
    return {
        "summary": summary,
        "missingSkills": missing_skills if missing_skills else ["No major missing skill from parsed requirements"],
        "nextSteps": list(dict.fromkeys(next_steps))[:5],
    }


def match_talent_to_job(candidate: dict[str, Any], profile: dict[str, Any], parsed_job: dict[str, Any]) -> dict[str, Any]:
    required_matches = _match_items(parsed_job.get("required_skills") or [], profile)
    nice_matches = _match_items(parsed_job.get("nice_to_have_skills") or [], profile)
    deliverable_matches = _match_items(parsed_job.get("deliverables") or [], profile)
    proof_quality = get_average_score(profile) / 100
    required_ratio = _get_match_ratio(required_matches)
    nice_ratio = _get_match_ratio(nice_matches)
    deliverable_ratio = _get_match_ratio(deliverable_matches)
    must_have_overlap_score = round(required_ratio * 100)
    semantic_similarity_score = _semantic_similarity_score(profile, parsed_job)
    proof_strength_score = _proof_strength_score(profile)
    domain_relevance_score = _domain_relevance_score(profile, parsed_job)
    integrity_confidence_score = _integrity_confidence_score(profile)
    weighted_match_score = round(
        must_have_overlap_score * 0.40
        + semantic_similarity_score * 0.25
        + proof_strength_score * 0.20
        + domain_relevance_score * 0.10
        + integrity_confidence_score * 0.05
    )
    weighted_match_score = max(0, min(100, weighted_match_score))
    skill_overlap_score = round(required_ratio * 100)
    matched_required = [m["label"] for m in required_matches if m.get("matched")]
    strong_matches = [m["label"] for m in required_matches if m.get("matched") and m.get("confidence", 0) >= 0.5]
    missing_skills = [m["label"] for m in required_matches if not m.get("matched")]
    explainable = _build_explainable_match(
        required_matches, nice_matches, deliverable_matches, weighted_match_score, profile
    )
    growth = _build_growth_path(candidate, missing_skills, parsed_job)
    sm = strong_matches if strong_matches else matched_required[:3]
    hiring = _build_hiring_decision(
        candidate,
        profile,
        parsed_job,
        weighted_match_score,
        skill_overlap_score,
        sm,
        missing_skills,
        proof_quality,
    )
    return {
        **candidate,
        "match": weighted_match_score,
        "weightedMatchScore": weighted_match_score,
        "hybridMatchScore": weighted_match_score,
        "hybridComponents": {
            "mustHaveSkillOverlap": must_have_overlap_score,
            "semanticSimilarity": semantic_similarity_score,
            "proofStrength": proof_strength_score,
            "domainRelevance": domain_relevance_score,
            "integrityConfidence": integrity_confidence_score,
            "formula": "0.40*mustHave + 0.25*semantic + 0.20*proof + 0.10*domain + 0.05*integrity",
        },
        "skillOverlapScore": skill_overlap_score,
        "niceToHaveCoverageScore": round(nice_ratio * 100),
        "deliverablesCoverageScore": round(deliverable_ratio * 100),
        "missingSkills": missing_skills,
        "growthPath": growth,
        "strongMatches": sm,
        "matchedSkills": matched_required,
        "hiringDecision": hiring,
        "explainableMatch": explainable,
        "matchExplanation": _build_match_explanation(
            candidate, weighted_match_score, sm if sm else matched_required, missing_skills, profile, parsed_job
        ),
    }
