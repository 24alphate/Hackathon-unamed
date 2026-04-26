import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
_is_vercel = bool(os.environ.get("VERCEL"))
SQLITE_PATH = os.environ.get(
    "SQLITE_PATH",
    "/tmp/unmapped.db" if _is_vercel else str(ROOT / "data" / "unmapped.db"),
)
SCHEMA_PATH = ROOT / "sql" / "schema.sql"
API_PORT = int(os.environ.get("API_PORT", "8000"))
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "").strip() or None
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip() or None
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
CHROMA_PATH = os.environ.get(
    "CHROMA_PATH",
    "/tmp/chroma" if _is_vercel else str(ROOT / "data" / "chroma"),
)
