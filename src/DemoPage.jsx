/**
 * DemoPage — full-screen walkthrough of all Screenshot Brain features.
 * Shown when the user clicks "Demo" in the sidebar.
 */

import { useState } from 'react'
import {
  X, Upload, FileText, Sparkles, Tag, Search, Mic, Volume2,
  ArrowRight, ChevronRight, Check,
} from 'lucide-react'

const STEPS = [
  {
    id: 'upload',
    icon: <Upload size={22} />,
    title: 'Upload Flow',
    description: 'Drag and drop one or many screenshots. Each image is saved locally — nothing leaves your device until you opt in.',
    detail: 'The upload endpoint accepts PNG and JPG files up to 25 MB. Files are stored under backend/data/uploads/ with UUID filenames.',
    color: 'coral',
  },
  {
    id: 'ocr',
    icon: <FileText size={22} />,
    title: 'OCR Extraction',
    description: 'Tesseract runs locally on every uploaded image and extracts all readable text into a searchable index.',
    detail: 'The backend calls the Tesseract executable directly (no pytesseract wrapper needed). Extracted text is stored in SQLite or MongoDB Atlas.',
    color: 'blue',
  },
  {
    id: 'ai',
    icon: <Sparkles size={22} />,
    title: 'AI Summary',
    description: 'A local Ollama model reads the OCR text and generates a human-readable title, summary, and category — all on your machine.',
    detail: 'Default model: llama3.2:1b. Switch models at runtime from the topbar picker. Falls back to keyword heuristics when Ollama is offline.',
    color: 'green',
  },
  {
    id: 'category',
    icon: <Tag size={22} />,
    title: 'Category Detection',
    description: 'The AI classifies every screenshot into Receipt, Travel, Shopping, Study, Notes, Finance, Booking, or Miscellaneous.',
    detail: 'Categories are normalised server-side so aliases ("receipts" → "Receipt") never create duplicates.',
    color: 'cream',
  },
  {
    id: 'semantic',
    icon: <Search size={22} />,
    title: 'Semantic Search',
    description: 'Toggle to semantic mode and search by intent. "food delivery payment" finds Uber Eats receipts even if that phrase isn\'t in the text.',
    detail: 'Embeddings are generated with nomic-embed-text (Ollama). Cosine similarity ranks results. Keyword search is the automatic fallback.',
    color: 'coral',
  },
  {
    id: 'voice',
    icon: <Mic size={22} />,
    title: 'Voice Search',
    description: 'Click the mic, speak your query. ElevenLabs Scribe transcribes the audio and runs a search automatically.',
    detail: 'Requires ELEVENLABS_API_KEY. Uses the browser MediaRecorder API with WebM/Opus encoding. Falls back gracefully when the key is absent.',
    color: 'blue',
  },
  {
    id: 'tts',
    icon: <Volume2 size={22} />,
    title: 'Audio Playback',
    description: 'Open any screenshot and click "Read aloud" to hear the summary spoken by ElevenLabs. Full play/pause/replay controls.',
    detail: 'Audio streams from the backend to minimise time-to-first-byte. Uses the eleven_turbo_v2 model for low latency.',
    color: 'green',
  },
]

const COLOR_CLASSES = {
  coral: 'demo-step-icon-coral',
  blue:  'demo-step-icon-blue',
  green: 'demo-step-icon-green',
  cream: 'demo-step-icon-cream',
}

export default function DemoPage({ close }) {
  const [active, setActive] = useState(0)
  const step = STEPS[active]

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="demo-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="demo-header">
          <div>
            <p className="eyebrow">Feature walkthrough</p>
            <h2>How Screenshot Brain works</h2>
          </div>
          <button className="modal-close" style={{ position: 'static' }} onClick={close}>
            <X size={18} />
          </button>
        </div>

        <div className="demo-body">
          {/* Step list */}
          <nav className="demo-nav">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                className={`demo-nav-item ${i === active ? 'active' : ''} ${i < active ? 'done' : ''}`}
                onClick={() => setActive(i)}
              >
                <span className="demo-nav-num">
                  {i < active ? <Check size={12} /> : i + 1}
                </span>
                {s.title}
                {i === active && <ChevronRight size={13} className="demo-nav-arrow" />}
              </button>
            ))}
          </nav>

          {/* Step content */}
          <div className="demo-content">
            <div className={`demo-step-icon ${COLOR_CLASSES[step.color] || ''}`}>
              {step.icon}
            </div>
            <h3>{step.title}</h3>
            <p className="demo-desc">{step.description}</p>
            <div className="demo-detail">
              <span className="demo-detail-label">Implementation detail</span>
              <p>{step.detail}</p>
            </div>

            {/* Navigation */}
            <div className="demo-footer">
              <button
                className="demo-nav-btn secondary"
                onClick={() => setActive(i => Math.max(0, i - 1))}
                disabled={active === 0}
              >
                Back
              </button>
              {active < STEPS.length - 1
                ? (
                  <button
                    className="demo-nav-btn primary"
                    onClick={() => setActive(i => i + 1)}
                  >
                    Next <ArrowRight size={14} />
                  </button>
                )
                : (
                  <button className="demo-nav-btn primary" onClick={close}>
                    <Check size={14} /> Done
                  </button>
                )
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
