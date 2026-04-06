import { useEffect, useState } from 'react'
import Sidebar from '../../components/Sidebar'
import api from '../../api'

const NAV = [
  { icon: '📊', label: 'Dashboard', path: '/admin' },
  { icon: '👨‍🏫', label: 'Faculties', path: '/admin/faculties' },
  { icon: '🏫', label: 'Sections',  path: '/admin/sections' },
]

interface Section {
  id: number; name: string; department: string; semester: string
  faculty_id: number; faculty_name: string; student_count: number
}
interface Faculty { id: number; name: string; department: string }
const emptyForm = { name: '', department: '', semester: '', faculty_id: '' }

const SEMESTERS = ['1', '2', '3', '4', '5', '6', '7', '8']

export default function AdminSections() {
  const [sections,  setSections]  = useState<Section[]>([])
  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [editId,    setEditId]    = useState<number | null>(null)
  const [toast,     setToast]     = useState<{ msg: string; type: string } | null>(null)
  const [deleting,  setDeleting]  = useState<number | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [form, setForm] = useState(emptyForm)

  const showToast = (msg: string, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const fetchData = () => {
    setLoading(true)
    Promise.all([api.get('/api/admin/sections'), api.get('/api/admin/faculties')])
      .then(([s, f]) => { setSections(s.data); setFaculties(f.data) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchData() }, [])

  const openEdit = (s: Section) => {
    setEditId(s.id)
    setForm({ name: s.name, department: s.department || '', semester: s.semester || '', faculty_id: String(s.faculty_id) })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.faculty_id) { showToast('Section name and faculty required', 'error'); return }
    setSaving(true)
    try {
      const payload = { name: form.name, department: form.department, semester: form.semester, faculty_id: parseInt(form.faculty_id) }
      if (editId) { await api.put(`/api/admin/sections/${editId}`, payload); showToast('Section updated') }
      else        { await api.post('/api/admin/sections', payload); showToast(`${form.name} created`) }
      setForm(emptyForm); setShowForm(false); setEditId(null); fetchData()
    } catch (e: any) { showToast(e.response?.data?.detail || 'Failed', 'error')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete section "${name}"?`)) return
    setDeleting(id)
    try { await api.delete(`/api/admin/sections/${id}`); showToast(`${name} removed`); fetchData() }
    catch { showToast('Failed to delete', 'error') }
    finally { setDeleting(null) }
  }

  // Group sections by semester
  const bySemester = SEMESTERS.map(sem => ({
    sem,
    sections: sections.filter(s => s.semester === sem)
  })).filter(g => g.sections.length > 0)
  const noSem = sections.filter(s => !s.semester)

  const grouped = faculties.map(f => ({ faculty: f, sections: sections.filter(s => s.faculty_id === f.id) })).filter(g => g.sections.length > 0)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
      <Sidebar items={NAV} />
      <div style={{ marginLeft: 240, flex: 1, padding: '32px 36px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#e2e8f0' }}>🏫 Sections</h1>
            <p style={{ color: '#475569', marginTop: 4, fontSize: '0.875rem' }}>Create sections and assign them to faculties</p>
          </div>
          <button className="btn-primary" onClick={() => { setShowForm(!showForm); if (showForm) { setEditId(null); setForm(emptyForm) } }}>
            {showForm ? '✕ Cancel' : '+ Add Section'}
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ color: '#e2e8f0', marginBottom: 20, fontSize: '1rem', fontWeight: 600 }}>
              {editId ? '✏️ Edit Section' : '➕ New Section'}
            </h3>
            {faculties.length === 0 ? (
              <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: 16, color: '#fbbf24', fontSize: '0.875rem' }}>
                ⚠️ No faculties found. Please add faculties first.
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Section Name *</label>
                    <input placeholder="e.g. CS-A, MCA-B" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Department</label>
                    <input placeholder="Computer Science" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Semester</label>
                    <select value={form.semester} onChange={e => setForm({ ...form, semester: e.target.value })}>
                      <option value="">-- No Semester --</option>
                      {SEMESTERS.map(s => <option key={s} value={s}>Semester {s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Assign Faculty *</label>
                    <select value={form.faculty_id} onChange={e => setForm({ ...form, faculty_id: e.target.value })}>
                      <option value="">Select Faculty</option>
                      {faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
                  <button className="btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? <><span className="spinner"></span> Saving...</> : editId ? '💾 Save Changes' : '✅ Create Section'}
                  </button>
                  <button className="btn-secondary" onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm) }}>Cancel</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* All sections table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }}></div> Loading...
          </div>
        ) : sections.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏫</div>
            <p style={{ color: '#475569', marginBottom: 16 }}>No sections created yet</p>
            <button className="btn-primary" onClick={() => { setEditId(null); setForm(emptyForm); setShowForm(true) }}>+ Create First Section</button>
          </div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: 20 }}>
                All Sections ({sections.length})
              </h2>
              <table>
                <thead>
                  <tr><th>Section</th><th>Semester</th><th>Department</th><th>Faculty</th><th>Students</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {sections.map(s => (
                    <tr key={s.id}>
                      <td><span style={{ fontWeight: 700, color: '#e2e8f0' }}>{s.name}</span></td>
                      <td>
                        {s.semester
                          ? <span className="badge badge-amber">Sem {s.semester}</span>
                          : <span style={{ color: '#334155' }}>—</span>
                        }
                      </td>
                      <td>{s.department ? <span className="badge badge-blue">{s.department}</span> : <span style={{ color: '#334155' }}>—</span>}</td>
                      <td style={{ color: '#94a3b8' }}>{s.faculty_name}</td>
                      <td><span className="badge badge-green">{s.student_count}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => openEdit(s)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.1)', color: '#818cf8', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Edit</button>
                          <button className="btn-danger" onClick={() => handleDelete(s.id, s.name)} disabled={deleting === s.id} style={{ padding: '5px 12px', fontSize: '0.8rem' }}>
                            {deleting === s.id ? '...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Grouped by Semester */}
            {bySemester.length > 0 && (
              <>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: 16 }}>📅 By Semester</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
                  {bySemester.map(({ sem, sections: sList }) => (
                    <div key={sem} className="card" style={{ padding: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <span style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', borderRadius: 8, padding: '4px 12px', fontWeight: 700, fontSize: '0.85rem' }}>
                          Semester {sem}
                        </span>
                        <span style={{ color: '#475569', fontSize: '0.8rem' }}>{sList.length} section{sList.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        {sList.map(sec => (
                          <div key={sec.id} style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '8px 14px', fontSize: '0.85rem' }}>
                            <span style={{ color: '#818cf8', fontWeight: 700 }}>{sec.name}</span>
                            <span style={{ color: '#475569', marginLeft: 8, fontSize: '0.75rem' }}>{sec.faculty_name}</span>
                            <span style={{ color: '#475569', marginLeft: 8, fontSize: '0.75rem' }}>({sec.student_count} students)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* By Faculty */}
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: 16 }}>📁 By Faculty</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
              {grouped.map(({ faculty, sections: fSections }) => (
                <div key={faculty.id} className="card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'white', flexShrink: 0 }}>{faculty.name.charAt(0)}</div>
                    <div>
                      <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.9rem' }}>{faculty.name}</div>
                      <div style={{ fontSize: '0.72rem', color: '#475569' }}>{faculty.department}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {fSections.map(sec => (
                      <div key={sec.id} style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '5px 10px', fontSize: '0.78rem', color: '#818cf8' }}>
                        {sec.name}
                        {sec.semester && <span style={{ color: '#6366f1', marginLeft: 4 }}>S{sec.semester}</span>}
                        <span style={{ color: '#475569', marginLeft: 4 }}>({sec.student_count})</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}
