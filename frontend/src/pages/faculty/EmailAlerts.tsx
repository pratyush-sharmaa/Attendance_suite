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

interface Section { id: number; name: string; student_count: number; semester: string }
interface Student { id: number; name: string; roll_no: string; parent_email: string; parent_name: string; parent_phone: string }
interface AlertResult { student: string; roll_no: string; parent_email: string; absent_dates: string[]; email_sent: boolean }
interface AlertLog { id: number; student_name: string; roll_no: string; absent_dates: string; email_sent: number; sent_to: string; sent_at: string }

export default function EmailAlerts() {
  const [sections,        setSections]        = useState<Section[]>([])
  const [selectedSection, setSelectedSection] = useState<Section | null>(null)
  const [students,        setStudents]        = useState<Student[]>([])
  const [alertResults,    setAlertResults]    = useState<AlertResult[]>([])
  const [alertLogs,       setAlertLogs]       = useState<AlertLog[]>([])
  const [tab,             setTab]             = useState<'parents' | 'send' | 'logs' | 'settings'>('parents')
  const [loading,         setLoading]         = useState(false)
  const [sending,         setSending]         = useState(false)
  const [editStudent,     setEditStudent]     = useState<Student | null>(null)
  const [toast,           setToast]           = useState<{ msg: string; type: string } | null>(null)
  const [consecutiveDays, setConsecutiveDays] = useState(3)
  const [savingParent,    setSavingParent]    = useState(false)

  // Email config
  const [emailConfig, setEmailConfig] = useState({
    smtp_host: '', smtp_port: '587', smtp_user: '', smtp_pass: '', smtp_from: ''
  })
  const [configured,   setConfigured]   = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [testEmail,    setTestEmail]    = useState('')
  const [testSending,  setTestSending]  = useState(false)

  // Parent edit form
  const [parentForm, setParentForm] = useState({ parent_email: '', parent_name: '', parent_phone: '' })

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    api.get('/api/faculty/sections').then(r => {
      setSections(r.data)
      if (r.data.length > 0) setSelectedSection(r.data[0])
    })
    api.get('/api/alerts/config').then(r => {
      setConfigured(r.data.configured)
      setEmailConfig(prev => ({
        ...prev,
        smtp_host: r.data.smtp_host,
        smtp_port: r.data.smtp_port,
        smtp_user: r.data.smtp_user,
        smtp_from: r.data.smtp_from,
      }))
    })
  }, [])

  useEffect(() => {
    if (selectedSection) {
      loadStudents(selectedSection.id)
      loadLogs(selectedSection.id)
    }
  }, [selectedSection])

  const loadStudents = (sectionId: number) => {
    setLoading(true)
    api.get(`/api/students/section/${sectionId}`)
      .then(r => setStudents(r.data))
      .finally(() => setLoading(false))
  }

  const loadLogs = (sectionId: number) => {
    api.get(`/api/alerts/logs/${sectionId}`)
      .then(r => setAlertLogs(r.data))
      .catch(() => {})
  }

  const openEditParent = (s: Student) => {
    setEditStudent(s)
    setParentForm({
      parent_email: s.parent_email || '',
      parent_name:  s.parent_name  || '',
      parent_phone: s.parent_phone || '',
    })
  }

  const saveParentInfo = async () => {
    if (!editStudent) return
    if (!parentForm.parent_email) {
      showToast('Parent email is required', 'error'); return
    }
    setSavingParent(true)
    try {
      await api.put(`/api/alerts/student/${editStudent.id}/parent`, parentForm)
      showToast(`✅ Parent info saved for ${editStudent.name}`)
      setEditStudent(null)
      setParentForm({ parent_email: '', parent_name: '', parent_phone: '' })
      if (selectedSection) loadStudents(selectedSection.id)
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to save parent info', 'error')
    } finally {
      setSavingParent(false)
    }
  }

  const checkAndSend = async () => {
    if (!selectedSection) return
    if (!configured) { showToast('Configure email settings first (Settings tab)', 'error'); return }
    setSending(true)
    setAlertResults([])
    try {
      const res = await api.post(`/api/alerts/check/${selectedSection.id}?consecutive_days=${consecutiveDays}`)
      setAlertResults(res.data.results)
      if (res.data.alerts_sent === 0) {
        showToast(`✅ Checked ${res.data.checked} students — no alerts needed`)
      } else {
        showToast(`📧 Sent ${res.data.alerts_sent} alert email${res.data.alerts_sent > 1 ? 's' : ''}`)
      }
      loadLogs(selectedSection.id)
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to check alerts', 'error')
    } finally {
      setSending(false)
    }
  }

  const saveEmailConfig = async () => {
    setSavingConfig(true)
    try {
      await api.post('/api/alerts/configure', {
        smtp_host: emailConfig.smtp_host,
        smtp_port: parseInt(emailConfig.smtp_port),
        smtp_user: emailConfig.smtp_user,
        smtp_pass: emailConfig.smtp_pass,
        smtp_from: emailConfig.smtp_from || emailConfig.smtp_user,
      })
      setConfigured(true)
      showToast('✅ Email settings saved!')
    } catch {
      showToast('Failed to save settings', 'error')
    } finally {
      setSavingConfig(false)
    }
  }

  const sendTestEmail = async () => {
    if (!testEmail) { showToast('Enter a test email address', 'error'); return }
    setTestSending(true)
    try {
      await api.post('/api/alerts/test', { to_email: testEmail })
      showToast(`📧 Test email sent to ${testEmail}`)
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Test failed — check SMTP settings', 'error')
    } finally {
      setTestSending(false)
    }
  }

  const studentsWithParent    = students.filter(s => s.parent_email)
  const studentsWithoutParent = students.filter(s => !s.parent_email)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
      <Sidebar items={NAV} />

      <div style={{ marginLeft: 240, flex: 1, padding: '32px 36px' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#e2e8f0' }}>📧 Absence Email Alerts</h1>
          <p style={{ color: '#475569', marginTop: 4, fontSize: '0.875rem' }}>
            Auto-email parents when students miss consecutive classes
          </p>
        </div>

        {/* Section tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {sections.map(sec => (
            <button key={sec.id} onClick={() => setSelectedSection(sec)} style={{
              padding: '8px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s',
              background: selectedSection?.id === sec.id
                ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.06)',
              color: selectedSection?.id === sec.id ? 'white' : '#64748b'
            }}>
              🏫 {sec.name}
              {sec.semester && (
                <span style={{
                  marginLeft: 6, fontSize: '0.75rem', opacity: 0.85,
                  background: selectedSection?.id === sec.id ? 'rgba(255,255,255,0.2)' : 'rgba(99,102,241,0.2)',
                  padding: '1px 6px', borderRadius: 10
                }}>
                  Sem {sec.semester}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
          {([
            { key: 'parents',  label: '👨‍👩‍👧 Parent Info' },
            { key: 'send',     label: '📤 Send Alerts' },
            { key: 'logs',     label: '📜 Alert History' },
            { key: 'settings', label: '⚙️ Email Settings' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: '0.82rem', transition: 'all 0.2s',
              background: tab === t.key ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'transparent',
              color: tab === t.key ? 'white' : '#475569'
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: Parent Info ── */}
        {tab === 'parents' && (
          <div>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Total Students',       val: students.length,               color: '#6366f1' },
                { label: 'Parent Email Added',   val: studentsWithParent.length,    color: '#22c55e' },
                { label: 'Missing Parent Email', val: studentsWithoutParent.length, color: '#ef4444' },
              ].map(s => (
                <div key={s.label} className="stat-card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {studentsWithoutParent.length > 0 && (
              <div style={{
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: 10, padding: '12px 16px', color: '#fbbf24',
                fontSize: '0.85rem', marginBottom: 20
              }}>
                ⚠️ {studentsWithoutParent.length} student{studentsWithoutParent.length > 1 ? 's' : ''} missing parent email — alerts won't be sent for them
              </div>
            )}

            {/* Edit parent modal */}
            {editStudent && (
              <div style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
              }}>
                <div style={{ width: 440, padding: 28, background: '#13131f', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 20 }}>
                  <h3 style={{ color: '#e2e8f0', marginBottom: 6, fontWeight: 600 }}>
                    👨‍👩‍👧 Parent Info — {editStudent.name}
                  </h3>
                  <p style={{ color: '#475569', fontSize: '0.8rem', marginBottom: 20 }}>
                    Roll: {editStudent.roll_no}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Parent Email *</label>
                      <input
                        type="email"
                        placeholder="parent@gmail.com"
                        value={parentForm.parent_email}
                        onChange={e => setParentForm({ ...parentForm, parent_email: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Parent Name</label>
                      <input
                        placeholder="Mr. / Mrs. Sharma"
                        value={parentForm.parent_name}
                        onChange={e => setParentForm({ ...parentForm, parent_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Parent Phone</label>
                      <input
                        placeholder="+91 98765 43210"
                        value={parentForm.parent_phone}
                        onChange={e => setParentForm({ ...parentForm, parent_phone: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button className="btn-primary" onClick={saveParentInfo} disabled={savingParent} style={{ flex: 1, justifyContent: 'center' }}>
                      {savingParent ? <><span className="spinner"></span> Saving...</> : '💾 Save'}
                    </button>
                    <button className="btn-secondary" onClick={() => setEditStudent(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Students table */}
            <div className="card">
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: 20 }}>
                Students in {selectedSection?.name}
              </h2>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>
                  <div className="spinner" style={{ margin: '0 auto 12px' }}></div>Loading...
                </div>
              ) : students.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>No students in this section</div>
              ) : (
                <table>
                  <thead>
                    <tr><th>Student</th><th>Roll No</th><th>Parent Email</th><th>Parent Name</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {students.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 500, color: '#e2e8f0' }}>{s.name}</td>
                        <td><span className="badge badge-blue">{s.roll_no}</span></td>
                        <td>
                          {s.parent_email
                            ? <span style={{ color: '#4ade80', fontSize: '0.85rem' }}>✅ {s.parent_email}</span>
                            : <span style={{ color: '#ef4444', fontSize: '0.85rem' }}>⚠️ Not added</span>
                          }
                        </td>
                        <td style={{ color: '#64748b', fontSize: '0.85rem' }}>{s.parent_name || '—'}</td>
                        <td>
                          <button
                            onClick={() => openEditParent(s)}
                            style={{
                              padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.3)',
                              background: 'rgba(99,102,241,0.1)', color: '#818cf8',
                              cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500
                            }}
                          >
                            ✏️ {s.parent_email ? 'Edit' : 'Add'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: Send Alerts ── */}
        {tab === 'send' && (
          <div style={{ maxWidth: 680 }}>
            {!configured && (
              <div style={{
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 12, padding: '14px 18px', color: '#f87171',
                fontSize: '0.875rem', marginBottom: 20
              }}>
                ❌ Email not configured yet — go to <strong>Email Settings</strong> tab first
              </div>
            )}

            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 20 }}>📤 Send Absence Alerts</h3>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', color: '#94a3b8' }}>
                  Alert threshold — send email if student absent for:
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[1, 2, 3, 5].map(n => (
                    <button key={n} onClick={() => setConsecutiveDays(n)} style={{
                      padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      fontWeight: 600, fontSize: '0.875rem',
                      background: consecutiveDays === n
                        ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.06)',
                      color: consecutiveDays === n ? 'white' : '#475569', transition: 'all 0.2s'
                    }}>
                      {n} day{n > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
                <p style={{ color: '#334155', fontSize: '0.75rem', marginTop: 8 }}>
                  Will check the last {consecutiveDays} day{consecutiveDays > 1 ? 's' : ''} — sends email only if absent on ALL of them
                </p>
              </div>

              <div style={{
                background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 10, padding: 16, marginBottom: 20, fontSize: '0.85rem'
              }}>
                <div style={{ color: '#818cf8', fontWeight: 600, marginBottom: 8 }}>📋 What will happen:</div>
                <ul style={{ color: '#64748b', margin: 0, paddingLeft: 20, lineHeight: 2 }}>
                  <li>Checks all {studentsWithParent.length} students with parent email in <strong style={{ color: '#e2e8f0' }}>{selectedSection?.name}</strong></li>
                  <li>Identifies who was absent for {consecutiveDays}+ consecutive days</li>
                  <li>Sends a professional HTML email to each parent</li>
                  <li>Logs all sent alerts in history</li>
                </ul>
              </div>

              <button
                className="btn-primary"
                onClick={checkAndSend}
                disabled={sending || !configured || !selectedSection}
                style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: '1rem' }}
              >
                {sending
                  ? <><span className="spinner"></span> Checking & Sending...</>
                  : `📧 Check & Send Alerts for ${selectedSection?.name}`
                }
              </button>
            </div>

            {/* Results */}
            {alertResults.length > 0 && (
              <div className="card">
                <h3 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 16 }}>
                  📊 Results — {alertResults.length} alert{alertResults.length > 1 ? 's' : ''} sent
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {alertResults.map((r, i) => (
                    <div key={i} style={{
                      background: r.email_sent ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                      border: `1px solid ${r.email_sent ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                      borderRadius: 10, padding: '14px 16px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{r.student}</span>
                        <span className={`badge ${r.email_sent ? 'badge-green' : 'badge-red'}`}>
                          {r.email_sent ? '✅ Sent' : '❌ Failed'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                        {r.roll_no} • To: {r.parent_email} • Absent: {r.absent_dates.join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {alertResults.length === 0 && !sending && (
              <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <p style={{ color: '#475569' }}>Click the button above to check for absences and send alerts</p>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Alert History ── */}
        {tab === 'logs' && (
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: 20 }}>
              📜 Alert History — {selectedSection?.name}
            </h2>
            {alertLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', color: '#475569' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <p>No alerts sent yet for this section</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr><th>Student</th><th>Absent Dates</th><th>Sent To</th><th>Status</th><th>Sent At</th></tr>
                </thead>
                <tbody>
                  {alertLogs.map(log => (
                    <tr key={log.id}>
                      <td>
                        <div style={{ fontWeight: 500, color: '#e2e8f0' }}>{log.student_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#475569' }}>{log.roll_no}</div>
                      </td>
                      <td style={{ color: '#ef4444', fontSize: '0.8rem' }}>
                        {log.absent_dates.split(',').join(' • ')}
                      </td>
                      <td style={{ color: '#64748b', fontSize: '0.8rem' }}>{log.sent_to}</td>
                      <td>
                        <span className={`badge ${log.email_sent ? 'badge-green' : 'badge-red'}`}>
                          {log.email_sent ? '✅ Delivered' : '❌ Failed'}
                        </span>
                      </td>
                      <td style={{ color: '#475569', fontSize: '0.78rem' }}>
                        {new Date(log.sent_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── TAB: Settings ── */}
        {tab === 'settings' && (
          <div style={{ maxWidth: 560 }}>
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 6 }}>⚙️ SMTP Email Settings</h3>
              <p style={{ color: '#475569', fontSize: '0.85rem', marginBottom: 20 }}>
                Use Gmail, Outlook, or any SMTP provider. For Gmail use an App Password.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>SMTP Host</label>
                    <input
                      placeholder="smtp.gmail.com"
                      value={emailConfig.smtp_host}
                      onChange={e => setEmailConfig({ ...emailConfig, smtp_host: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Port</label>
                    <input
                      placeholder="587"
                      value={emailConfig.smtp_port}
                      onChange={e => setEmailConfig({ ...emailConfig, smtp_port: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Email / Username</label>
                  <input
                    type="email"
                    placeholder="yourschool@gmail.com"
                    value={emailConfig.smtp_user}
                    onChange={e => setEmailConfig({ ...emailConfig, smtp_user: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>
                    Password / App Password
                  </label>
                  <input
                    type="password"
                    placeholder="Gmail App Password (16 chars)"
                    value={emailConfig.smtp_pass}
                    onChange={e => setEmailConfig({ ...emailConfig, smtp_pass: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>From Name / Email (optional)</label>
                  <input
                    placeholder="FaceAttend System <noreply@school.edu>"
                    value={emailConfig.smtp_from}
                    onChange={e => setEmailConfig({ ...emailConfig, smtp_from: e.target.value })}
                  />
                </div>
              </div>

              <div style={{
                background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 10, padding: 14, marginTop: 16, fontSize: '0.8rem', color: '#818cf8'
              }}>
                <strong>Gmail setup:</strong> Go to Google Account → Security → 2-Step Verification → App Passwords → create one for "Mail"
              </div>

              <button
                className="btn-primary"
                onClick={saveEmailConfig}
                disabled={savingConfig}
                style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
              >
                {savingConfig ? <><span className="spinner"></span> Saving...</> : '💾 Save Email Settings'}
              </button>
            </div>

            {/* Test Email */}
            <div className="card">
              <h3 style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 16 }}>🧪 Test Email</h3>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn-primary"
                  onClick={sendTestEmail}
                  disabled={testSending || !configured}
                >
                  {testSending ? <><span className="spinner"></span></> : '📤 Send Test'}
                </button>
              </div>
              {!configured && (
                <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: 8 }}>
                  Save settings above first
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}
