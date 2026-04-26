"""FastAPI app — same routes as server/index.js."""
from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import API_PORT, GITHUB_TOKEN, OPENAI_API_KEY
from .database import get_db, init_db
from .match_service import match_talent_to_job
from .persistence import (
    append_audit_event,
    build_profile_from_db,
    get_talent_roster_for_matching,
    persist_submission_evaluation,
)
from .pipeline import run_evaluation_pipeline, run_job_parse_request, strip_metadata

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    logger.info("Database ready at API startup")
    yield


app = FastAPI(title="Unmapped API", version="0.2", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, Any]:
    ok = True
    try:
        c = get_db()
        c.execute("SELECT 1")
        c.close()
    except OSError:
        ok = False
    return {
        "ok": ok,
        "db": ok,
        "evaluator": "openai" if OPENAI_API_KEY else "mock",
        "github": "token" if GITHUB_TOKEN else "public_rate_limit",
    }


@app.get("/api/bootstrap")
def bootstrap() -> dict[str, Any]:
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM challenges ORDER BY id ASC LIMIT 1")
        ch = cur.fetchone()
        challenge = {k: ch[k] for k in ch.keys()} if ch else None
        cur.execute(
            """SELECT c.id as id, c.company_name, c.industry, c.country, c.user_id, u.name as contact_name, u.email
               FROM companies c
               JOIN users u ON u.id = c.user_id
               LIMIT 1"""
        )
        co = cur.fetchone()
        company = {k: co[k] for k in co.keys()} if co else None
        talents = get_talent_roster_for_matching()
        return {
            "challenge": challenge,
            "company": company,
            "talents": talents,
            "demoTalentUserId": 1,
            "demoCompanyId": company.get("id") if company else None,
        }
    finally:
        conn.close()


def _row_to_dict(row: Any) -> dict[str, Any] | None:
    if row is None:
        return None
    if hasattr(row, "keys"):
        return {k: row[k] for k in row.keys()}
    return None


@app.get("/api/challenges")
def list_challenges() -> list[dict[str, Any]]:
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM challenges ORDER BY id")
        return [_row_to_dict(r) for r in cur.fetchall()]  # type: ignore[misc]
    finally:
        conn.close()


@app.get("/api/challenges/{challenge_id}")
def get_challenge(challenge_id: int) -> dict[str, Any]:
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM challenges WHERE id = ?", (challenge_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Challenge not found.")
        return _row_to_dict(row)  # type: ignore[return-value]
    finally:
        conn.close()


class SubmissionIn(BaseModel):
    talentId: int = Field(..., gt=0)
    challengeId: int = Field(..., gt=0)
    projectDescription: str = ""
    githubUrl: str = ""
    liveUrl: str = ""
    explanation: str = ""
    videoUrl: str = ""


@app.post("/api/submissions")
async def create_submission(body: SubmissionIn) -> dict[str, Any]:
    pd = (body.projectDescription or "").strip()
    ghu = (body.githubUrl or "").strip()
    ghl = (body.liveUrl or "").strip()
    ex = (body.explanation or "").strip()
    if not pd and not ex and not ghu and not ghl:
        raise HTTPException(400, "Add project evidence before submitting.")

    out = await run_evaluation_pipeline(
        {
            "projectDescription": pd,
            "githubUrl": ghu,
            "liveUrl": ghl,
            "explanation": ex,
        }
    )
    ev = out["evaluation"]
    gh = out["githubResolved"]
    meta = {
        "source": (ev.get("githubEvidence") or {}).get("source") or gh.get("source"),
        "owner": (ev.get("githubEvidence") or {}).get("owner") or gh.get("owner"),
        "repo": (ev.get("githubEvidence") or {}).get("repo") or gh.get("repo"),
    }
    saved = persist_submission_evaluation(
        talent_id=body.talentId,
        challenge_id=body.challengeId,
        project_description=pd,
        github_url=ghu,
        live_url=ghl,
        explanation=ex,
        video_url=(body.videoUrl or "").strip() or None,
        evaluation=ev,
        github_evidence_meta=meta,
    )
    return {"submissionId": saved["submissionId"], "evaluation": ev, "githubEvidence": ev.get("githubEvidence")}


