import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'

interface User {
  token: string
  role: string
  name: string
  sub?: string
}

interface AuthContextType {
  user: User | null
  login: (token: string, role: string, name: string, sub?: string) => void
  logout: () => void
  ready: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,  setUser]  = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const role  = localStorage.getItem('role')
    const name  = localStorage.getItem('name')
    const sub   = localStorage.getItem('sub') || undefined
    if (token && role && name) setUser({ token, role, name, sub })
    setReady(true)
  }, [])

  const login = (token: string, role: string, name: string, sub?: string) => {
    localStorage.setItem('token', token)
    localStorage.setItem('role',  role)
    localStorage.setItem('name',  name)
    if (sub) localStorage.setItem('sub', sub)
    setUser({ token, role, name, sub })
  }

  const logout = () => {
    localStorage.clear()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, ready }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}