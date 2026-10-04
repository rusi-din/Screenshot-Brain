import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  Archive, ArrowUpRight, BarChart2, Brain, Check, ChevronDown,
  Copy, FileText, FolderOpen, ImagePlus, Inbox, LayoutGrid,
  Menu, MessageSquare, Mic, Play, Plus, Search, Send,
  Settings2, Sparkles, Tag, Trash2, Upload, Volume2, X, Zap,
} from 'lucide-react'

import VoiceSearch        from './VoiceSearch.jsx'
import AudioPlayer        from './AudioPlayer.jsx'
import AnalyticsDashboard from './AnalyticsDashboard.jsx'
import DemoPage           from './DemoPage.jsx'
import SettingsModal      from './SettingsModal.jsx'

const API = 'http://localhost:8000'
const KNOWN_CATEGORIES = ['All screenshots', 'Receipt', 'Travel', 'Study', 'Shopping', 'Notes', 'Finance', 'Booking']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeCategory(value) {
  const raw = String(value ?? 'Miscellaneous').trim()
  if (!raw) return 'Miscellaneous'
  const n = raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  const aliases = {
    receipt: 'Receipt', receipts: 'Receipt',
    travel: 'Travel', study: 'Study', shopping: 'Shopping',
    notes: 'Notes', finance: 'Finance', booking: 'Booking',
    miscellaneous: 'Miscellaneous', 'social media': 'Social Media',
  }
  return aliases[n] || (n.endsWith('s') && aliases[n.slice(0, -1)]) || 'Miscellaneous'
}