class EvaluateIn(BaseModel):
    projectDescription: str = ""
    githubUrl: str = ""
    liveUrl: str = ""
    explanation: str = ""


@app.post("/api/evaluate")
async def evaluate_only(body: EvaluateIn) -> dict[str, Any]:
    pd = (body.projectDescription or "").strip()
    ghu = (body.githubUrl or "").strip()
    ghl = (body.liveUrl or "").strip()
    ex = (body.explanation or "").strip()
    if not pd and not ex and not ghu and not ghl:
        raise HTTPException(400, "Add project evidence before evaluating.")
    out = await run_evaluation_pipeline(
        {"projectDescription": pd, "githubUrl": ghu, "liveUrl": ghl, "explanation": ex}
    )
    return out["evaluation"]


class ParseJobIn(BaseModel):
    jobPost: str = ""


@app.post("/api/parse-job")
async def parse_job(body: ParseJobIn) -> dict[str, Any]:
    jp = (body.jobPost or "").strip()
    if not jp:
        raise HTTPException(400, "Add a job post before parsing.")
    result = await run_job_parse_request(jp)
    if result.get("error") == "empty":
        raise HTTPException(400, "Empty job post.")
    return result


class CreateJobIn(BaseModel):
    companyId: int = Field(..., gt=0)
    rawDescription: str = ""


@app.post("/api/jobs")
async def create_job(body: CreateJobIn) -> dict[str, Any]:
    raw = (body.rawDescription or "").strip()
    if not body.companyId or not raw:
        raise HTTPException(400, "companyId and rawDescription are required.")
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM companies WHERE id = ?", (body.companyId,))
        if not cur.fetchone():
            raise HTTPException(404, "Company not found.")
    finally:
        conn.close()
    parsed = await run_job_parse_request(raw)
    if parsed.get("error"):
        raise HTTPException(400, "Failed to parse job.")
    to_store = {**strip_metadata(parsed), "source": parsed.get("source"), "model": parsed.get("model"), "warning": parsed.get("warning")}
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO jobs (company_id, raw_description, parsed_job_json) VALUES (?,?,?)",
            (body.companyId, raw, json.dumps(to_store)),
        )
        job_id = int(cur.lastrowid)
        append_audit_event(
            conn,
            entity_type="job",
            entity_id=job_id,
            event_type="job_parsed_and_saved",
            step_index=1,
            detail={
                "company_id": body.companyId,
                "raw_description": raw,
                "parsed_job": to_store,
            },
        )
        conn.commit()
    finally:
        conn.close()
    return {"jobId": job_id, **parsed}


@app.get("/api/jobs")
def get_jobs(companyId: int | None = None) -> list[dict[str, Any]]:
    conn = get_db()
    try:
        cur = conn.cursor()
        if companyId:
            cur.execute("SELECT * FROM jobs WHERE company_id = ? ORDER BY id DESC", (companyId,))
        else:
            cur.execute("SELECT * FROM jobs ORDER BY id DESC")
        rows = cur.fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            d = _row_to_dict(r)
            if d:
                out.append(d)
        return out
    finally:
        conn.close()


@app.get("/api/jobs/{job_id}")
def get_job(job_id: int) -> dict[str, Any]:
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Job not found.")
        d = _row_to_dict(row)
        assert d
        if d.get("parsed_job_json"):
            try:
                d["parsed"] = json.loads(d["parsed_job_json"])
            except json.JSONDecodeError:
                d["parsed"] = None
        return d
    finally:
        conn.close()


