import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { nowMs } from './db.js'

const SESSION_COOKIE = 'cc_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 days

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim()
}

export function getSessionCookieName() {
  return SESSION_COOKIE
}

export function sessionCookieOptions(req) {
  const isHttps =
    req.secure ||
    String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https'
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge: SESSION_TTL_MS,
  }
}

export function createUser(db, { email, password }) {
  const normalized = normalizeEmail(email)
  if (!normalized) return { ok: false, error: 'Email is required.' }
  if (typeof password !== 'string' || password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' }
  }
  const existing = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(normalized)
  if (existing) return { ok: false, error: 'An account with this email already exists.' }

  const passwordHash = bcrypt.hashSync(password, 12)
  const createdAt = nowMs()
  const info = db
    .prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)')
    .run(normalized, passwordHash, createdAt)
  return { ok: true, user: { id: info.lastInsertRowid, email: normalized } }
}

export function verifyLogin(db, { email, password }) {
  const normalized = normalizeEmail(email)
  const row = db
    .prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
    .get(normalized)
  if (!row) return { ok: false, error: 'No account found for this email.' }
  const ok = bcrypt.compareSync(String(password || ''), row.password_hash)
  if (!ok) return { ok: false, error: 'Incorrect password.' }
  return { ok: true, user: { id: row.id, email: row.email } }
}

export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex')
  const createdAt = nowMs()
  const expiresAt = createdAt + SESSION_TTL_MS
  db.prepare(
    'INSERT INTO sessions (user_id, token, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(userId, token, createdAt, expiresAt)
  return { token, expiresAt }
}

export function deleteSession(db, token) {
  if (!token) return
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function loadSession(db, token) {
  if (!token) return null
  const row = db
    .prepare(
      `SELECT s.token, s.expires_at, u.id as user_id, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(token)
  if (!row) return null
  if (row.expires_at <= nowMs()) {
    deleteSession(db, token)
    return null
  }
  return { token: row.token, user: { id: row.user_id, email: row.email } }
}

export function pruneExpiredSessions(db) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowMs())
}
