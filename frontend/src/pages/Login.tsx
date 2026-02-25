import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api'

function decodeJWT(token: string) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return {}
  }
}

export default function Login() {
  const navigate  = useNavigate()
  const { login } = useAuth()

  const [tab,      setTab]      = useState<'admin' | 'faculty'>('faculty')
  const [email,    setEmail]    = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const handleLogin = async () => {
    setError('')
    setLoading(true)
    try {
      if (tab === 'admin') {
        const res     = await api.post('/api/auth/admin-login', { username, password })
        const payload = decodeJWT(res.data.token)
        login(res.data.token, 'admin', username, payload.sub)
        navigate('/admin')
      } else {
        const res     = await api.post('/api/auth/faculty-login', { email, password })
        const payload = decodeJWT(res.data.token)
        login(res.data.token, 'faculty', payload.name || email, payload.sub)
        navigate('/faculty')
      }
    } catch {
      setError('Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at 60% 50%, #1a1040 0%, #0a0a0f 70%)',
      padding: '20px'
    }}>
      {/* Glow orbs */}
      <div style={{
        position: 'fixed', top: '20%', left: '15%',
        width: 400, height: 400,
        background: 'rgba(99,102,241,0.12)',
        borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none'
      }}/>
      <div style={{
        position: 'fixed', bottom: '20%', right: '15%',
        width: 300, height: 300,
        background: 'rgba(139,92,246,0.1)',
        borderRadius: '50%', filter: 'blur(60px)', pointerEvents: 'none'
      }}/>

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 28,
            boxShadow: '0 0 30px rgba(99,102,241,0.4)'
          }}>🎓</div>
          <h1 className="gradient-text" style={{ fontSize: '1.8rem', fontWeight: 700 }}>
            Attendance
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: 6 }}>
            AI-Powered Attendance System
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 32 }}>

          {/* Tabs */}
          <div style={{
            display: 'flex', background: 'rgba(255,255,255,0.04)',
            borderRadius: 10, padding: 4, marginBottom: 28
          }}>
            {(['faculty', 'admin'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setError('') }} style={{
                flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
                cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
                transition: 'all 0.2s',
                background: tab === t ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'transparent',
                color: tab === t ? 'white' : '#64748b'
              }}>
                {t === 'faculty' ? '👨‍🏫 Faculty' : '🔐 Admin'}
              </button>
            ))}
          </div>

          {/* Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {tab === 'admin' ? (
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>
                  Username
                </label>
                <input
                  type="text"
                  placeholder="Enter username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                />
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>
                Password
              </label>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: '0.875rem'
              }}>
                ❌ {error}
              </div>
            )}

            <button
              className="btn-primary"
              onClick={handleLogin}
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', padding: '13px', marginTop: 4 }}
            >
              {loading ? <><span className="spinner"></span> Authenticating...</> : '🚀 Sign In'}
            </button>
          </div>

          {tab === 'admin' && (
            <p style={{ textAlign: 'center', marginTop: 16, fontSize: '0.75rem', color: '#334155' }}>
              Default: admin / admin123
            </p>
          )}
        </div>
      </div>
    </div>
  )
}