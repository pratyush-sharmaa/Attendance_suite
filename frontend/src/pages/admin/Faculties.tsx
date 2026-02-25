import { useEffect, useState } from 'react'
import Sidebar from '../../components/Sidebar'
import api from '../../api'

const NAV = [
  { icon: '📊', label: 'Dashboard', path: '/admin' },
  { icon: '👨‍🏫', label: 'Faculties', path: '/admin/faculties' },
  { icon: '🏫', label: 'Sections',  path: '/admin/sections' },
]

interface Faculty {
  id: number
  name: string
  email: string
  department: string
  section_count: number
  created_at: string
}

const emptyForm = { name: '', email: '', password: '', department: '' }

export default function AdminFaculties() {
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

  const fetchFaculties = () => {
    setLoading(true)
    api.get('/api/admin/faculties')
      .then(r => setFaculties(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchFaculties() }, [])

  const openAdd = () => {
    setEditId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (f: Faculty) => {
    setEditId(f.id)
    setForm({ name: f.name, email: f.email, password: '', department: f.department })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.email) {
      showToast('Name and email are required', 'error'); return
    }
    if (!editId && !form.password) {
      showToast('Password is required for new faculty', 'error'); return
    }
    setSaving(true)
    try {
      if (editId) {
        // Edit — only send password if filled
        const payload: any = { name: form.name, email: form.email, department: form.department }
        if (form.password) payload.password = form.password
        await api.put(`/api/admin/faculties/${editId}`, payload)
        showToast(`✅ ${form.name} updated successfully!`)
      } else {
        await api.post('/api/admin/faculties', form)
        showToast(`✅ ${form.name} added successfully!`)
      }
      setForm(emptyForm)
      setShowForm(false)
      setEditId(null)
      fetchFaculties()
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete faculty "${name}"? This cannot be undone.`)) return
    setDeleting(id)
    try {
      await api.delete(`/api/admin/faculties/${id}`)
      showToast(`🗑️ ${name} removed`)
      fetchFaculties()
    } catch {
      showToast('Failed to delete', 'error')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
      <Sidebar items={NAV} />

      <div style={{ marginLeft: 240, flex: 1, padding: '32px 36px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#e2e8f0' }}>👨‍🏫 Faculties</h1>
            <p style={{ color: '#475569', marginTop: 4, fontSize: '0.875rem' }}>
              Manage faculty accounts and their access
            </p>
          </div>
          <button className="btn-primary" onClick={showForm ? () => { setShowForm(false); setEditId(null) } : openAdd}>
            {showForm ? '✕ Cancel' : '+ Add Faculty'}
          </button>
        </div>

        {/* Add / Edit Form */}
        {showForm && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ color: '#e2e8f0', marginBottom: 20, fontSize: '1rem', fontWeight: 600 }}>
              {editId ? '✏️ Edit Faculty' : '➕ New Faculty'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Full Name *</label>
                <input placeholder="Dr. John Smith" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Email *</label>
                <input type="email" placeholder="john@college.edu" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>
                  {editId ? 'New Password (leave blank to keep current)' : 'Password *'}
                </label>
                <input
                  type="password"
                  placeholder={editId ? 'Leave blank to keep current' : 'Set login password'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '0.8rem', color: '#94a3b8' }}>Department</label>
                <input placeholder="Computer Science" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <><span className="spinner"></span> Saving...</> : editId ? '💾 Save Changes' : '✅ Create Faculty'}
              </button>
              <button className="btn-secondary" onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm) }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0' }}>
              All Faculties ({faculties.length})
            </h2>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }}></div> Loading...
            </div>
          ) : faculties.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#475569' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>👨‍🏫</div>
              <p style={{ marginBottom: 16 }}>No faculties added yet</p>
              <button className="btn-primary" onClick={openAdd}>+ Add First Faculty</button>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Faculty</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Sections</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {faculties.map(f => (
                  <tr key={f.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: 13, flexShrink: 0
                        }}>
                          {f.name.charAt(0)}
                        </div>
                        <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{f.name}</span>
                      </div>
                    </td>
                    <td style={{ color: '#94a3b8' }}>{f.email}</td>
                    <td>
                      {f.department
                        ? <span className="badge badge-blue">{f.department}</span>
                        : <span style={{ color: '#334155' }}>—</span>
                      }
                    </td>
                    <td><span className="badge badge-purple">{f.section_count} sections</span></td>
                    <td style={{ color: '#475569', fontSize: '0.8rem' }}>
                      {new Date(f.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => openEdit(f)}
                          style={{
                            padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.3)',
                            background: 'rgba(99,102,241,0.1)', color: '#818cf8',
                            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
                            transition: 'all 0.2s'
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          className="btn-danger"
                          onClick={() => handleDelete(f.id, f.name)}
                          disabled={deleting === f.id}
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                        >
                          {deleting === f.id ? '...' : '🗑️ Delete'}
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