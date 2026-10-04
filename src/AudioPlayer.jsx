/**
 * AudioPlayer — minimal play/pause/replay controls for a Blob URL or
 * a streaming fetch from the ElevenLabs TTS endpoint.
 *
 * Props:
 *   src          string  — blob URL (set once audio is fetched)
 *   loading      boolean — show spinner while audio is loading
 *   error        string  — error message to display
 */

import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Volume2 } from 'lucide-react'

export default function AudioPlayer({ src, loading = false, error = '' }) {
  const audioRef  = useRef(null)
  const [playing, setPlaying]     = useState(false)
  const [progress, setProgress]   = useState(0)
  const [duration, setDuration]   = useState(0)

  // Reset when src changes
  useEffect(() => {
    setPlaying(false)
    setProgress(0)
    setDuration(0)
  }, [src])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      audio.play().catch(() => {})
    }
    setPlaying(!playing)
  }

  function replay() {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    audio.play().catch(() => {})
    setPlaying(true)
  }

  function handleTimeUpdate() {
    const audio = audioRef.current
    if (!audio) return
    setProgress(audio.currentTime)
    setDuration(audio.duration || 0)
  }

  function handleEnded() { setPlaying(false) }

  function handleSeek(e) {
    const audio = audioRef.current
    if (!audio || !duration) return
    const pct = parseFloat(e.target.value)
    audio.currentTime = (pct / 100) * duration
    setProgress(audio.currentTime)
  }

  if (error) {
    return <div className="audio-player error"><Volume2 size={14} /> {error}</div>
  }

  if (loading) {
    return (
      <div className="audio-player loading">
        <span className="spinner small" /> Generating audio…
      </div>
    )
  }

  if (!src) return null

  const pct = duration ? (progress / duration) * 100 : 0
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleTimeUpdate}
        onEnded={handleEnded}
        preload="auto"
      />
      <button
        className="audio-btn"
        onClick={togglePlay}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <input
        type="range"
        className="audio-progress"
        min={0}
        max={100}
        value={pct}
        onChange={handleSeek}
        aria-label="Audio progress"
      />
      <span className="audio-time">{fmt(progress)}{duration ? ` / ${fmt(duration)}` : ''}</span>
      <button className="audio-btn" onClick={replay} aria-label="Replay" title="Replay">
        <RotateCcw size={14} />
      </button>
    </div>
  )
}
