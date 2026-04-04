import { useEffect, useState } from 'react'
import Sidebar from '../../components/Sidebar'
import api from '../../api'

const NAV = [
  { icon: '▪', label: 'Dashboard',     path: '/faculty' },
  { icon: '▪', label: 'Students',      path: '/faculty/students' },
  { icon: '▪', label: 'Attendance',    path: '/faculty/attendance' },
  { icon: '▪', label: 'QR Attendance', path: '/faculty/qr' },
  { icon: '▪', label: 'Alerts',        path: '/faculty/alerts' },
  { icon: '▪', label: 'Reports',       path: '/faculty/reports' },
]

interface Section { id: number; name: string; department: string; student_count: number }
interface Student {
  id: number; name: string; roll_no: string; phone: string; registered_at: string
  parent_email: string; parent_name: string; parent_phone: string; photo_url: string
}

const emptyForm = {
  name: '', roll_no: '', phone: '',
  parent_email: '', parent_name: '', parent_phone: ''
}

const P = { marginLeft: 220, flex: 1, padding: '32px 36px', minHeight: '100vh', background: 'var(--bg)' }

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
    // Show existing photo from Cloudinary
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
      showToast('A face photo is required to register a student', 'error'); return
    }
    if (!selectedSection) {
      showToast('No section selected', 'error'); return
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
      fd.append('section_id',   String(selectedSection.id))  // always send

      if (editStudent) {
        if (photo) fd.append('photo', photo)  // only if changed
        await api.put(`/api/students/${editStudent.id}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        showToast(`${form.name} updated`)
      } else {
        fd.append('photo', photo!)
        await api.post('/api/students/register', fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        showToast(`${form.name} registered`)
      }

      closeForm()
      loadStudents(selectedSection)
    } catch (e: any) {
      const detail = e.response?.data?.detail
      if (Array.isArray(detail)) {
        // Pydantic validation errors — extract messages
        showToast(detail.map((d: any) => d.msg).join(', '), 'error')
      } else {
        showToast(typeof detail === 'string' ? detail : 'Failed — check face photo is clear', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Remove "${name}"? This also removes their face data.`)) return
    try {
      await api.delete(`/api/students/${id}`)
      showToast(`${name} removed`)
      if (selectedSection) loadStudents(selectedSection)
    } catch { showToast('Failed to delete', 'error') }
  }

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.roll_no.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', background: 'var(--bg)', minHeight: '100vh' }}>
      <Sidebar items={NAV} />
      <div style={P}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 3, height: 24, background: 'var(--accent)', borderRadius: 99 }} />
              <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>Students</h1>
            </div>
            <p style={{ color: 'var(--text3)', fontSize: '0.72rem', fontFamily: 'var(--mono)', paddingLeft: 13 }}>FACE REGISTRATION & MANAGEMENT</p>
          </div>
          <button
            className="btn-primary"
            onClick={showForm ? closeForm : openAdd}
            disabled={sections.length === 0}
            style={{ opacity: sections.length === 0 ? 0.4 : 1 }}
          >
            {showForm ? '✕ Cancel' : '+ Register Student'}
          </button>
        </div>

        {/* No sections warning */}
        {sections.length === 0 && (
          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid var(--accentBorder)', borderRadius: 'var(--radius2)', padding: '12px 16px', color: 'var(--accent2)', marginBottom: 20, fontSize: '0.82rem', fontFamily: 'var(--mono)' }}>
            ⚠ NO SECTIONS ASSIGNED — CONTACT ADMIN
          </div>
        )}

        {/* Section tabs */}
        {sections.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
            {sections.map(sec => (
              <button key={sec.id} onClick={() => { loadStudents(sec); closeForm() }} style={{
                padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: '0.75rem', fontFamily: 'var(--mono)', letterSpacing: '0.04em',
                transition: 'all 0.15s',
                background: selectedSection?.id === sec.id ? 'var(--accent)' : 'rgba(255,255,255,0.04)',
                color: selectedSection?.id === sec.id ? '#000' : 'var(--text3)',
                border: selectedSection?.id === sec.id ? '1px solid transparent' : '1px solid var(--border)',
              } as React.CSSProperties}>
                {sec.name}
                <span style={{ marginLeft: 6, opacity: 0.6, fontWeight: 400 }}>({sec.student_count})</span>
              </button>
            ))}
          </div>
        )}

        {/* Register / Edit Form */}
        {showForm && selectedSection && (
          <div className="card" style={{ marginBottom: 20, borderColor: 'var(--accentBorder)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--accent)', fontFamily: 'var(--mono)', letterSpacing: '0.1em', marginBottom: 20 }}>
              {editStudent ? `EDITING — ${editStudent.name}` : `REGISTER IN ${selectedSection.name}`}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginBottom: 20 }}>

              {/* Left — fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.65rem', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Full Name *</label>
                  <input placeholder="Student full name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.65rem', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Roll Number *</label>
                  <input
                    placeholder="CS2024001"
                    value={form.roll_no}
                    onChange={e => setForm({ ...form, roll_no: e.target.value.toUpperCase() })}
                    disabled={!!editStudent}
                    style={{ opacity: editStudent ? 0.4 : 1, fontFamily: 'var(--mono)' } as React.CSSProperties}
                  />
                  {editStudent && (
                    <p style={{ color: 'var(--text3)', fontSize: '0.62rem', marginTop: 4, fontFamily: 'var(--mono)' }}>
                      ROLL NUMBER CANNOT BE CHANGED
                    </p>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: '0.65rem', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Phone</label>
                  <input placeholder="+91 98765 43210" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase' }}>Parent Contact</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input type="email" placeholder="Parent email" value={form.parent_email} onChange={e => setForm({ ...form, parent_email: e.target.value })} />
                    <input placeholder="Parent name" value={form.parent_name} onChange={e => setForm({ ...form, parent_name: e.target.value })} />
                    <input placeholder="Parent phone" value={form.parent_phone} onChange={e => setForm({ ...form, parent_phone: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Right — photo (same UI for both add and edit) */}
              <div>
                <label style={{ display: 'block', marginBottom: 10, fontSize: '0.65rem', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {editStudent ? 'Face Photo — click to update' : 'Face Photo — required *'}
                </label>

                <div
                  onClick={() => document.getElementById('photo-input')?.click()}
                  style={{
                    border: `1px dashed ${preview ? 'var(--accent)' : 'var(--border2)'}`,
                    borderRadius: 12, overflow: 'hidden',
                    background: preview ? 'transparent' : 'var(--accentDim)',
                    cursor: 'pointer', transition: 'all 0.2s',
                    height: 250, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', position: 'relative',
                  }}
                >
                  {preview ? (
                    <>
                      <img
                        src={preview}
                        alt="preview"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      <div className="bracket bracket-tl" />
                      <div className="bracket bracket-tr" />
                      <div className="bracket bracket-bl" />
                      <div className="bracket bracket-br" />
                      <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center' }}>
                        <span style={{ fontSize: '0.62rem', color: 'var(--accent)', fontFamily: 'var(--mono)', background: 'rgba(0,0,0,0.8)', padding: '3px 12px', borderRadius: 99, letterSpacing: '0.06em' }}>
                          {photo ? '✓ NEW PHOTO SELECTED · CLICK TO CHANGE' : 'CURRENT PHOTO · CLICK TO CHANGE'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 20 }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: 10, opacity: 0.4 }}>◉</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', letterSpacing: '0.06em', marginBottom: 6 }}>
                        CLICK TO UPLOAD PHOTO
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', opacity: 0.5, lineHeight: 1.8 }}>
                        FACE CLEARLY VISIBLE · GOOD LIGHTING
                      </div>
                    </div>
                  )}
                </div>

                <input
                  id="photo-input"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  style={{ display: 'none' }}
                />

                {/* Status hint below photo box */}
                <div style={{ marginTop: 8, fontSize: '0.65rem', fontFamily: 'var(--mono)' }}>
                  {!editStudent && !photo && (
                    <span style={{ color: 'var(--red)' }}>✕ PHOTO REQUIRED TO REGISTER</span>
                  )}
                  {editStudent && !photo && preview && (
                    <span style={{ color: 'var(--green)' }}>✓ EXISTING PHOTO WILL BE KEPT</span>
                  )}
                  {editStudent && !photo && !preview && (
                    <span style={{ color: 'var(--accent)' }}>⚠ NO PHOTO ON FILE — PLEASE UPLOAD ONE</span>
                  )}
                  {photo && (
                    <span style={{ color: 'var(--accent)' }}>✓ {photo.name}</span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 18 }}>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving
                  ? <><span className="spinner" /> {editStudent ? 'Saving...' : 'Registering...'}</>
                  : editStudent ? 'Save Changes' : 'Register Student'
                }
              </button>
              <button className="btn-secondary" onClick={closeForm}>Cancel</button>
            </div>
          </div>
        )}

        {/* Students table */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: '0.1em' }}>
              {selectedSection?.name} — {filtered.length} STUDENTS
            </div>
            {students.length > 0 && (
              <div style={{ width: 200 }}>
                <input
                  placeholder="Search name or roll no..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ padding: '7px 12px !important', fontSize: '0.8rem' } as React.CSSProperties}
                />
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '0.78rem' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} /> LOADING...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12, opacity: 0.2 }}>◉</div>
              <p style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem', marginBottom: 16 }}>
                {students.length === 0 ? 'NO STUDENTS REGISTERED YET' : 'NO RESULTS FOUND'}
              </p>
              {students.length === 0 && (
                <button className="btn-primary" onClick={openAdd}>+ Register First Student</button>
              )}
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
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', color: 'var(--text3)' }}>
                      {String(i + 1).padStart(2, '0')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                          overflow: 'hidden', border: '1px solid var(--accentBorder)',
                          background: 'var(--accentDim)',
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
                            <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>
                              {s.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.875rem' }}>{s.name}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', color: 'var(--accent)', background: 'var(--accentDim)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--accentBorder)' }}>
                        {s.roll_no}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem' }}>
                      {s.parent_email
                        ? <span style={{ color: 'var(--green)' }}>✓ {s.parent_email}</span>
                        : <span className="badge badge-red">MISSING</span>
                      }
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', color: 'var(--text3)' }}>
                      {s.phone || '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', color: 'var(--text3)' }}>
                      {new Date(s.registered_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => openEdit(s)}
                          style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.15s' }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-danger"
                          onClick={() => handleDelete(s.id, s.name)}
                          style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                        >
                          Delete
                        </button>
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
