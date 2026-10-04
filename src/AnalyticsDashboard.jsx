/**
 * AnalyticsDashboard — modal overlay showing:
 *  - Total screenshots
 *  - Category breakdown (bar chart via CSS)
 *  - Top search terms
 *  - Recent uploads
 *  - Semantic search usage count
 */

import { useEffect, useState } from 'react'
import {
  X, BarChart2, Search, ImagePlus, Sparkles, Clock3, TrendingUp,
} from 'lucide-react'

const API = 'http://localhost:8000'

export default function AnalyticsDashboard({ close }) {
  const [data, setData]     = useState(null)
  const [loading, setLoad]  = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    fetch(`${API}/api/analytics`)
      .then(r => { if (!r.ok) throw new Error('Analytics unavailable'); return r.json() })
      .then(d => { setData(d); setLoad(false) })
      .catch(e => { setError(e.message); setLoad(false) })
  }, [])

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="analytics-modal" onClick={e => e.stopPropagation()}>
        <div className="analytics-header">
          <div>
            <p className="eyebrow">Insights</p>
            <h2>Analytics</h2>
          </div>
          <button className="modal-close" style={{ position: 'static' }} onClick={close}>
            <X size={18} />
          </button>
        </div>

        {loading && <div className="analytics-loading"><span className="spinner" /> Loading…</div>}
        {error   && <div className="analytics-error">{error}</div>}

        {data && (
          <div className="analytics-body">
            {/* Top stats */}
            <div className="analytics-stat-row">
              <StatTile icon={<ImagePlus size={16} />} label="Total screenshots" value={data.total} />
              <StatTile icon={<Sparkles size={16} />}  label="Semantic searches" value={data.semantic_search_count} />
              <StatTile icon={<Search size={16} />}    label="Total searches"    value={data.top_searches.reduce((a, s) => a + s.count, 0)} />
            </div>

            <div className="analytics-two-col">
              {/* Category breakdown */}
              <div className="analytics-card">
                <h3><BarChart2 size={14} /> By category</h3>
                <CategoryChart data={data.by_category} total={data.total} />
              </div>

              {/* Top searches */}
              <div className="analytics-card">
                <h3><TrendingUp size={14} /> Top searches</h3>
                {data.top_searches.length === 0
                  ? <p className="analytics-empty">No searches yet.</p>
                  : (
                    <ul className="search-term-list">
                      {data.top_searches.map(s => (
                        <li key={s.term}>
                          <span className="search-term-text">{s.term}</span>
                          <span className="search-term-count">{s.count}</span>
                        </li>
                      ))}
                    </ul>
                  )
                }
              </div>
            </div>

            {/* Recent uploads */}
            <div className="analytics-card">
              <h3><Clock3 size={14} /> Recent uploads</h3>
              {data.recent_uploads.length === 0
                ? <p className="analytics-empty">No uploads yet.</p>
                : (
                  <table className="recent-table">
                    <tbody>
                      {data.recent_uploads.map(u => (
                        <tr key={u.id}>
                          <td className="recent-title">{u.title}</td>
                          <td><span className={`tag ${(u.category || '').toLowerCase()}`}>{u.category}</span></td>
                          <td className="recent-date">
                            {u.uploaded_at
                              ? new Date(u.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatTile({ icon, label, value }) {
  return (
    <div className="analytics-stat-tile">
      <div className="stat-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value ?? '—'}</strong>
      </div>
    </div>
  )
}

function CategoryChart({ data, total }) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="analytics-empty">No data yet.</p>
  }
  const max = Math.max(...Object.values(data))
  return (
    <div className="category-chart">
      {Object.entries(data)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, count]) => (
          <div key={cat} className="chart-row">
            <span className="chart-label">{cat}</span>
            <div className="chart-bar-wrap">
              <div
                className="chart-bar"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="chart-count">{count}</span>
          </div>
        ))
      }
    </div>
  )
}
