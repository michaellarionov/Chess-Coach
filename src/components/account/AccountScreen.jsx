import { useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import './AccountScreen.css'

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

export default function AccountScreen({ onBack }) {
  const { user, ready, login, signup, logout } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setPending(true)
    try {
      const fn = mode === 'signin' ? login : signup
      const r = await fn(email, password)
      if (!r.ok) setError(r.error || 'Something went wrong.')
      else setPassword('')
    } finally {
      setPending(false)
    }
  }

  if (!ready) {
    return (
      <div className="account-screen">
        <p className="account-muted">Loading…</p>
      </div>
    )
  }

  if (user) {
    return (
      <div className="account-screen">
        <div className="account-card">
          <h2 className="account-title">Account</h2>
          <p className="account-signed-in">
            Signed in as <strong>{user.email}</strong>
          </p>
          <p className="account-note">
            Your credentials are stored only in this browser (local storage).
            Use a real backend when you deploy for production sign-in.
          </p>
          <div className="account-actions">
            <button type="button" className="account-btn secondary" onClick={onBack}>
              Back to Chess Coach
            </button>
            <button type="button" className="account-btn danger" onClick={logout}>
              Log out
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="account-screen">
      <div className="account-card">
        <h2 className="account-title">Account</h2>
        <div className="account-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className={mode === 'signin' ? 'active' : ''}
            onClick={() => {
              setMode('signin')
              setError('')
            }}
          >
            Log in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => {
              setMode('signup')
              setError('')
            }}
          >
            Sign up
          </button>
        </div>
        <form className="account-form" onSubmit={handleSubmit}>
          <label className="account-label">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="account-label">
            Password
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {error && <p className="account-error">{error}</p>}
          <button type="submit" className="account-btn primary" disabled={pending}>
            {pending ? 'Please wait…' : mode === 'signin' ? 'Log in' : 'Create account'}
          </button>
        </form>
        <button type="button" className="account-back" onClick={onBack}>
          ← Back to Chess Coach
        </button>
      </div>
    </div>
  )
}
