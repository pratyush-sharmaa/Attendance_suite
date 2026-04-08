import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar  from '../../components/Sidebar'
import StatCard from '../../components/StatCard'
import api      from '../../api'

const NAV = [
  { icon: '📊', label: 'Dashboard',     path: '/faculty' },
  { icon: '👨‍🎓', label: 'Students',      path: '/faculty/students' },
  { icon: '📷', label: 'Attendance',    path: '/faculty/attendance' },
  { icon: '📱', label: 'QR Attendance', path: '/faculty/qr' },
  { icon: '📧', label: 'Alerts',        path: '/faculty/alerts' },
  { icon: '📋', label: 'Reports',       path: '/faculty/reports' },
]

interface Stats {
  my_sections:   number
  my_students:   number
  marked_today:  number
  unknown_today: number
}

interface Section {
  id: number
  name: string
  department: string
  student_count: number
  semester: string
}

export default function FacultyDashboard() {
  const [stats,    setStats]    = useState<Stats | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [loading,  setLoading]  = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      api.get('/api/faculty/stats'),
      api.get('/api/faculty/sections')
    ]).then(([s, sec]) => {
      setStats(s.data)
      setSections(sec.data)
    }).finally(() => setLoading(false))
  }, [])

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
      <Sidebar items={NAV} />

      <div style={{ marginLeft: 240, flex: 1, padding: '32px 36px' }}>

        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#e2e8f0' }}>
            Faculty Dashboard
          </h1>
          <p style={{ color: '#475569', marginTop: 4, fontSize: '0.875rem' }}>📅 {today}</p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#475569' }}>
            <div className="spinner"></div> Loading...
          </div>
        ) : (
          <>
            {/* Stats */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16, marginBottom: 32
            }}>
              <StatCard icon="🏫" label="My Sections"   value={stats?.my_sections   ?? 0} color="#6366f1" />
              <StatCard icon="👨‍🎓" label="My Students"   value={stats?.my_students   ?? 0} color="#06b6d4" />
              <StatCard icon="✅" label="Marked Today"  value={stats?.marked_today  ?? 0} color="#22c55e" />
              <StatCard icon="🚨" label="Unknown Today" value={stats?.unknown_today ?? 0} color="#f59e0b" />
            </div>

            {/* Quick actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
              <button onClick={() => navigate('/faculty/attendance')} style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))',
                border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: 16, padding: '24px', cursor: 'pointer',
                textAlign: 'left', transition: 'all 0.2s', color: '#e2e8f0'
              }}
                onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseOut={e  => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <div style={{ fontSize: 36, marginBottom: 12 }}>📷</div>
                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>Take Attendance</div>
                <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                  Webcam or classroom photo — mark attendance instantly
                </div>
              </button>

              <button onClick={() => navigate('/faculty/reports')} style={{
                background: 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(34,197,94,0.2))',
                border: '1px solid rgba(6,182,212,0.3)',
                borderRadius: 16, padding: '24px', cursor: 'pointer',
                textAlign: 'left', transition: 'all 0.2s', color: '#e2e8f0'
              }}
                onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseOut={e  => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>View Reports</div>
                <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                  Section-wise attendance records and export CSV
                </div>
              </button>
            </div>

            {/* My sections */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0' }}>🏫 My Sections</h2>
                <button
                  className="btn-primary"
                  onClick={() => navigate('/faculty/students')}
                  style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                >
                  Manage Students
                </button>
              </div>

              {sections.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#475569' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🏫</div>
                  <p>No sections assigned yet. Contact admin to assign sections.</p>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 16
                }}>
                  {sections.map(sec => (
                    <div key={sec.id} style={{
                      background: 'rgba(99,102,241,0.08)',
                      border: '1px solid rgba(99,102,241,0.2)',
                      borderRadius: 12, padding: '20px',
                      cursor: 'pointer', transition: 'all 0.2s'
                    }}
                      onClick={() => navigate('/faculty/attendance')}
                      onMouseOver={e => {
                        e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'
                        e.currentTarget.style.transform = 'translateY(-2px)'
                      }}
                      onMouseOut={e => {
                        e.currentTarget.style.borderColor = 'rgba(99,102,241,0.2)'
                        e.currentTarget.style.transform = 'translateY(0)'
                      }}
                    >
                      <div style={{ fontSize: 28, marginBottom: 10 }}>🏫</div>
                      <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '1rem' }}>{sec.name}</div>
                      <div style={{ color: '#475569', fontSize: '0.8rem', marginTop: 4 }}>{sec.department}</div>
                      <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {sec.semester && (
                          <span className="badge badge-purple">Sem {sec.semester}</span>
                        )}
                        <span className="badge badge-purple">{sec.student_count} students</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
