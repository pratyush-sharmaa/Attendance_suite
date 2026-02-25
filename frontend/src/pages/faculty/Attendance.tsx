import { useEffect, useRef, useState } from 'react'
import Sidebar from '../../components/Sidebar'
import api from '../../api'
import { useAuth } from '../../context/AuthContext'

const NAV = [
  { icon: '📊', label: 'Dashboard',     path: '/faculty' },
  { icon: '👨‍🎓', label: 'Students',      path: '/faculty/students' },
  { icon: '📷', label: 'Attendance',    path: '/faculty/attendance' },
  { icon: '📱', label: 'QR Attendance', path: '/faculty/qr' },      // NEW
  { icon: '📧', label: 'Alerts',        path: '/faculty/alerts' },   // NEW
  { icon: '📋', label: 'Reports',       path: '/faculty/reports' },
]

interface Section { id: number; name: string; department: string }
interface Result  { name: string; roll_no: string; similarity: number; status: string }

export default function FacultyAttendance() {
  const { user } = useAuth()

  const [sections,        setSections]        = useState<Section[]>([])
  const [selectedSection, setSelectedSection] = useState<Section | null>(null)
  const [mode,            setMode]            = useState<'webcam' | 'classroom'>('webcam')
  const [threshold,       setThreshold]       = useState(0.5)
  const [results,         setResults]         = useState<Result[]>([])
  const [annotatedImg,    setAnnotatedImg]     = useState<string | null>(null)
  const [processing,      setProcessing]       = useState(false)
  const [cameraOn,        setCameraOn]         = useState(false)
  const [cameraError,     setCameraError]      = useState('')
  const [toast,           setToast]           = useState<{ msg: string; type: string } | null>(null)

  const videoRef     = useRef<HTMLVideoElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // Load sections on mount — fully release camera on unmount
  useEffect(() => {
    api.get('/api/faculty/sections').then(r => {
      setSections(r.data)
      if (r.data.length > 0) setSelectedSection(r.data[0])
    })

    return () => {
      // Guaranteed cleanup when navigating away
      releaseCamera()
    }
  }, [])

  // Mode change — stop camera when switching to classroom, do NOT auto-start webcam
  useEffect(() => {
    if (mode === 'classroom') {
      stopCamera()
      setAnnotatedImg(null)
      setResults([])
    }
    // webcam mode: user clicks Start Camera manually
  }, [mode])

  // The real camera release — detach video FIRST, then stop tracks
  const releaseCamera = () => {
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => {
        t.enabled = false
        t.stop()
      })
      streamRef.current = null
    }
  }

  const startCamera = async () => {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setCameraOn(true)
    } catch {
      setCameraError('Camera access denied. Please allow camera permission in your browser and try again.')
      setCameraOn(false)
    }
  }

  const stopCamera = () => {
    // Detach from video element FIRST (Chrome quirk — must do this before stopping tracks)
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
    // Now stop all tracks — camera light turns off
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => {
        t.enabled = false
        t.stop()
      })
      streamRef.current = null
    }
    setCameraOn(false)
    setCameraError('')
  }

  const captureAndProcess = async () => {
    if (!canvasRef.current || !videoRef.current) {
      showToast('Camera not ready', 'error'); return
    }
    if (!selectedSection) {
      showToast('Please select a section first', 'error'); return
    }
    const canvas = canvasRef.current
    const video  = videoRef.current
    canvas.width  = video.videoWidth  || 640
    canvas.height = video.videoHeight || 480
    canvas.getContext('2d')?.drawImage(video, 0, 0)

    canvas.toBlob(async blob => {
      if (!blob) { showToast('Failed to capture image', 'error'); return }
      await processImage(blob, 'webcam')
    }, 'image/jpeg', 0.92)
  }

  const processImage = async (blob: Blob, method: string) => {
    if (!selectedSection) {
      showToast('Select a section first', 'error'); return
    }
    setProcessing(true)
    setResults([])
    setAnnotatedImg(null)

    try {
      const facultyId = user?.sub || '1'
      const fd = new FormData()
      fd.append('photo',      blob, 'capture.jpg')
      fd.append('section_id', String(selectedSection.id))
      fd.append('faculty_id', facultyId)
      fd.append('method',     method)
      fd.append('threshold',  String(threshold))

      const res = await api.post('/api/attendance/process', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      setResults(res.data.results)
      setAnnotatedImg(res.data.annotated_image)

      const { marked, already_marked, unknown } = res.data.summary
      if (res.data.summary.total_faces === 0) {
        showToast('No faces detected in image', 'error')
      } else {
        showToast(`✅ ${marked} marked, ${already_marked} already marked, ${unknown} unknown`)
      }
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Processing failed. Check backend.', 'error')
    } finally {
      setProcessing(false)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processImage(file, 'classroom')
    e.target.value = ''
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
      <Sidebar items={NAV} />

      <div style={{ marginLeft: 240, flex: 1, padding: '32px 36px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#e2e8f0' }}>📷 Take Attendance</h1>
          <p style={{ color: '#475569', marginTop: 4, fontSize: '0.875rem' }}>
            Webcam or classroom photo — AI detects faces and marks attendance automatically
          </p>
        </div>

        {sections.length === 0 && (
          <div style={{
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 12, padding: '16px 20px', color: '#fbbf24',
            marginBottom: 24, fontSize: '0.875rem'
          }}>
            ⚠️ No sections assigned to you. Ask admin to assign sections first.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24 }}>
          <div>
            {/* Controls */}
            <div className="card" style={{ marginBottom: 16, padding: 20 }}>
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
                      // Only clear results — camera keeps running
                      setResults([])
                      setAnnotatedImg(null)
                    }}
                  >
                    {sections.length === 0
                      ? <option>No sections available</option>
                      : sections.map(s => <option key={s.id} value={s.id}>{s.name} — {s.department}</option>)
                    }
                  </select>
                </div>

                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>
                    Mode
                  </label>
                  <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3 }}>
                    {(['webcam', 'classroom'] as const).map(m => (
                      <button key={m} onClick={() => setMode(m)} style={{
                        flex: 1, padding: '8px', borderRadius: 6, border: 'none',
                        cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', transition: 'all 0.2s',
                        background: mode === m ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'transparent',
                        color: mode === m ? 'white' : '#64748b'
                      }}>
                        {m === 'webcam' ? '📷 Webcam' : '🖼️ Upload Photo'}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ minWidth: 150 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>
                    Confidence: <strong style={{ color: '#818cf8' }}>{Math.round(threshold * 100)}%</strong>
                  </label>
                  <input
                    type="range" min="0.3" max="0.9" step="0.05"
                    value={threshold}
                    onChange={e => setThreshold(parseFloat(e.target.value))}
                    style={{
                      width: '100%', padding: '0 !important',
                      border: 'none !important', background: 'transparent !important',
                      accentColor: '#6366f1'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Webcam */}
            {mode === 'webcam' && (
              <div className="card" style={{ padding: 20 }}>
                {cameraError && (
                  <div style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 8, padding: '12px 16px', color: '#f87171',
                    fontSize: '0.875rem', marginBottom: 16
                  }}>
                    ❌ {cameraError}
                  </div>
                )}

                <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#050508', minHeight: 320 }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    style={{ width: '100%', display: 'block', borderRadius: 12 }}
                  />
                  {!cameraOn && (
                    <div style={{
                      position: 'absolute', inset: 0, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      flexDirection: 'column', gap: 12, color: '#334155'
                    }}>
                      <div style={{ fontSize: 48 }}>📷</div>
                      <p style={{ fontSize: '0.9rem' }}>Click "Start Camera" to begin</p>
                    </div>
                  )}
                  {cameraOn && (
                    <div style={{
                      position: 'absolute', top: 12, right: 12,
                      background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)',
                      borderRadius: 20, padding: '4px 10px', color: '#4ade80', fontSize: '0.75rem',
                      display: 'flex', alignItems: 'center', gap: 6
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80' }}/>
                      LIVE
                    </div>
                  )}
                </div>
                <canvas ref={canvasRef} style={{ display: 'none' }} />

                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  {!cameraOn ? (
                    <button
                      className="btn-primary"
                      onClick={startCamera}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      🎥 Start Camera
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn-primary"
                        onClick={captureAndProcess}
                        disabled={processing || !selectedSection}
                        style={{ flex: 2, justifyContent: 'center', background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}
                      >
                        {processing
                          ? <><span className="spinner"></span> Processing...</>
                          : '📸 Capture & Mark Attendance'
                        }
                      </button>
                      <button className="btn-secondary" onClick={stopCamera}>
                        ⏹ Stop
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Upload */}
            {mode === 'classroom' && (
              <div className="card" style={{ padding: 20 }}>
                <div
                  onClick={() => !processing && fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed rgba(99,102,241,0.3)',
                    borderRadius: 12, padding: '60px 20px', textAlign: 'center',
                    cursor: processing ? 'not-allowed' : 'pointer',
                    background: 'rgba(99,102,241,0.04)', transition: 'all 0.2s'
                  }}
                >
                  {processing ? (
                    <>
                      <div className="spinner" style={{ margin: '0 auto 16px', width: 32, height: 32 }}></div>
                      <div style={{ color: '#6366f1', fontWeight: 600 }}>Detecting faces...</div>
                      <div style={{ color: '#475569', fontSize: '0.85rem', marginTop: 6 }}>This may take a few seconds</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 52, marginBottom: 12 }}>🖼️</div>
                      <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '1.05rem', marginBottom: 6 }}>Upload Classroom Photo</div>
                      <div style={{ color: '#475569', fontSize: '0.85rem', marginBottom: 16 }}>All faces detected and marked simultaneously</div>
                      <button className="btn-primary" style={{ pointerEvents: 'none' }}>📁 Choose Photo</button>
                    </>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
              </div>
            )}

            {annotatedImg && (
              <div className="card" style={{ marginTop: 16, padding: 16 }}>
                <h3 style={{ color: '#e2e8f0', marginBottom: 12, fontWeight: 600, fontSize: '0.95rem' }}>🎯 Recognition Result</h3>
                <img src={annotatedImg} alt="result" style={{ width: '100%', borderRadius: 10, display: 'block', border: '1px solid rgba(255,255,255,0.07)' }} />
              </div>
            )}
          </div>

          {/* Results panel */}
          <div>
            <div className="card" style={{ position: 'sticky', top: 24 }}>
              <h3 style={{ color: '#e2e8f0', marginBottom: 16, fontWeight: 600 }}>📋 Session Results</h3>

              {results.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: '#334155' }}>
                  <div style={{ fontSize: 44, marginBottom: 12 }}>🎯</div>
                  <p style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                    {mode === 'webcam'
                      ? 'Start camera and click "Capture & Mark Attendance"'
                      : 'Upload a classroom photo to detect all faces'
                    }
                  </p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                    {[
                      { label: 'Marked',  val: results.filter(r => r.status === 'marked').length,         color: '#22c55e' },
                      { label: 'Already', val: results.filter(r => r.status === 'already_marked').length, color: '#f59e0b' },
                      { label: 'Unknown', val: results.filter(r => r.status === 'unknown').length,        color: '#ef4444' },
                      { label: 'Total',   val: results.length,                                             color: '#6366f1' },
                    ].map(s => (
                      <div key={s.label} style={{
                        background: `${s.color}15`, border: `1px solid ${s.color}30`,
                        borderRadius: 8, padding: '10px', textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color }}>{s.val}</div>
                        <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
                    {results.map((r, i) => (
                      <div key={i} style={{
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 10, padding: '12px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.875rem' }}>
                            {r.name === 'Unknown' ? '❓ Unknown Person' : r.name}
                          </div>
                          <span className={`badge ${r.status === 'marked' ? 'badge-green' : r.status === 'already_marked' ? 'badge-orange' : 'badge-red'}`} style={{ fontSize: '0.7rem' }}>
                            {r.status === 'marked' ? '✅ Marked' : r.status === 'already_marked' ? '🔁 Already' : '❓ Unknown'}
                          </span>
                        </div>
                        {r.roll_no !== 'unknown' && (
                          <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: 4 }}>
                            Roll: {r.roll_no} • Match: {(r.similarity * 100).toFixed(1)}%
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    className="btn-secondary"
                    onClick={() => { setResults([]); setAnnotatedImg(null) }}
                    style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                  >
                    🔄 Clear Results
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}