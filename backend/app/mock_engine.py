"""
Mock / fallback evaluation (parity with server/evaluationCore.js).
Used when OpenAI is unavailable or returns invalid output.
"""
from __future__ import annotations

import re
from typing import Any

from .evidence_extractor import extract_evidence
from .skill_inference import infer_skills_from_evidence

_SIGNALS = [
    {
        "skill": "Responsive UI Design",
        "keywords": ["responsive", "mobile", "desktop", "layout", "landing page"],
        "evidence": "Submission describes a responsive interface and landing-page sections.",
    },
    {
        "skill": "API Integration",
        "keywords": ["api", "fetch", "endpoint", "integration", "data"],
        "evidence": "Submission mentions API-powered data or endpoint integration.",
    },
    {
        "skill": "Form Handling",
        "keywords": ["form", "validation", "contact", "submit", "email"],
        "evidence": "Submission describes a user input or contact form flow.",
    },
    {
        "skill": "Component Structure",
        "keywords": ["component", "react", "reuse", "section", "state"],
        "evidence": "Submission references React structure or reusable UI sections.",
    },
    {
        "skill": "Deployment Literacy",
        "keywords": ["deploy", "live", "vite", "vercel", "netlify"],
        "evidence": "Submission includes a live URL or describes deployment.",
    },
]


def normalize_submission(body: dict[str, Any] | None) -> dict[str, str]:
    b = body or {}
    return {
        "projectDescription": str(b.get("projectDescription") or "").strip(),
        "githubUrl": str(b.get("githubUrl") or "").strip(),
        "liveUrl": str(b.get("liveUrl") or "").strip(),
        "explanation": str(b.get("explanation") or "").strip(),
    }


