import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api'

type Step = 'loading' | 'invalid' | 'expired' | 'roll' | 'camera' | 'submitting' | 'success' | 'error'

export default function StudentAttendance() {
  const [params]        = useSearchParams()
  const token           = params.get('token') || ''

  const [step,          setStep]          = useState<Step>('loading')
  const [sessionInfo,   setSessionInfo]   = useState<any>(null)
  const [rollNo,        setRollNo]        = useState('')
  const [message,       setMessage]       = useState('')
  const [resultData,    setResultData]    = useState<any>(null)
  const [cameraError,   setCameraError]   = useState('')
  const [photoPreview,  setPhotoPreview]  = useState<string | null>(null)
  const [capturedBlob,  setCapturedBlob]  = useState<Blob | null>(null)

  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!token) { setStep('invalid'); return }
    api.get(`/api/qr/validate/${token}`)
      .then(r => { setSessionInfo(r.data); setStep('roll') })
      .catch(e => {
        if (e.response?.status === 410) setStep('expired')
        else setStep('invalid')
      })
  }, [token])

  const startCamera = async () => {
    setCameraError('')
    setStep('camera')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    } catch {
      setCameraError('Camera access denied. Please allow camera in your browser.')
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
  }

  const capture = () => {
    if (!canvasRef.current || !videoRef.current) return
    const canvas = canvasRef.current
    const video  = videoRef.current
    canvas.width  = video.videoWidth  || 640
    canvas.height = video.videoHeight || 480
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    setPhotoPreview(canvas.toDataURL('image/jpeg', 0.9))
    canvas.toBlob(blob => { if (blob) setCapturedBlob(blob) }, 'image/jpeg', 0.9)
  }

  const retake = () => {
    setPhotoPreview(null)
    setCapturedBlob(null)
  }

  const submit = async () => {
    if (!capturedBlob) return
    setStep('submitting')
    stopCamera()
    try {
      const fd = new FormData()
      fd.append('token',   token)
      fd.append('roll_no', rollNo.trim().toUpperCase())
      fd.append('selfie',  capturedBlob, 'selfie.jpg')
      const res = await api.post('/api/qr/submit', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setResultData(res.data)
      setStep('success')
    } catch (e: any) {
      setMessage(e.response?.data?.detail || 'Submission failed. Please try again.')
      setStep('error')
    }
  }

  // Clean up camera on unmount
  useEffect(() => () => stopCamera(), [])

  const cardStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse at 50% 30%, #1a1040 0%, #0a0a0f 70%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '20px', fontFamily: 'Inter, sans-serif'
  }

  const boxStyle: React.CSSProperties = {
    width: '100%', maxWidth: 420,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20, padding: 28, textAlign: 'center'
  }

  // ── Loading ───────────────────────────────────────────────
  if (step === 'loading') return (
    <div style={cardStyle}>
      <div style={boxStyle}>
        <div className="spinner" style={{ margin: '0 auto 16px', width: 36, height: 36 }}></div>
        <p style={{ color: '#475569' }}>Verifying QR session...</p>
      </div>
    </div>
  )

  // ── Invalid ───────────────────────────────────────────────
  if (step === 'invalid') return (
    <div style={cardStyle}>
      <div style={boxStyle}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>❌</div>
        <h2 style={{ color: '#f87171', marginBottom: 8 }}>Invalid QR Code</h2>
        <p style={{ color: '#475569', fontSize: '0.9rem' }}>
          This QR code is invalid. Please scan the correct QR code shown by your faculty.
        </p>
      </div>
    </div>
  )

  // ── Expired ───────────────────────────────────────────────
  if (step === 'expired') return (
    <div style={cardStyle}>
      <div style={boxStyle}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>⏰</div>
        <h2 style={{ color: '#f59e0b', marginBottom: 8 }}>QR Code Expired</h2>
        <p style={{ color: '#475569', fontSize: '0.9rem' }}>
          This session has ended. Ask your faculty to generate a new QR code.
        </p>
      </div>
    </div>
  )

  // ── Success ───────────────────────────────────────────────
  if (step === 'success') return (
    <div style={cardStyle}>
      <div style={boxStyle}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>
          {resultData?.already ? '🔁' : '✅'}
        </div>
        <h2 style={{
          color: resultData?.already ? '#f59e0b' : '#22c55e',
          marginBottom: 8, fontSize: '1.4rem'
        }}>
          {resultData?.already ? 'Already Marked!' : 'Attendance Marked!'}
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: 20 }}>
          {resultData?.message}
        </p>
        <div style={{
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: 12, padding: 16
        }}>
          <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '1.1rem' }}>{resultData?.name}</div>
          <div style={{ color: '#475569', fontSize: '0.85rem', marginTop: 4 }}>
            {resultData?.roll_no} • Face match: {Math.round((resultData?.similarity || 0) * 100)}%
          </div>
        </div>
        <p style={{ color: '#334155', fontSize: '0.75rem', marginTop: 20 }}>
          You can close this tab now.
        </p>
      </div>
    </div>
  )

  // ── Error ─────────────────────────────────────────────────
  if (step === 'error') return (
    <div style={cardStyle}>
      <div style={boxStyle}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>😕</div>
        <h2 style={{ color: '#f87171', marginBottom: 8 }}>Oops!</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 20 }}>{message}</p>
        <button
          onClick={() => { setStep('roll'); setPhotoPreview(null); setCapturedBlob(null) }}
          style={{
            width: '100%', padding: '12px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem'
          }}
        >
          🔄 Try Again
        </button>
      </div>
    </div>
  )

  // ── Submitting ────────────────────────────────────────────
  if (step === 'submitting') return (
    <div style={cardStyle}>
      <div style={boxStyle}>
        <div className="spinner" style={{ margin: '0 auto 16px', width: 40, height: 40 }}></div>
        <h3 style={{ color: '#e2e8f0', marginBottom: 8 }}>Verifying your face...</h3>
        <p style={{ color: '#475569', fontSize: '0.85rem' }}>This takes just a second ✨</p>
      </div>
    </div>
  )

  return (
    <div style={cardStyle}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px', fontSize: 24,
          boxShadow: '0 0 24px rgba(99,102,241,0.4)'
        }}>🎓</div>
        <h1 style={{ color: '#e2e8f0', fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>FaceAttend</h1>
        {sessionInfo && (
          <p style={{ color: '#6366f1', fontSize: '0.85rem', marginTop: 4 }}>
            {sessionInfo.section_name} • {sessionInfo.department}
          </p>
        )}
      </div>

      <div style={{ ...boxStyle, textAlign: 'left' }}>

        {/* Step 1 — Roll Number */}
        {step === 'roll' && (
          <>
            <h2 style={{ color: '#e2e8f0', fontSize: '1.1rem', fontWeight: 600, marginBottom: 6 }}>
              Step 1 — Enter Roll Number
            </h2>
            <p style={{ color: '#475569', fontSize: '0.85rem', marginBottom: 20 }}>
              Enter your roll number exactly as registered
            </p>
            <input
              placeholder="e.g. CS2024001"
              value={rollNo}
              onChange={e => setRollNo(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && rollNo && startCamera()}
              style={{
                width: '100%', padding: '14px 16px', borderRadius: 10,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#e2e8f0', fontSize: '1rem', outline: 'none',
                marginBottom: 16, boxSizing: 'border-box',
                fontFamily: 'monospace', letterSpacing: 2, textAlign: 'center',
                textTransform: 'uppercase'
              }}
            />
            <button
              onClick={startCamera}
              disabled={!rollNo.trim()}
              style={{
                width: '100%', padding: '13px', borderRadius: 10, border: 'none',
                background: rollNo.trim()
                  ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
                  : 'rgba(255,255,255,0.06)',
                color: rollNo.trim() ? 'white' : '#334155',
                fontWeight: 600, cursor: rollNo.trim() ? 'pointer' : 'not-allowed',
                fontSize: '0.95rem'
              }}
            >
              📸 Continue to Selfie →
            </button>
          </>
        )}

        {/* Step 2 — Camera */}
        {step === 'camera' && (
          <>
            <h2 style={{ color: '#e2e8f0', fontSize: '1.1rem', fontWeight: 600, marginBottom: 6 }}>
              Step 2 — Take Selfie
            </h2>
            <p style={{ color: '#475569', fontSize: '0.85rem', marginBottom: 16 }}>
              Look straight at camera • Good lighting • No glasses if possible
            </p>

            {cameraError ? (
              <div style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 10, padding: 16, color: '#f87171', fontSize: '0.85rem',
                marginBottom: 16
              }}>
                ❌ {cameraError}
              </div>
            ) : (
              <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 16, background: '#000' }}>
                {!photoPreview ? (
                  <video
                    ref={videoRef}
                    autoPlay muted playsInline
                    style={{ width: '100%', display: 'block', borderRadius: 12, minHeight: 280 }}
                  />
                ) : (
                  <img src={photoPreview} alt="captured" style={{ width: '100%', borderRadius: 12, display: 'block' }} />
                )}
                {/* Face guide oval */}
                {!photoPreview && (
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'
                  }}>
                    <div style={{
                      width: 140, height: 175, borderRadius: '50%',
                      border: '2px dashed rgba(99,102,241,0.6)',
                    }} />
                  </div>
                )}
              </div>
            )}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            <div style={{ display: 'flex', gap: 10 }}>
              {!photoPreview ? (
                <button
                  onClick={capture}
                  style={{
                    flex: 1, padding: '13px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg,#22c55e,#16a34a)',
                    color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem'
                  }}
                >
                  📸 Capture
                </button>
              ) : (
                <>
                  <button
                    onClick={retake}
                    style={{
                      flex: 1, padding: '13px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      color: '#94a3b8', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem'
                    }}
                  >
                    🔄 Retake
                  </button>
                  <button
                    onClick={submit}
                    style={{
                      flex: 2, padding: '13px', borderRadius: 10, border: 'none',
                      background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                      color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem'
                    }}
                  >
                    ✅ Submit Attendance
                  </button>
                </>
              )}
            </div>

            <button
              onClick={() => { stopCamera(); setStep('roll') }}
              style={{
                width: '100%', marginTop: 10, padding: '10px', borderRadius: 10,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                color: '#475569', cursor: 'pointer', fontSize: '0.85rem'
              }}
            >
              ← Back
            </button>
          </>
        )}
      </div>

      <p style={{ color: '#1e293b', fontSize: '0.75rem', marginTop: 20 }}>
        Powered by FaceAttend AI
      </p>
    </div>
  )
}