import { useEffect, useRef, useState } from 'react'
import api from '../api'
import { useAuth } from '../context/AuthContext'

interface Message {
  role: 'user' | 'assistant'
  content: string
  data?: any[]
  sql_used?: string
  loading?: boolean
}

const SUGGESTIONS = [
  "How many sections are assigned to me?",
  "Who has < 75% attendance?",
  "List all my students",
  "Today's attendance summary",
  "Which section has best attendance?",
  "Students who never attended",
]

export default function ChatBot() {
  const [open,        setOpen]        = useState(false)
  const [messages,    setMessages]    = useState<Message[]>([])
  const [input,       setInput]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [configured,  setConfigured]  = useState(false)
  const [apiKey,      setApiKey]      = useState('')
  const [showSetup,   setShowSetup]   = useState(false)
  const [savingKey,   setSavingKey]   = useState(false)
  const [setupError,  setSetupError]  = useState('')
  const { user } = useAuth()
  const bottomRef   = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLInputElement>(null)
  const keyInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.get('/api/chat/config')
      .then(r => setConfigured(r.data.configured))
      .catch(() => {})
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!open) return
    if (!configured) {
      setTimeout(() => keyInputRef.current?.focus(), 150)
    } else {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
    if (messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: "Hi! 👋 I'm AttendAI. Ask me anything about your students, sections, or attendance data!"
      }])
    }
  }, [open])

  const saveApiKey = async () => {
    if (!apiKey.trim()) return
    setSavingKey(true)
    setSetupError('')
    try {
      await api.post('/api/chat/configure', { api_key: apiKey.trim() })
      setConfigured(true)
      setShowSetup(false)
      setApiKey('')
      setMessages([{
        role: 'assistant',
        content: "✅ API key saved! I'm ready. Ask me anything about your attendance data!"
      }])
      setTimeout(() => inputRef.current?.focus(), 100)
    } catch (e: any) {
      setSetupError(e.response?.data?.detail || 'Failed to save. Check the key and try again.')
    } finally {
      setSavingKey(false)
    }
  }

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim()
    if (!msg || loading || !configured) return
    setInput('')

    const history = messages
      .filter(m => !m.loading)
      .slice(-8)
      .map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [
      ...prev,
      { role: 'user', content: msg },
      { role: 'assistant', content: '', loading: true }
    ])
    setLoading(true)

    try {
      const res = await api.post('/api/chat/message', {
        message:      msg,
        history,
        faculty_id:   user?.sub  ? parseInt(user.sub as string) : null,
        faculty_name: (user?.name as string) || null,
        role:         (user?.role as string) || 'faculty'
      })
      setMessages(prev => [
        ...prev.filter(m => !m.loading),
        { role: 'assistant', content: res.data.answer, data: res.data.data, sql_used: res.data.sql_used }
      ])
    } catch (e: any) {
      const detail = e.response?.data?.detail || ''
      let errMsg = '❌ Something went wrong.'
      if (detail.includes('GROQ_API_KEY') || detail.includes('API key')) {
        errMsg = '❌ API key missing or invalid. Click ⚙️ above to add your Groq key.'
      } else if (e.response?.status === 429) {
        errMsg = '❌ Rate limit hit. Wait a moment and try again.'
      } else if (detail) {
        errMsg = `❌ ${detail}`
      }
      setMessages(prev => [...prev.filter(m => !m.loading), { role: 'assistant', content: errMsg }])
    } finally {
      setLoading(false)
    }
  }

  const renderTable = (data: any[]) => {
    if (!data?.length) return null
    const cols = Object.keys(data[0])
    return (
      <div style={{ marginTop: 8, overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.71rem' }}>
          <thead>
            <tr style={{ background: 'rgba(99,102,241,0.12)' }}>
              {cols.map(c => (
                <th key={c} style={{
                  padding: '6px 10px', textAlign: 'left', color: '#818cf8',
                  fontWeight: 700, whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.08)'
                }}>
                  {c.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 15).map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                {cols.map(c => {
                  const val = row[c]
                  const isPct = c.toLowerCase().includes('pct') || c.toLowerCase().includes('percent') || c.toLowerCase().includes('rate')
                  const num = parseFloat(String(val))
                  return (
                    <td key={c} style={{ padding: '6px 10px', color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                      {isPct && !isNaN(num)
                        ? <span style={{ fontWeight: 700, color: num < 75 ? '#f87171' : num < 85 ? '#fbbf24' : '#4ade80' }}>{num.toFixed(1)}%</span>
                        : String(val ?? '—')}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length > 15 && (
          <div style={{ padding: '5px 10px', color: '#475569', fontSize: '0.68rem', background: 'rgba(0,0,0,0.2)' }}>
            Showing 15 of {data.length} rows
          </div>
        )}
      </div>
    )
  }

  const SetupScreen = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      <div style={{ fontSize: 44 }}>🔑</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '1rem', marginBottom: 6 }}>Setup Groq API Key</div>
        <p style={{ color: '#64748b', fontSize: '0.78rem', lineHeight: 1.7 }}>
          Get a <strong style={{ color: '#818cf8' }}>free</strong> key at{' '}
          <a href="https://console.groq.com" target="_blank" rel="noreferrer"
            style={{ color: '#6366f1' }}>console.groq.com</a>
          {' '}→ API Keys → Create
        </p>
      </div>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          ref={keyInputRef}
          type="password"
          placeholder="gsk_xxxxxxxxxxxxxxxxxxxxxxxx"
          value={apiKey}
          onChange={e => { setApiKey(e.target.value); setSetupError('') }}
          onKeyDown={e => e.key === 'Enter' && saveApiKey()}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: '0.85rem', boxSizing: 'border-box' }}
        />
        {setupError && (
          <div style={{ color: '#f87171', fontSize: '0.75rem', padding: '6px 10px', background: 'rgba(248,113,113,0.1)', borderRadius: 6 }}>
            {setupError}
          </div>
        )}
        <button
          onClick={saveApiKey}
          disabled={savingKey || !apiKey.trim()}
          style={{
            padding: 11, borderRadius: 10, border: 'none', fontWeight: 700,
            background: apiKey.trim() ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.08)',
            color: apiKey.trim() ? 'white' : '#475569',
            cursor: apiKey.trim() ? 'pointer' : 'not-allowed', fontSize: '0.9rem'
          }}
        >
          {savingKey ? '⏳ Saving...' : '✅ Save & Activate'}
        </button>
      </div>
      <p style={{ color: '#334155', fontSize: '0.7rem', textAlign: 'center' }}>
        Free · 30 req/min · Llama 3.3 70B · No credit card
      </p>
    </div>
  )

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
          width: 54, height: 54, borderRadius: '50%', border: 'none',
          background: open ? 'rgba(99,102,241,0.2)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          cursor: 'pointer', fontSize: open ? 18 : 24,
          boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
          transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
      >
        {open ? '✕' : '🤖'}
      </button>

      {/* Amber dot if not configured */}
      {!open && !configured && (
        <div style={{
          position: 'fixed', bottom: 50, right: 18, zIndex: 1001,
          width: 10, height: 10, borderRadius: '50%',
          background: '#f59e0b', border: '2px solid #0a0a0f'
        }}/>
      )}

      {/* Chat panel — sits above button, aligned to right edge */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: 88,
          right: 24,
          width: 'min(370px, calc(100vw - 270px))',
          height: 'min(560px, calc(100vh - 110px))',
          minWidth: 280,
          background: '#0d0d18',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 18,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 999,
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          animation: 'chatUp 0.2s ease'
        }}>

          {/* Header */}
          <div style={{
            padding: '11px 14px', flexShrink: 0,
            background: 'rgba(99,102,241,0.08)',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center', gap: 10
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15
            }}>🤖</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.87rem' }}>AttendAI</div>
              <div style={{ fontSize: '0.66rem', display: 'flex', alignItems: 'center', gap: 4, color: configured ? '#4ade80' : '#f59e0b' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: configured ? '#4ade80' : '#f59e0b', flexShrink: 0 }}/>
                {configured ? 'Llama 3.3 70B · Ready' : 'API key needed'}
              </div>
            </div>
            <button onClick={() => setShowSetup(s => !s)} title="Settings" style={{
              width: 27, height: 27, borderRadius: 7, border: 'none', flexShrink: 0,
              background: showSetup ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.07)',
              color: showSetup ? '#818cf8' : '#475569', cursor: 'pointer', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>⚙️</button>
            <button onClick={() => setMessages([{ role: 'assistant', content: 'Chat cleared!' }])} title="Clear" style={{
              width: 27, height: 27, borderRadius: 7, border: 'none', flexShrink: 0,
              background: 'rgba(255,255,255,0.07)', color: '#475569', cursor: 'pointer', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>🗑️</button>
          </div>

          {/* Inline key update (when settings clicked while already configured) */}
          {showSetup && configured && (
            <div style={{ padding: '12px 14px', flexShrink: 0, background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <p style={{ color: '#64748b', fontSize: '0.73rem', marginBottom: 8 }}>Update Groq API key:</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="password" placeholder="gsk_..." value={apiKey}
                  onChange={e => setApiKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveApiKey()}
                  style={{ flex: 1, fontSize: '0.8rem', padding: '7px 10px' }} />
                <button onClick={saveApiKey} disabled={savingKey || !apiKey.trim()} style={{
                  padding: '7px 12px', borderRadius: 8, border: 'none', fontWeight: 600,
                  background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white',
                  cursor: 'pointer', fontSize: '0.8rem', opacity: savingKey || !apiKey.trim() ? 0.5 : 1
                }}>{savingKey ? '...' : 'Save'}</button>
              </div>
            </div>
          )}

          {/* Body: either setup screen or chat */}
          {!configured ? <SetupScreen /> : (
            <>
              {/* Messages area */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 7 }}>
                    {msg.role === 'assistant' && (
                      <div style={{
                        width: 23, height: 23, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                        background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10
                      }}>🤖</div>
                    )}
                    <div style={{ maxWidth: '80%' }}>
                      <div style={{
                        padding: '9px 12px',
                        borderRadius: msg.role === 'user' ? '13px 13px 3px 13px' : '3px 13px 13px 13px',
                        background: msg.role === 'user' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.06)',
                        border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)',
                        color: '#e2e8f0', fontSize: '0.81rem', lineHeight: 1.65
                      }}>
                        {msg.loading
                          ? <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              {[0,1,2].map(j => (
                                <div key={j} style={{
                                  width: 6, height: 6, borderRadius: '50%', background: '#6366f1',
                                  animation: 'chatBounce 1s ease infinite', animationDelay: `${j * 0.15}s`
                                }}/>
                              ))}
                            </div>
                          : <>
                              <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                              {msg.data && msg.data.length > 0 && renderTable(msg.data)}
                            </>
                        }
                      </div>

                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Suggestion chips */}
              {messages.length <= 1 && (
                <div style={{ padding: '7px 10px', flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => sendMessage(s)} style={{
                      padding: '4px 9px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 500,
                      border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)',
                      color: '#818cf8', cursor: 'pointer', whiteSpace: 'nowrap'
                    }}>{s}</button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div style={{
                padding: '9px 12px', flexShrink: 0,
                borderTop: '1px solid rgba(255,255,255,0.07)',
                display: 'flex', gap: 8, background: 'rgba(0,0,0,0.15)'
              }}>
                <input
                  ref={inputRef}
                  placeholder="Ask about attendance..."
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  disabled={loading}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 10, fontSize: '0.82rem',
                    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0'
                  }}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={loading || !input.trim()}
                  style={{
                    width: 37, height: 37, flexShrink: 0, borderRadius: 10, border: 'none',
                    background: input.trim() && !loading ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.07)',
                    cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, opacity: loading ? 0.5 : 1, transition: 'all 0.2s'
                  }}
                >{loading ? '⏳' : '➤'}</button>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes chatUp {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes chatBounce {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
          40%            { transform: scale(1.2); opacity: 1; }
        }
      `}</style>
    </>
  )
}