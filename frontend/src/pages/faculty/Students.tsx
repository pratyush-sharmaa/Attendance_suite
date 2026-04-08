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

interface Section { id: number; name: string; department: string; student_count: number; semester: string }
interface Student {
  id: number; name: string; roll_no: string; phone: string; registered_at: string
  parent_email: string; parent_name: string; parent_phone: string; photo_url: string
}

const emptyForm = {
  name: '', roll_no: '', phone: '',
  parent_email: '', parent_name: '', parent_phone: ''
}

function safeError(e: any): string {
  try {
    const detail = e?.response?.data?.detail
    if (!detail) return 'Request failed — please try again'
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail.map((d: any) => {
        if (typeof d === 'string') return d
        if (typeof d?.msg === 'string') return d.msg
        return 'Validation error'
      }).join(' · ')
    }
    return 'Something went wrong'
  } catch {
    return 'Something went wrong'
  }
}

export default function FacultyStudents() {
  const [sections,        setSections]        = useState<Section[]>([])
  const [selectedSection, setSelectedSection] = useState<Section | null>(null)
  const [students,        setStudents]        = useState<Student[]>([])
  const [loading,         setLoading]         = useState(false)
  const [showForm,        setShowForm]        = useState(false)
  const [editStudent,     setEditStudent]     = useState<Student | null>(null)
  const [toast,           setToast]           = useState<{ msg: string; type: string } | null>(null)
  const [saving,          setSaving]          = useState(false)
  const [search,          setSearch]          = useState('')
  const [form,            setForm]            = useState(emptyForm)
  const [photo,           setPhoto]           = useState<File | null>(null)
  const [preview,         setPreview]         = useState<string | null>(null)

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    api.get('/api/faculty/sections').then(r => {
      setSections(r.data)
      if (r.data.length > 0) loadStudents(r.data[0])
    })
  }, [])

  const loadStudents = (sec: Section) => {
    setSelectedSection(sec)
    setLoading(true)
    setStudents([])
    api.get(`/api/students/section/${sec.id}`)
      .then(r => setStudents(r.data))
      .finally(() => setLoading(false))
  }

  const openAdd = () => {
    setEditStudent(null)
    setForm(emptyForm)
    setPhoto(null)
    setPreview(null)
    setShowForm(true)
  }

  const openEdit = (s: Student) => {
    setEditStudent(s)
    setForm({
      name:         s.name,
      roll_no:      s.roll_no,
      phone:        s.phone        || '',
      parent_email: s.parent_email || '',
      parent_name:  s.parent_name  || '',
      parent_phone: s.parent_phone || '',
    })
    setPhoto(null)
    setPreview(s.photo_url && s.photo_url.length > 0 ? s.photo_url : null)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false); setEditStudent(null)
    setPreview(null); setPhoto(null); setForm(emptyForm)
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  const handleSave = async () => {
    if (!form.name || !form.roll_no) {
      showToast('Name and roll number are required', 'error'); return
    }
    if (!editStudent && !photo) {
      showToast('Please upload a face photo', 'error'); return
    }
    if (!selectedSection) {
      showToast('Please select a section', 'error'); return
    }

    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('name',         form.name)
      fd.append('roll_no',      form.roll_no)
      fd.append('phone',        form.phone)
      fd.append('parent_email', form.parent_email)
      fd.append('parent_name',  form.parent_name)
      fd.append('parent_phone', form.parent_phone)
      fd.append('section_id',   String(selectedSection.id))

      if (editStudent) {
        if (photo) fd.append('photo', photo)
        await api.put(`/api/students/${editStudent.id}`, fd)
        showToast(`✅ ${form.name} updated!`)
      } else {
        fd.append('photo', photo!)
        await api.post('/api/students/register', fd)
        showToast(`✅ ${form.name} registered!`)
      }

      closeForm()
      loadStudents(selectedSection)
    } catch (e: any) {
      showToast(safeError(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Remove "${name}"? This also removes their face data.`)) return
    try {
      await api.delete(`/api/students/${id}`)
      showToast(`🗑️ ${name} removed`)
      if (selectedSection) loadStudents(selectedSection)
    } catch (e: any) {
      showToast(safeError(e), 'error')
    }
  }

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.roll_no.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
      <Sidebar items={NAV} />

      <div style={{ marginLeft: 240, flex: 1, padding: '32px 36px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#e2e8f0' }}>👨‍🎓 Students</h1>
            <p style={{ color: '#475569', marginTop: 4, fontSize: '0.875rem' }}>Register and manage students with face recognition</p>
          </div>
          <button
            className="btn-primary"
            onClick={showForm ? closeForm : openAdd}
            disabled={sections.length === 0}
            style={{ opacity: sections.length === 0 ? 0.5 : 1 }}
          >
            {showForm ? '✕ Cancel' : '+ Register Student'}
          </button>
        </div>

        {/* No sections warning */}
        {sections.length === 0 && (
          <div style={{
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 12, padding: '16px 20px', color: '#fbbf24',
            marginBottom: 24, fontSize: '0.875rem'
          }}>
            ⚠️ No sections assigned yet. Ask admin to assign sections.
          </div>
        )}

        {/* Section tabs */}
        {sections.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            {sections.map(sec => (
              <button key={sec.id} onClick={() => { loadStudents(sec); closeForm() }} style={{
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
                <span style={{ opacity: 0.7, marginLeft: 4 }}>({sec.student_count})</span>
              </button>
            ))}
          </div>
        )}

        {/* Register / Edit Form */}
        {showForm && selectedSection && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ color: '#e2e8f0', marginBottom: 24, fontWeight: 600 }}>
              {editStudent
                ? <>✏️ Edit — <span style={{ color: '#818cf8' }}>{editStudent.name}</span></>
                : <>➕ Register in <span style={{ color: '#818cf8' }}>{selectedSection.name}</span></>
              }
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 20 }}>

              {/* Left — fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Full Name *</label>
                  <input placeholder="Student full name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Roll Number *</label>
                  <input
                    placeholder="e.g. CS2024001"
                    value={form.roll_no}
                    onChange={e => setForm({ ...form, roll_no: e.target.value })}
                    disabled={!!editStudent}
                    style={{ opacity: editStudent ? 0.5 : 1 }}
                  />
                  {editStudent && <p style={{ color: '#334155', fontSize: '0.72rem', marginTop: 4 }}>Roll number cannot be changed</p>}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Student Phone</label>
                  <input placeholder="Optional" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>

              {/* Right — photo */}
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>
                  {editStudent ? 'Update Face Photo (optional)' : 'Face Photo * (clear, front-facing)'}
                </label>
                <label style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  border: '2px dashed rgba(99,102,241,0.4)', borderRadius: 12, padding: 20,
                  textAlign: 'center', cursor: 'pointer', minHeight: 180,
                  background: 'rgba(99,102,241,0.04)', position: 'relative', overflow: 'hidden'
                }}>
                  <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
                  {preview ? (
                    <>
                      <img
                        src={preview}
                        alt="preview"
                        style={{ width: 130, height: 130, borderRadius: '50%', objectFit: 'cover', border: '3px solid #6366f1' }}
                        onError={e => { e.currentTarget.style.display = 'none'; setPreview(null) }}
                      />
                      <p style={{ color: '#475569', fontSize: '0.75rem', marginTop: 10 }}>
                        {photo ? '✅ New photo selected' : '📷 Current photo — click to change'}
                      </p>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 36, marginBottom: 8 }}>📸</div>
                      <div style={{ color: '#475569', fontSize: '0.85rem' }}>
                        {editStudent ? 'Click to upload new photo' : 'Click to upload face photo'}
                      </div>
                      {editStudent && <div style={{ color: '#334155', fontSize: '0.72rem', marginTop: 4 }}>Leave empty to keep existing</div>}
                    </>
                  )}
                </label>
                {!editStudent && !photo && (
                  <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: 6 }}>⚠️ Photo is required for registration</p>
                )}
                {editStudent && !photo && preview && (
                  <p style={{ color: '#4ade80', fontSize: '0.75rem', marginTop: 6 }}>✅ Existing photo will be kept</p>
                )}
              </div>
            </div>

            {/* Parent info */}
            <div style={{
              background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)',
              borderRadius: 12, padding: 20, marginBottom: 20
            }}>
              <h4 style={{ color: '#818cf8', fontSize: '0.85rem', fontWeight: 600, marginBottom: 16 }}>
                👨‍👩‍👧 Parent / Guardian Info (for absence alerts)
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Parent Email</label>
                  <input type="email" placeholder="parent@gmail.com" value={form.parent_email} onChange={e => setForm({ ...form, parent_email: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Parent Name</label>
                  <input placeholder="Mr. / Mrs. Sharma" value={form.parent_name} onChange={e => setForm({ ...form, parent_name: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Parent Phone</label>
                  <input placeholder="+91 98765 43210" value={form.parent_phone} onChange={e => setForm({ ...form, parent_phone: e.target.value })} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving
                  ? <><span className="spinner"></span> {editStudent ? 'Updating...' : 'Registering...'}</>
                  : editStudent ? '💾 Save Changes' : '✅ Register Student'
                }
              </button>
              <button className="btn-secondary" onClick={closeForm}>Cancel</button>
            </div>
          </div>
        )}

        {/* Students table */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0' }}>
              {selectedSection?.name} — {filtered.length} student{filtered.length !== 1 ? 's' : ''}
            </h2>
            {students.length > 0 && (
              <input
                placeholder="🔍 Search name or roll no..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: 220, fontSize: '0.85rem' }}
              />
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }}></div>Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#475569' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>👨‍🎓</div>
              <p style={{ marginBottom: 16 }}>{search ? 'No match found' : 'No students yet'}</p>
              {!search && <button className="btn-primary" onClick={openAdd}>+ Register First Student</button>}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student</th>
                  <th>Roll No</th>
                  <th>Parent Email</th>
                  <th>Phone</th>
                  <th>Registered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <tr key={s.id}>
                    <td style={{ color: '#334155' }}>{i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                          overflow: 'hidden', border: '2px solid rgba(99,102,241,0.3)',
                          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {s.photo_url ? (
                            <img
                              src={s.photo_url}
                              alt={s.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={e => { e.currentTarget.style.display = 'none' }}
                            />
                          ) : (
                            <span style={{ fontWeight: 700, fontSize: 13, color: 'white' }}>
                              {s.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{s.name}</span>
                      </div>
                    </td>
                    <td><span className="badge badge-blue">{s.roll_no}</span></td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {s.parent_email
                        ? <span style={{ color: '#4ade80' }}>✅ {s.parent_email}</span>
                        : <span style={{ color: '#ef4444' }}>⚠️ Not added</span>
                      }
                    </td>
                    <td style={{ color: '#64748b', fontSize: '0.85rem' }}>{s.phone || '—'}</td>
                    <td style={{ color: '#475569', fontSize: '0.78rem' }}>
                      {new Date(s.registered_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => openEdit(s)} style={{
                          padding: '6px 12px', borderRadius: 8,
                          border: '1px solid rgba(99,102,241,0.3)',
                          background: 'rgba(99,102,241,0.1)', color: '#818cf8',
                          cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500
                        }}>✏️ Edit</button>
                        <button className="btn-danger" onClick={() => handleDelete(s.id, s.name)}
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}