@app.post("/api/jobs/{job_id}/match")
def match_job(job_id: int) -> dict[str, Any]:
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        job = cur.fetchone()
        if not job:
            raise HTTPException(404, "Job not found.")
        pj = job["parsed_job_json"] if hasattr(job, "keys") else job[3]
        try:
            parsed = json.loads(pj)
        except (json.JSONDecodeError, TypeError):
            raise HTTPException(400, "Invalid stored job parse.")
        if not parsed.get("required_skills"):
            raise HTTPException(400, "Job is missing required_skills in parsed data.")

        roster = get_talent_roster_for_matching()
        out: list[dict[str, Any]] = []
        for t in roster:
            tid = t["id"]
            profile = build_profile_from_db(tid)
            candidate = {
                "name": t["name"],
                "country": t["country"],
                "proof": t.get("headline") or "Verified work",
                "badges": [b["title"] for b in (profile.get("earnedBadges") or [])],
            }
            match_row = match_talent_to_job(candidate, profile, parsed)
            must_have = (match_row.get("explainableMatch") or {}).get("mustHaveCoverage") or 0
            risk = (match_row.get("explainableMatch") or {}).get("riskScore") or 50
            expl = {
                "matchExplanation": match_row.get("matchExplanation"),
                "hiringDecision": match_row.get("hiringDecision"),
                "explainableMatch": match_row.get("explainableMatch"),
                "strongMatches": match_row.get("strongMatches"),
                "missingSkills": match_row.get("missingSkills"),
            }
            cur.execute(
                """INSERT INTO matches (job_id, talent_id, match_score, must_have_score, semantic_score, risk_score, explanation_json)
                   VALUES (?,?,?,?,?,?,?)
                   ON CONFLICT(job_id, talent_id) DO UPDATE SET
                     match_score = excluded.match_score,
                     must_have_score = excluded.must_have_score,
                     semantic_score = excluded.semantic_score,
                     risk_score = excluded.risk_score,
                     explanation_json = excluded.explanation_json""",
                (
                    job_id,
                    tid,
                    match_row.get("weightedMatchScore"),
                    must_have,
                    match_row.get("skillOverlapScore"),
                    risk,
                    json.dumps(expl),
                ),
            )
            append_audit_event(
                conn,
                entity_type="match",
                entity_id=job_id,
                event_type="match_scored",
                step_index=4,
                detail={
                    "job_id": job_id,
                    "talent_id": tid,
                    "hybridMatchScore": match_row.get("hybridMatchScore"),
                    "hybridComponents": match_row.get("hybridComponents"),
                    "missingSkills": match_row.get("missingSkills"),
                },
            )
            out.append({**t, **match_row, "talentId": tid, "talent_id": tid})
        conn.commit()
        out.sort(key=lambda a: a.get("weightedMatchScore") or 0, reverse=True)
        return {"jobId": job_id, "candidates": out}
    finally:
        conn.close()


