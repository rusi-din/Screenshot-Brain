"""
Database repository layer.
Uses MongoDB Atlas when MONGODB_URI is set, SQLite otherwise.
Both backends expose the same interface so main.py never branches on storage type.

Runtime switching: call reinit(mongodb_uri) to switch backends without restarting.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Optional MongoDB
# ---------------------------------------------------------------------------
try:
    from pymongo import MongoClient, DESCENDING
    from pymongo.collection import Collection as MongoCollection
    _pymongo_available = True
except ImportError:
    _pymongo_available = False

# ---------------------------------------------------------------------------
# SQLite paths
# ---------------------------------------------------------------------------
ROOT     = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH  = DATA_DIR / "screenshots.db"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _sqlite_conn() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def _init_sqlite() -> None:
    with _sqlite_conn() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS screenshots (
                id             TEXT PRIMARY KEY,
                filename       TEXT NOT NULL,
                path           TEXT NOT NULL,
                extracted_text TEXT,
                title          TEXT,
                summary        TEXT,
                category       TEXT,
                keywords       TEXT,
                embedding      TEXT,
                uploaded_at    TEXT NOT NULL
            )
        """)
        cols = {row[1] for row in db.execute("PRAGMA table_info(screenshots)")}
        if "embedding" not in cols:
            db.execute("ALTER TABLE screenshots ADD COLUMN embedding TEXT")
        db.execute("""
            CREATE TABLE IF NOT EXISTS search_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                term        TEXT NOT NULL,
                mode        TEXT NOT NULL DEFAULT 'keyword',
                searched_at TEXT NOT NULL
            )
        """)


# ---------------------------------------------------------------------------
# MongoDB — mutable runtime state
# ---------------------------------------------------------------------------
_mongo_client: Any = None
_mongo_db:     Any = None
_mongo_uri:    str = ""


def _connect_mongo(uri: str) -> Any:
    """Open a new MongoDB connection and return the default database."""
    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")          # fast connectivity check
    mdb = client.get_default_database()
    col: MongoCollection = mdb.screenshots
    col.create_index([("uploaded_at", DESCENDING)])
    col.create_index([("category", 1)])
    col.create_index([("title", "text"), ("summary", "text"), ("extracted_text", "text")])
    mdb.search_log.create_index([("searched_at", DESCENDING)])
    return client, mdb


def _close_mongo() -> None:
    global _mongo_client, _mongo_db, _mongo_uri
    if _mongo_client is not None:
        try:
            _mongo_client.close()
        except Exception:
            pass
    _mongo_client = None
    _mongo_db     = None
    _mongo_uri    = ""


def _get_mongo() -> Any:
    """Return the active Mongo db, or None if SQLite is in use."""
    return _mongo_db


def using_mongo() -> bool:
    return _mongo_db is not None


def current_mongo_uri() -> str:
    return _mongo_uri


# ---------------------------------------------------------------------------
# Public init / reinit
# ---------------------------------------------------------------------------

def init(mongodb_uri: str = "") -> dict:
    """
    Initialise storage at startup.
    Returns a status dict: {"backend": "mongodb"|"sqlite", "error": str|None}
    """
    _init_sqlite()
    if mongodb_uri:
        return reinit(mongodb_uri)
    return {"backend": "sqlite", "error": None}


def reinit(mongodb_uri: str) -> dict:
    """
    Switch the active backend at runtime (no restart required).
    Pass an empty string to fall back to SQLite.
    Returns {"backend": ..., "error": ...}
    """
    global _mongo_client, _mongo_db, _mongo_uri

    _close_mongo()

    if not mongodb_uri.strip():
        return {"backend": "sqlite", "error": None}

    if not _pymongo_available:
        return {
            "backend": "sqlite",
            "error": "pymongo is not installed. Run: pip install pymongo[srv]",
        }

    try:
        client, mdb = _connect_mongo(mongodb_uri.strip())
        _mongo_client = client
        _mongo_db     = mdb
        _mongo_uri    = mongodb_uri.strip()
        return {"backend": "mongodb", "error": None}
    except Exception as exc:
        return {"backend": "sqlite", "error": str(exc)}


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def insert_screenshot(record: dict) -> None:
    mdb = _get_mongo()
    if mdb is not None:
        doc = {**record}
        doc.setdefault("keywords", [])
        mdb.screenshots.insert_one(doc)
    else:
        with _sqlite_conn() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO screenshots
                   (id, filename, path, extracted_text, title, summary,
                    category, keywords, embedding, uploaded_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (
                    record["id"],
                    record.get("filename", ""),
                    record.get("path", ""),
                    record.get("extracted_text", ""),
                    record.get("title", ""),
                    record.get("summary", ""),
                    record.get("category", "Miscellaneous"),
                    json.dumps(record.get("keywords", [])),
                    json.dumps(record.get("embedding", [])),
                    record.get("uploaded_at", datetime.now(timezone.utc).isoformat()),
                ),
            )


