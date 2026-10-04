#!/usr/bin/env python3
"""
Migrate Screenshot Brain data from SQLite to MongoDB Atlas.

Usage:
    MONGODB_URI="mongodb+srv://..." python migrate_to_mongo.py

The script is idempotent: it uses `update_one` with `upsert=True` so running
it twice won't create duplicate records.
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from pathlib import Path

try:
    from pymongo import MongoClient
except ImportError:
    print("pymongo not installed. Run: pip install pymongo[srv]")
    sys.exit(1)

MONGODB_URI = os.getenv("MONGODB_URI", "").strip()
if not MONGODB_URI:
    print("Set MONGODB_URI before running this script.")
    sys.exit(1)

ROOT    = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "screenshots.db"

if not DB_PATH.exists():
    print(f"SQLite database not found at {DB_PATH}")
    sys.exit(1)

# ── Connect ──────────────────────────────────────────────────────────────────
client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=8000)
try:
    client.admin.command("ping")
    print("✓ Connected to MongoDB Atlas")
except Exception as e:
    print(f"✗ Could not connect to MongoDB: {e}")
    sys.exit(1)

db = client.get_default_database()
col = db.screenshots

# ── Read SQLite ───────────────────────────────────────────────────────────────
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
rows = conn.execute("SELECT * FROM screenshots").fetchall()
print(f"  Found {len(rows)} screenshots in SQLite")

migrated = 0
skipped  = 0

for row in rows:
    doc = dict(row)
    raw_kw = doc.pop("keywords", "[]") or "[]"
    try:
        doc["keywords"] = json.loads(raw_kw)
    except (json.JSONDecodeError, TypeError):
        doc["keywords"] = []
    raw_emb = doc.pop("embedding", "[]") or "[]"
    try:
        doc["embedding"] = json.loads(raw_emb)
    except (json.JSONDecodeError, TypeError):
        doc["embedding"] = []

    result = col.update_one(
        {"id": doc["id"]},
        {"$set": doc},
        upsert=True,
    )
    if result.upserted_id:
        migrated += 1
    else:
        skipped += 1

conn.close()

# ── Indexes ───────────────────────────────────────────────────────────────────
from pymongo import DESCENDING
col.create_index([("uploaded_at", DESCENDING)])
col.create_index([("category", 1)])
col.create_index([("title", "text"), ("summary", "text"), ("extracted_text", "text")])

print(f"✓ Migrated {migrated} new records, {skipped} already existed")
print("✓ Indexes created")
print("Done. Set MONGODB_URI in your environment to activate MongoDB storage.")