@app.get("/api/jobs/{job_id}/matches")
def get_job_matches(job_id: int) -> list[dict[str, Any]]:
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT m.*, u.name, u.country, tp.headline
               FROM matches m
               JOIN users u ON u.id = m.talent_id
               JOIN talent_profiles tp ON tp.user_id = u.id
               WHERE m.job_id = ?
               ORDER BY m.match_score DESC""",
            (job_id,),
        )
        rows = cur.fetchall()
        result: list[dict[str, Any]] = []
        for r in rows:
            d = _row_to_dict(r)
            if not d:
                continue
            try:
                d["parsed"] = json.loads(d.get("explanation_json") or "{}")
            except json.JSONDecodeError:
                d["parsed"] = {}
            result.append(d)
        return result
    finally:
        conn.close()


class FinalChallengeIn(BaseModel):
    jobId: int = Field(..., gt=0)
    talentId: int = Field(..., gt=0)
    challengeText: str = ""
    status: str = "sent"


@app.post("/api/final-challenges")
def final_challenge(body: FinalChallengeIn) -> dict[str, int]:
    j, t, c = body.jobId, body.talentId, (body.challengeText or "").strip()
    st = (body.status or "sent").strip() or "sent"
    if not j or not t or not c:
        raise HTTPException(400, "jobId, talentId, and challengeText are required.")
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO final_challenges (job_id, talent_id, challenge_text, status) VALUES (?,?,?,?)",
            (j, t, c, st),
        )
        eid = int(cur.lastrowid)
        append_audit_event(
            conn,
            entity_type="final_challenge",
            entity_id=eid,
            event_type="final_challenge_created",
            step_index=1,
            detail={"job_id": j, "talent_id": t, "status": st},
        )
        conn.commit()
        return {"id": eid}
    finally:
        conn.close()


@app.get("/api/final-challenges")
def list_final_challenges(jobId: int | None = None) -> list[dict[str, Any]]:
    conn = get_db()
    try:
        cur = conn.cursor()
        if jobId:
            cur.execute("SELECT * FROM final_challenges WHERE job_id = ? ORDER BY id DESC", (jobId,))
        else:
            cur.execute("SELECT * FROM final_challenges ORDER BY id DESC")
        return [_row_to_dict(r) for r in cur.fetchall()]  # type: ignore[misc]
    finally:
        conn.close()


class PaymentIn(BaseModel):
    companyId: int = Field(..., gt=0)
    talentId: int = Field(..., gt=0)
    amount: float = 0
    status: str = "pending"
    payoutMethod: str = "mobile_money"


@app.post("/api/payments")
def create_payment(body: PaymentIn) -> dict[str, Any]:
    if not body.companyId or not body.talentId:
        raise HTTPException(400, "companyId and talentId required.")
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO payments (company_id, talent_id, amount, status, payout_method) VALUES (?,?,?,?,?)",
            (body.companyId, body.talentId, body.amount or 0, body.status or "pending", body.payoutMethod or "mobile_money"),
        )
        eid = int(cur.lastrowid)
        append_audit_event(
            conn,
            entity_type="payment",
            entity_id=eid,
            event_type="payment_created",
            step_index=1,
            detail={
                "company_id": body.companyId,
                "talent_id": body.talentId,
                "amount": body.amount,
                "status": body.status,
                "payout_method": body.payoutMethod,
            },
        )
        conn.commit()
        return {"id": eid, "status": body.status, "amount": body.amount, "payoutMethod": body.payoutMethod}
    finally:
        conn.close()


@app.get("/api/users")
def list_users() -> list[dict[str, Any]]:
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, name, email, country, role, created_at FROM users")
        return [_row_to_dict(r) for r in cur.fetchall()]  # type: ignore[misc]
    finally:
        conn.close()


@app.get("/api/audit-trail")
def get_audit_trail(
    entityType: str | None = None,
    entityId: int | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    conn = get_db()
    try:
        cur = conn.cursor()
        lim = max(1, min(1000, int(limit)))
        if entityType and entityId is not None:
            cur.execute(
                "SELECT * FROM audit_trail WHERE entity_type = ? AND entity_id = ? ORDER BY id DESC LIMIT ?",
                (entityType, entityId, lim),
            )
        elif entityType:
            cur.execute(
                "SELECT * FROM audit_trail WHERE entity_type = ? ORDER BY id DESC LIMIT ?",
                (entityType, lim),
            )
        else:
            cur.execute("SELECT * FROM audit_trail ORDER BY id DESC LIMIT ?", (lim,))
        rows = cur.fetchall()
        out = []
        for r in rows:
            d = _row_to_dict(r)
            if not d:
                continue
            try:
                d["detail"] = json.loads(d.get("detail_json") or "{}")
            except json.JSONDecodeError:
                d["detail"] = {}
            out.append(d)
        return out
    finally:
        conn.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=API_PORT, reload=False)
