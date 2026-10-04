# GitHub Copilot Usage — Screenshot Brain

This document records how GitHub Copilot was used during development of Screenshot Brain, the prompts that produced useful output, and examples of generated code.

---

## Features generated with GitHub Copilot

| Feature | What Copilot produced |
|---|---|
| FastAPI backend skeleton | Route structure, Pydantic models, CORS setup |
| SQLite schema + repository layer | `CREATE TABLE` DDL, `sqlite3.Row` dict conversion |
| Tesseract subprocess integration | `find_tesseract()` with Windows path discovery |
| Ollama JSON-mode prompting | Chat call with `format="json"` and fallback parsing |
| Category normalisation | Alias map + plural stripping logic |
| Vector cosine similarity | Pure-Python implementation with magnitude check |
| ElevenLabs streaming TTS | `httpx` streaming response with `iter_bytes` |
| ElevenLabs STT upload | `files=` multipart form with `scribe_v1` model |
| MongoDB repository layer | `pymongo` CRUD with upsert patterns and index creation |
| SQLite → MongoDB migration script | Idempotent `update_one(upsert=True)` loop |
| React audio player | `useRef` audio element with progress range input |
| React voice recorder | `MediaRecorder` with mime-type detection and blob upload |
| Analytics bar chart (CSS only) | `width: ${pct}%` CSS bar with percentage calculation |
| Demo page step navigator | `useState` step index with prev/next navigation |

---

## Productivity improvements

- **Boilerplate elimination** — The repository pattern (`db.py`) was scaffolded in one prompt, saving ~45 minutes of typing `sqlite3` boilerplate.
- **API shape iteration** — Copilot suggested the `using_mongo()` abstraction so `main.py` never branches on storage type, which simplified tests.
- **Error handling patterns** — Copilot consistently added `try/except` with graceful degradation (return `[]` instead of raising) for optional services (Ollama, ElevenLabs, MongoDB).
- **CSS micro-animations** — The `pulse-ring` keyframe animation for the recording button was generated from the comment `/* pulsing ring animation for recording state */`.
- **TypeScript-style JSDoc** — Copilot added `@param` / `@returns` comments to all utility functions without being asked.

---

## Example prompts used during development

### 1. Vector search fallback

**Prompt:**
```
Write a Python function that computes cosine similarity between two float lists.
Return 0 if either list is empty or lengths differ. No numpy.
```

**Output (edited slightly):**
```python
def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot   = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)
```

---

### 2. ElevenLabs streaming TTS

**Prompt:**
```
Write a Python generator that streams MP3 audio chunks from the ElevenLabs
text-to-speech API using httpx. Accept text and yield bytes chunks.
```

**Output (edited):**
```python
def text_to_speech_stream(text: str) -> Iterator[bytes]:
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}/stream"
    with httpx.Client(timeout=60) as client:
        with client.stream("POST", url,
            headers={"xi-api-key": API_KEY, "Accept": "audio/mpeg"},
            json={"text": text, "model_id": "eleven_turbo_v2",
                  "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}}
        ) as resp:
            resp.raise_for_status()
            for chunk in resp.iter_bytes(chunk_size=4096):
                yield chunk
```

---

### 3. Browser MediaRecorder with mime-type detection

**Prompt:**
```
Write a React hook that records audio using MediaRecorder, detects the
best supported mime type, and returns the recorded blob when stopped.
```

**Output (adapted into VoiceSearch.jsx):**
```js
function preferredMime() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]
  return types.find(t => MediaRecorder.isTypeSupported(t)) || ''
}
```

---

### 4. MongoDB idempotent migration

**Prompt:**
```
Write a Python script that reads all rows from an SQLite database and upserts
them into MongoDB using pymongo. The script should be safe to run multiple times.
```

**Output (adapted into migrate_to_mongo.py):**
```python
result = col.update_one(
    {"id": doc["id"]},
    {"$set": doc},
    upsert=True,
)
```

---

### 5. CSS-only bar chart

**Prompt:**
```
Write CSS and JSX for a horizontal bar chart where each bar width is a
percentage of the maximum value. No chart library.
```

**Output (adapted into AnalyticsDashboard.jsx):**
```jsx
<div className="chart-bar"
  style={{ width: `${(count / max) * 100}%` }}
/>
```

---

## Generated code examples

### FastAPI streaming response

```python
@app.post("/api/voice/speak/{screenshot_id}")
def speak_screenshot(screenshot_id: str):
    def audio_stream():
        yield from voice.text_to_speech_stream(text)
    return StreamingResponse(audio_stream(), media_type="audio/mpeg")
```

### Semantic search with cosine similarity

```python
def semantic_search(query, candidates, top_k=20, threshold=0.35):
    query_vec = generate_embedding(query)
    if not query_vec:
        return candidates[:top_k]
    scored = [
        (cosine_similarity(query_vec, item.get("embedding", [])), item)
        for item in candidates
        if item.get("embedding")
    ]
    scored.sort(key=lambda t: t[0], reverse=True)
    return [item for score, item in scored if score >= threshold][:top_k]
```

### React audio player with progress

```jsx
<input
  type="range"
  className="audio-progress"
  min={0} max={100}
  value={duration ? (progress / duration) * 100 : 0}
  onChange={e => {
    audio.currentTime = (e.target.value / 100) * duration
  }}
/>
```

---

*Document generated as part of the Hacktoberfest 2026 submission.*
