import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

interface NavItem { icon: string; label: string; path: string }

export default function Sidebar({ items }: { items: NavItem[] }) {
  const navigate       = useNavigate()
  const location       = useLocation()
  const { user, logout } = useAuth()

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div style={{
      width: 240, position: 'fixed', top: 0, left: 0, bottom: 0,
      background: 'rgba(13,13,20,0.98)',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', flexDirection: 'column',
      zIndex: 50
    }}>
      {/* Logo */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, boxShadow: '0 0 16px rgba(99,102,241,0.35)'
          }}>🎓</div>
          <div>
            <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '1rem' }}>Attendance Portal</div>
            <div style={{ fontSize: '0.7rem', color: '#475569' }}>
              {user?.role === 'admin' ? 'Admin Portal' : 'Faculty Portal'}
            </div>
          </div>
        </div>
      </div>

      {/* User info */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 14, flexShrink: 0
          }}>
            {(user?.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontWeight: 600, color: '#e2e8f0', fontSize: '0.85rem',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>
              {user?.name}
            </div>
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1,
              padding: '2px 6px', borderRadius: 4,
              background: 'rgba(99,102,241,0.2)', color: '#818cf8'
            }}>
              {user?.role?.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Nav — scrollable middle section */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
        {items.map(item => {
          const active = location.pathname === item.path
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8, border: 'none',
                cursor: 'pointer', marginBottom: 2, transition: 'all 0.15s',
                background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                borderLeft: active ? '3px solid #6366f1' : '3px solid transparent',
                color: active ? '#e2e8f0' : '#475569',
                fontWeight: active ? 600 : 400, fontSize: '0.875rem',
                textAlign: 'left'
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </div>

      {/* Sign out — always visible at bottom */}
      <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
        <button
          onClick={handleLogout}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 8, border: 'none',
            cursor: 'pointer', transition: 'all 0.15s',
            background: 'rgba(239,68,68,0.08)', color: '#f87171',
            fontWeight: 600, fontSize: '0.875rem'
          }}
        >
          <span style={{ fontSize: 16 }}>🚪</span> Sign Out
        </button>
      </div>
    </div>
  )
}