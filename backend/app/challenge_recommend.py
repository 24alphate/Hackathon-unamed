"""Challenge catalog ranking — parity with server/index.js POST /api/challenges/recommend."""
from __future__ import annotations

import json
import re
from functools import cmp_to_key
from typing import Any

from .pipeline import run_evaluation_pipeline

# -- token / text helpers (aligned with server/index.js) --


def _tokenize_for_match(text: str) -> list[str]:
    s = re.sub(r"[^a-z0-9\s]", " ", (text or "").lower())
    return [t for t in s.split() if len(t) >= 3]


def _extract_skills_for_challenge_recommend(evaluation: dict[str, Any] | None) -> list[str]:
    if not evaluation:
        return []
    out: list[str] = []
    seen: set[str] = set()

    def add(name: str) -> None:
        n = (name or "").strip()
        if not n:
            return
        k = n.lower()
        if k in seen:
            return
        seen.add(k)
        out.append(n)

    for h in evaluation.get("skillHypotheses") or []:
        if isinstance(h, dict) and h.get("skill") and (h.get("status") in ("likely", "possible", "weak")):
            add(str(h.get("skill")))
    for s in evaluation.get("skillScores") or []:
        if isinstance(s, dict) and s.get("skill") and (float(s.get("score") or 0) >= 65):
            add(str(s.get("skill")))
    pa = evaluation.get("proofAnalysis") or {}
    if isinstance(pa.get("skills_inferred"), list):
        for x in pa["skills_inferred"]:
            add(str(x))
    return out


# Approximate Node normalizeSkillName: map token -> stable id; unknown short tokens return None
def _js_like_skill_id(raw: str) -> str | None:
    t = (raw or "").strip().lower()
    if len(t) < 3:
        return None
    return t


def _collect_employer_demand_terms(cur: Any) -> dict[str, float]:
    cur.execute("SELECT raw_description, parsed_job_json FROM jobs ORDER BY id DESC LIMIT 50")
    terms: dict[str, float] = {}

    def add_term(term: str, weight: float) -> None:
        nid = _js_like_skill_id(str(term or ""))
        if not nid:
            return
        terms[nid] = terms.get(nid, 0.0) + weight

    for row in cur.fetchall() or []:
        rawd = row["raw_description"] if hasattr(row, "keys") else row[0]
        pj = row["parsed_job_json"] if hasattr(row, "keys") else row[1]
        for t in _tokenize_for_match(str(rawd or "")):
            add_term(t, 0.5)
        parsed: dict[str, Any] | None = None
        if pj:
            try:
                parsed = json.loads(pj) if isinstance(pj, str) else None
            except (json.JSONDecodeError, TypeError):
                parsed = None
        if not isinstance(parsed, dict):
            continue
        for k in ("requiredSkills", "required_skills", "mustHaveSkills", "skills"):
            v = parsed.get(k)
            if isinstance(v, list):
                for x in v:
                    add_term(str(x), 2.0)
    return terms


def _score_challenges(
    challenges: list[dict[str, Any]],
    user_text: str,
    inferred_skills: list[str],
    employer_demand: dict[str, float],
    demand_scale: float,
) -> list[dict[str, Any]]:
    raw_token_set = set(_tokenize_for_match(user_text))
    inferred_set: set[str] = set()
    for x in inferred_skills or []:
        tid = _js_like_skill_id(str(x).lower())
        if tid:
            inferred_set.add(tid)
    token_set: set[str] = set()
    for t in raw_token_set:
        tid = _js_like_skill_id(t)
        if tid:
            token_set.add(tid)

    out: list[dict[str, Any]] = []
    for ch in challenges:
        targets = ch.get("skill_targets") or []
        if not isinstance(targets, list):
            targets = []
        reasons: list[str] = []
        score = 0.0
        for target in targets:
            ts = str(target)
            target_tokens = _tokenize_for_match(ts)
            direct_overlap = sum(1 for tok in target_tokens if tok in raw_token_set)
            if direct_overlap > 0:
                score += min(24, direct_overlap * 8)
                reasons.append(f"Direct keyword overlap: {target}")
            normalized_target = _js_like_skill_id(ts)
            if not normalized_target:
                continue
            if normalized_target in inferred_set:
                score += 32
                reasons.append(f"Aligned with proof engine skills: {target}")
                continue
            if normalized_target in token_set:
                score += 18
                reasons.append(f"Matches your profile text: {target}")
            dem = (employer_demand.get(normalized_target) or 0.0) * demand_scale
            if dem > 0:
                score += min(8, dem)
                reasons.append(f"Employer market signal: {target}")
        title_desc = f"{ch.get('title') or ''} {ch.get('description') or ''}".lower()
        lexical_hits = sum(1 for t in raw_token_set if len(t) >= 4 and t in title_desc)
        if lexical_hits > 0:
            score += min(20, lexical_hits * 3)
            reasons.append("Challenge text overlaps your profile")
        d = {**ch}
        d["recommendation_score"] = float(f"{float(score):.2f}")
        seen_r: set[str] = set()
        rr: list[str] = []
        for r in reasons:
            if r not in seen_r:
                seen_r.add(r)
                rr.append(r)
        d["recommendation_reasons"] = rr[:4]
        out.append(d)
    out.sort(key=lambda a: (-(a.get("recommendation_score") or 0.0), a.get("id") or 0))
    return out


