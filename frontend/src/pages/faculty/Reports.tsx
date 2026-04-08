import { useEffect, useState } from 'react'
import Sidebar from '../../components/Sidebar'
import api from '../../api'

const NAV = [
  { icon: '📊', label: 'Dashboard',     path: '/faculty' },
  { icon: '👨‍🎓', label: 'Students',      path: '/faculty/students' },
  { icon: '📷', label: 'Attendance',    path: '/faculty/attendance' },
  { icon: '📱', label: 'QR Attendance', path: '/faculty/qr' },
  { icon: '📧', label: 'Alerts',        path: '/faculty/alerts' },
  { icon: '📋', label: 'Reports',       path: '/faculty/reports' },
]

interface Section  { id: number; name: string; student_count: number; semester: string }
interface Record   { name: string; roll_no: string; time: string; method: string; date: string }
interface Summary  { name: string; roll_no: string; total_present: number }
interface RangeStat { name: string; roll_no: string; present_days: number; total_days: number; percentage: number }

export default function FacultyReports() {
  const [sections,        setSections]        = useState<Section[]>([])
  const [selectedSection, setSelectedSection] = useState<Section | null>(null)
  const [selectedDate,    setSelectedDate]    = useState(new Date().toISOString().split('T')[0])
  const [fromDate,        setFromDate]        = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]
  })
  const [toDate,          setToDate]          = useState(new Date().toISOString().split('T')[0])
  const [records,         setRecords]         = useState<Record[]>([])
  const [summary,         setSummary]         = useState<Summary[]>([])
  const [rangeStats,      setRangeStats]      = useState<RangeStat[]>([])
  const [loading,         setLoading]         = useState(false)
  const [view,            setView]            = useState<'daily' | 'range' | 'summary'>('daily')

  useEffect(() => {
    api.get('/api/faculty/sections').then(r => {
      setSections(r.data)
      if (r.data.length > 0) setSelectedSection(r.data[0])
    })
  }, [])

  useEffect(() => { if (selectedSection) fetchData() }, [selectedSection, selectedDate, view])

  const fetchData = () => {
    if (!selectedSection) return
    setLoading(true)
    if (view === 'daily') {
      Promise.all([
        api.get(`/api/attendance/section/${selectedSection.id}?date_str=${selectedDate}`),
        api.get(`/api/attendance/section/${selectedSection.id}/summary`)
      ]).then(([r, s]) => { setRecords(r.data); setSummary(s.data) }).finally(() => setLoading(false))
    } else if (view === 'summary') {
      api.get(`/api/attendance/section/${selectedSection.id}/summary`)
        .then(r => setSummary(r.data)).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }

  const fetchRange = async () => {
    if (!selectedSection || !fromDate || !toDate) return
    setLoading(true)
    try {
      const res = await api.get(
        `/api/attendance/section/${selectedSection.id}/range?from_date=${fromDate}&to_date=${toDate}`
      )
      setRangeStats(res.data)
    } catch {
      const sumRes = await api.get(`/api/attendance/section/${selectedSection.id}/summary`)
      setSummary(sumRes.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (view === 'range' && selectedSection) fetchRange() }, [view, selectedSection, fromDate, toDate])

  const exportCSV = () => {
    if (view === 'daily') {
      if (!records.length) return
      const csv = 'Name,Roll No,Time,Method,Date,Section\n' +
        records.map(r => `"${r.name}",${r.roll_no},${r.time},${r.method},${selectedDate},${selectedSection?.name}`).join('\n')
      download(csv, `attendance_${selectedSection?.name}_${selectedDate}.csv`)
    } else if (view === 'range') {
      if (!rangeStats.length) return
      const csv = 'Name,Roll No,Present Days,Total Days,Percentage,Section\n' +
        rangeStats.map(r => `"${r.name}",${r.roll_no},${r.present_days},${r.total_days},${r.percentage.toFixed(1)}%,${selectedSection?.name}`).join('\n')
      download(csv, `range_${selectedSection?.name}_${fromDate}_to_${toDate}.csv`)
    } else {
      if (!summary.length) return
      const csv = 'Name,Roll No,Total Present,Section\n' +
        summary.map(s => `"${s.name}",${s.roll_no},${s.total_present},${selectedSection?.name}`).join('\n')
      download(csv, `summary_${selectedSection?.name}.csv`)
    }
  }

  const download = (csv: string, filename: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = filename; a.click()
  }

  const totalStudents = selectedSection?.student_count ?? 0
  const pct = totalStudents > 0 ? Math.round((records.length / totalStudents) * 100) : 0

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
      <Sidebar items={NAV} />
      <div style={{ marginLeft: 240, flex: 1, padding: '32px 36px' }}>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#e2e8f0' }}>📋 Attendance Reports</h1>
          <p style={{ color: '#475569', marginTop: 4, fontSize: '0.875rem' }}>View and export attendance records</p>
        </div>

        {sections.length === 0 && (
          <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '16px 20px', color: '#fbbf24', marginBottom: 24, fontSize: '0.875rem' }}>
            ⚠️ No sections assigned to you. Ask admin to assign sections first.
          </div>
        )}

        {/* Filters */}
        <div className="card" style={{ marginBottom: 24, padding: 20 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Section</label>
              <select value={selectedSection?.id || ''} onChange={e => {
                const sec = sections.find(s => s.id === parseInt(e.target.value))
                if (sec) setSelectedSection(sec)
              }}>
                {sections.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.semester ? ` (Sem ${s.semester})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {view === 'daily' && (
              <div style={{ flex: 1, minWidth: 150 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Date</label>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
              </div>
            )}

            {view === 'range' && (
              <>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>From Date</label>
                  <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>To Date</label>
                  <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
                </div>
                <button className="btn-primary" onClick={fetchRange} style={{ fontSize: '0.85rem' }}>
                  🔍 Fetch
                </button>
              </>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={exportCSV} style={{ fontSize: '0.85rem' }}>📥 Export CSV</button>
              <button className="btn-secondary" onClick={fetchData} style={{ fontSize: '0.85rem' }}>🔄 Refresh</button>
            </div>
          </div>
        </div>

        {/* Stats row — daily only */}
        {view === 'daily' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total Students', val: totalStudents,                  color: '#6366f1' },
              { label: 'Present',        val: records.length,                 color: '#22c55e' },
              { label: 'Absent',         val: totalStudents - records.length, color: '#ef4444' },
              { label: 'Rate',           val: `${pct}%`,                      color: '#06b6d4' },
            ].map(m => (
              <div key={m.label} className="stat-card" style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: m.color }}>{m.val}</div>
                <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 4 }}>{m.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {([
            { key: 'daily',   label: '📅 Daily View' },
            { key: 'range',   label: '📆 Date Range' },
            { key: 'summary', label: '📊 Overall Summary' },
          ] as const).map(v => (
            <button key={v.key} onClick={() => setView(v.key)} style={{
              padding: '8px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s',
              background: view === v.key ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.06)',
              color: view === v.key ? 'white' : '#64748b'
            }}>{v.label}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }}></div> Loading records...
          </div>

        ) : view === 'daily' ? (
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: 20 }}>
              ✅ Present on {selectedDate} — {records.length}/{totalStudents}
            </h2>
            {records.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#475569' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <p>No attendance marked for {selectedDate}</p>
              </div>
            ) : (
              <table>
                <thead><tr><th>#</th><th>Name</th><th>Roll No</th><th>Time</th><th>Method</th></tr></thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={i}>
                      <td style={{ color: '#475569' }}>{i + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white' }}>{r.name.charAt(0)}</div>
                          <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{r.name}</span>
                        </div>
                      </td>
                      <td><span className="badge badge-blue">{r.roll_no}</span></td>
                      <td style={{ color: '#94a3b8' }}>{r.time}</td>
                      <td><span className={`badge ${r.method === 'webcam' ? 'badge-purple' : 'badge-blue'}`}>{r.method}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        ) : view === 'range' ? (
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>
              📆 Date Range Report — {selectedSection?.name}
            </h2>
            <p style={{ color: '#475569', fontSize: '0.85rem', marginBottom: 20 }}>
              {fromDate} to {toDate}
            </p>
            {rangeStats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#475569' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📆</div>
                <p>Select date range and click Fetch to load data</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Students',    val: rangeStats.length,                                                                color: '#6366f1' },
                    { label: '≥75% Attend', val: rangeStats.filter(r => r.percentage >= 75).length,                               color: '#22c55e' },
                    { label: '<75% Attend', val: rangeStats.filter(r => r.percentage < 75 && r.percentage > 0).length,            color: '#f59e0b' },
                    { label: 'Never Came',  val: rangeStats.filter(r => r.present_days === 0).length,                             color: '#ef4444' },
                  ].map(m => (
                    <div key={m.label} className="stat-card" style={{ textAlign: 'center', padding: 14 }}>
                      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: m.color }}>{m.val}</div>
                      <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: 4 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
                <table>
                  <thead><tr><th>#</th><th>Student</th><th>Roll No</th><th>Present Days</th><th>Total Days</th><th>Percentage</th><th>Status</th></tr></thead>
                  <tbody>
                    {rangeStats.sort((a,b) => b.percentage - a.percentage).map((r, i) => (
                      <tr key={i}>
                        <td style={{ color: '#475569' }}>{i + 1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: r.percentage >= 75 ? 'linear-gradient(135deg,#22c55e,#06b6d4)' : 'rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: r.percentage >= 75 ? 'white' : '#f87171' }}>{r.name.charAt(0)}</div>
                            <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{r.name}</span>
                          </div>
                        </td>
                        <td><span className="badge badge-blue">{r.roll_no}</span></td>
                        <td style={{ fontWeight: 700, color: '#06b6d4', textAlign: 'center' }}>{r.present_days}</td>
                        <td style={{ color: '#475569', textAlign: 'center' }}>{r.total_days}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 99, height: 6 }}>
                              <div style={{ width: `${Math.min(r.percentage, 100)}%`, height: '100%', borderRadius: 99, background: r.percentage >= 75 ? '#22c55e' : r.percentage >= 50 ? '#f59e0b' : '#ef4444', transition: 'width 0.3s' }} />
                            </div>
                            <span style={{ fontWeight: 700, color: r.percentage >= 75 ? '#22c55e' : r.percentage >= 50 ? '#f59e0b' : '#ef4444', minWidth: 42, fontSize: '0.85rem' }}>
                              {r.percentage.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${r.percentage >= 75 ? 'badge-green' : r.percentage >= 50 ? 'badge-orange' : r.percentage > 0 ? 'badge-red' : 'badge-red'}`}>
                            {r.percentage >= 75 ? '✅ Good' : r.percentage >= 50 ? '⚠️ Low' : r.percentage > 0 ? '❌ Critical' : '❌ Never'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

        ) : (
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: 20 }}>
              📊 Overall Attendance Summary — {selectedSection?.name}
            </h2>
            {summary.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#475569' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                <p>No students in this section yet</p>
              </div>
            ) : (
              <table>
                <thead><tr><th>#</th><th>Student</th><th>Roll No</th><th>Total Present</th><th>Status</th></tr></thead>
                <tbody>
                  {summary.map((s, i) => (
                    <tr key={i}>
                      <td style={{ color: '#475569' }}>{i + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: s.total_present > 0 ? 'linear-gradient(135deg,#22c55e,#06b6d4)' : 'rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: s.total_present > 0 ? 'white' : '#f87171' }}>{s.name.charAt(0)}</div>
                          <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{s.name}</span>
                        </div>
                      </td>
                      <td><span className="badge badge-blue">{s.roll_no}</span></td>
                      <td style={{ fontWeight: 700, color: '#06b6d4', fontSize: '1rem' }}>{s.total_present}</td>
                      <td><span className={`badge ${s.total_present > 0 ? 'badge-green' : 'badge-red'}`}>{s.total_present > 0 ? '✅ Active' : '⚠️ Never'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
