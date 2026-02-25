import { useEffect, useState } from 'react'
import Sidebar   from '../../components/Sidebar'
import StatCard  from '../../components/StatCard'
import api       from '../../api'

const NAV = [
  { icon: '📊', label: 'Dashboard',  path: '/admin' },
  { icon: '👨‍🏫', label: 'Faculties',  path: '/admin/faculties' },
  { icon: '🏫', label: 'Sections',   path: '/admin/sections' },
]

interface Stats {
  total_faculties: number
  total_sections:  number
  total_students:  number
  present_today:   number
  unknown_today:   number
}

interface Faculty {
  id: number
  name: string
  email: string
  department: string
  section_count: number
}

export default function AdminDashboard() {
  const [stats,     setStats]     = useState<Stats | null>(null)
  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/api/admin/stats'),
      api.get('/api/admin/faculties')
    ]).then(([s, f]) => {
      setStats(s.data)
      setFaculties(f.data)
    }).finally(() => setLoading(false))
  }, [])

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
      <Sidebar items={NAV} />

      {/* Main content */}
      <div style={{ marginLeft: 240, flex: 1, padding: '32px 36px' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#e2e8f0' }}>
            Admin Dashboard
          </h1>
          <p style={{ color: '#475569', marginTop: 4, fontSize: '0.875rem' }}>📅 {today}</p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#475569' }}>
            <div className="spinner"></div> Loading...
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16, marginBottom: 32
            }}>
              <StatCard icon="👨‍🏫" label="Total Faculties" value={stats?.total_faculties ?? 0} color="#6366f1" />
              <StatCard icon="🏫" label="Total Sections"  value={stats?.total_sections  ?? 0} color="#8b5cf6" />
              <StatCard icon="👨‍🎓" label="Total Students"  value={stats?.total_students  ?? 0} color="#06b6d4" />
              <StatCard icon="✅" label="Present Today"   value={stats?.present_today   ?? 0} color="#22c55e" />
              <StatCard icon="🚨" label="Unknown Today"   value={stats?.unknown_today   ?? 0} color="#f59e0b" />
            </div>

            {/* Faculties table */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0' }}>
                  👨‍🏫 Faculty Overview
                </h2>
                <button
                  className="btn-primary"
                  onClick={() => window.location.href = '/admin/faculties'}
                  style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                >
                  Manage Faculties
                </button>
              </div>

              {faculties.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#475569' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>👨‍🏫</div>
                  <p>No faculties added yet.</p>
                  <button
                    className="btn-primary"
                    onClick={() => window.location.href = '/admin/faculties'}
                    style={{ marginTop: 16 }}
                  >
                    Add First Faculty
                  </button>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Department</th>
                      <th>Sections</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faculties.map(f => (
                      <tr key={f.id}>
                        <td style={{ fontWeight: 500, color: '#e2e8f0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: '50%',
                              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                              display: 'flex', alignItems: 'center',
                              justifyContent: 'center', fontSize: 12, fontWeight: 700
                            }}>
                              {f.name.charAt(0)}
                            </div>
                            {f.name}
                          </div>
                        </td>
                        <td>{f.email}</td>
                        <td>{f.department || '—'}</td>
                        <td>
                          <span className="badge badge-purple">{f.section_count} sections</span>
                        </td>
                        <td><span className="badge badge-green">Active</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}