def _session_order_tie_break(ranked: list[dict[str, Any]], session_seed: Any) -> list[dict[str, Any]]:
    try:
        s = abs(int(session_seed))
    except (TypeError, ValueError):
        s = abs(int(str(session_seed).split(".")[0] or 0)) if session_seed is not None else 0

    def cmp(a: dict[str, Any], b: dict[str, Any]) -> int:
        diff = (b.get("recommendation_score") or 0) - (a.get("recommendation_score") or 0)
        if abs(diff) > 0.15:
            return 1 if diff > 0 else -1
        aid = int(a.get("id") or 0)
        bid = int(b.get("id") or 0)
        ja = ((aid * 13 + s * 17) % 23) * 0.003
        jb = ((bid * 13 + s * 17) % 23) * 0.003
        v = (b.get("recommendation_score") or 0) + jb - (a.get("recommendation_score") or 0) - ja
        if v > 0:
            return 1
        if v < 0:
            return -1
        return 0

    return sorted(ranked, key=cmp_to_key(cmp))


def _row_to_dict(row: Any) -> dict[str, Any] | None:
    if row is None:
        return None
    if hasattr(row, "keys"):
        return {k: row[k] for k in row.keys()}
    return None


def _load_challenge_row(d: dict[str, Any]) -> dict[str, Any]:
    for jk in ("rubric_json", "skill_targets", "required_outputs"):
        v = d.get(jk)
        if isinstance(v, str) and v.strip().startswith(("{", "[")):
            try:
                d[jk] = json.loads(v)
            except json.JSONDecodeError:
                if jk == "skill_targets":
                    d[jk] = []
        elif jk == "skill_targets" and v is None:
            d[jk] = []
    st = d.get("skill_targets")
    if not isinstance(st, list):
        d["skill_targets"] = []
    return d


def has_any_evidence(
    project_description: str, explanation: str, github_url: str, live_url: str, video_url: str = ""
) -> bool:
    return bool(
        (project_description or "").strip()
        or (explanation or "").strip()
        or (github_url or "").strip()
        or (live_url or "").strip()
        or (video_url or "").strip()
    )


async def challenge_recommend_handler(
    get_db: Any, body: dict[str, Any]
) -> dict[str, Any]:
    talent_claims = str(body.get("talentClaims") or "").strip()
    explanation = str(body.get("explanation") or "").strip()
    github_url = str(body.get("githubUrl") or "").strip()
    live_url = str(body.get("liveUrl") or "").strip()
    video_url = str(body.get("videoUrl") or "").strip()
    project_description = "\n\n".join([p for p in (talent_claims, explanation) if p])

    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM challenges ORDER BY id")
        rows = cur.fetchall()
        challenges: list[dict[str, Any]] = []
        for r in rows:
            d = _row_to_dict(r)
            if d:
                challenges.append(_load_challenge_row(d))
    finally:
        conn.close()

    if not challenges:
        return {"challenges": [], "picks": [], "allRanked": []}

    inferred: list[str] = []
    evaluation_for_meta: dict[str, Any] | None = None
    if has_any_evidence(project_description, explanation, github_url, live_url, video_url):
        try:
            out = await run_evaluation_pipeline(
                {
                    "projectDescription": project_description,
                    "explanation": explanation,
                    "githubUrl": github_url,
                    "liveUrl": live_url,
                }
            )
            evaluation_for_meta = (out or {}).get("evaluation") or None
            inferred = _extract_skills_for_challenge_recommend(evaluation_for_meta)
        except Exception:
            inferred = []

    user_full = "\n".join([p for p in (talent_claims, explanation, github_url, live_url, video_url) if p])
    demand_scale = 0.28 if (len(inferred) >= 2 or len(user_full) > 120) else 0.55

    conn = get_db()
    try:
        cur = conn.cursor()
        employer_terms = _collect_employer_demand_terms(cur)
    finally:
        conn.close()

    ranked = _score_challenges(
        challenges, user_full, inferred, employer_terms, demand_scale
    )
    diversify = body.get("diversifySeed") or body.get("refreshToken")
    ordered = _session_order_tie_break(ranked, diversify)
    try:
        mp = int(body.get("maxPicks") or 5)
    except (TypeError, ValueError):
        mp = 5
    max_picks = min(20, max(1, mp)) if mp > 0 else 5

    def has_personal_signal(ch: dict[str, Any]) -> bool:
        for r in ch.get("recommendation_reasons") or []:
            if not str(r).startswith("Employer market signal"):
                return True
        return False

    relevant = [c for c in ordered if has_personal_signal(c)]
    picks = (relevant if relevant else [])[:max_picks]

    no_match = None
    if len(relevant) == 0 and len(user_full.strip()) > 20:
        no_match = (
            "None of the current challenges match your described focus. The catalog covers fintech, dashboards, checkout flows, and mobile UI. "
            "If your work is outside these areas, describe your proof directly in step 4."
        )
    meta = {
        "inferredSkills": inferred[:8],
        "employerSignalsCount": len(employer_terms),
        "totalInCatalog": len(challenges),
        "matchedCount": len(relevant),
        "maxPicks": max_picks,
        "diversifySeed": diversify,
        "skillsSource": (
            "proof_engine+text"
            if evaluation_for_meta
            else "text_only" if user_full.strip() else "none"
        ),
    }
    if no_match is not None:
        meta["noMatchReason"] = no_match
    return {
        "picks": picks,
        "allRanked": ordered,
        "challenges": picks,
        "meta": meta,
    }
