"""
Screenshot Brain API  v0.4.0
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import db
import embeddings as emb
import voice

try:
    import ollama
except ImportError:
    ollama = None  # type: ignore

# ---------------------------------------------------------------------------
# Startup config  (env vars are the initial defaults; UI can override at runtime)
# ---------------------------------------------------------------------------
ROOT       = Path(__file__).resolve().parent
UPLOAD_DIR = ROOT / "data" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_cfg = {
    # Ollama
    "ollama_model":       os.getenv("OLLAMA_MODEL",       "llama3.2:1b"),
    "ollama_embed_model": os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text"),
    # Tesseract
    "tesseract_cmd":      os.getenv("TESSERACT_CMD",      "").strip(),
    # ElevenLabs
    "elevenlabs_api_key": os.getenv("ELEVENLABS_API_KEY", "").strip(),
    "elevenlabs_voice_id":os.getenv("ELEVENLABS_VOICE_ID","EXAVITQu4vr4xnSDxMaL").strip(),
    # Storage
    "mongodb_uri":        os.getenv("MONGODB_URI",        "").strip(),
}

# Apply initial storage config
db.init(mongodb_uri=_cfg["mongodb_uri"])

# Apply initial voice config
voice.configure(_cfg["elevenlabs_api_key"], _cfg["elevenlabs_voice_id"])

# Apply initial embed-model config
emb.configure(_cfg["ollama_embed_model"])

# ---------------------------------------------------------------------------
# FastAPI
# ---------------------------------------------------------------------------
app = FastAPI(title="Screenshot Brain API", version="0.4.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# ---------------------------------------------------------------------------
# Tesseract helpers
# ---------------------------------------------------------------------------

def find_tesseract() -> Optional[str]:
    configured = _cfg["tesseract_cmd"]
    if configured and Path(configured).is_file():
        return configured
    discovered = shutil.which("tesseract")
    if discovered:
        return discovered
    for prog_dir in (os.getenv("ProgramFiles"), os.getenv("ProgramFiles(x86)")):
        if prog_dir:
            candidate = Path(prog_dir) / "Tesseract-OCR" / "tesseract.exe"
            if candidate.is_file():
                return str(candidate)
    return None


def extract_text(image_path: Path) -> str:
    tess = find_tesseract()
    if not tess:
        return ""
    try:
        result = subprocess.run(
            [tess, str(image_path), "stdout"],
            capture_output=True, text=True, check=True,
        )
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


# ---------------------------------------------------------------------------
# Category normalisation
# ---------------------------------------------------------------------------
CATEGORY_ALIASES: dict[str, str] = {
    "receipt": "Receipt", "receipts": "Receipt",
    "travel": "Travel", "study": "Study", "shopping": "Shopping",
    "notes": "Notes", "finance": "Finance", "booking": "Booking",
    "social media": "Social Media", "miscellaneous": "Miscellaneous",
}


def normalize_category(value) -> str:
    if not value:
        return "Miscellaneous"
    n = re.sub(r"\s+", " ", str(value).strip().lower().replace("_", " ").replace("-", " "))
    if n.endswith("s") and n[:-1] in CATEGORY_ALIASES:
        return CATEGORY_ALIASES[n[:-1]]
    return CATEGORY_ALIASES.get(n, "Miscellaneous")


# ---------------------------------------------------------------------------
# Metadata analysis
# ---------------------------------------------------------------------------

def fallback_metadata(text: str, filename: str) -> dict:
    lowered = f"{filename} {text}".lower()
    category = "Miscellaneous"
    for name, terms in {
        "Receipt":  ["receipt", "order", "amazon", "total", "invoice"],
        "Travel":   ["flight", "airport", "boarding", "hotel", "itinerary"],
        "Booking":  ["reservation", "booking", "confirmation"],
        "Finance":  ["invoice", "payment", "bank", "transaction"],
        "Shopping": ["cart", "delivery", "shop", "purchase"],
        "Study":    ["lecture", "notes", "chapter", "homework", "study"],
    }.items():
        if any(t in lowered for t in terms):
            category = name
            break
    clean = re.sub(r"\s+", " ", text).strip()
    title = Path(filename).stem.replace("_", " ").replace("-", " ").title() or "Untitled screenshot"
    return {
        "title":    title,
        "summary":  clean[:180] or "Screenshot ready for review.",
        "category": category,
        "keywords": clean.split()[:12],
    }


def normalize_metadata(raw: dict) -> dict:
    cat_raw = raw.get("category", "Miscellaneous")
    if isinstance(cat_raw, list):
        cat_raw = cat_raw[0] if cat_raw else "Miscellaneous"
    keywords = raw.get("keywords", [])
    if isinstance(keywords, str):
        keywords = [k.strip() for k in keywords.split(",") if k.strip()]
    return {
        "title":    str(raw.get("title") or "Untitled screenshot"),
        "summary":  str(raw.get("summary") or "Screenshot ready for review."),
        "category": normalize_category(cat_raw),
        "keywords": keywords if isinstance(keywords, list) else [],
    }


def analyze(text: str, filename: str) -> dict:
    if ollama and text.strip():
        try:
            response = ollama.chat(
                model=_cfg["ollama_model"],
                format="json",
                messages=[{
                    "role": "user",
                    "content": (
                        "Analyze this screenshot OCR text and return a JSON object with exactly "
                        "these fields: title (short descriptive title), summary (1-2 sentence summary), "
                        "category (one of: Receipt, Travel, Shopping, Study, Notes, Social Media, Finance, "
                        "Booking, Miscellaneous), keywords (array of strings). "
                        f"OCR text:\n{text[:6000]}"
                    ),
                }],
            )
            return normalize_metadata(json.loads(response["message"]["content"]))
        except Exception:
            pass
    return fallback_metadata(text, filename)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class AskRequest(BaseModel):
    question: str

class ModelRequest(BaseModel):
    model: str

class SearchRequest(BaseModel):
    query: str
    mode: str = "keyword"

class SettingsUpdate(BaseModel):
    # Each field is optional — only supplied keys are changed
    ollama_model:        Optional[str] = None
    ollama_embed_model:  Optional[str] = None
    tesseract_cmd:       Optional[str] = None
    elevenlabs_api_key:  Optional[str] = None
    elevenlabs_voice_id: Optional[str] = None
    mongodb_uri:         Optional[str] = None


# ---------------------------------------------------------------------------
# Helper: mask secrets in responses
# ---------------------------------------------------------------------------

def _mask(value: str) -> str:
    """Replace all but the last 4 chars with bullets."""
    if not value:
        return ""
    visible = value[-4:]
    return f"{'•' * max(4, len(value) - 4)}{visible}"


def _public_cfg() -> dict:
    """Return the current config with secrets masked."""
    return {
        "ollama_model":        _cfg["ollama_model"],
        "ollama_embed_model":  _cfg["ollama_embed_model"],
        "tesseract_cmd":       _cfg["tesseract_cmd"],
        "tesseract_path":      find_tesseract(),
        "elevenlabs_api_key":  _mask(_cfg["elevenlabs_api_key"]),
        "elevenlabs_voice_id": _cfg["elevenlabs_voice_id"],
        "elevenlabs_configured": bool(_cfg["elevenlabs_api_key"]),
        "mongodb_uri":         _mask(_cfg["mongodb_uri"]),
        "mongodb_configured":  bool(_cfg["mongodb_uri"]),
        "storage":             "mongodb" if db.using_mongo() else "sqlite",
    }


# ---------------------------------------------------------------------------
# Routes — settings
# ---------------------------------------------------------------------------

@app.get("/api/settings")
def get_settings():
    """Return current config (secrets masked)."""
    return _public_cfg()


@app.post("/api/settings")
def update_settings(body: SettingsUpdate):
    """
    Apply config changes at runtime — no restart needed.
    Only fields present in the request body are changed.
    Sensitive fields: pass the real value to update, or omit to keep current.
    Pass an empty string to clear a configured value.
    """
    global _cfg
    changed: list[str] = []
    errors:  list[str] = []

    # ── Ollama model ──────────────────────────────────────────────────────
    if body.ollama_model is not None:
        _cfg["ollama_model"] = body.ollama_model.strip()
        changed.append("ollama_model")

    # ── Embed model ───────────────────────────────────────────────────────
    if body.ollama_embed_model is not None:
        val = body.ollama_embed_model.strip()
        _cfg["ollama_embed_model"] = val
        emb.configure(val)
        changed.append("ollama_embed_model")

    # ── Tesseract ─────────────────────────────────────────────────────────
    if body.tesseract_cmd is not None:
        val = body.tesseract_cmd.strip()
        if val and not Path(val).is_file():
            errors.append(f"tesseract_cmd: path '{val}' does not exist.")
        else:
            _cfg["tesseract_cmd"] = val
            changed.append("tesseract_cmd")

    # ── ElevenLabs ────────────────────────────────────────────────────────
    el_key  = body.elevenlabs_api_key
    el_voice = body.elevenlabs_voice_id
    if el_key is not None or el_voice is not None:
        new_key   = el_key.strip()   if el_key   is not None else _cfg["elevenlabs_api_key"]
        new_voice = el_voice.strip() if el_voice is not None else _cfg["elevenlabs_voice_id"]
        _cfg["elevenlabs_api_key"]   = new_key
        _cfg["elevenlabs_voice_id"]  = new_voice
        voice.configure(new_key, new_voice)
        if el_key   is not None: changed.append("elevenlabs_api_key")
        if el_voice is not None: changed.append("elevenlabs_voice_id")

    # ── MongoDB URI ───────────────────────────────────────────────────────
    if body.mongodb_uri is not None:
        new_uri = body.mongodb_uri.strip()
        result = db.reinit(new_uri)
        if result["error"]:
            errors.append(f"mongodb_uri: {result['error']}")
        else:
            _cfg["mongodb_uri"] = new_uri
            changed.append("mongodb_uri")

    return {
        "changed": changed,
        "errors":  errors,
        "config":  _public_cfg(),
    }


@app.post("/api/settings/test-elevenlabs")
def test_elevenlabs():
    """Quick connectivity test — tries to synthesise a short phrase."""
    if not voice.is_available():
        return {"ok": False, "error": "ELEVENLABS_API_KEY is not configured."}
    try:
        data = voice.text_to_speech("Test.")
        return {"ok": True, "bytes": len(data)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.post("/api/settings/test-mongodb")
def test_mongodb(body: dict):
    """Test a MongoDB URI without permanently applying it."""
    uri = str(body.get("uri", "")).strip()
    if not uri:
        return {"ok": False, "error": "URI is empty."}
    try:
        from pymongo import MongoClient
        c = MongoClient(uri, serverSelectionTimeoutMS=5000)
        c.admin.command("ping")
        c.close()
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.post("/api/settings/test-tesseract")
def test_tesseract(body: dict):
    """Test a Tesseract binary path without permanently applying it."""
    path = str(body.get("path", "")).strip()
    tess = path or find_tesseract()
    if not tess:
        return {"ok": False, "error": "Tesseract not found. Install it or set the path."}
    try:
        result = subprocess.run([tess, "--version"], capture_output=True, text=True, check=True)
        version_line = (result.stdout or result.stderr).split("\n")[0]
        return {"ok": True, "version": version_line.strip()}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Routes — health
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    tess = find_tesseract()
    ocr_ready = False
    if tess:
        try:
            subprocess.run([tess, "--version"], capture_output=True, check=True)
            ocr_ready = True
        except (OSError, subprocess.SubprocessError):
            pass

    ai_ready = False
    available_models: list[str] = []
    if ollama:
        try:
            models = ollama.list().get("models", [])
            for m in models:
                name = m.get("name", "") if isinstance(m, dict) else getattr(m, "model", "")
                if name:
                    available_models.append(name)
            ai_ready = any(
                m.split(":")[0] == _cfg["ollama_model"].split(":")[0]
                for m in available_models
            )
        except Exception:
            pass

    return {
        "status":            "ok",
        "ocr":               ocr_ready,
        "ai":                ai_ready,
        "voice":             voice.is_available(),
        "storage":           "mongodb" if db.using_mongo() else "sqlite",
        "model":             _cfg["ollama_model"],
        "embed_model":       _cfg["ollama_embed_model"],
        "available_models":  available_models,
        "tesseract_path":    tess,
        "elevenlabs_configured": bool(_cfg["elevenlabs_api_key"]),
        "mongodb_configured":    bool(_cfg["mongodb_uri"]),
    }


@app.post("/api/model")
def set_model(body: ModelRequest):
    requested = body.model.strip()
    if not requested:
        raise HTTPException(400, "Model name must not be empty.")
    available: list[str] = []
    if ollama:
        try:
            models = ollama.list().get("models", [])
            for m in models:
                name = m.get("name", "") if isinstance(m, dict) else getattr(m, "model", "")
                if name:
                    available.append(name)
        except Exception:
            pass
    match = next(
        (m for m in available if m == requested or m.split(":")[0] == requested.split(":")[0]),
        None,
    )
    if available and not match:
        raise HTTPException(404, f"Model '{requested}' not available. Pull with `ollama pull {requested}`.")
    _cfg["ollama_model"] = match or requested
    return {"model": _cfg["ollama_model"]}


# ---------------------------------------------------------------------------
# Routes — screenshots
# ---------------------------------------------------------------------------

@app.get("/api/screenshots")
def list_screenshots(q: str = "", category: str = "", mode: str = "keyword"):
    norm_cat = normalize_category(category) if category else ""
    if mode == "semantic" and q:
        db.log_search(q, "semantic")
        results = emb.semantic_search(q, db.get_all_with_embeddings())
        if norm_cat:
            results = [r for r in results if normalize_category(r.get("category")) == norm_cat]
        return results
    db.log_search(q, "keyword")
    return db.list_screenshots(q=q, category=norm_cat)


@app.get("/api/screenshots/{screenshot_id}")
def get_screenshot(screenshot_id: str):
    item = db.get_screenshot(screenshot_id)
    if not item:
        raise HTTPException(404, "Screenshot not found.")
    return item


@app.post("/api/screenshots", status_code=201)
async def upload_screenshot(file: UploadFile = File(...)):
    mime = (file.content_type or "").split(";", 1)[0].lower()
    suffix = Path(file.filename or "screenshot.png").suffix.lower() if file.filename else ".png"
    if mime and mime not in {"image/png", "image/jpeg", "image/jpg"}:
        raise HTTPException(415, "Only PNG and JPG are supported.")
    if not mime and suffix not in {".png", ".jpg", ".jpeg"}:
        raise HTTPException(415, "Only PNG and JPG are supported.")

    sid  = str(uuid.uuid4())
    name = f"{sid}{suffix}"
    path = UPLOAD_DIR / name
    path.write_bytes(await file.read())

    text     = extract_text(path)
    metadata = analyze(text, file.filename or name)
    now      = datetime.now(timezone.utc).isoformat()
    record   = {
        "id": sid, "filename": file.filename or name, "path": name,
        "extracted_text": text, **metadata, "embedding": [], "uploaded_at": now,
    }
    db.insert_screenshot(record)

    try:
        vector = emb.generate_embedding(emb.build_embed_text(record))
        if vector:
            db.update_embedding(sid, vector)
            record["embedding"] = vector
    except Exception:
        pass

    return {**record, "url": f"/uploads/{name}"}


@app.delete("/api/screenshots/{screenshot_id}", status_code=200)
def delete_screenshot(screenshot_id: str):
    item = db.get_screenshot(screenshot_id)
    if not item:
        raise HTTPException(404, "Screenshot not found.")
    image_path = UPLOAD_DIR / item["path"]
    db.delete_screenshot(screenshot_id)
    if image_path.exists():
        try:
            image_path.unlink()
        except OSError:
            pass
    return {"deleted": screenshot_id}


@app.post("/api/screenshots/{screenshot_id}/ask")
def ask_screenshot(screenshot_id: str, body: AskRequest):
    item = db.get_screenshot(screenshot_id)
    if not item:
        raise HTTPException(404, "Screenshot not found.")
    question = body.question.strip()
    if not question:
        raise HTTPException(400, "Question must not be empty.")
    ocr_text = (item.get("extracted_text") or "").strip()
    if not ocr_text:
        return {"answer": "No text was extracted. Re-upload with Tesseract installed."}
    if not ollama:
        return {"answer": "Ollama is not installed. Run `pip install ollama` and start the service."}
    context = (
        f"Title: {item.get('title', '')}\nCategory: {item.get('category', '')}\n"
        f"Summary: {item.get('summary', '')}\n\nOCR text:\n{ocr_text[:8000]}"
    )
    try:
        response = ollama.chat(
            model=_cfg["ollama_model"],
            messages=[
                {"role": "system", "content": (
                    "You are a helpful assistant answering questions about screenshot content. "
                    "Answer using only the provided OCR text. Be concise."
                )},
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
            ],
        )
        return {"answer": response["message"]["content"].strip()}
    except Exception as exc:
        raise HTTPException(503, f"Ollama error: {exc}")


# ---------------------------------------------------------------------------
# Routes — semantic search
# ---------------------------------------------------------------------------

@app.post("/api/search/semantic")
def semantic_search_endpoint(body: SearchRequest):
    q = body.query.strip()
    if not q:
        raise HTTPException(400, "Query must not be empty.")
    db.log_search(q, "semantic")
    results = emb.semantic_search(q, db.get_all_with_embeddings())
    return {"query": q, "results": results, "count": len(results)}


@app.post("/api/embeddings/reindex")
def reindex_embeddings():
    items = db.list_screenshots()
    updated = failed = 0
    for item in items:
        try:
            vector = emb.generate_embedding(emb.build_embed_text(item))
            if vector:
                db.update_embedding(item["id"], vector)
                updated += 1
        except Exception:
            failed += 1
    return {"updated": updated, "failed": failed, "total": len(items)}


# ---------------------------------------------------------------------------
# Routes — voice
# ---------------------------------------------------------------------------

@app.post("/api/voice/speak/{screenshot_id}")
def speak_screenshot(screenshot_id: str):
    if not voice.is_available():
        raise HTTPException(503, "ELEVENLABS_API_KEY is not configured.")
    item = db.get_screenshot(screenshot_id)
    if not item:
        raise HTTPException(404, "Screenshot not found.")
    text = item.get("summary") or item.get("title") or "No summary available."
    return StreamingResponse(voice.text_to_speech_stream_iter(text), media_type="audio/mpeg")


@app.post("/api/voice/speak-text")
async def speak_text(body: dict):
    if not voice.is_available():
        raise HTTPException(503, "ELEVENLABS_API_KEY is not configured.")
    text = str(body.get("text", "")).strip()
    if not text:
        raise HTTPException(400, "text must not be empty.")
    return StreamingResponse(voice.text_to_speech_stream_iter(text[:2500]), media_type="audio/mpeg")


@app.post("/api/voice/transcribe")
async def transcribe_voice(file: UploadFile = File(...)):
    if not voice.is_available():
        raise HTTPException(503, "ELEVENLABS_API_KEY is not configured.")
    audio = await file.read()
    try:
        return {"text": voice.speech_to_text(audio, filename=file.filename or "audio.webm")}
    except Exception as exc:
        raise HTTPException(500, f"Transcription failed: {exc}")


# ---------------------------------------------------------------------------
# Routes — analytics
# ---------------------------------------------------------------------------

@app.get("/api/analytics")
def analytics():
    return db.analytics_summary()
