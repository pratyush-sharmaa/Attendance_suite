import { useEffect, useState, useRef } from 'react'
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

interface Section { id: number; name: string; department: string; semester: string }
interface MarkedEntry { name: string; roll_no: string; time: string; score: number }

export default function QRAttendance() {
  const [sections,        setSections]        = useState<Section[]>([])
  const [selectedSection, setSelectedSection] = useState<Section | null>(null)
  const [qrData,          setQrData]          = useState<any>(null)
  const [sessionData,     setSessionData]     = useState<any>(null)
  const [generating,      setGenerating]      = useState(false)
  const [serverUrl,       setServerUrl]       = useState('')
  const [timeLeft,        setTimeLeft]        = useState(0)
  const [toast,           setToast]           = useState<{ msg: string; type: string } | null>(null)
  const pollRef  = useRef<any>(null)
  const timerRef = useRef<any>(null)

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    api.get('/api/faculty/sections').then(r => {
      setSections(r.data)
      if (r.data.length > 0) setSelectedSection(r.data[0])
    })
    return () => {
      clearInterval(pollRef.current)
      clearInterval(timerRef.current)
    }
  }, [])

  const generateQR = async () => {
    if (!selectedSection) { showToast('Select a section first', 'error'); return }
    setGenerating(true)
    try {
      const fd = new FormData()
      fd.append('section_id',      String(selectedSection.id))
      fd.append('faculty_id',      '1')
      fd.append('expires_minutes', '2')
      fd.append('server_url', serverUrl || window.location.origin)
      const res = await api.post('/api/qr/generate', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setQrData(res.data)
      setSessionData({ marked: [], marked_count: 0, active: true })
      setTimeLeft(2 * 60)

      clearInterval(pollRef.current)
      pollRef.current = setInterval(() => {
        api.get(`/api/qr/session/${res.data.token}`).then(r => {
          setSessionData(r.data)
          if (!r.data.active) {
            clearInterval(pollRef.current)
            clearInterval(timerRef.current)
          }
        })
      }, 3000)

      clearInterval(timerRef.current)
      let remaining = 2 * 60
      timerRef.current = setInterval(() => {
        remaining -= 1
        setTimeLeft(remaining)
        if (remaining <= 0) {
          clearInterval(timerRef.current)
          clearInterval(pollRef.current)
          api.delete(`/api/qr/session/${res.data.token}`).catch(() => {})
          setQrData(null)
          setSessionData(null)
          setTimeLeft(0)
          showToast('⏰ QR session expired — generate a new one to continue', 'error')
        }
      }, 1000)

      showToast('QR code generated!')
    } catch {
      showToast('Failed to generate QR', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const endSession = async () => {
    if (!qrData?.token) return
    await api.delete(`/api/qr/session/${qrData.token}`)
    clearInterval(pollRef.current)
    clearInterval(timerRef.current)
    setQrData(null)
    setSessionData(null)
    setTimeLeft(0)
    showToast('Session ended')
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const pct = timeLeft > 0 ? (timeLeft / (2 * 60)) * 100 : 0

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
      <Sidebar items={NAV} />

      <div style={{ marginLeft: 240, flex: 1, padding: '32px 36px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#e2e8f0' }}>📱 QR Self-Attendance</h1>
          <p style={{ color: '#475569', marginTop: 4, fontSize: '0.875rem' }}>
            Generate a QR code — students scan with phone, take a selfie, attendance marked automatically
          </p>
        </div>

        {!qrData ? (
          <div style={{ maxWidth: 560 }}>
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ color: '#e2e8f0', marginBottom: 20, fontWeight: 600 }}>⚙️ Setup Session</h3>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Section</label>
                <select
                  value={selectedSection?.id || ''}
                  onChange={e => {
                    const sec = sections.find(s => s.id === parseInt(e.target.value))
                    if (sec) setSelectedSection(sec)
                  }}
                >
                  {sections.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.semester ? ` — Sem ${s.semester}` : ''} — {s.department}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 4 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>
                  Your PC IP Address <span style={{ color: '#334155' }}>(so phones can connect)</span>
                </label>
                <input
                  placeholder="e.g. http://192.168.1.10:5173"
                  value={serverUrl}
                  onChange={e => setServerUrl(e.target.value)}
                />
                <p style={{ color: '#334155', fontSize: '0.72rem', marginTop: 6, lineHeight: 1.6 }}>
                  Run <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: 4 }}>ipconfig</code> (Windows) or <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: 4 }}>ifconfig</code> (Mac/Linux) to find your IP. Both PC and phone must be on the same WiFi.
                </p>
              </div>

              <div style={{
                background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 10, padding: 16, marginBottom: 20, fontSize: '0.85rem', color: '#818cf8'
              }}>
                <strong>How it works:</strong>
                <ol style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 2, color: '#94a3b8' }}>
                  <li>Click Generate — a QR code appears</li>
                  <li>Show QR on screen</li>
                  <li>Students scan with phone camera</li>
                  <li>They enter roll number + take selfie</li>
                  <li>Face verified → attendance marked instantly</li>
                  <li>Watch names appear here in real-time ✨</li>
                </ol>
              </div>

              <button
                className="btn-primary"
                onClick={generateQR}
                disabled={generating || !selectedSection}
                style={{ width: '100%', justifyContent: 'center', padding: '14px' }}
              >
                {generating
                  ? <><span className="spinner"></span> Generating...</>
                  : '🔲 Generate QR Code'
                }
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

            {/* Left — QR display */}
            <div>
              <div className="card" style={{ textAlign: 'center', padding: 28 }}>
                <div style={{ marginBottom: 16 }}>
                  <span className="badge badge-green" style={{ fontSize: '0.8rem', padding: '6px 14px' }}>
                    🟢 SESSION ACTIVE
                  </span>
                </div>

                <div style={{
                  background: 'white', borderRadius: 16, padding: 16,
                  display: 'inline-block', marginBottom: 20,
                  boxShadow: '0 0 40px rgba(99,102,241,0.3)'
                }}>
                  <img
                    src={qrData.qr_image}
                    alt="QR Code"
                    style={{ width: 220, height: 220, display: 'block' }}
                  />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <p style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 4 }}>
                    {selectedSection?.name} — Scan to Mark Attendance
                  </p>
                  <p style={{ color: '#475569', fontSize: '0.8rem' }}>
                    Students: open phone camera → scan QR → selfie ✅
                  </p>
                </div>

                {/* Countdown */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    marginBottom: 6, fontSize: '0.8rem'
                  }}>
                    <span style={{ color: '#475569' }}>Time remaining</span>
                    <span style={{
                      color: timeLeft < 60 ? '#ef4444' : timeLeft < 180 ? '#f59e0b' : '#22c55e',
                      fontWeight: 700, fontFamily: 'monospace', fontSize: '1rem'
                    }}>
                      {formatTime(timeLeft)}
                    </span>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 99, height: 8 }}>
                    <div style={{
                      width: `${pct}%`, height: '100%', borderRadius: 99, transition: 'width 1s linear',
                      background: timeLeft < 60 ? '#ef4444' : timeLeft < 180 ? '#f59e0b' : 'linear-gradient(90deg,#6366f1,#22c55e)'
                    }} />
                  </div>
                </div>

                <button
                  className="btn-danger"
                  onClick={endSession}
                  style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
                >
                  ⏹ End Session
                </button>
              </div>

              <div className="card" style={{ marginTop: 16, padding: 16 }}>
                <p style={{ color: '#475569', fontSize: '0.75rem', marginBottom: 8 }}>
                  📋 Manual link (share if QR scan doesn't work):
                </p>
                <div style={{
                  background: 'rgba(255,255,255,0.04)', borderRadius: 8,
                  padding: '8px 12px', fontFamily: 'monospace',
                  fontSize: '0.75rem', color: '#818cf8',
                  wordBreak: 'break-all'
                }}>
                  {qrData.student_url}
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(qrData.student_url); showToast('Link copied!') }}
                  className="btn-secondary"
                  style={{ marginTop: 10, width: '100%', padding: '8px', justifyContent: 'center', fontSize: '0.8rem' }}
                >
                  📋 Copy Link
                </button>
              </div>
            </div>

            {/* Right — Live attendance feed */}
            <div>
              <div className="card" style={{ height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3 style={{ color: '#e2e8f0', fontWeight: 600 }}>⚡ Live Feed</h3>
                  <span className="badge badge-purple">
                    {sessionData?.marked_count || 0} marked
                  </span>
                </div>

                {!sessionData?.marked?.length ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: '#334155' }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
                    <p style={{ fontSize: '0.9rem' }}>Waiting for students to scan...</p>
                    <p style={{ fontSize: '0.8rem', marginTop: 8, color: '#1e293b' }}>
                      Names will appear here as attendance is marked
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 500, overflowY: 'auto' }}>
                    {[...(sessionData.marked || [])].reverse().map((entry: MarkedEntry, i: number) => (
                      <div key={i} style={{
                        background: 'rgba(34,197,94,0.08)',
                        border: '1px solid rgba(34,197,94,0.2)',
                        borderRadius: 10, padding: '14px 16px',
                        display: 'flex', alignItems: 'center', gap: 12,
                        animation: 'slideIn 0.3s ease'
                      }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%',
                          background: 'linear-gradient(135deg,#22c55e,#06b6d4)',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 16, fontWeight: 700,
                          flexShrink: 0
                        }}>
                          {entry.name.charAt(0)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{entry.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                            {entry.roll_no} • {entry.time} • Match: {Math.round(entry.score * 100)}%
                          </div>
                        </div>
                        <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>✅ Marked</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}
