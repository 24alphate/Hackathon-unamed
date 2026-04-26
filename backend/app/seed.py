"""Idempotent seed when users is empty (parity with server/seed.js)."""
from __future__ import annotations

import json
import sqlite3

from .database import get_db


def _get_or_create_skill(cur: sqlite3.Cursor, name: str) -> int:
    cur.execute("SELECT id FROM skills WHERE name = ?", (name,))
    row = cur.fetchone()
    if row:
        return int(row[0])
    cur.execute(
        "INSERT INTO skills (name, category, ontology_source) VALUES (?,?,?)",
        (name, "General", "seed"),
    )
    return int(cur.lastrowid)


def seed_database() -> None:
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM users")
        if cur.fetchone()[0] > 0:
            return

        def ins_user(name: str, email: str, country: str, role: str) -> None:
            cur.execute(
                "INSERT INTO users (name, email, country, role) VALUES (?,?,?,?)",
                (name, email, country, role),
            )

        ins_user("Amina Okoro", "amina@demo.unmapped", "Nigeria", "talent")
        ins_user("Kofi Mensah", "kofi@demo.unmapped", "Ghana", "talent")
        ins_user("Nadia Kamau", "nadia@demo.unmapped", "Kenya", "talent")
        ins_user("Demo Employer", "hr@demo.unmapped", "United States", "company")
        talent1, talent2, talent3, company_user = 1, 2, 3, 4

        cur.execute(
            "INSERT INTO talent_profiles (user_id, headline, country, bio, portfolio_links) VALUES (?,?,?,?,?)",
            (talent1, "Frontend developer", "Nigeria", "Proof-of-work builder", '["https://github.com/demo"]'),
        )
        cur.execute(
            "INSERT INTO talent_profiles (user_id, headline, country, bio, portfolio_links) VALUES (?,?,?,?,?)",
            (talent2, "Dashboard engineer", "Ghana", "Data + UI", "[]"),
        )
        cur.execute(
            "INSERT INTO talent_profiles (user_id, headline, country, bio, portfolio_links) VALUES (?,?,?,?,?)",
            (talent3, "Product UI", "Kenya", "Forms and checkout", "[]"),
        )
        cur.execute(
            "INSERT INTO companies (user_id, company_name, industry, country) VALUES (?,?,?,?)",
            (company_user, "Demo Fintech Ltd", "Fintech", "United States"),
        )

        challenge_rubric = json.dumps(
            {"dimensions": ["functionality", "responsiveness", "evidence_quality", "API usage", "UI clarity"]}
        )
        skill_targets = json.dumps(
            [
                "Responsive UI Design",
                "API Integration",
                "Form Handling",
                "Component Structure",
                "Mobile-first Design",
            ]
        )
        required_out = json.dumps(["GitHub URL", "Live URL", "Short explanation"])
        cur.execute(
            """INSERT INTO challenges (title, description, rubric_json, required_outputs, skill_targets)
               VALUES (?,?,?,?,?)""",
            (
                "Fintech landing page proof",
                "Build a responsive fintech landing page with API integration and a validated contact form.",
                challenge_rubric,
                required_out,
                skill_targets,
            ),
        )
        challenge_id = int(cur.lastrowid)

        skill_names = [
            ("Responsive UI Design", "UI/Frontend", "Layout and responsive patterns", "unmapped_v1"),
            ("API Integration", "Backend/API", "HTTP data integration", "unmapped_v1"),
            ("Form Handling", "UI/Frontend", "Validation and submission flows", "unmapped_v1"),
            ("Component Structure", "System Design", "Reusable UI organization", "unmapped_v1"),
            ("Deployment Literacy", "System Design", "Shipping and hosting awareness", "unmapped_v1"),
            ("Dashboard Layout and Navigation", "UI/Frontend", "Navigation and IA for dashboards", "unmapped_v1"),
            (
                "Transaction or Financial Data Presentation",
                "Data Handling",
                "Financial data in UI",
                "unmapped_v1",
            ),
            ("Form Validation", "UI/Frontend", "Input validation UX", "unmapped_v1"),
        ]
        skill_ids: dict[str, int] = {}
        for name, cat, desc, ont in skill_names:
            cur.execute(
                "INSERT INTO skills (name, category, description, ontology_source) VALUES (?,?,?,?)",
                (name, cat, desc, ont),
            )
            skill_ids[name] = int(cur.lastrowid)

        for name, sid in skill_ids.items():
            cur.execute(
                "INSERT INTO badges (name, skill_id, level, threshold_rules_json) VALUES (?,?,?,?)",
                (f"Verified {name}", sid, "1", '{"min_confidence":0.72}'),
            )

        def seed_submission(
            talent_id: int,
            github: str,
            live: str,
            explanation: str,
            skills_payload: dict,
        ) -> None:
            cur.execute(
                """INSERT INTO submissions (challenge_id, talent_id, project_description, github_url, live_url, explanation, video_url)
                   VALUES (?,?,?,?,?,?,?)""",
                (
                    challenge_id,
                    talent_id,
                    "Seeded proof project for matching demo.",
                    github,
                    live,
                    explanation,
                    None,
                ),
            )
            sid = int(cur.lastrowid)
            cur.execute(
                """INSERT INTO evidence_analyses (submission_id, project_type, detected_features_json, file_structure_json, readme_signal, authenticity_risk, confidence_score, full_eval_json)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    sid,
                    skills_payload.get("projectType") or "landing page",
                    json.dumps(skills_payload.get("features") or ["responsive layout"]),
                    json.dumps(["README.md", "package.json", "src/App.jsx"]),
                    "Seeded README signal for demo.",
                    "medium",
                    skills_payload.get("confidence") or 82,
                    "{}",
                ),
            )
            for row in skills_payload.get("skills", []):
                sk_id = skill_ids.get(row["name"]) or _get_or_create_skill(cur, row["name"])
                cur.execute(
                    """INSERT INTO inferred_skills (talent_id, submission_id, skill_id, confidence, evidence_json, level)
                       VALUES (?,?,?,?,?,?)""",
                    (
                        talent_id,
                        sid,
                        sk_id,
                        row["confidence"],
                        json.dumps({"evidence": row["evidence"]}),
                        row.get("level") or "intermediate",
                    ),
                )
            for b in skills_payload.get("badges") or []:
                cur.execute("SELECT id FROM badges WHERE name = ?", (b["name"],))
                br = cur.fetchone()
                if br:
                    cur.execute(
                        """INSERT INTO awarded_badges (talent_id, badge_id, submission_id, confidence, proof_strength_score)
                           VALUES (?,?,?,?,?)""",
                        (talent_id, int(br[0]), sid, b["confidence"], b.get("proof") or 80),
                    )

        seed_submission(
            talent1,
            "https://github.com/amina/fintech-proof",
            "https://amina-fintech-proof.example.com",
            "Seeded: responsive landing, API rates widget, contact form.",
            {
                "projectType": "landing page",
                "features": ["responsive layout", "API-backed data", "validated form"],
                "confidence": 88,
                "skills": [
                    {"name": "Responsive UI Design", "confidence": 0.94, "evidence": "Hero and sections reflow", "level": "advanced"},
                    {"name": "API Integration", "confidence": 0.88, "evidence": "Rates widget", "level": "intermediate"},
                    {"name": "Form Handling", "confidence": 0.91, "evidence": "Contact form", "level": "intermediate"},
                ],
                "badges": [
                    {"name": "Verified Responsive UI Design", "confidence": 0.94, "proof": 90},
                    {"name": "Verified API Integration", "confidence": 0.88, "proof": 85},
                ],
            },
        )
        seed_submission(
            talent2,
            "https://github.com/kofi/merchant-dashboard-proof",
            "https://kofi-merchant-dashboard.example.com",
            "Seeded: merchant analytics dashboard.",
            {
                "projectType": "dashboard",
                "features": ["tables", "sidebar", "data"],
                "confidence": 85,
                "skills": [
                    {"name": "Dashboard Layout and Navigation", "confidence": 0.91, "evidence": "Sidebar + cards", "level": "intermediate"},
                    {
                        "name": "Transaction or Financial Data Presentation",
                        "confidence": 0.87,
                        "evidence": "Transaction-style rows",
                        "level": "intermediate",
                    },
                    {"name": "Responsive UI Design", "confidence": 0.82, "evidence": "Mobile layout", "level": "intermediate"},
                ],
                "badges": [{"name": "Verified Dashboard Layout and Navigation", "confidence": 0.91, "proof": 88}],
            },
        )
        seed_submission(
            talent3,
            "https://github.com/nadia/remittance-checkout-proof",
            "https://nadia-remittance-checkout.example.com",
            "Seeded: remittance checkout flow.",
            {
                "projectType": "landing page",
                "features": ["forms", "checkout", "validation"],
                "confidence": 84,
                "skills": [
                    {"name": "Form Validation", "confidence": 0.93, "evidence": "Multi-step validation", "level": "advanced"},
                    {"name": "Responsive UI Design", "confidence": 0.81, "evidence": "Responsive checkout", "level": "intermediate"},
                ],
                "badges": [{"name": "Verified Form Validation", "confidence": 0.93, "proof": 90}],
            },
        )

        conn.commit()
    finally:
        conn.close()
