import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

const AuthContext = createContext(null)

function apiBase() {
  const base = import.meta.env.VITE_API_BASE_URL?.trim()
  if (!base) return ''
  return base.replace(/\/+$/, '')
}

async function apiFetch(path, options = {}) {
  const url = `${apiBase()}${path}`
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  return res
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch('/api/auth/me', { method: 'GET' })
        const json = await res.json().catch(() => null)
        if (cancelled) return
        setUser(json?.user || null)
      } catch {
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Login failed.' }
    setUser(json.user || null)
    return { ok: true }
  }, [])

  const signup = useCallback(async (email, password) => {
    const res = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Sign up failed.' }
    setUser(json.user || null)
    return { ok: true }
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', body: '{}' })
    } finally {
      setUser(null)
    }
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
