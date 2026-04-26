"""GitHub README + tree resolution (parity with server/github.js)."""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

import httpx

from .config import GITHUB_TOKEN

USER_AGENT = "Unmapped-MVP/0.2 (python; proof-of-work evaluation)"


def parse_github_repo_url(url: str | None) -> dict[str, str] | None:
    if not url or not isinstance(url, str):
        return None
    try:
        u = urlparse(url.strip())
        host = (u.hostname or "").lower()
        if host not in ("github.com", "www.github.com"):
            return None
        parts = [p for p in u.path.split("/") if p]
        if len(parts) < 2:
            return None
        owner, repo = parts[0], re.sub(r"\.git$", "", parts[1], flags=re.I)
        return {"owner": owner, "repo": repo}
    except Exception:
        return None


def _github_headers() -> dict[str, str]:
    h = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": USER_AGENT,
    }
    if GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h


def _pick_relevant_paths(paths: list[str]) -> list[str]:
    def score_path(p: str) -> int:
        lower = p.lower()
        s = 0
        if p.startswith(("src/", "app/", "lib/")):
            s += 3
        if lower.endswith(("package.json", "package-lock.json", "pnpm-lock.yaml")):
            s += 4
        if re.search(r"\.(jsx?|tsx?|css|html|vue|svelte)$", lower):
            s += 2
        if "component" in lower:
            s += 1
        return s

    paths = [p for p in paths if p and "node_modules/" not in p]
    return sorted(paths, key=score_path, reverse=True)[:100]


def _extract_paths_from_tree(tree: dict[str, Any]) -> list[str]:
    if not tree or not isinstance(tree.get("tree"), list):
        return []
    return [n["path"] for n in tree["tree"] if n.get("type") == "blob" and n.get("path")]


def _simulate_from_submission(submission: dict[str, str]) -> dict[str, Any]:
    text = f"{submission.get('projectDescription', '')} {submission.get('explanation', '')}".lower()
    has_dashboard = "dashboard" in text or "transaction" in text
    has_api = "api" in text or "fetch" in text or "endpoint" in text
    has_form = "form" in text or "validation" in text or "contact" in text
    has_react = "react" in text or "component" in text
    parts = [p for p in submission.get("githubUrl", "").split("/") if p]
    project_name = re.sub(r"\.git$", "", parts[-1] if parts else "submitted-project", flags=re.I)
    lines = [
        f"# {project_name}",
        submission.get("projectDescription") or "Project README describes a frontend proof-of-work submission.",
    ]
    if has_api:
        lines.append("Includes API-powered data loading with loading and error states.")
    if has_form:
        lines.append("Includes validated user input forms.")
    if has_dashboard:
        lines.append("Includes dashboard or transaction-oriented interface sections.")
    else:
        lines.append("Includes landing page sections and conversion-focused layout.")
    lines.append("Built as a responsive proof project for Unmapped evaluation.")
    readme = "\n".join([x for x in lines if x])
    file_structure = [
        "README.md",
        "package.json",
        "src/App.jsx" if has_react else "src/main.js",
        "src/components/Hero.jsx" if has_react else "src/index.html",
        "src/components/TransactionList.jsx" if has_dashboard else "src/components/PricingSection.jsx",
        "src/lib/api.js" if has_api else "src/data/content.js",
        "src/components/ContactForm.jsx" if has_form else "src/components/CTA.jsx",
        "src/styles.css",
    ]
    return {"readme": readme, "fileStructure": file_structure}


async def resolve_github_evidence(submission: dict[str, str]) -> dict[str, Any]:
    ghu = (submission.get("githubUrl") or "").strip()
    if not ghu:
        return {
            "source": "none",
            "readme": "No GitHub URL was provided, so repository evidence is unavailable.",
            "fileStructure": [],
        }
    parsed = parse_github_repo_url(ghu)
    if not parsed:
        return {
            "source": "simulated",
            "error": "URL is not a valid github.com owner/repo link.",
            **_simulate_from_submission(submission),
        }
    owner, repo = parsed["owner"], parsed["repo"]
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            rrepo = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}",
                headers=_github_headers(),
            )
            rrepo.raise_for_status()
            repo_info = rrepo.json()
            default_branch = repo_info.get("default_branch") or "main"
            rreadme = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/readme",
                headers={**_github_headers(), "Accept": "application/vnd.github.raw"},
            )
            readme = (rreadme.text if rreadme.is_success else "")[:12000]
            if not readme.strip() and default_branch:
                raw = await client.get(
                    f"https://raw.githubusercontent.com/{owner}/{repo}/{default_branch}/README.md",
                    headers={"User-Agent": USER_AGENT},
                )
                if raw.is_success:
                    readme = raw.text[:12000]
            try:
                rtree = await client.get(
                    f"https://api.github.com/repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1",
                    headers=_github_headers(),
                )
                tree_data = rtree.json() if rtree.is_success else None
            except Exception:
                tree_data = None
            paths = _pick_relevant_paths(_extract_paths_from_tree(tree_data or {})) if tree_data else []
            file_structure = paths if paths else [
                "README.md" if readme.strip() else "README (not found)"
            ]
            return {
                "source": "github",
                "owner": owner,
                "repo": repo,
                "defaultBranch": default_branch,
                "readme": readme.strip() or "(No README found or it is empty.)",
                "fileStructure": file_structure,
            }
        except Exception as e:
            msg = (str(e))[:500]
            return {
                "source": "simulated",
                "owner": owner,
                "repo": repo,
                "error": msg,
                **_simulate_from_submission(submission),
            }
