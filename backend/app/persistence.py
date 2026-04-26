"""Persist evaluations and load profiles (parity with server/persistence.js)."""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from .database import get_db


def append_audit_event(
    conn: sqlite3.Connection,
    *,
    entity_type: str,
    entity_id: int | None,
    event_type: str,
    detail: dict[str, Any],
    step_index: int = 0,
    actor_type: str = "system",
    actor_id: int | None = None,
) -> None:
    conn.execute(
        """INSERT INTO audit_trail (entity_type, entity_id, event_type, actor_type, actor_id, step_index, detail_json)
           VALUES (?,?,?,?,?,?,?)""",
        (
            entity_type,
            entity_id,
            event_type,
            actor_type,
            actor_id,
            step_index,
            json.dumps(detail),
        ),
    )


def _get_or_create_skill(cur: sqlite3.Cursor, name: str, category: str = "General") -> int:
    cur.execute("SELECT id FROM skills WHERE name = ?", (name,))
    row = cur.fetchone()
    if row:
        return int(row[0])
    cur.execute(
        "INSERT INTO skills (name, category, ontology_source) VALUES (?,?,?)",
        (name, category, "inferred"),
    )
    return int(cur.lastrowid)


def _score_to_level(score: float) -> str:
    if score >= 90:
        return "advanced"
    if score >= 75:
        return "intermediate"
    return "beginner"


