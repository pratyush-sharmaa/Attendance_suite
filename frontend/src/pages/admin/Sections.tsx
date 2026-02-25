import { useEffect, useState } from 'react'
import Sidebar from '../../components/Sidebar'
import api from '../../api'

const NAV = [
  { icon: '📊', label: 'Dashboard', path: '/admin' },
  { icon: '👨‍🏫', label: 'Faculties', path: '/admin/faculties' },
  { icon: '🏫', label: 'Sections',  path: '/admin/sections' },
]

interface Section {
  id: number
  name: string
  department: string
  faculty_id: number
  faculty_name: string
  student_count: number
}

interface Faculty { id: number; name: string; department: string }

const emptyForm = { name: '', department: '', faculty_id: '' }

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

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchData = () => {
    setLoading(true)
    Promise.all([
      api.get('/api/admin/sections'),
      api.get('/api/admin/faculties')
    ]).then(([s, f]) => {
      setSections(s.data)
      setFaculties(f.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const openAdd = () => {
    setEditId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (s: Section) => {
    setEditId(s.id)
    setForm({ name: s.name, department: s.department || '', faculty_id: String(s.faculty_id) })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.faculty_id) {
      showToast('Section name and faculty are required', 'error'); return
    }
    setSaving(true)
    try {
      const payload = { name: form.name, department: form.department, faculty_id: parseInt(form.faculty_id) }
      if (editId) {
        await api.put(`/api/admin/sections/${editId}`, payload)
        showToast(`✅ Section updated successfully!`)
      } else {
        await api.post('/api/admin/sections', payload)
        showToast(`✅ Section ${form.name} created!`)
      }
      setForm(emptyForm)
      setShowForm(false)
      setEditId(null)
      fetchData()
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to save section', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete section "${name}"?`)) return
    setDeleting(id)
    try {
      await api.delete(`/api/admin/sections/${id}`)
      showToast(`🗑️ Section ${name} removed`)
      fetchData()
    } catch {
      showToast('Failed to delete', 'error')
    } finally {
      setDeleting(null)
    }
  }

  const grouped = faculties.map(f => ({
    faculty: f,
    sections: sections.filter(s => s.faculty_id === f.id)
  })).filter(g => g.sections.length > 0)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
      <Sidebar items={NAV} />

      <div style={{ marginLeft: 240, flex: 1, padding: '32px 36px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#e2e8f0' }}>🏫 Sections</h1>
            <p style={{ color: '#475569', marginTop: 4, fontSize: '0.875rem' }}>
              Create sections and assign them to faculties
            </p>
          </div>
          <button className="btn-primary" onClick={showForm ? () => { setShowForm(false); setEditId(null) } : openAdd}>
            {showForm ? '✕ Cancel' : '+ Add Section'}
          </button>
        </div>

        {/* Add / Edit Form */}
        {showForm && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ color: '#e2e8f0', marginBottom: 20, fontSize: '1rem', fontWeight: 600 }}>
              {editId ? '✏️ Edit Section' : '➕ New Section'}
            </h3>
            {faculties.length === 0 ? (
              <div style={{
                background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: 8, padding: 16, color: '#fbbf24', fontSize: '0.875rem'
              }}>
                ⚠️ No faculties found. Please add faculties first.
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Section Name *</label>
                    <input placeholder="e.g. CS-A, MCA-B" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Department</label>
                    <input placeholder="Computer Science" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Assign Faculty *</label>
                    <select value={form.faculty_id} onChange={e => setForm({ ...form, faculty_id: e.target.value })}>
                      <option value="">Select Faculty</option>
                      {faculties.map(f => (
                        <option key={f.id} value={f.id}>{f.name} — {f.department}</option>
                      ))}
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

        {/* Sections table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }}></div> Loading...
          </div>
        ) : sections.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏫</div>
            <p style={{ color: '#475569', marginBottom: 16 }}>No sections created yet</p>
            <button className="btn-primary" onClick={openAdd}>+ Create First Section</button>
          </div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: 20 }}>
                All Sections ({sections.length})
              </h2>
              <table>
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Department</th>
                    <th>Assigned Faculty</th>
                    <th>Students</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map(s => (
                    <tr key={s.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
                          }}>🏫</div>
                          <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{s.name}</span>
                        </div>
                      </td>
                      <td>
                        {s.department
                          ? <span className="badge badge-blue">{s.department}</span>
                          : <span style={{ color: '#334155' }}>—</span>
                        }
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700
                          }}>
                            {s.faculty_name?.charAt(0)}
                          </div>
                          <span style={{ color: '#94a3b8' }}>{s.faculty_name}</span>
                        </div>
                      </td>
                      <td><span className="badge badge-green">{s.student_count} students</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => openEdit(s)}
                            style={{
                              padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.3)',
                              background: 'rgba(99,102,241,0.1)', color: '#818cf8',
                              cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, transition: 'all 0.2s'
                            }}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            className="btn-danger"
                            onClick={() => handleDelete(s.id, s.name)}
                            disabled={deleting === s.id}
                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          >
                            {deleting === s.id ? '...' : '🗑️ Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Grouped by faculty */}
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginBottom: 16 }}>📁 By Faculty</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {grouped.map(({ faculty, sections: fSections }) => (
                <div key={faculty.id} className="card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%',
                      background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700
                    }}>
                      {faculty.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.9rem' }}>{faculty.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#475569' }}>{faculty.department}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {fSections.map(sec => (
                      <div key={sec.id} style={{
                        background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                        borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', color: '#818cf8'
                      }}>
                        {sec.name}
                        <span style={{ color: '#475569', marginLeft: 6 }}>({sec.student_count})</span>
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