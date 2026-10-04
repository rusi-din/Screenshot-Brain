/**
 * VoiceSearch — microphone button that records audio and sends it to
 * POST /api/voice/transcribe, then calls onResult with the transcription.
 *
 * Falls back gracefully when the browser doesn't support MediaRecorder
 * or when the ElevenLabs key isn't configured.
 */

import { useRef, useState } from 'react'
import { Mic, MicOff, Loader } from 'lucide-react'

const API = 'http://localhost:8000'

export default function VoiceSearch({ onResult, disabled = false }) {
  const [state, setState] = useState('idle') // idle | recording | transcribing | error
  const [errorMsg, setErrorMsg] = useState('')
  const mediaRef  = useRef(null)
  const chunksRef = useRef([])

  async function startRecording() {
    setErrorMsg('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: preferredMime() })
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        await transcribe(blob, recorder.mimeType)
      }
      mediaRef.current = recorder
      recorder.start()
      setState('recording')
    } catch (err) {
      setErrorMsg('Microphone access denied.')
      setState('error')
    }
  }

  function stopRecording() {
    if (mediaRef.current?.state === 'recording') {
      mediaRef.current.stop()
      setState('transcribing')
    }
  }

  async function transcribe(blob, mimeType) {
    const ext  = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm'
    const form = new FormData()
    form.append('file', blob, `voice.${ext}`)
    try {
      const res = await fetch(`${API}/api/voice/transcribe`, { method: 'POST', body: form })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || 'Transcription failed')
      }
      const { text } = await res.json()
      onResult(text)
      setState('idle')
    } catch (err) {
      setErrorMsg(err.message)
      setState('error')
    }
  }

  function handleClick() {
    if (state === 'recording') stopRecording()
    else if (state === 'idle' || state === 'error') startRecording()
  }

  const isRecording    = state === 'recording'
  const isTranscribing = state === 'transcribing'

  return (
    <div className="voice-search-wrap">
      <button
        type="button"
        className={`voice-btn ${isRecording ? 'recording' : ''} ${state === 'error' ? 'errored' : ''}`}
        onClick={handleClick}
        disabled={disabled || isTranscribing}
        title={isRecording ? 'Stop recording' : 'Voice search'}
        aria-label={isRecording ? 'Stop recording' : 'Start voice search'}
      >
        {isTranscribing
          ? <Loader size={17} className="spin-icon" />
          : isRecording
            ? <MicOff size={17} />
            : <Mic size={17} />
        }
      </button>
      {isRecording && <span className="voice-recording-label">Listening…</span>}
      {errorMsg    && <span className="voice-error-label">{errorMsg}</span>}
    </div>
  )
}

function preferredMime() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  return types.find(t => MediaRecorder.isTypeSupported(t)) || ''
}
