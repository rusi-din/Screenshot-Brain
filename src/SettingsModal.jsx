/**
 * SettingsModal — full configuration panel.
 *
 * Sections:
 *  1. Storage  — SQLite vs MongoDB Atlas (with connection test)
 *  2. AI       — Ollama model + embed model
 *  3. OCR      — Tesseract binary path (with auto-detect + test)
 *  4. Voice    — ElevenLabs API key + voice ID (with test)
 *
 * Each section reads live config from GET /api/settings and writes via POST /api/settings.
 * Secrets are masked in GET; to update, user types new value and submits.
 */

import { useEffect, useRef, useState } from 'react'
import {
  X, Database, Cpu, FileText, Volume2, Check, AlertCircle,
  Eye, EyeOff, RefreshCw, ChevronRight, Loader, Server,
} from 'lucide-react'

const API = 'http://localhost:8000'

const VOICE_PRESETS = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily' },
]

export default function SettingsModal({ close, onSave }) {
  const [cfg, setCfg]           = useState(null)
  const [loading, setLoading]   = useState(true)
  const [section, setSection]   = useState('storage')
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState(null)  // { type: 'ok'|'err', text }

  useEffect(() => {
    fetch(`${API}/api/settings`)
      .then(r => r.json())
      .then(d => { setCfg(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function save(patch) {
    setSaving(true); setSaveMsg(null)
    try {
      const res  = await fetch(`${API}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      setCfg(data.config)
      if (data.errors?.length) {
        setSaveMsg({ type: 'err', text: data.errors.join(' · ') })
      } else {
        setSaveMsg({ type: 'ok', text: `Saved: ${data.changed.join(', ')}` })
        onSave?.()
      }
    } catch (e) {
      setSaveMsg({ type: 'err', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const SECTIONS = [
    { id: 'storage', label: 'Storage',   icon: <Database size={15} /> },
    { id: 'ai',      label: 'AI / LLM',  icon: <Cpu size={15} /> },
    { id: 'ocr',     label: 'OCR',       icon: <FileText size={15} /> },
    { id: 'voice',   label: 'Voice',     icon: <Volume2 size={15} /> },
  ]

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="modal-close" style={{ position: 'static' }} onClick={close}>
            <X size={18} />
          </button>
        </div>

        {loading
          ? <div className="settings-loading"><span className="spinner" /> Loading config…</div>
          : (
            <div className="settings-body">
              {/* Nav */}
              <nav className="settings-nav">
                {SECTIONS.map(s => (
                  <button
                    key={s.id}
                    className={`settings-nav-item ${section === s.id ? 'active' : ''}`}
                    onClick={() => { setSection(s.id); setSaveMsg(null) }}
                  >
                    {s.icon} {s.label}
                    <ChevronRight size={13} className="settings-nav-arrow" />
                  </button>
                ))}
              </nav>

              {/* Content */}
              <div className="settings-content">
                {saveMsg && (
                  <div className={`settings-msg ${saveMsg.type}`}>
                    {saveMsg.type === 'ok' ? <Check size={13} /> : <AlertCircle size={13} />}
                    {saveMsg.text}
                  </div>
                )}

                {section === 'storage' && (
                  <StorageSection cfg={cfg} onSave={save} saving={saving} />
                )}
                {section === 'ai' && (
                  <AISection cfg={cfg} onSave={save} saving={saving} />
                )}
                {section === 'ocr' && (
                  <OCRSection cfg={cfg} onSave={save} saving={saving} />
                )}
                {section === 'voice' && (
                  <VoiceSection cfg={cfg} onSave={save} saving={saving} />
                )}
              </div>
            </div>
          )
        }
      </div>
    </div>
  )
}

// ─── Storage section ─────────────────────────────────────────────────────────

function StorageSection({ cfg, onSave, saving }) {
  const [uri, setUri]         = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTest] = useState(null)
  const [show, setShow]       = useState(false)

  const isMongo = cfg?.storage === 'mongodb'

  async function testConnection() {
    setTesting(true); setTest(null)
    try {
      const res  = await fetch(`${API}/api/settings/test-mongodb`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri }),
      })
      const data = await res.json()
      setTest(data)
    } catch (e) {
      setTest({ ok: false, error: e.message })
    } finally {
      setTesting(false)
    }
  }

  function applyMongo() {
    if (uri.trim()) onSave({ mongodb_uri: uri.trim() })
  }

  function switchToSQLite() {
    onSave({ mongodb_uri: '' })
  }

  return (
    <div className="settings-section">
      <h3>Database storage</h3>

      {/* Current status */}
      <div className={`storage-status-card ${isMongo ? 'mongo' : 'sqlite'}`}>
        <div className="storage-status-icon">
          {isMongo ? <Server size={18} /> : <Database size={18} />}
        </div>
        <div>
          <strong>{isMongo ? 'MongoDB Atlas' : 'SQLite (local)'}</strong>
          <p>{isMongo ? 'Cloud storage is active.' : 'All data is stored locally on this device.'}</p>
        </div>
        <span className={`storage-badge ${isMongo ? 'active' : 'local'}`}>
          {isMongo ? 'Cloud' : 'Local'}
        </span>
      </div>

      {/* Switch to MongoDB */}
      <div className="settings-field-group">
        <label className="settings-label">
          MongoDB Atlas URI
          {cfg?.mongodb_configured && !uri && (
            <span className="settings-configured-badge"><Check size={10} /> Configured</span>
          )}
        </label>
        <p className="settings-hint">
          Format: <code>mongodb+srv://user:password@cluster.mongodb.net/screenshot_brain</code>
          <br />Get a free cluster at <a href="https://cloud.mongodb.com" target="_blank" rel="noreferrer">cloud.mongodb.com</a>.
        </p>
        <div className="settings-input-row">
          <input
            type={show ? 'text' : 'password'}
            className="settings-input"
            value={uri}
            onChange={e => { setUri(e.target.value); setTest(null) }}
            placeholder={cfg?.mongodb_configured ? '•••• (configured — enter to replace)' : 'mongodb+srv://…'}
            spellCheck={false}
          />
          <button className="settings-icon-btn" onClick={() => setShow(s => !s)} title="Toggle visibility">
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        <div className="settings-btn-row">
          <button
            className="settings-btn secondary"
            onClick={testConnection}
            disabled={!uri.trim() || testing}
          >
            {testing ? <Loader size={13} className="spin-icon" /> : <RefreshCw size={13} />}
            Test connection
          </button>
          <button
            className="settings-btn primary"
            onClick={applyMongo}
            disabled={!uri.trim() || saving}
          >
            <Check size={13} /> Apply
          </button>
        </div>

        {testResult && (
          <TestResult ok={testResult.ok} msg={testResult.ok ? 'Connection successful.' : testResult.error} />
        )}
      </div>

      {/* Revert to SQLite */}
      {isMongo && (
        <div className="settings-field-group">
          <label className="settings-label">Switch back to SQLite</label>
          <p className="settings-hint">Clears the MongoDB URI and uses the local SQLite database.</p>
          <button className="settings-btn danger-outline" onClick={switchToSQLite} disabled={saving}>
            Use local SQLite
          </button>
        </div>
      )}
    </div>
  )
}

// ─── AI section ──────────────────────────────────────────────────────────────

function AISection({ cfg, onSave, saving }) {
  const [model,      setModel]      = useState(cfg?.ollama_model       || '')
  const [embedModel, setEmbedModel] = useState(cfg?.ollama_embed_model || '')

  return (
    <div className="settings-section">
      <h3>AI / LLM (Ollama)</h3>

      <div className="settings-field-group">
        <label className="settings-label">Analysis model</label>
        <p className="settings-hint">
          Used for categorisation, summaries, and Q&A. Pull models with <code>ollama pull &lt;name&gt;</code>.
        </p>
        <input
          className="settings-input"
          value={model}
          onChange={e => setModel(e.target.value)}
          placeholder="llama3.2:1b"
        />
        <div className="settings-btn-row">
          <button className="settings-btn primary" onClick={() => onSave({ ollama_model: model })} disabled={saving || !model.trim()}>
            <Check size={13} /> Save
          </button>
        </div>
        <div className="settings-chips">
          {['llama3.2:1b', 'llama3.2:3b', 'gemma3:1b', 'qwen2.5:1.5b', 'mistral:7b', 'phi3:mini'].map(m => (
            <button key={m} className={`settings-chip ${model === m ? 'active' : ''}`} onClick={() => setModel(m)}>{m}</button>
          ))}
        </div>
      </div>

      <div className="settings-field-group">
        <label className="settings-label">Embedding model</label>
        <p className="settings-hint">
          Used for semantic / vector search. Requires <code>ollama pull nomic-embed-text</code>.
        </p>
        <input
          className="settings-input"
          value={embedModel}
          onChange={e => setEmbedModel(e.target.value)}
          placeholder="nomic-embed-text"
        />
        <div className="settings-btn-row">
          <button className="settings-btn primary" onClick={() => onSave({ ollama_embed_model: embedModel })} disabled={saving || !embedModel.trim()}>
            <Check size={13} /> Save
          </button>
        </div>
        <div className="settings-chips">
          {['nomic-embed-text', 'mxbai-embed-large', 'all-minilm'].map(m => (
            <button key={m} className={`settings-chip ${embedModel === m ? 'active' : ''}`} onClick={() => setEmbedModel(m)}>{m}</button>
          ))}
        </div>
      </div>

      <div className="settings-info-box">
        <strong>After changing the embed model</strong>, re-index existing screenshots so they get new embeddings:
        <div className="settings-btn-row" style={{ marginTop: 10 }}>
          <ReindexButton />
        </div>
      </div>
    </div>
  )
}

function ReindexButton() {
  const [state, setState] = useState('idle')
  const [result, setResult] = useState(null)
  async function reindex() {
    setState('running')
    const res = await fetch(`${API}/api/embeddings/reindex`, { method: 'POST' })
    const d   = await res.json()
    setResult(d)
    setState('done')
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button className="settings-btn secondary" onClick={reindex} disabled={state === 'running'}>
        {state === 'running' ? <Loader size={13} className="spin-icon" /> : <RefreshCw size={13} />}
        Re-index embeddings
      </button>
      {result && <span className="settings-hint" style={{ margin: 0 }}>{result.updated} updated, {result.failed} failed</span>}
    </div>
  )
}

// ─── OCR section ─────────────────────────────────────────────────────────────

function OCRSection({ cfg, onSave, saving }) {
  const [path,    setPath]    = useState(cfg?.tesseract_cmd || '')
  const [testing, setTesting] = useState(false)
  const [testResult, setTest] = useState(null)

  async function test() {
    setTesting(true); setTest(null)
    const res  = await fetch(`${API}/api/settings/test-tesseract`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    setTest(await res.json())
    setTesting(false)
  }

  return (
    <div className="settings-section">
      <h3>OCR (Tesseract)</h3>

      <div className="settings-field-group">
        <label className="settings-label">
          Tesseract binary path
          {cfg?.tesseract_path && (
            <span className="settings-configured-badge"><Check size={10} /> Auto-detected</span>
          )}
        </label>
        {cfg?.tesseract_path && (
          <p className="settings-hint detected-path">
            Detected: <code>{cfg.tesseract_path}</code>
          </p>
        )}
        <p className="settings-hint">
          Leave blank to auto-detect. Set explicitly if Tesseract is in a non-standard location.
          <br />Windows: <code>C:\Program Files\Tesseract-OCR\tesseract.exe</code>
          <br />macOS: <code>/usr/local/bin/tesseract</code>
        </p>
        <input
          className="settings-input"
          value={path}
          onChange={e => { setPath(e.target.value); setTest(null) }}
          placeholder={cfg?.tesseract_path || 'Leave blank to auto-detect'}
          spellCheck={false}
        />
        <div className="settings-btn-row">
          <button className="settings-btn secondary" onClick={test} disabled={testing}>
            {testing ? <Loader size={13} className="spin-icon" /> : <RefreshCw size={13} />}
            Test
          </button>
          <button className="settings-btn primary" onClick={() => onSave({ tesseract_cmd: path })} disabled={saving}>
            <Check size={13} /> Save
          </button>
        </div>
        {testResult && (
          <TestResult ok={testResult.ok} msg={testResult.ok ? testResult.version : testResult.error} />
        )}
      </div>

      <div className="settings-info-box">
        <strong>Install Tesseract</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.9, fontSize: 12 }}>
          <li>Windows: <code>winget install UB-Mannheim.TesseractOCR</code></li>
          <li>macOS: <code>brew install tesseract</code></li>
          <li>Ubuntu: <code>apt install tesseract-ocr</code></li>
        </ul>
      </div>
    </div>
  )
}

// ─── Voice section ────────────────────────────────────────────────────────────

function VoiceSection({ cfg, onSave, saving }) {
  const [key,     setKey]     = useState('')
  const [voiceId, setVoiceId] = useState(cfg?.elevenlabs_voice_id || 'EXAVITQu4vr4xnSDxMaL')
  const [show,    setShow]    = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTest] = useState(null)

  async function test() {
    setTesting(true); setTest(null)
    // Apply key first if entered, then test
    if (key.trim()) await onSave({ elevenlabs_api_key: key.trim(), elevenlabs_voice_id: voiceId })
    const res  = await fetch(`${API}/api/settings/test-elevenlabs`, { method: 'POST' })
    setTest(await res.json())
    setTesting(false)
  }

  function save() {
    const patch = {}
    if (key.trim())     patch.elevenlabs_api_key  = key.trim()
    if (voiceId.trim()) patch.elevenlabs_voice_id = voiceId.trim()
    if (Object.keys(patch).length) onSave(patch)
  }

  return (
    <div className="settings-section">
      <h3>Voice (ElevenLabs)</h3>

      <div className="settings-field-group">
        <label className="settings-label">
          API key
          {cfg?.elevenlabs_configured && !key && (
            <span className="settings-configured-badge"><Check size={10} /> Configured</span>
          )}
        </label>
        <p className="settings-hint">
          Get a free key at <a href="https://elevenlabs.io" target="_blank" rel="noreferrer">elevenlabs.io</a>.
          The free tier gives 10,000 characters / month.
        </p>
        <div className="settings-input-row">
          <input
            type={show ? 'text' : 'password'}
            className="settings-input"
            value={key}
            onChange={e => { setKey(e.target.value); setTest(null) }}
            placeholder={cfg?.elevenlabs_configured ? '•••• (configured — enter to replace)' : 'sk_…'}
            spellCheck={false}
          />
          <button className="settings-icon-btn" onClick={() => setShow(s => !s)} title="Toggle visibility">
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>

      <div className="settings-field-group">
        <label className="settings-label">Voice</label>
        <div className="voice-presets">
          {VOICE_PRESETS.map(v => (
            <button
              key={v.id}
              className={`voice-preset-btn ${voiceId === v.id ? 'active' : ''}`}
              onClick={() => setVoiceId(v.id)}
            >
              {v.name}
            </button>
          ))}
        </div>
        <p className="settings-hint" style={{ marginTop: 8 }}>
          Or enter a custom voice ID: <input
            className="settings-input-inline"
            value={voiceId}
            onChange={e => setVoiceId(e.target.value)}
            placeholder="EXAVITQu4vr4xnSDxMaL"
          />
        </p>
      </div>

      <div className="settings-btn-row">
        <button className="settings-btn secondary" onClick={test} disabled={testing || (!key.trim() && !cfg?.elevenlabs_configured)}>
          {testing ? <Loader size={13} className="spin-icon" /> : <RefreshCw size={13} />}
          Test
        </button>
        <button className="settings-btn primary" onClick={save} disabled={saving}>
          <Check size={13} /> Save
        </button>
      </div>

      {testResult && (
        <TestResult
          ok={testResult.ok}
          msg={testResult.ok ? `Connected · ${testResult.bytes?.toLocaleString()} bytes received` : testResult.error}
        />
      )}

      {!cfg?.elevenlabs_configured && (
        <div className="settings-info-box">
          <strong>What voice enables</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.9, fontSize: 12 }}>
            <li>Read screenshot summaries aloud</li>
            <li>Read extracted OCR text aloud</li>
            <li>Read AI answers aloud</li>
            <li>Voice search — speak your query</li>
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function TestResult({ ok, msg }) {
  return (
    <div className={`test-result ${ok ? 'ok' : 'err'}`}>
      {ok ? <Check size={13} /> : <AlertCircle size={13} />}
      {msg}
    </div>
  )
}
