import { useEffect, useRef, useState } from 'react'
import './ChatPanel.css'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-3-5-sonnet-latest'

function makeSystemPrompt() {
  return (
    'You are a friendly chess coach. Explain positions in plain English, avoid jargon when possible, and keep responses concise but instructive. ' +
    'When discussing a move, cover tactical ideas, strategic plans, and one concrete next step for the side to move.'
  )
}

function makeAutoExplainPrompt(context) {
  return (
    `Explain this position in plain English after the move was played.\n` +
    `FEN: ${context.fen}\n` +
    `Move played: ${context.movePlayed} (${context.movePlayedUci})\n` +
    `Stockfish best move: ${context.bestMove}\n` +
    `Centipawn evaluation (white perspective): ${context.centipawnEval}\n` +
    `Eval text: ${context.evalText}\n` +
    `Top 3 lines: ${context.topLines.join(' | ')}`
  )
}

function makeFollowupPrompt(question, position) {
  return (
    `Question: ${question}\n\n` +
    `Current position context:\n` +
    `FEN: ${position.fen}\n` +
    `Best move: ${position.bestMove || 'unknown'}\n` +
    `Centipawn evaluation: ${position.evaluation?.cp ?? 'unknown'}\n` +
    `Eval text: ${position.evaluation?.score ?? 'unknown'}\n` +
    `Top lines: ${(position.topLines || []).map(line => line.moves).join(' | ')}\n` +
    `PGN: ${position.pgn || '(empty)'}`
  )
}

export default function ChatPanel({
  fen,
  pgn,
  bestMove,
  evaluation,
  topLines,
  autoExplainContext,
}) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hello! Share a position or game and I will help you analyse it.' },
  ])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const lastAutoIdRef = useRef(null)

  const callClaude = async (userPrompt, history) => {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('Missing VITE_ANTHROPIC_API_KEY. Add it to your .env file.')
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: makeSystemPrompt(),
        messages: [
          ...history.map(msg => ({
            role: msg.role,
            content: [{ type: 'text', text: msg.text }],
          })),
          { role: 'user', content: [{ type: 'text', text: userPrompt }] },
        ],
      }),
    })

    if (!response.ok) {
      const details = await response.text()
      throw new Error(`Claude API error (${response.status}): ${details}`)
    }

    const json = await response.json()
    return json.content?.[0]?.text || 'No response from Claude.'
  }

  const sendToClaude = async ({ prompt, appendUserText }) => {
    setError('')
    setIsSending(true)

    const history = messages.filter(m => m.role === 'user' || m.role === 'assistant')
    if (appendUserText) {
      setMessages(prev => [...prev, { role: 'user', text: appendUserText }])
    }

    try {
      const answer = await callClaude(prompt, history)
      setMessages(prev => [...prev, { role: 'assistant', text: answer }])
    } catch (err) {
      setError(err.message || 'Failed to call Claude API.')
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: 'I could not reach Claude right now. Please check API key/configuration and try again.',
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  useEffect(() => {
    if (!autoExplainContext?.id) return
    if (lastAutoIdRef.current === autoExplainContext.id) return
    lastAutoIdRef.current = autoExplainContext.id

    const prompt = makeAutoExplainPrompt(autoExplainContext)
    void sendToClaude({
      prompt,
      appendUserText: `Auto-analysis: ${autoExplainContext.movePlayed} (best: ${autoExplainContext.bestMove}, eval: ${autoExplainContext.evalText})`,
    })
  }, [autoExplainContext]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = () => {
    const text = input.trim()
    if (!text || isSending) return
    setInput('')
    const prompt = makeFollowupPrompt(text, { fen, pgn, bestMove, evaluation, topLines })
    void sendToClaude({ prompt, appendUserText: text })
  }

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="chat-panel">
      <h2>Coach Chat</h2>
      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <span className="bubble">{m.text}</span>
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about the position…"
          rows={2}
          disabled={isSending}
        />
        <button onClick={send} disabled={isSending}>
          {isSending ? 'Sending…' : 'Send'}
        </button>
      </div>
      {error && <p className="chat-error">{error}</p>}
    </div>
  )
}