def _slug(value: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", str(value).lower()).strip("_")
    return s


def _build_evidence_object(
    submission: dict[str, str], github_evidence: dict[str, Any], extraction: dict[str, Any]
) -> dict[str, Any]:
    text = f"{submission.get('projectDescription', '')} {submission.get('explanation', '')} {github_evidence.get('readme', '')}".lower()
    project_type = "dashboard" if "dashboard" in text else "API app" if "api" in text and "landing" not in text else "landing page"
    domain = (
        "fintech / payments"
        if "fintech" in text or "payment" in text or "transaction" in text
        else "general web product"
    )
    implemented = extraction.get("features_detected") or []
    src = github_evidence.get("source")
    ghu = submission.get("githubUrl") or ""
    ghl = submission.get("liveUrl") or ""
    expl = submission.get("explanation") or ""
    proof = [
        "GitHub URL submitted" if ghu else "",
        "Live demo URL submitted" if ghl else "",
        "README content fetched from GitHub"
        if github_evidence.get("readme") and src == "github"
        else "README content simulated (GitHub fetch unavailable)"
        if github_evidence.get("readme") and src == "simulated"
        else "",
        (
            "Repository file tree fetched from GitHub"
            if src == "github"
            else "Repository file structure simulated or partial"
        )
        if (github_evidence.get("fileStructure") or []).__len__() and src
        else "",
        "Candidate explanation submitted" if expl else "",
    ]
    proof = [p for p in proof if p]
    weak: list[str] = []
    if src == "simulated" and ghu:
        weak.append("Repository contents are simulated: GitHub API fetch failed, URL invalid, or repo is private")
    if len(expl) < 180:
        weak.append("Candidate explanation is short")
    missing: list[str] = []
    if not ghu:
        missing.append("No GitHub repository link")
    if not ghl:
        missing.append("No live demo link")
    if not expl:
        missing.append("No implementation explanation")
    auth = [
        "README/tree fetched via public API; code was not executed in Unmapped's sandbox"
        if src == "github"
        else "Repository text was not fetched from GitHub; verify the link manually"
        if src == "simulated" and ghu
        else "",
        "Runtime behavior cannot be inspected" if not ghl else "",
    ]
    auth = [a for a in auth if a]
    return {
        "project_type": project_type,
        "domain_context": domain,
        "implemented_features": implemented or ["basic project flow described"],
        "technical_artifacts": extraction.get("technical_artifacts") or [],
        "proof_signals": list(dict.fromkeys([*proof, *(extraction.get("proof_signals") or [])])),
        "weak_signals": [w for w in weak if w],
        "missing_evidence": list(dict.fromkeys([*missing, *(extraction.get("missing_evidence") or [])])),
        "authenticity_risks": list(dict.fromkeys([*auth, *(extraction.get("authenticity_risks") or [])])),
    }


def _feature_matches_skill(feature: str, skill: str) -> bool:
    pair = f"{feature} {skill}".lower()
    return (
        ("api" in pair and "integration" in pair)
        or ("responsive" in pair and "ui" in pair)
        or ("form" in pair and "handling" in pair)
        or ("component" in pair and ("structure" in pair or "design" in pair))
    )


def _infer_feature_nodes(submission: dict[str, str], github_evidence: dict[str, Any]) -> list[dict[str, Any]]:
    text = f"{submission.get('projectDescription', '')} {submission.get('explanation', '')} {github_evidence.get('readme', '')} {' '.join(github_evidence.get('fileStructure') or [])}".lower()
    out: list[dict[str, Any] | None] = [
        {
            "id": "api_calls",
            "type": "feature",
            "label": "API calls",
            "summary": "Project evidence references API/fetch behavior.",
            "source": "readme",
            "reason": "README/explanation mention API-backed data loading or endpoint integration.",
        }
        if "api" in text or "fetch" in text or "endpoint" in text
        else None,
        {
            "id": "responsive_layout",
            "type": "feature",
            "label": "Responsive layout",
            "summary": "Project evidence references mobile/responsive layout behavior.",
            "source": "submission_explanation",
            "reason": "Candidate explanation describes responsive or mobile-first behavior.",
        }
        if "responsive" in text or "mobile" in text
        else None,
        {
            "id": "form_handling",
            "type": "feature",
            "label": "Form handling",
            "summary": "Project evidence references validated forms or contact submission.",
            "source": "readme",
            "reason": "README/explanation mention form validation or contact flow.",
        }
        if "form" in text or "validation" in text or "contact" in text
        else None,
        {
            "id": "component_structure",
            "type": "feature",
            "label": "Component structure",
            "summary": "File structure suggests reusable UI components.",
            "source": "file_structure",
            "reason": "File structure includes component-oriented source paths.",
        }
        if "component" in text or "src/components" in text
        else None,
    ]
    return [x for x in out if x]


def _build_evidence_graph(
    submission: dict[str, str], github_evidence: dict[str, Any], skill_scores: list[dict[str, Any]]
) -> dict[str, Any]:
    evidence_nodes = [
        {
            "id": "submission_explanation",
            "type": "evidence",
            "label": "Candidate explanation",
            "summary": submission.get("explanation") or "No explanation submitted",
        },
        {
            "id": "readme",
            "type": "evidence",
            "label": "README evidence",
            "summary": github_evidence.get("readme") or "",
        },
        {
            "id": "file_structure",
            "type": "evidence",
            "label": "File structure",
            "summary": ", ".join(github_evidence.get("fileStructure") or [])
            or "No file structure available",
        },
    ]
    feature_nodes = _infer_feature_nodes(submission, github_evidence)
    skill_nodes = [
        {
            "id": _slug(s["skill"]),
            "type": "skill",
            "label": s["skill"],
            "summary": s["evidence"],
        }
        for s in skill_scores
        if float(s.get("score") or 0) >= 58
    ]
    src = github_evidence.get("source")
    ghu = submission.get("githubUrl") or ""
    risk_nodes: list[dict[str, Any]] = []
    if src == "simulated" and ghu:
        risk_nodes.append(
            {
                "id": "simulated_repo_risk",
                "type": "risk",
                "label": "Simulated repository evidence",
                "summary": "README and file structure were not fetched from GitHub; treat as low-trust until verified.",
            }
        )
    elif src == "github":
        risk_nodes.append(
            {
                "id": "unexecuted_code_risk",
                "type": "risk",
                "label": "Evidence not executed",
                "summary": "Unmapped read public metadata only; a human should still run the app and read code before hire.",
            }
        )
    edges: list[dict[str, str]] = []
    for fe in feature_nodes:
        edges.append(
            {
                "from": fe["source"],
                "to": fe["id"],
                "type": "indicates",
                "reason": fe["reason"],
            }
        )
    for skn in skill_nodes:
        sk_label = skn.get("label") or ""
        linked = [f for f in feature_nodes if _feature_matches_skill(f["label"], sk_label)]
        for fe in (linked or feature_nodes[:1]):
            edges.append(
                {
                    "from": fe["id"],
                    "to": skn["id"],
                    "type": "proves" if linked else "supports",
                    "reason": (
                        f"{fe['label']} is observable evidence for {sk_label}."
                        if linked
                        else f"{fe['label']} weakly supports {sk_label}, but more direct proof would increase confidence."
                    ),
                }
            )
    if src == "simulated" and ghu:
        edges.append(
            {
                "from": "simulated_repo_risk",
                "to": "file_structure",
                "type": "limits_confidence",
                "reason": "File list was not confirmed against GitHub, so a human should verify the real repository.",
            }
        )
    elif src == "github":
        edges.append(
            {
                "from": "unexecuted_code_risk",
                "to": "readme",
                "type": "limits_confidence",
                "reason": "Fetched text does not prove runtime behavior; open the live demo to raise confidence.",
            }
        )
    fn_flat = []
    for f in feature_nodes:
        d = {k: v for k, v in f.items() if k not in ("source", "reason")}
        fn_flat.append(d)
    return {"nodes": evidence_nodes + fn_flat + skill_nodes + risk_nodes, "edges": edges}


def _build_claim_proof_analysis(
    submission: dict[str, str], github_evidence: dict[str, Any], skill_scores: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    text = f"{submission.get('projectDescription', '')} {submission.get('explanation', '')}".lower()
    features = _infer_feature_nodes(submission, github_evidence)
    out: list[dict[str, Any]] = []
    for s in skill_scores:
        if float(s.get("score") or 0) < 58:
            continue
        token = s["skill"].lower().split(" ")[0]
        rel = [f["label"] for f in features if _feature_matches_skill(f["label"], s["skill"])]
        out.append(
            {
                "skill": s["skill"],
                "claim": (
                    f"Candidate text appears to claim or reference {s['skill']}."
                    if token in text
                    else f"Candidate did not explicitly name {s['skill']}; inference is based on project evidence."
                ),
                "observed_evidence": [
                    s["evidence"],
                    "README/file evidence references related implementation"
                    if github_evidence.get("readme") and github_evidence.get("source") != "none"
                    else "",
                    "Live demo URL provided for employer inspection" if submission.get("liveUrl") else "",
                ],
                "derived_features": rel if rel else ["Related implementation feature inferred from submission"],
                "inference": f"{s['skill']} is inferred because observed evidence maps to {', '.join(rel) or 'related implementation behavior'}, not because of a standalone claim.",
                "confidence": float(s.get("score") or 0),
                "risk_if_wrong": "low" if s.get("score", 0) >= 85 else "medium" if s.get("score", 0) >= 70 else "high",
            }
        )
        out[-1]["observed_evidence"] = [x for x in out[-1]["observed_evidence"] if x]
    return out


def _categorize_skill_name(skill: str) -> str:
    label = skill.lower()
    if "api" in label or "backend" in label or "integration" in label:
        return "Backend/API"
    if "data" in label or "transaction" in label or "table" in label:
        return "Data Handling"
    if "structure" in label or "deployment" in label or "architecture" in label or "component" in label:
        return "System Design"
    return "UI/Frontend"


def _build_detailed_skills(skill_scores: list[dict[str, Any]], github_evidence: dict[str, Any]) -> list[dict[str, Any]]:
    fs = github_evidence.get("fileStructure") or []
    out: list[dict[str, Any]] = []
    for s in skill_scores:
        if float(s.get("score") or 0) < 58:
            continue
        sc = float(s.get("score") or 0)
        out.append(
            {
                "skill_name": s["skill"],
                "category": _categorize_skill_name(s["skill"]),
                "confidence_score": sc,
                "evidence_used": [s["evidence"], *fs[:2]],
                "why_it_proves_skill": f"{s['evidence']} This is observable project evidence, not merely a declared skill.",
                "what_would_increase_confidence": "Fetch and inspect the real repository, run the live demo, and review implementation commits.",
                "level": "advanced" if sc >= 90 else "intermediate" if sc >= 75 else "beginner",
            }
        )
    return out


def _build_rubric_evaluation(
    submission: dict[str, str], github_evidence: dict[str, Any], skill_scores: list[dict[str, Any]]
) -> list[dict[str, Any]]:

    def score_for(name: str, fallback: float) -> float:
        for sk in skill_scores:
            if name in sk.get("skill", "").lower():
                return float(sk.get("score") or fallback)
        return fallback

    ghu, ghl = submission.get("githubUrl"), submission.get("liveUrl")
    pd = (submission.get("projectDescription") or "").lower()
    fs = github_evidence.get("fileStructure") or []
    return [
        {
            "dimension": "functionality",
            "score": max(score_for("api", 62), score_for("form", 62)),
            "reasoning": "Scored from described working API/form behavior and submitted proof links.",
        },
        {
            "dimension": "completeness",
            "score": 86 if ghu and ghl else 62,
            "reasoning": "Completeness improves when both repository and live proof are available.",
        },
        {
            "dimension": "UI/UX quality",
            "score": score_for("responsive", 70),
            "reasoning": "Responsive layout and clear landing/dashboard patterns are observable in the submitted description.",
        },
        {
            "dimension": "responsiveness",
            "score": score_for("responsive", 60),
            "reasoning": "Mobile-first or responsive behavior must be present in the output evidence.",
        },
        {
            "dimension": "API/data handling",
            "score": score_for("api", 45),
            "reasoning": "API/data score depends on explicit endpoint, fetch, loading, or transaction-data proof.",
        },
        {
            "dimension": "code organization",
            "score": score_for("component", 72 if fs else 45),
            "reasoning": "Component/file structure evidence increases confidence in organization.",
        },
        {
            "dimension": "real-world relevance",
            "score": 88 if "fintech" in pd else 68,
            "reasoning": "Domain-specific project context increases real-world relevance.",
        },
        {
            "dimension": "evidence quality",
            "score": min(
                95,
                45 + (20 if ghu else 0) + (20 if ghl else 0) + (10 if fs else 0),
            ),
            "reasoning": "Evidence quality is based on proof links, README/file structure, and explanation depth.",
        },
    ]


def _build_badge_decisions(
    skill_scores: list[dict[str, Any]],
    submission: dict[str, str],
    github_evidence: dict[str, Any],
    extraction: dict[str, Any],
) -> list[dict[str, Any]]:
    rub = _build_rubric_evaluation(submission, github_evidence, skill_scores)
    rubric_avg = round(sum(r["score"] for r in rub) / len(rub))
    risk_tokens = set(extraction.get("authenticity_risks") or [])
    integrity_risk = (
        "high"
        if (
            "repository_evidence_simulated" in risk_tokens
            or "github_link_not_verified_by_api" in risk_tokens
            or "no_repository_evidence" in risk_tokens
        )
        else "medium"
        if "short_or_low_detail_explanation" in risk_tokens
        else "low"
    )

    def rubric_for_skill(skill_name: str) -> int:
        s = skill_name.lower()
        if "api" in s:
            keys = {"functionality", "API/data handling", "evidence quality"}
        elif "form" in s:
            keys = {"functionality", "responsiveness", "evidence quality"}
        elif "responsive" in s or "ui" in s:
            keys = {"UI/UX quality", "responsiveness", "evidence quality"}
        elif "deployment" in s:
            keys = {"completeness", "real-world relevance", "evidence quality"}
        else:
            keys = {"code organization", "functionality", "evidence quality"}
        rows = [r["score"] for r in rub if r["dimension"] in keys]
        return round(sum(rows) / len(rows)) if rows else rubric_avg

    out: list[dict[str, Any]] = []
    for s in skill_scores[:6]:
        confidence = float(s.get("score") or 0)
        rubric_score = float(rubric_for_skill(str(s.get("skill") or "")))
        awarded = (
            rubric_score >= 75
            and confidence >= 80
            and integrity_risk != "high"
        )
        level = "advanced" if confidence >= 92 and rubric_score >= 88 else "intermediate" if confidence >= 86 and rubric_score >= 80 else "beginner"
        out.append(
            {
                "badge_name": f"Verified {s['skill']}",
                "badge_level": level,
                "required_evidence": [
                    "rubric_score >= 75",
                    "confidence >= 80",
                    "integrity_risk != high",
                    "observable feature-level evidence",
                ],
                "evidence_satisfied": [
                    s["evidence"],
                    f"rubric_score={int(rubric_score)}",
                    f"confidence={int(confidence)}",
                    f"integrity_risk={integrity_risk}",
                    "GitHub link present" if submission.get("githubUrl") else "",
                    "Live demo present" if submission.get("liveUrl") else "",
                ],
                "confidence": int(confidence),
                "why_awarded": (
                    f"Awarded: rubric {int(rubric_score)}, confidence {int(confidence)}, integrity risk {integrity_risk}."
                    if awarded
                    else (
                        f"Not enough proof: requires rubric>=75, confidence>=80, and non-high integrity risk; "
                        f"got rubric={int(rubric_score)}, confidence={int(confidence)}, integrity_risk={integrity_risk}."
                    )
                ),
                "why_not_higher_level": (
                    "Not enough proof for higher level: increase rubric evidence quality and confidence with stronger verified artifacts."
                    if awarded and level != "advanced"
                    else "Advanced level reserved for stronger evidence depth and consistently high rubric performance."
                    if awarded and level == "advanced"
                    else "Not awarded; higher levels are blocked until baseline proof thresholds are met."
                ),
            }
        )
        out[-1]["evidence_satisfied"] = [x for x in out[-1]["evidence_satisfied"] if x]
    return out


def _build_evaluation_uncertainty(submission: dict[str, str], github_evidence: dict[str, Any]) -> dict[str, Any]:
    src = github_evidence.get("source")
    ghu, ghl = submission.get("githubUrl"), submission.get("liveUrl")
    return {
        "known": [
            x
            for x in [
                "Submitted project text was analyzed",
                "GitHub URL exists" if ghu else "",
                "Live demo URL exists" if ghl else "",
            ]
            if x
        ],
        "assumptions": [
            "README and file tree were fetched from public GitHub metadata"
            if src == "github"
            else "README and file tree are simulated because GitHub fetch did not complete"
            if src == "simulated" and ghu
            else "Repository URL absent or not parsed"
        ],
        "missing": [x for x in [not ghu and "Repository code" or "", not ghl and "Runtime behavior" or "", "Human code review"] if x != ""],
    }


def _describe_github_in_reasoning(submission: dict[str, str], github_evidence: dict[str, Any]) -> str:
    if not submission.get("githubUrl"):
        return "with no repository link"
    src = github_evidence.get("source")
    if src == "github":
        return "fetched README and repository file tree from GitHub"
    if src == "simulated":
        return "simulated README and file structure (GitHub fetch was not used or failed)"
    return "no repository text"


def _build_skill_graph(
    skill_scores: list[dict[str, Any]], features: list[str], project_type: str
) -> list[dict[str, Any]]:
    buckets: dict[str, list[dict[str, Any]]] = {
        "UI/Frontend": [],
        "Backend/API": [],
        "Data Handling": [],
        "System Design": [],
    }
    for s in skill_scores:
        label = s["skill"].lower()
        if "api" in label or "backend" in label or "integration" in label:
            buckets["Backend/API"].append(s)
        elif "data" in label or "transaction" in label or "table" in label:
            buckets["Data Handling"].append(s)
        elif "structure" in label or "deployment" in label or "architecture" in label:
            buckets["System Design"].append(s)
        else:
            buckets["UI/Frontend"].append(s)
    if any("data" in f or "transaction" in f for f in features):
        buckets["Data Handling"].append(
            {"skill": "Data Presentation", "score": 78 if project_type == "dashboard" else 55}
        )
    if any("component" in f for f in features):
        buckets["System Design"].append({"skill": "Component Organization", "score": 72})
    result: list[dict[str, Any]] = []
    for category, sks in buckets.items():
        if not sks:
            result.append({"category": category, "score": 0, "skills": []})
        else:
            avg = sum(float(x.get("score") or 0) for x in sks) / len(sks)
            names: list[str] = []
            for x in sks:
                if isinstance(x, dict) and "skill" in x:
                    names.append(str(x["skill"]))
                else:
                    names.append(str(x))
            result.append({"category": category, "score": round(avg), "skills": names})
    return result


def _build_mock_proof_analysis(
    submission: dict[str, str],
    github_evidence: dict[str, Any],
    skill_scores: list[dict[str, Any]],
    extraction: dict[str, Any],
) -> dict[str, Any]:
    text = f"{submission.get('projectDescription', '')} {submission.get('explanation', '')} {github_evidence.get('readme', '')}".lower()
    features = [
        "responsive layout" if "responsive" in text or "mobile" in text else "",
        "API-backed data loading" if "api" in text or "fetch" in text else "",
        "validated form flow" if "form" in text or "validation" in text else "",
        "transaction/dashboard interface" if "dashboard" in text or "transaction" in text else "",
        "componentized UI structure" if "component" in text or "react" in text else "",
        "live deployment" if submission.get("liveUrl") else "",
    ]
    features = [f for f in features if f]
    project_type = extraction.get("project_type") or (
        "dashboard" if "dashboard" in text else "API app" if "api" in text and "landing" not in text else "landing page"
    )
    ghu, ghl = submission.get("githubUrl"), submission.get("liveUrl")
    fs = github_evidence.get("fileStructure") or []
    signal_count = len(features) + (1 if ghu else 0) + (1 if ghl else 0)
    complexity = "advanced" if signal_count >= 6 else "intermediate" if signal_count >= 4 else "beginner"
    confidence = min(96, max(42, 38 + signal_count * 8 + (8 if fs else 0)))
    skills_inferred = [s["skill"] for s in skill_scores if float(s.get("score") or 0) >= 58]
    return {
        "project_type": project_type,
        "features_detected": extraction.get("features_detected") or features or ["basic project structure"],
        "complexity_level": complexity,
        "skills_inferred": skills_inferred,
        "confidence_score": confidence,
        "reasoning": (
            f"The Proof Engine classified this as a {project_type} because the evidence references "
            f"{', '.join(features[:4]) or 'a basic implementation'}. Confidence is based on the written explanation, "
            f"{_describe_github_in_reasoning(submission, github_evidence)}"
            f"{' and a live demo link' if ghl else ' with no live demo link'}."
        ),
        "github_readme_excerpt": (github_evidence.get("readme") or "")[:420],
        "file_structure": fs,
        "skill_graph": _build_skill_graph(skill_scores, features, project_type),
    }


def mock_evaluate(submission: dict[str, str], github_evidence: dict[str, Any]) -> dict[str, Any]:
    text = f"{submission.get('projectDescription', '')} {submission.get('explanation', '')}".lower()
    ghu = submission.get("githubUrl") or ""
    ghl = submission.get("liveUrl") or ""
    has_github = bool(re.match(r"^https?://(www\.)?github\.com/", ghu, re.I))
    has_live = bool(re.match(r"^https?://", ghl, re.I))

    extraction = extract_evidence(submission, github_evidence)
    inferred = infer_skills_from_evidence(extraction)
    skill_scores: list[dict[str, Any]] = inferred.get("skillScores") or []
    if not skill_scores:
        # Last-resort fallback if feature extraction produced nothing usable.
        skill_scores = [
            {
                "skill": "Early Stage Product Implementation",
                "score": 40,
                "evidence": "Insufficient feature-level proof was detected from repository/live artifacts.",
            }
        ]

    detected = [{"name": s["skill"], "evidence": s["evidence"]} for s in skill_scores if s["score"] >= 58]
    badge_decisions = _build_badge_decisions(skill_scores, submission, github_evidence, extraction)
    earned = [
        {
            "title": d["badge_name"],
            "score": d["confidence"],
            "evidence": d["why_awarded"],
        }
        for d in badge_decisions
        if str(d.get("why_awarded", "")).lower().startswith("awarded:")
    ][:3]
    strengths = [
        "Includes a GitHub proof link for code inspection." if has_github else "Explains the project intent in a structured way.",
        "Includes a live URL that an employer can inspect." if has_live else "The written explanation gives an initial review path.",
        "Capabilities are inferred from project artifacts and described behaviors.",
    ]
    weaknesses = [
        w
        for w in [
            "" if has_github else "No GitHub URL was provided, so code structure cannot be verified.",
            "" if has_live else "No live demo URL was provided, so runtime behavior cannot be checked.",
            "The explanation is short; richer evidence would improve confidence." if len(text) < 180 else "",
        ]
        if w
    ]

    return {
        "evidenceObject": _build_evidence_object(submission, github_evidence, extraction),
        "evidenceGraph": _build_evidence_graph(submission, github_evidence, skill_scores),
        "claimProofAnalysis": _build_claim_proof_analysis(submission, github_evidence, skill_scores),
        "inferredSkillsDetailed": _build_detailed_skills(skill_scores, github_evidence),
        "rubricEvaluation": _build_rubric_evaluation(submission, github_evidence, skill_scores),
        "badgeDecisions": badge_decisions,
        "uncertainty": _build_evaluation_uncertainty(submission, github_evidence),
        "proofAnalysis": _build_mock_proof_analysis(submission, github_evidence, skill_scores, extraction),
        "evidenceExtraction": extraction,
        "skillInferenceChains": inferred.get("chains") or [],
        "detectedCapabilities": detected,
        "skillScores": skill_scores,
        "earnedBadges": earned,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "evidenceExplanation": "Fallback evaluation used keyword and proof-link signals from the project description, GitHub URL, live URL, and explanation. It does not accept the candidate's labels as proof by themselves.",
        "employerSummary": (
            f"This candidate shows observable evidence for {', '.join(c['name'] for c in detected[:3]) or 'early-stage frontend capability'}. "
            "Review the submitted links and use a final work sample before hiring."
        ),
        "source": "mock",
    }


def mock_parse_job(job_post: str) -> dict[str, Any]:
    text = (job_post or "").lower()
    is_dashboard = "dashboard" in text
    is_fintech = "fintech" in text or "payment" in text or "transaction" in text
    is_frontend = "frontend" in text or "front-end" in text or "ui" in text
    required_skills = [
        "responsive frontend UI" if is_frontend else "user-facing product interface",
        "dashboard layout and navigation" if is_dashboard else "clear landing page structure",
        "transaction or financial data presentation" if is_fintech else "domain-specific data presentation",
        "API integration",
        "form validation",
        "mobile-first design",
    ]
    nice = [
        "loading and empty states",
        "accessible interaction patterns",
        "component reuse",
        "deployment hygiene",
    ]
    deliverables = [
        "Live demo URL",
        "GitHub repository with readable structure",
        "Transaction list with filters" if is_dashboard else "Primary page flow with conversion action",
        "Short implementation explanation",
    ]
    return {
        "role_title": (
            "Frontend Developer for Fintech Product"
            if is_fintech
            else "Frontend Developer for Product UI"
        ),
        "business_context": (
            "Fintech product requiring trusted transaction or payment-facing UI."
            if is_fintech
            else "Web product requiring clear user-facing delivery."
        ),
        "required_deliverables": deliverables,
        "required_capabilities": required_skills,
        "technical_skills": [
            "responsive UI implementation",
            "API integration",
            "form validation",
            "dashboard/data presentation" if is_dashboard else "landing page composition",
        ],
        "soft_contextual_skills": [
            "communicates implementation tradeoffs",
            "understands user trust and clarity",
            "can work from a vague product brief",
        ],
        "must_have": required_skills[:4],
        "nice_to_have": nice,
        "ambiguity_questions": [
            q
            for q in [
                "What API endpoints or sample data will be provided?",
                "Is this a dashboard, landing page, or both?",
                "What level of browser/device support is required?",
                "What payment or compliance constraints matter for the final product?",
            ]
            if len(job_post) < 220 or "API" in q
        ],
        "uncertainty": {
            "known": [
                f"Employer needs {'frontend' if is_frontend else 'product UI'} capability",
                "Fintech context is stated" if is_fintech else "Business domain is only lightly specified",
            ],
            "assumptions": [
                "Assuming a web-based deliverable",
                "Assuming proof-of-work challenge should test observable output",
            ],
            "missing": [
                "Exact data source/API contract",
                "Timeline and seniority expectations",
                "Design system constraints",
            ],
            "human_review_needed": [
                "Confirm deliverables with employer",
                "Review final challenge scope before sending",
            ],
        },
        "required_skills": required_skills,
        "nice_to_have_skills": nice,
        "deliverables": deliverables,
        "test_challenge": (
            "Build a transaction dashboard with a responsive layout, filterable transaction list, API-backed data loading, validation for one user action, and a receipt download interaction."
            if is_dashboard
            else "Build a responsive product page with API-backed content, reusable sections, a validated contact form, and a live deployment."
        ),
        "matching_weights": {
            "required_skills": 0.5,
            "nice_to_have_skills": 0.15,
            "deliverables": 0.2,
            "proof_quality": 0.15,
        },
        "source": "mock",
    }
