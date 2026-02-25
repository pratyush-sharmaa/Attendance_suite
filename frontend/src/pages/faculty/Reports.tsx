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

interface Section { id: number; name: string; student_count: number }
interface Record  { name: string; roll_no: string; time: string; method: string; date: string }
interface Summary { name: string; roll_no: string; total_present: number }

export default function FacultyReports() {
  const [sections,        setSections]        = useState<Section[]>([])
  const [selectedSection, setSelectedSection] = useState<Section | null>(null)
  const [selectedDate,    setSelectedDate]    = useState(new Date().toISOString().split('T')[0])
  const [records,         setRecords]         = useState<Record[]>([])
  const [summary,         setSummary]         = useState<Summary[]>([])
  const [loading,         setLoading]         = useState(false)
  const [view,            setView]            = useState<'daily' | 'summary'>('daily')

  useEffect(() => {
    api.get('/api/faculty/sections').then(r => {
      setSections(r.data)
      if (r.data.length > 0) setSelectedSection(r.data[0])
    })
  }, [])

  useEffect(() => {
    if (selectedSection) fetchData()
  }, [selectedSection, selectedDate])

  const fetchData = () => {
    if (!selectedSection) return
    setLoading(true)
    Promise.all([
      api.get(`/api/attendance/section/${selectedSection.id}?date_str=${selectedDate}`),
      api.get(`/api/attendance/section/${selectedSection.id}/summary`)
    ]).then(([r, s]) => {
      setRecords(r.data)
      setSummary(s.data)
    }).finally(() => setLoading(false))
  }

  const exportCSV = () => {
    if (!records.length) { alert('No records to export for this date'); return }
    const headers = 'Name,Roll No,Time,Method,Date,Section\n'
    const rows    = records.map(r =>
      `"${r.name}",${r.roll_no},${r.time},${r.method},${selectedDate},${selectedSection?.name}`
    ).join('\n')
    const blob    = new Blob([headers + rows], { type: 'text/csv' })
    const url     = URL.createObjectURL(blob)
    const a       = document.createElement('a')
    a.href        = url
    a.download    = `attendance_${selectedSection?.name}_${selectedDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportSummaryCSV = () => {
    if (!summary.length) return
    const headers = 'Name,Roll No,Total Present,Section\n'
    const rows    = summary.map(s =>
      `"${s.name}",${s.roll_no},${s.total_present},${selectedSection?.name}`
    ).join('\n')
    const blob    = new Blob([headers + rows], { type: 'text/csv' })
    const url     = URL.createObjectURL(blob)
    const a       = document.createElement('a')
    a.href        = url
    a.download    = `summary_${selectedSection?.name}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalStudents = selectedSection?.student_count ?? 0
  const pct           = totalStudents > 0 ? Math.round((records.length / totalStudents) * 100) : 0

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
      <Sidebar items={NAV} />

      <div style={{ marginLeft: 240, flex: 1, padding: '32px 36px' }}>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#e2e8f0' }}>📋 Attendance Reports</h1>
          <p style={{ color: '#475569', marginTop: 4, fontSize: '0.875rem' }}>
            View and export attendance records by section and date
          </p>
        </div>

        {/* No sections warning */}
        {sections.length === 0 && (
          <div style={{
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 12, padding: '16px 20px', color: '#fbbf24',
            marginBottom: 24, fontSize: '0.875rem'
          }}>
            ⚠️ No sections assigned to you. Ask admin to assign sections first.
          </div>
        )}

        {/* Filters */}
        <div className="card" style={{ marginBottom: 24, padding: 20 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>
                Section
              </label>
              <select
                value={selectedSection?.id || ''}
                onChange={e => {
                  const sec = sections.find(s => s.id === parseInt(e.target.value))
                  if (sec) setSelectedSection(sec)
                }}
              >
                {sections.length === 0
                  ? <option>No sections available</option>
                  : sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
                }
              </select>
            </div>

            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>
                Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={view === 'daily' ? exportCSV : exportSummaryCSV}>
                📥 Export CSV
              </button>
              <button className="btn-secondary" onClick={fetchData}>
                🔄 Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Total Students', val: totalStudents,                 color: '#6366f1' },
            { label: 'Present',        val: records.length,                color: '#22c55e' },
            { label: 'Absent',         val: totalStudents - records.length, color: '#ef4444' },
            { label: 'Rate',           val: `${pct}%`,                     color: '#06b6d4' },
          ].map(m => (
            <div key={m.label} className="stat-card" style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: m.color }}>{m.val}</div>
              <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 4 }}>{m.label}</div>
            </div>
          ))}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['daily', 'summary'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '8px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s',
              background: view === v ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.06)',
              color: view === v ? 'white' : '#64748b'
            }}>
              {v === 'daily' ? '📅 Daily View' : '📊 Overall Summary'}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#475569' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
            Loading records...
          </div>
        ) : view === 'daily' ? (
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: 20 }}>
              ✅ Present on {selectedDate}
              <span style={{ color: '#475569', fontWeight: 400, marginLeft: 8 }}>
                ({records.length} of {totalStudents})
              </span>
            </h2>
            {records.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', color: '#475569' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <p>No attendance marked for {selectedDate}</p>
                <p style={{ fontSize: '0.8rem', marginTop: 8, color: '#334155' }}>
                  Take attendance from the Attendance page
                </p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Name</th><th>Roll No</th><th>Time</th><th>Method</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={i}>
                      <td style={{ color: '#475569' }}>{i + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 30, height: 30, borderRadius: '50%',
                            background: 'linear-gradient(135deg,#06b6d4,#6366f1)',
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: 11, fontWeight: 700
                          }}>
                            {r.name.charAt(0)}
                          </div>
                          <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{r.name}</span>
                        </div>
                      </td>
                      <td><span className="badge badge-blue">{r.roll_no}</span></td>
                      <td style={{ color: '#94a3b8' }}>{r.time}</td>
                      <td>
                        <span className={`badge ${r.method === 'webcam' ? 'badge-purple' : 'badge-blue'}`}>
                          {r.method === 'webcam' ? '📷 Webcam' : '🖼️ Classroom'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: 20 }}>
              📊 Overall Attendance Summary — {selectedSection?.name}
            </h2>
            {summary.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', color: '#475569' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                <p>No students in this section yet</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Student</th><th>Roll No</th><th>Total Present</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s, i) => (
                    <tr key={i}>
                      <td style={{ color: '#475569' }}>{i + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 30, height: 30, borderRadius: '50%',
                            background: s.total_present > 0
                              ? 'linear-gradient(135deg,#22c55e,#06b6d4)'
                              : 'rgba(239,68,68,0.2)',
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: 11, fontWeight: 700,
                            color: s.total_present > 0 ? 'white' : '#f87171'
                          }}>
                            {s.name.charAt(0)}
                          </div>
                          <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{s.name}</span>
                        </div>
                      </td>
                      <td><span className="badge badge-blue">{s.roll_no}</span></td>
                      <td style={{ fontWeight: 700, color: '#06b6d4', fontSize: '1rem' }}>
                        {s.total_present}
                      </td>
                      <td>
                        <span className={`badge ${s.total_present > 0 ? 'badge-green' : 'badge-red'}`}>
                          {s.total_present > 0 ? '✅ Active' : '⚠️ Never Attended'}
                        </span>
                      </td>
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