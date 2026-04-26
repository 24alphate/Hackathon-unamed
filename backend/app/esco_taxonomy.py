"""Minimal ESCO-like normalization map for hackathon use."""
from __future__ import annotations

from typing import Iterable

# Canonical names aligned to ESCO-style normalized skill labels.
_ALIASES = {
    "Frontend API Consumption": ["api integration", "api consumption", "frontend api consumption"],
    "Async Data Rendering": ["async rendering", "asynchronous rendering", "loading states"],
    "Form Validation": ["form handling", "input validation", "form submission"],
    "Responsive UI Design": ["responsive design", "mobile-first design", "responsive layout"],
    "Component Structure": ["component architecture", "component composition", "ui components"],
    "Dashboard Layout and Navigation": ["dashboard navigation", "dashboard layout"],
    "Deployment Literacy": ["deployment", "hosting", "release basics"],
}


def normalize_skill_name(name: str) -> str:
    q = (name or "").strip().lower()
    if not q:
        return name
    for canonical, aliases in _ALIASES.items():
        if q == canonical.lower() or q in aliases:
            return canonical
    return name


def normalize_many(skills: Iterable[str]) -> list[str]:
    return [normalize_skill_name(s) for s in skills]
