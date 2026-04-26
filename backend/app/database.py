"""SQLite access (parity with server/db.js)."""
from __future__ import annotations

import sqlite3
from pathlib import Path

from .config import SCHEMA_PATH, SQLITE_PATH


def _ensure_parent() -> None:
    Path(SQLITE_PATH).parent.mkdir(parents=True, exist_ok=True)


def get_db() -> sqlite3.Connection:
    _ensure_parent()
    conn = sqlite3.connect(SQLITE_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        schema = f.read()
    conn = get_db()
    try:
        conn.executescript(schema)
        conn.commit()
    finally:
        conn.close()
    from .seed import seed_database

    seed_database()
