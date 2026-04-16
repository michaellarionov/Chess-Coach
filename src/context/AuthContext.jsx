import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import * as auth from '../utils/authStorage.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const s = auth.getSession()
    if (s?.email) setUser({ email: s.email })
    setReady(true)
  }, [])

  const login = useCallback(async (email, password) => {
    const r = await auth.authenticate(email, password)
    if (!r.ok) return r
    auth.setSession(r.email)
    setUser({ email: r.email })
    return { ok: true }
  }, [])

  const signup = useCallback(async (email, password) => {
    const r = await auth.registerAccount(email, password)
    if (!r.ok) return r
    const normalized = email.toLowerCase().trim()
    auth.setSession(normalized)
    setUser({ email: normalized })
    return { ok: true }
  }, [])

  const logout = useCallback(() => {
    auth.clearSession()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, ready, login, signup, logout }),
    [user, ready, login, signup, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
