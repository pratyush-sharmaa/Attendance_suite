import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
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

interface ProtectedRouteProps {
  children: ReactNode
  role?: string
}

function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const { user, ready } = useAuth()

  if (!ready) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a0f' }}>
      <div className="spinner" style={{ width: 40, height: 40 }}></div>
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
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Public — student scans QR, no auth needed */}
          <Route path="/student-attendance" element={<StudentAttendance />} />

          {/* Admin routes */}
          <Route path="/admin" element={
            <ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>
          }/>
          <Route path="/admin/faculties" element={
            <ProtectedRoute role="admin"><AdminFaculties /></ProtectedRoute>
          }/>
          <Route path="/admin/sections" element={
            <ProtectedRoute role="admin"><AdminSections /></ProtectedRoute>
          }/>

          {/* Faculty routes */}
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

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>

        {/* AI Chatbot floats on every page for logged-in users */}
        <ChatBotWrapper />
      </BrowserRouter>
    </AuthProvider>
  )
}

// Only show chatbot when user is logged in
function ChatBotWrapper() {
  const { user } = useAuth()
  if (!user) return null
  return <ChatBot />
}