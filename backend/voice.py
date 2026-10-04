"""
ElevenLabs voice integration.
Supports runtime reconfiguration via configure().
"""

from __future__ import annotations

from typing import Iterator
import httpx

_api_key:  str = ""
_voice_id: str = "EXAVITQu4vr4xnSDxMaL"   # Sarah (default)

TTS_BASE = "https://api.elevenlabs.io/v1/text-to-speech"
STT_URL  = "https://api.elevenlabs.io/v1/speech-to-text"


def configure(api_key: str, voice_id: str = "") -> None:
    """Apply new credentials at runtime — no restart needed."""
    global _api_key, _voice_id
    _api_key  = api_key.strip()
    if voice_id.strip():
        _voice_id = voice_id.strip()


def is_available() -> bool:
    return bool(_api_key)


def _headers(accept: str = "audio/mpeg") -> dict:
    return {"xi-api-key": _api_key, "Content-Type": "application/json", "Accept": accept}


def _tts_payload(text: str) -> dict:
    return {
        "text": text[:2500],
        "model_id": "eleven_turbo_v2",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }


def text_to_speech(text: str) -> bytes:
    """Return complete MP3 bytes. Used for connectivity testing."""
    if not is_available():
        raise ValueError("ELEVENLABS_API_KEY is not configured.")
    url = f"{TTS_BASE}/{_voice_id}"
    with httpx.Client(timeout=30) as client:
        r = client.post(url, headers=_headers(), json=_tts_payload(text))
        r.raise_for_status()
        return r.content


def text_to_speech_stream_iter(text: str) -> Iterator[bytes]:
    """Stream MP3 chunks. Used in FastAPI StreamingResponse."""
    if not is_available():
        raise ValueError("ELEVENLABS_API_KEY is not configured.")
    url = f"{TTS_BASE}/{_voice_id}/stream"
    with httpx.Client(timeout=60) as client:
        with client.stream("POST", url, headers=_headers(), json=_tts_payload(text)) as r:
            r.raise_for_status()
            for chunk in r.iter_bytes(chunk_size=4096):
                yield chunk


def speech_to_text(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe audio → text via ElevenLabs Scribe."""
    if not is_available():
        raise ValueError("ELEVENLABS_API_KEY is not configured.")
    with httpx.Client(timeout=60) as client:
        r = client.post(
            STT_URL,
            headers={"xi-api-key": _api_key},
            files={"file": (filename, audio_bytes, "audio/webm")},
            data={"model_id": "scribe_v1"},
        )
        r.raise_for_status()
        return r.json().get("text", "").strip()