def persist_submission_evaluation(
    *,
    talent_id: int,
    challenge_id: int,
    project_description: str,
    github_url: str,
    live_url: str,
    explanation: str,
    video_url: str | None,
    evaluation: dict[str, Any],
    github_evidence_meta: dict[str, Any],
) -> dict[str, int]:
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO submissions (challenge_id, talent_id, project_description, github_url, live_url, explanation, video_url)
               VALUES (?,?,?,?,?,?,?)""",
            (challenge_id, talent_id, project_description, github_url, live_url, explanation, video_url),
        )
        submission_id = int(cur.lastrowid)

        pa = evaluation.get("proofAnalysis") or {}
        src = github_evidence_meta.get("source")
        unc = evaluation.get("uncertainty") or {}
        missing = unc.get("missing") or []
        auth_risk = "low" if src == "github" else "high" if len(missing) > 2 else "medium"

        cur.execute(
            """INSERT INTO evidence_analyses (submission_id, project_type, detected_features_json, file_structure_json, readme_signal, authenticity_risk, confidence_score, full_eval_json)
               VALUES (?,?,?,?,?,?,?,?)""",
            (
                submission_id,
                pa.get("project_type"),
                json.dumps(pa.get("features_detected") or []),
                json.dumps(pa.get("file_structure") or []),
                pa.get("github_readme_excerpt") or "",
                auth_risk,
                pa.get("confidence_score"),
                json.dumps(evaluation),
            ),
        )
        append_audit_event(
            conn,
            entity_type="submission",
            entity_id=submission_id,
            event_type="evaluation_completed",
            step_index=1,
            detail={
                "project_type": pa.get("project_type"),
                "confidence_score": pa.get("confidence_score"),
                "authenticity_risk": auth_risk,
                "evidenceExtraction": evaluation.get("evidenceExtraction"),
            },
        )

        cur.execute("DELETE FROM inferred_skills WHERE submission_id = ?", (submission_id,))
        for row in evaluation.get("skillScores") or []:
            sk_id = _get_or_create_skill(cur, row["skill"], "Inferred")
            conf = min(1.0, max(0.0, float(row.get("score") or 0) / 100))
            cur.execute(
                """INSERT INTO inferred_skills (talent_id, submission_id, skill_id, confidence, evidence_json, level)
                   VALUES (?,?,?,?,?,?)""",
                (
                    talent_id,
                    submission_id,
                    sk_id,
                    conf,
                    json.dumps({"evidence": row.get("evidence"), "score": row.get("score")}),
                    _score_to_level(float(row.get("score") or 0)),
                ),
            )
        append_audit_event(
            conn,
            entity_type="submission",
            entity_id=submission_id,
            event_type="skills_inferred",
            step_index=2,
            detail={"skillScores": evaluation.get("skillScores") or []},
        )

        cur.execute("DELETE FROM awarded_badges WHERE submission_id = ?", (submission_id,))
        for b in evaluation.get("earnedBadges") or []:
            title = b.get("title") or ""
            cur.execute("SELECT id FROM badges WHERE name = ?", (title,))
            badge = cur.fetchone()
            if badge:
                cur.execute(
                    """INSERT INTO awarded_badges (talent_id, badge_id, submission_id, confidence, proof_strength_score)
                       VALUES (?,?,?,?,?)""",
                    (
                        talent_id,
                        int(badge[0]),
                        submission_id,
                        min(1.0, float(b.get("score") or 0) / 100),
                        float(b.get("score") or 0),
                    ),
                )
                append_audit_event(
                    conn,
                    entity_type="badge",
                    entity_id=int(badge[0]),
                    event_type="badge_awarded",
                    step_index=3,
                    detail={
                        "submission_id": submission_id,
                        "talent_id": talent_id,
                        "title": title,
                        "confidence": b.get("score"),
                    },
                )
            else:
                cur.execute("SELECT id FROM skills WHERE name = ?", (title.replace("Verified ", ""),))
                skill = cur.fetchone()
                cur.execute(
                    "INSERT INTO badges (name, skill_id, level, threshold_rules_json) VALUES (?,?,?,?)",
                    (title, int(skill[0]) if skill else None, "1", '{"dynamic":true}'),
                )
                bid = int(cur.lastrowid)
                cur.execute(
                    """INSERT INTO awarded_badges (talent_id, badge_id, submission_id, confidence, proof_strength_score)
                       VALUES (?,?,?,?,?)""",
                    (
                        talent_id,
                        bid,
                        submission_id,
                        min(1.0, float(b.get("score") or 0) / 100),
                        float(b.get("score") or 0),
                    ),
                )
                append_audit_event(
                    conn,
                    entity_type="badge",
                    entity_id=bid,
                    event_type="badge_created_and_awarded",
                    step_index=3,
                    detail={
                        "submission_id": submission_id,
                        "talent_id": talent_id,
                        "title": title,
                        "confidence": b.get("score"),
                    },
                )

        conn.commit()
        return {"submissionId": submission_id}
    finally:
        conn.close()


def build_profile_from_db(talent_id: int) -> dict[str, Any]:
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM submissions WHERE talent_id = ? ORDER BY submitted_at DESC LIMIT 1",
            (talent_id,),
        )
        sub = cur.fetchone()
        if not sub:
            return {
                "skillScores": [],
                "earnedBadges": [],
                "proofAnalysis": None,
                "employerSummary": "",
                "uncertainty": {"missing": []},
            }
        sid = int(sub[0])

        cur.execute(
            """SELECT s.name as skill, i.confidence * 100 as score, json_extract(i.evidence_json, '$.evidence') as evidence
               FROM inferred_skills i
               JOIN skills s ON s.id = i.skill_id
               WHERE i.submission_id = ?""",
            (sid,),
        )
        skills = cur.fetchall()
        cur.execute(
            """SELECT b.name as title, ab.confidence * 100 as score, b.name as evidence
               FROM awarded_badges ab
               JOIN badges b ON b.id = ab.badge_id
               WHERE ab.submission_id = ?""",
            (sid,),
        )
        badge_rows = cur.fetchall()
        earned_badges = [{"title": r[0], "score": r[1], "evidence": r[2]} for r in badge_rows]

        cur.execute("SELECT * FROM evidence_analyses WHERE submission_id = ?", (sid,))
        ea = cur.fetchone()
        if not ea:
            return {
                "skillScores": [],
                "earnedBadges": [],
                "proofAnalysis": None,
                "employerSummary": "",
                "uncertainty": {"missing": []},
            }
        full: dict[str, Any] | None
        try:
            raw_full = ea["full_eval_json"] if isinstance(ea, sqlite3.Row) else ea[8]
            full = json.loads(raw_full or "{}")
        except (json.JSONDecodeError, TypeError, IndexError, KeyError):
            full = None

        if isinstance(ea, sqlite3.Row):
            conf = ea["confidence_score"]
            pt = ea["project_type"]
            fsj = ea["file_structure_json"]
            rss = ea["readme_signal"]
        else:
            conf, pt, fsj, rss = ea[7], ea[2], ea[4], ea[5]

        conf = float(conf) if conf is not None else 70.0
        confidence_100 = conf * 100 if conf <= 1 else conf

        return {
            "skillScores": [
                {"skill": r[0], "score": r[1], "evidence": r[2] or ""} for r in skills
            ],
            "earnedBadges": earned_badges,
            "proofAnalysis": (full or {}).get("proofAnalysis")
            or {
                "project_type": pt or "web",
                "complexity_level": "intermediate",
                "confidence_score": confidence_100,
                "file_structure": json.loads(fsj or "[]"),
                "github_readme_excerpt": rss,
            },
            "employerSummary": (full or {}).get("employerSummary") or "",
            "uncertainty": (full or {}).get("uncertainty") or {"missing": []},
        }
    finally:
        conn.close()


def get_talent_roster_for_matching() -> list[dict[str, Any]]:
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT u.id, u.name, u.country, tp.headline
               FROM users u
               JOIN talent_profiles tp ON tp.user_id = u.id
               WHERE u.role = 'talent'
               ORDER BY u.id"""
        )
        rows = cur.fetchall()
        return [{"id": r[0], "name": r[1], "country": r[2], "headline": r[3]} for r in rows]
    finally:
        conn.close()
