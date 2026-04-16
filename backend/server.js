import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { Readable } from 'node:stream'

dotenv.config({ override: true })

const app = express()
const port = Number.parseInt(process.env.PORT || '8787', 10)
const rawKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY
const apiKey = typeof rawKey === 'string' ? rawKey.trim() : rawKey

function maskKey(k) {
  if (!k || typeof k !== 'string') return '(missing)'
  const clean = k.trim()
  if (clean.length <= 10) return `${clean.slice(0, 2)}…${clean.slice(-2)}`
  return `${clean.slice(0, 6)}…${clean.slice(-4)}`
}

if (!apiKey) {
  console.warn(
    'Missing ANTHROPIC_API_KEY (or VITE_ANTHROPIC_API_KEY fallback). Claude proxy will return 500 until set.',
  )
} else {
  console.log(
    `Anthropic key loaded (${maskKey(apiKey)}), length=${String(apiKey).length}`,
  )
}

const allowlist = new Set(
  (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
)

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser tools (curl/postman) and same-origin server-to-server traffic.
    if (!origin) return callback(null, true)
    if (allowlist.size === 0) return callback(null, true)
    if (allowlist.has(origin)) return callback(null, true)
    return callback(new Error(`Origin not allowed: ${origin}`))
  },
}

app.use(cors(corsOptions))
app.use(express.json({ limit: '1mb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/anthropic/messages', async (req, res) => {
  if (!apiKey) {
    return res.status(500).json({
      error: 'Server misconfigured: ANTHROPIC_API_KEY is not set.',
    })
  }

  const {
    model = 'claude-sonnet-4-6',
    max_tokens = 500,
    system,
    messages,
  } = req.body || {}

  const wantsStream =
    req.query?.stream === '1' ||
    String(req.headers.accept || '').includes('text/event-stream')

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid payload: messages[] is required.' })
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens,
        system,
        messages,
        stream: wantsStream,
      }),
    })

    if (wantsStream) {
      res.status(upstream.status)
      res.setHeader('content-type', 'text/event-stream; charset=utf-8')
      res.setHeader('cache-control', 'no-cache, no-transform')
      res.setHeader('connection', 'keep-alive')
      res.flushHeaders?.()

      if (!upstream.ok || !upstream.body) {
        const text = await upstream.text()
        res.write(`event: error\ndata: ${JSON.stringify({ status: upstream.status, details: text })}\n\n`)
        return res.end()
      }

      const nodeStream = Readable.fromWeb(upstream.body)
      nodeStream.on('error', err => {
        res.write(`event: error\ndata: ${JSON.stringify({ error: err?.message || String(err) })}\n\n`)
        res.end()
      })
      req.on('close', () => {
        nodeStream.destroy()
      })
      return nodeStream.pipe(res)
    }

    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json')
    return res.send(text)
  } catch (error) {
    return res.status(502).json({
      error: 'Failed to reach Anthropic API.',
      details: error?.message || String(error),
    })
  }
})

app.listen(port, () => {
  console.log(`Claude proxy listening on http://localhost:${port}`)
})
