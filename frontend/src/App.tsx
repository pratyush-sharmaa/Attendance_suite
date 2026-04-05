import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Component } from 'react'
import type { ReactNode } from 'react'

import Login             from './pages/Login'
import AdminDashboard    from './pages/admin/Dashboard'
import AdminFaculties    from './pages/admin/Faculties'
import AdminSections     from './pages/admin/Sections'
import FacultyDashboard  from './pages/faculty/Dashboard'
import FacultyStudents   from './pages/faculty/Students'
import FacultyAttendance from './pages/faculty/Attendance'
import FacultyReports    from './pages/faculty/Reports'
import QRAttendance      from './pages/faculty/QRAttendance'
import StudentAttendance from './pages/StudentAttendance'
import EmailAlerts       from './pages/faculty/EmailAlerts'
import ChatBot           from './components/ChatBot'

class ErrorBoundary extends Component
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error: error.message }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', background: '#07070f',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 20, padding: 40, fontFamily: 'monospace'
        }}>
          <div style={{ color: '#f59e0b', fontSize: '1.4rem' }}>◈ FACEATTEND</div>
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10, padding: '16px 24px', color: '#f87171',
            fontSize: '0.78rem', textAlign: 'center', maxWidth: 500, lineHeight: 2
          }}>
            RENDER ERROR — {this.state.error}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => { this.setState({ error: null }); window.history.back() }}
              style={{
                background: 'rgba(255,255,255,0.06)', color: '#e8e8f2',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontFamily: 'monospace'
              }}
            >
              ← GO BACK
            </button>
            <button
              onClick={() => { this.setState({ error: null }); window.location.href = '/faculty' }}
              style={{
                background: '#f59e0b', color: '#000', border: 'none', borderRadius: 8,
                padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontFamily: 'monospace'
              }}
            >
              GO TO DASHBOARD
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

interface ProtectedRouteProps {
  children: ReactNode
  role?: string
}

function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const { user, ready } = useAuth()

  if (!ready) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#07070f', gap: 12,
      fontFamily: 'monospace', color: '#3a3a58', fontSize: '0.75rem', letterSpacing: '0.1em'
    }}>
      <div className="spinner" style={{ width: 20, height: 20 }} />
      LOADING...
    </div>
  )

  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/student-attendance" element={<StudentAttendance />} />

            <Route path="/admin" element={
              <ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>
            }/>
            <Route path="/admin/faculties" element={
              <ProtectedRoute role="admin"><AdminFaculties /></ProtectedRoute>
            }/>
            <Route path="/admin/sections" element={
              <ProtectedRoute role="admin"><AdminSections /></ProtectedRoute>
            }/>

            <Route path="/faculty" element={
              <ProtectedRoute role="faculty"><FacultyDashboard /></ProtectedRoute>
            }/>
            <Route path="/faculty/students" element={
              <ProtectedRoute role="faculty"><FacultyStudents /></ProtectedRoute>
            }/>
            <Route path="/faculty/attendance" element={
              <ProtectedRoute role="faculty"><FacultyAttendance /></ProtectedRoute>
            }/>
            <Route path="/faculty/reports" element={
              <ProtectedRoute role="faculty"><FacultyReports /></ProtectedRoute>
            }/>
            <Route path="/faculty/qr" element={
              <ProtectedRoute role="faculty"><QRAttendance /></ProtectedRoute>
            }/>
            <Route path="/faculty/alerts" element={
              <ProtectedRoute role="faculty"><EmailAlerts /></ProtectedRoute>
            }/>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
          <ChatBotWrapper />
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  )
}

function ChatBotWrapper() {
  const { user } = useAuth()
  if (!user) return null
  return <ChatBot />
}