def get_screenshot(screenshot_id: str) -> dict | None:
    mdb = _get_mongo()
    if mdb is not None:
        return mdb.screenshots.find_one({"id": screenshot_id}, {"_id": 0})
    with _sqlite_conn() as conn:
        row = conn.execute("SELECT * FROM screenshots WHERE id=?", (screenshot_id,)).fetchone()
    return _sqlite_row_to_dict(row) if row else None


def list_screenshots(q: str = "", category: str = "") -> list[dict]:
    mdb = _get_mongo()
    if mdb is not None:
        filt: dict = {}
        if category:
            filt["category"] = category
        if q:
            filt["$text"] = {"$search": q}
        return list(mdb.screenshots.find(filt, {"_id": 0}).sort("uploaded_at", DESCENDING))

    with _sqlite_conn() as conn:
        rows = conn.execute("SELECT * FROM screenshots ORDER BY uploaded_at DESC").fetchall()
    results = []
    for row in rows:
        item = _sqlite_row_to_dict(row)
        haystack = " ".join(
            str(item.get(k, ""))
            for k in ("title", "summary", "category", "extracted_text", "keywords")
        ).lower()
        if (not category or item.get("category") == category) and (not q or q.lower() in haystack):
            results.append(item)
    return results


def delete_screenshot(screenshot_id: str) -> bool:
    mdb = _get_mongo()
    if mdb is not None:
        return mdb.screenshots.delete_one({"id": screenshot_id}).deleted_count > 0
    with _sqlite_conn() as conn:
        if not conn.execute("SELECT 1 FROM screenshots WHERE id=?", (screenshot_id,)).fetchone():
            return False
        conn.execute("DELETE FROM screenshots WHERE id=?", (screenshot_id,))
    return True


def update_embedding(screenshot_id: str, embedding: list[float]) -> None:
    mdb = _get_mongo()
    if mdb is not None:
        mdb.screenshots.update_one({"id": screenshot_id}, {"$set": {"embedding": embedding}})
    else:
        with _sqlite_conn() as conn:
            conn.execute(
                "UPDATE screenshots SET embedding=? WHERE id=?",
                (json.dumps(embedding), screenshot_id),
            )


def get_all_with_embeddings() -> list[dict]:
    mdb = _get_mongo()
    if mdb is not None:
        return list(mdb.screenshots.find(
            {"embedding": {"$exists": True, "$not": {"$size": 0}}}, {"_id": 0}
        ))
    with _sqlite_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM screenshots WHERE embedding IS NOT NULL AND embedding != '[]'"
        ).fetchall()
    return [_sqlite_row_to_dict(r) for r in rows]


def log_search(term: str, mode: str = "keyword") -> None:
    if not term.strip():
        return
    now = datetime.now(timezone.utc).isoformat()
    mdb = _get_mongo()
    if mdb is not None:
        mdb.search_log.insert_one({"term": term, "mode": mode, "searched_at": now})
    else:
        with _sqlite_conn() as conn:
            conn.execute(
                "INSERT INTO search_log (term, mode, searched_at) VALUES (?,?,?)",
                (term, mode, now),
            )


def analytics_summary() -> dict:
    mdb = _get_mongo()
    if mdb is not None:
        total = mdb.screenshots.count_documents({})
        by_cat = {d["_id"]: d["count"] for d in mdb.screenshots.aggregate([
            {"$group": {"_id": "$category", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ])}
        recent = list(mdb.screenshots.find(
            {}, {"_id": 0, "id": 1, "title": 1, "category": 1, "uploaded_at": 1}
        ).sort("uploaded_at", DESCENDING).limit(5))
        top_searches = [{"term": d["_id"], "count": d["count"]} for d in mdb.search_log.aggregate([
            {"$group": {"_id": "$term", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}, {"$limit": 10},
        ])]
        semantic_count = mdb.search_log.count_documents({"mode": "semantic"})
    else:
        with _sqlite_conn() as conn:
            total = conn.execute("SELECT COUNT(*) FROM screenshots").fetchone()[0]
            by_cat = {r[0]: r[1] for r in conn.execute(
                "SELECT category, COUNT(*) FROM screenshots GROUP BY category ORDER BY 2 DESC"
            ).fetchall()}
            recent = [dict(r) for r in conn.execute(
                "SELECT id, title, category, uploaded_at FROM screenshots ORDER BY uploaded_at DESC LIMIT 5"
            ).fetchall()]
            top_searches = [{"term": r[0], "count": r[1]} for r in conn.execute(
                "SELECT term, COUNT(*) FROM search_log GROUP BY term ORDER BY 2 DESC LIMIT 10"
            ).fetchall()]
            semantic_count = conn.execute(
                "SELECT COUNT(*) FROM search_log WHERE mode='semantic'"
            ).fetchone()[0]

    return {
        "total": total,
        "by_category": by_cat,
        "recent_uploads": recent,
        "top_searches": top_searches,
        "semantic_search_count": semantic_count,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sqlite_row_to_dict(row: sqlite3.Row) -> dict:
    item = dict(row)
    for key, fallback in (("keywords", "[]"), ("embedding", "[]")):
        raw = item.get(key) or fallback
        try:
            item[key] = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            item[key] = []
    return item
