const ACCOUNTS_KEY = 'chessCoachAuthAccounts'
const SESSION_KEY = 'chessCoachAuthSession'

export async function hashCredential(email, password) {
  const normalized = email.toLowerCase().trim()
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest(
    'SHA-256',
    enc.encode(`${normalized}\0${password}`),
  )
  return [...new Uint8Array(buf)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function loadStoredAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveStoredAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
}

export async function registerAccount(email, password) {
  const accounts = loadStoredAccounts()
  const normalized = email.toLowerCase().trim()
  if (accounts.some(a => a.email === normalized)) {
    return { ok: false, error: 'An account with this email already exists.' }
  }
  const passwordHash = await hashCredential(normalized, password)
  accounts.push({
    email: normalized,
    passwordHash,
    createdAt: Date.now(),
  })
  saveStoredAccounts(accounts)
  return { ok: true }
}

export async function authenticate(email, password) {
  const accounts = loadStoredAccounts()
  const normalized = email.toLowerCase().trim()
  const row = accounts.find(a => a.email === normalized)
  if (!row) {
    return { ok: false, error: 'No account found for this email.' }
  }
  const hash = await hashCredential(normalized, password)
  if (hash !== row.passwordHash) {
    return { ok: false, error: 'Incorrect password.' }
  }
  return { ok: true, email: normalized }
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setSession(email) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ email }))
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}