function cleanText(value, fallback = '') {
  const t = String(value ?? '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return t || fallback
}

function toCard(item) {
  const title   = cleanText(item.title || item.filename, 'Untitled screenshot')
  const rawSum  = item.summary || item.extracted_text || 'Screenshot ready for review.'
  const summary = cleanText(rawSum, 'Screenshot ready for review.')
  return {
    id:       item.id,
    title,
    category: normalizeCategory(item.category || 'Miscellaneous'),
    date:     item.uploaded_at
      ? new Date(item.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : 'Just now',
    summary:  summary.length > 180 ? `${summary.slice(0, 177)}…` : summary,
    text:     item.extracted_text || summary,
    image:    `${API}${item.url || `/uploads/${item.path}`}`,
    color:    'cream',
  }
}

const STARTER = [
  { id: 's1', title: 'Amazon order confirmation', category: 'Shopping', date: 'Today',     summary: 'Delivery confirmation for a new mechanical keyboard and desk accessories.', text: 'Amazon.com Order #114-9283718 Arriving Friday Mechanical keyboard $129.00',         image: '/screenshots/receipt.svg', color: 'coral' },
  { id: 's2', title: 'Lisbon flight details',      category: 'Travel',   date: 'Yesterday', summary: 'TAP Air Portugal flight for a long weekend in Lisbon.',                       text: 'TAP Air Portugal TP1350 London to Lisbon October 24 08:15 Gate B42',              image: '/screenshots/flight.svg',  color: 'blue'  },
  { id: 's3', title: 'Research notes: local AI',   category: 'Study',    date: 'Oct 12',    summary: 'Clipped article about privacy-preserving ML and local models.',                text: 'Local-first software gives people ownership. Ollama Qwen benchmarks.',            image: '/screenshots/notes.svg',   color: 'cream' },
  { id: 's4', title: 'Dinner reservation',         category: 'Booking',  date: 'Oct 10',    summary: 'Reservation confirmed at Sabor for four people on Saturday evening.',           text: 'Sabor Restaurant Saturday October 19 7:30 PM Party of 4 Confirmation 83920',     image: '/screenshots/booking.svg', color: 'green' },
]

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeCategory, setActiveCategory]   = useState('All screenshots')
  const [query, setQuery]                     = useState('')
  const [searchMode, setSearchMode]           = useState('keyword')  // 'keyword' | 'semantic'
  const [showUpload, setShowUpload]           = useState(false)
  const [showMenu, setShowMenu]               = useState(false)
  const [showAnalytics, setShowAnalytics]     = useState(false)
  const [showDemo, setShowDemo]               = useState(false)
  const [showSettings, setShowSettings]       = useState(false)
  const [selected, setSelected]               = useState(null)
  const [screenshots, setScreenshots]         = useState(STARTER)
  const [apiStatus, setApiStatus]             = useState('offline')
  const [voiceReady, setVoiceReady]           = useState(false)
  const [storageType, setStorageType]         = useState('sqlite')
  const [activeModel, setActiveModel]         = useState('')
  const [availableModels, setAvailableModels] = useState([])
  const [uploadError, setUploadError]         = useState('')
  const [uploadNotice, setUploadNotice]       = useState(null)
  const [uploading, setUploading]             = useState(false)
  const [semanticResults, setSemanticResults] = useState(null)
  const [semanticLoading, setSemanticLoading] = useState(false)
  const [customGroups, setCustomGroups]       = useState([])
  const [brokenImages, setBrokenImages]       = useState({})
  const fileInput = useRef(null)

  // close sidebar on outside click (mobile)
  useEffect(() => {
    if (!showMenu) return
    const h = () => setShowMenu(false)
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [showMenu])

  // health + initial load
  useEffect(() => {
    fetch(`${API}/api/health`)
      .then(r => r.json())
      .then(h => {
        setApiStatus(h.ocr && h.ai ? 'ready' : h.ocr ? 'ocr-only' : h.ai ? 'ai-only' : 'online')
        setVoiceReady(!!h.voice)
        setStorageType(h.storage || 'sqlite')
        if (h.model) setActiveModel(h.model)
        if (Array.isArray(h.available_models)) setAvailableModels(h.available_models)
      })
      .catch(() => setApiStatus('offline'))

    fetch(`${API}/api/screenshots`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(items => setScreenshots(prev => [...items.map(toCard), ...prev]))
      .catch(() => {})
  }, [])

  // Semantic search when mode is semantic and query changes
  useEffect(() => {
    if (searchMode !== 'semantic' || !query.trim()) {
      setSemanticResults(null)
      return
    }
    const timer = setTimeout(async () => {
      setSemanticLoading(true)
      try {
        const res = await fetch(`${API}/api/search/semantic`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, mode: 'semantic' }),
        })
        const data = await res.json()
        setSemanticResults(data.results.map(toCard))
      } catch {
        setSemanticResults([])
      } finally {
        setSemanticLoading(false)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [query, searchMode])

  const keywordFiltered = useMemo(() => screenshots.filter(item => {
    const catMatch = activeCategory === 'All screenshots' ||
      normalizeCategory(item.category) === normalizeCategory(activeCategory)
    const s = query.toLowerCase().trim()
    return catMatch && (!s || `${item.title} ${item.summary} ${item.text} ${item.category}`.toLowerCase().includes(s))
  }), [screenshots, activeCategory, query])

  const displayedScreenshots = searchMode === 'semantic' && query.trim()
    ? (semanticResults ?? keywordFiltered)
    : keywordFiltered

  function handleNewGroup() {
    const name = window.prompt('Name your new group', 'Project brainstorm')
    if (!name?.trim()) return
    const clean = name.trim()
    setCustomGroups(prev => prev.includes(clean) ? prev : [...prev, clean])
    setActiveCategory(clean)
  }

  async function handleFiles(files) {
    const list = Array.from(files)
    if (!list.length) return
    const previews = list.map((f, i) => ({
      id: `preview-${Date.now()}-${i}`,
      title: f.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'New screenshot',
      category: 'Miscellaneous', date: 'Just now',
      summary: 'Running local OCR and AI analysis…', text: '',
      image: URL.createObjectURL(f), color: 'cream', uploading: true,
    }))
    setUploadError('')
    setUploadNotice(null)
    setScreenshots(prev => [...previews, ...prev])
    setShowUpload(false)
    setUploading(true)

    let ok = 0, fail = 0
    const results = []
    for (const file of list) {
      try {
        const body = new FormData()
        body.append('file', file)
        const res = await fetch(`${API}/api/screenshots`, { method: 'POST', body })
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || 'API error') }
        results.push(await res.json()); ok++
      } catch { fail++ }
    }

    setScreenshots(prev => {
      const clean = prev.filter(s => !previews.some(p => p.id === s.id))
      return [...results.map(toCard), ...clean]
    })

    if (ok && !fail)     setUploadNotice({ type: 'success', message: `${ok} screenshot${ok > 1 ? 's' : ''} uploaded and indexed.` })
    else if (ok && fail) setUploadNotice({ type: 'warning', message: `${ok} indexed, ${fail} failed.` })
    else                 setUploadError('Upload failed. Check the backend connection.')
    setUploading(false)
  }

  // Refresh health after settings save
  function refreshHealth() {
    fetch(`${API}/api/health`)
      .then(r => r.json())
      .then(h => {
        setApiStatus(h.ocr && h.ai ? 'ready' : h.ocr ? 'ocr-only' : h.ai ? 'ai-only' : 'online')
        setVoiceReady(!!h.voice)
        setStorageType(h.storage || 'sqlite')
        if (h.model) setActiveModel(h.model)
        if (Array.isArray(h.available_models)) setAvailableModels(h.available_models)
      })
      .catch(() => {})
  }

  const handleDelete = useCallback((id) => {
    setScreenshots(prev => prev.filter(s => s.id !== id))
    setSelected(null)
  }, [])

  async function switchModel(model) {
    try {
      const res = await fetch(`${API}/api/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed')
      setActiveModel(data.model)
    } catch (err) {
      alert(`Could not switch model: ${err.message}`)
    }
  }

  const statusLabel = {
    ready:      'OCR + AI ready',
    'ocr-only': 'OCR ready · AI offline',
    'ai-only':  'AI ready · OCR offline',
    online:     'Backend online',
    offline:    'Backend offline',
  }[apiStatus] ?? 'Checking…'

  return (
    <div className="app-shell">
      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className={`sidebar ${showMenu ? 'sidebar-open' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="brand">
          <div className="brand-mark"><Brain size={18} strokeWidth={2.5} /></div>
          <span>Screenshot<br /><em>Brain</em></span>
        </div>
        <nav className="primary-nav">
          <button className="nav-item active"><LayoutGrid size={17} /> Overview</button>
          <button className="nav-item" onClick={() => setShowUpload(true)}><Inbox size={17} /> Inbox</button>
          <button className="nav-item" onClick={() => setShowAnalytics(true)}><BarChart2 size={17} /> Analytics</button>
          <button className="nav-item" onClick={() => setShowDemo(true)}><Sparkles size={17} /> Demo</button>
          <button className="nav-item" onClick={handleNewGroup}><Tag size={17} /> New group</button>
        </nav>
        <div className="nav-label">Your library</div>
        <div className="category-list-wrap">
          <div className="category-list">
            {KNOWN_CATEGORIES.slice(1).map(cat => {
              const count = screenshots.filter(s => normalizeCategory(s.category) === cat).length
              return (
                <button
                  key={cat}
                  className={`category-link ${activeCategory === cat ? 'selected' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  <span className={`category-dot ${cat.toLowerCase()}`} />
                  {cat}
                  <span className="category-number">{count || '—'}</span>
                </button>
              )
            })}
            {customGroups.map(group => (
              <button
                key={group}
                className={`category-link ${activeCategory === group ? 'selected' : ''}`}
                onClick={() => setActiveCategory(group)}
              >
                <span className="category-dot custom" />{group}
                <span className="category-number">—</span>
              </button>
            ))}
          </div>
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item"><Archive size={17} /> Archive</button>
          <button className="nav-item" onClick={() => setShowSettings(true)}><Settings2 size={17} /> Settings</button>
          <button className="nav-item create-group" onClick={handleNewGroup}><Plus size={17} /> Create group</button>
          <div className="privacy-note">
            <span className="privacy-pulse" />
            {storageType === 'mongodb' ? 'MongoDB Atlas' : 'Private by default'}
            <br /><small>{storageType === 'mongodb' ? 'Cloud storage active' : 'Nothing leaves your device'}</small>
          </div>
        </div>
      </aside>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={e => { e.stopPropagation(); setShowMenu(m => !m) }}>
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span><span>/</span><strong>Overview</strong>
          </div>
          <div className="top-actions">
            <span className="sync-status">
              <span className={`sync-dot ${apiStatus === 'offline' ? 'offline' : apiStatus === 'ready' ? 'ready' : 'partial'}`} />
              {statusLabel}
            </span>
            <ModelPicker active={activeModel} models={availableModels} onSwitch={switchModel} />
            <button className="avatar">RS</button>
          </div>
        </header>

        <section className="content-wrap">
          {/* Hero */}
          <div className="hero-row">
            <div>
              <p className="eyebrow">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <h1>Your second brain<br /><span>for screenshots.</span></h1>
              <p className="hero-copy">Search the things you saved, not the folders they got lost in.</p>
            </div>
            <button className="upload-button" onClick={() => setShowUpload(true)}>
              <Upload size={17} /> Add screenshots <span className="shortcut">⌘ K</span>
            </button>
          </div>

          {/* Search */}
          <div className="search-box">
            <Search size={20} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={searchMode === 'semantic' ? 'Semantic search: describe what you remember…' : 'Ask your screenshots anything…'}
            />
            <button
              className={`search-mode-toggle ${searchMode === 'semantic' ? 'active' : ''}`}
              onClick={() => setSearchMode(m => m === 'keyword' ? 'semantic' : 'keyword')}
              title={searchMode === 'semantic' ? 'Switch to keyword search' : 'Switch to semantic search'}
            >
              <Sparkles size={14} />
              {searchMode === 'semantic' ? 'Semantic' : 'Keyword'}
            </button>
            {voiceReady && (
              <VoiceSearch onResult={text => { setQuery(text); setSearchMode('keyword') }} />
            )}
            <button className="search-submit"><ArrowUpRight size={19} /></button>
          </div>

          {/* Notices */}
          {uploadError       && <div className="upload-error">{uploadError}</div>}
          {uploadNotice      && <div className={`upload-feedback ${uploadNotice.type}`}>{uploadNotice.message}</div>}
          {uploading         && <div className="upload-status"><span className="spinner" /> Uploading · OCR · AI analysis…</div>}
          {semanticLoading   && <div className="upload-status"><span className="spinner" /> Running semantic search…</div>}

          {/* Stats */}
          <div className="stat-grid">
            <Stat icon={<ImagePlus />}  label="Total screenshots" value={screenshots.length}                                        detail={`${screenshots.length} indexed`}                    positive />
            <Stat icon={<Sparkles />}   label="AI model"          value={activeModel ? activeModel.split(':')[0] : '—'}             detail={apiStatus === 'ready' ? 'Local · private' : 'Offline'} />
            <Stat icon={<FolderOpen />} label="Categories"        value={KNOWN_CATEGORIES.length - 1}                               detail="Auto-organised" />
          </div>

          {/* Section heading */}
          <div className="section-heading">
            <div>
              <p className="eyebrow">Your library</p>
              <h2>{activeCategory === 'All screenshots' ? (searchMode === 'semantic' && query ? 'Semantic results' : 'Recent uploads') : activeCategory}</h2>
            </div>
            <button className="view-all" onClick={() => { setActiveCategory('All screenshots'); setQuery('') }}>
              View all <ArrowUpRight size={15} />
            </button>
          </div>

          {/* Filters */}
          <div className="filters">
            <button className={`filter-pill ${activeCategory === 'All screenshots' ? 'active' : ''}`} onClick={() => setActiveCategory('All screenshots')}>All</button>
            {KNOWN_CATEGORIES.slice(1, 6).map(cat => (
              <button key={cat} className={`filter-pill ${activeCategory === cat ? 'active' : ''}`} onClick={() => setActiveCategory(cat)}>{cat}</button>
            ))}
            {customGroups.map(g => (
              <button key={g} className={`filter-pill ${activeCategory === g ? 'active' : ''}`} onClick={() => setActiveCategory(g)}>{g}</button>
            ))}
            <button className="filter-pill new-group-pill" onClick={handleNewGroup}><Plus size={14} /> New group</button>
            <button className="filter-more"><ChevronDown size={15} /> More</button>
          </div>

          {/* Grid */}
          <div className="results-grid">
            {displayedScreenshots.map(item => (
              <ScreenshotCard
                key={item.id}
                item={item}
                onOpen={() => setSelected(item)}
                brokenImages={brokenImages}
                setBrokenImages={setBrokenImages}
              />
            ))}
            {!displayedScreenshots.length && (
              <div className="empty-state">
                <Search size={30} />
                <h3>No screenshots found</h3>
                <p>{searchMode === 'semantic' ? 'No semantic matches. Try a broader description or switch to keyword search.' : 'Try a different phrase or upload something new.'}</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {showUpload    && <UploadModal close={() => setShowUpload(false)} inputRef={fileInput} onFiles={handleFiles} />}
      {showAnalytics && <AnalyticsDashboard close={() => setShowAnalytics(false)} />}
      {showDemo      && <DemoPage close={() => setShowDemo(false)} />}
      {showSettings  && <SettingsModal close={() => setShowSettings(false)} onSave={refreshHealth} />}
      {selected      && (
        <DetailModal
          item={selected}
          close={() => setSelected(null)}
          onDelete={handleDelete}
          voiceReady={voiceReady}
          brokenImages={brokenImages}
          setBrokenImages={setBrokenImages}
        />
      )}
    </div>
  )
}

// ─── Model picker ──────────────────────────────────────────────────────────────

function ModelPicker({ active, models, onSwitch }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  if (!active) return null
  return (
    <div className="model-picker" ref={ref}>
      <button className={`model-badge-btn ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)} title="Switch AI model">
        <Zap size={10} />{active.split(':')[0]}
        <ChevronDown size={11} className={`chevron ${open ? 'flipped' : ''}`} />
      </button>
      {open && (
        <div className="model-dropdown">
          <p className="model-dropdown-label">Active model</p>
          {models.length === 0 && <p className="model-dropdown-empty">No models found.<br />Run <code>ollama pull llama3.2:1b</code></p>}
          {models.map(m => (
            <button key={m} className={`model-option ${m === active ? 'active' : ''}`} onClick={() => { onSwitch(m); setOpen(false) }}>
              <span className="model-option-name">{m.split(':')[0]}</span>
              <span className="model-option-tag">{m.includes(':') ? m.split(':')[1] : 'latest'}</span>
              {m === active && <Check size={13} className="model-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function Stat({ icon, label, value, detail, positive }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small className={positive ? 'positive' : ''}>{detail}</small>
      </div>
    </div>
  )
}

// ─── Screenshot card ───────────────────────────────────────────────────────────

function ScreenshotCard({ item, onOpen, brokenImages, setBrokenImages }) {
  const catClass = normalizeCategory(item.category).toLowerCase().replace(/\s+/g, '-')
  const broken   = !!brokenImages[item.id]
  return (
    <article className={`screenshot-card ${item.uploading ? 'uploading' : ''}`}>
      <div className="screenshot-preview-wrapper" onClick={onOpen} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}>
        <div className={`screenshot-preview ${item.color}`}>
          {broken
            ? <div className="image-fallback"><ImagePlus size={18} /><span>Preview unavailable</span></div>
            : <img src={item.image} alt={item.title} onError={() => setBrokenImages(p => ({ ...p, [item.id]: true }))} />
          }
          <div className="preview-overlay">
            <button aria-label="Open screenshot" type="button"><ArrowUpRight size={16} /></button>
          </div>
        </div>
      </div>
      <div className="card-body">
        <div className="card-meta">
          <span className={`tag ${catClass}`}>{item.category}</span>
          <span>{item.date}</span>
        </div>
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
        <div className="card-footer">
          <span><FileText size={13} /> OCR ready</span>
          <button type="button" aria-label="Open" onClick={onOpen}>Open →</button>
        </div>
      </div>
    </article>
  )
}

// ─── Upload modal ──────────────────────────────────────────────────────────────

function UploadModal({ close, inputRef, onFiles }) {
  const [dragging, setDragging] = useState(false)
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="upload-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={close}><X size={18} /></button>
        <div className="modal-icon"><Upload size={21} /></div>
        <p className="eyebrow">Expand your memory</p>
        <h2>Bring in your screenshots</h2>
        <p className="modal-copy">Drop one or a hundred images here. OCR and AI analysis happen locally — nothing is sent to the cloud.</p>
        <div
          className={`drop-zone ${dragging ? 'dragging' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files) }}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus size={27} />
          <strong>Drop screenshots here</strong>
          <span>or browse from your computer</span>
          <small>PNG, JPG · up to 25 MB each</small>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg" multiple onChange={e => onFiles(e.target.files)} />
        </div>
        <div className="local-processing"><Check size={14} /> Your images stay on this device</div>
      </div>
    </div>
  )
}

// ─── Detail modal ──────────────────────────────────────────────────────────────

function DetailModal({ item, close, onDelete, voiceReady, brokenImages, setBrokenImages }) {
  const [tab, setTab]             = useState('details')
  const [question, setQuestion]   = useState('')
  const [answer, setAnswer]       = useState('')
  const [asking, setAsking]       = useState(false)
  const [askError, setAskError]   = useState('')
  const [copied, setCopied]       = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [audioSrc, setAudioSrc]   = useState(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [audioError, setAudioError]     = useState('')
  const broken    = !!brokenImages[item.id]
  const isStarter = String(item.id).startsWith('s')
  const catClass  = normalizeCategory(item.category).toLowerCase().replace(/\s+/g, '-')

  async function handleAsk(e) {
    e.preventDefault()
    if (!question.trim() || asking) return
    setAsking(true); setAnswer(''); setAskError('')
    try {
      const res  = await fetch(`${API}/api/screenshots/${item.id}/ask`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Request failed')
      setAnswer(data.answer)
    } catch (err) {
      setAskError(err.message)
    } finally {
      setAsking(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    if (isStarter) { onDelete(item.id); return }
    setDeleting(true)
    try {
      const res = await fetch(`${API}/api/screenshots/${item.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || 'Delete failed') }
      onDelete(item.id)
    } catch (err) {
      alert(`Could not delete: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  async function handleReadAloud() {
    if (isStarter) {
      // Starter cards don't have a backend ID — speak the summary directly
      await speakText(item.summary)
      return
    }
    setAudioLoading(true); setAudioSrc(null); setAudioError('')
    try {
      const res = await fetch(`${API}/api/voice/speak/${item.id}`, { method: 'POST' })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || 'TTS failed') }
      const blob = await res.blob()
      setAudioSrc(URL.createObjectURL(blob))
    } catch (err) {
      setAudioError(err.message)
    } finally {
      setAudioLoading(false)
    }
  }

  async function speakText(text) {
    setAudioLoading(true); setAudioSrc(null); setAudioError('')
    try {
      const res = await fetch(`${API}/api/voice/speak-text`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || 'TTS failed') }
      const blob = await res.blob()
      setAudioSrc(URL.createObjectURL(blob))
    } catch (err) {
      setAudioError(err.message)
    } finally {
      setAudioLoading(false)
    }
  }

  function copyText() {
    if (!item.text) return
    navigator.clipboard.writeText(item.text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="detail-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="detail-header">
          <div className="detail-title-row">
            <span className={`tag ${catClass}`}>{item.category}</span>
            <h2>{item.title}</h2>
            <span className="detail-date">{item.date}</span>
          </div>
          <div className="detail-actions">
            {voiceReady && (
              <button className="detail-action-btn" onClick={handleReadAloud} title="Read aloud" disabled={audioLoading}>
                <Volume2 size={15} /> {audioLoading ? 'Loading…' : 'Read aloud'}
              </button>
            )}
            <button className="detail-action-btn" onClick={copyText} disabled={!item.text}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Copied' : 'Copy text'}
            </button>
            <button className="detail-action-btn danger" onClick={handleDelete} disabled={deleting}>
              <Trash2 size={15} /> {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button className="modal-close" style={{ position: 'static' }} onClick={close}><X size={18} /></button>
          </div>
        </div>

        {/* Audio player */}
        {(audioSrc || audioLoading || audioError) && (
          <div className="detail-audio">
            <AudioPlayer src={audioSrc} loading={audioLoading} error={audioError} />
          </div>
        )}

        {/* Body */}
        <div className="detail-body">
          <div className="detail-image-col">
            <div className="image-preview-shell">
              {broken
                ? <div className="image-fallback large"><ImagePlus size={22} /><span>Image unavailable</span></div>
                : <img src={item.image} alt={item.title} onError={() => setBrokenImages(p => ({ ...p, [item.id]: true }))} />
              }
            </div>
          </div>

          <div className="detail-panel">
            <div className="detail-tabs">
              {[['details', <FileText size={14} />, 'Details'],
                ['ocr',     <Search size={14} />,   'OCR text'],
                ['ask',     <MessageSquare size={14} />, 'Ask AI'],
              ].map(([id, icon, label]) => (
                <button key={id} className={`detail-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
                  {icon} {label}
                </button>
              ))}
            </div>

            {tab === 'details' && (
              <div className="detail-content">
                <p className="detail-summary">{item.summary}</p>
                <div className="detail-meta-grid">
                  <div className="meta-item"><span>Category</span><strong>{item.category}</strong></div>
                  <div className="meta-item"><span>Added</span><strong>{item.date}</strong></div>
                  <div className="meta-item"><span>OCR</span><strong>{item.text ? `${item.text.split(/\s+/).filter(Boolean).length} words` : 'Not available'}</strong></div>
                </div>
              </div>
            )}

            {tab === 'ocr' && (
              <div className="detail-content">
                {item.text
                  ? <>
                      <div className="ocr-toolbar">
                        <span className="ocr-word-count">{item.text.split(/\s+/).filter(Boolean).length} words</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {voiceReady && (
                            <button className="copy-btn" onClick={() => speakText(item.text)} title="Read OCR text aloud">
                              <Volume2 size={13} /> Read
                            </button>
                          )}
                          <button className="copy-btn" onClick={copyText}>
                            {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
                          </button>
                        </div>
                      </div>
                      <pre className="ocr-text">{item.text}</pre>
                    </>
                  : <p className="ocr-empty">No text extracted. Make sure Tesseract is installed and re-upload.</p>
                }
              </div>
            )}

            {tab === 'ask' && (
              <div className="detail-content ask-panel">
                <p className="ask-intro">Ask a question about this screenshot. The AI answers using the extracted text — fully local.</p>
                <form className="ask-form" onSubmit={handleAsk}>
                  <input
                    className="ask-input"
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    placeholder="What's the total on this receipt?"
                    disabled={asking}
                    autoFocus
                  />
                  <button className="ask-send" type="submit" disabled={!question.trim() || asking}>
                    {asking ? <span className="spinner small" /> : <Send size={15} />}
                  </button>
                </form>
                {askError && <div className="ask-error">{askError}</div>}
                {answer   && (
                  <div className="ask-answer">
                    <span className="ask-answer-label"><Sparkles size={12} /> Answer</span>
                    <p>{answer}</p>
                    {voiceReady && (
                      <button className="copy-btn" style={{ marginTop: 10 }} onClick={() => speakText(answer)}>
                        <Volume2 size={13} /> Read answer
                      </button>
                    )}
                  </div>
                )}
                {!answer && !askError && !asking && (
                  <div className="ask-suggestions">
                    {['What is the total amount?', 'What date is mentioned?', 'Summarize in one sentence.', 'What action do I need to take?'].map(s => (
                      <button key={s} className="ask-suggestion" onClick={() => setQuestion(s)}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
