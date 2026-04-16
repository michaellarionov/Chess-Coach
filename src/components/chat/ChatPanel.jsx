import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './ChatPanel.css'

const MODEL = 'claude-sonnet-4-6'

function getApiUrl() {
  const base = import.meta.env.VITE_API_BASE_URL?.trim()
  if (!base) return '/api/anthropic/messages'
  return `${base.replace(/\/+$/, '')}/api/anthropic/messages`
}

const ANTHROPIC_API_URL = getApiUrl()

function makeSystemPrompt() {
  return (
    'You are a friendly chess coach. Explain positions in plain English, avoid jargon when possible, and keep responses concise but instructive. ' +
    'When discussing a move, cover tactical ideas, strategic plans, and one concrete next step for the side to move.'
  )
}

function makeAutoExplainPrompt(context) {
  const openingText = context.opening
    ? `${context.opening.eco} - ${context.opening.name}`
    : 'Unknown'
  return (
    `Explain this position in plain English after the move was played.\n` +
    `FEN: ${context.fen}\n` +
    `Move played: ${context.movePlayed} (${context.movePlayedUci})\n` +
    `Stockfish best move: ${context.bestMove}\n` +
    `Centipawn evaluation (white perspective): ${context.centipawnEval}\n` +
    `Eval text: ${context.evalText}\n` +
    `Top 3 lines: ${context.topLines.join(' | ')}\n` +
    `Opening: ${openingText}\n` +
    `Out of opening theory: ${context.theoryExited ? `yes (ply ${context.theoryExitPly})` : 'no'}\n` +
    `Weakness profile: ${context.weaknessSummary || 'none yet'}`
  )
}

function makeFollowupPrompt(question, position) {
  const opening = position.openingContext?.currentOpening || position.openingContext?.lastKnownOpening
  const openingText = opening ? `${opening.eco} - ${opening.name}` : 'Unknown'
  return (
    `Question: ${question}\n\n` +
    `Current position context:\n` +
    `FEN: ${position.fen}\n` +
    `Best move: ${position.bestMove || 'unknown'}\n` +
    `Centipawn evaluation: ${position.evaluation?.cp ?? 'unknown'}\n` +
    `Eval text: ${position.evaluation?.score ?? 'unknown'}\n` +
    `Top lines: ${(position.topLines || []).map(line => line.moves).join(' | ')}\n` +
    `Opening: ${openingText}\n` +
    `Out of opening theory: ${position.openingContext?.theoryExited ? `yes (ply ${position.openingContext.theoryExitPly})` : 'no'}\n` +
    `Weakness profile: ${position.weaknessProfile?.summary || 'none yet'}\n` +
    `PGN: ${position.pgn || '(empty)'}`
  )
}

function makeTrainerPrompt(context) {
  const openingText = context.opening
    ? `${context.opening.eco} - ${context.opening.name}`
    : 'Unknown line'
  return (
    `Opening trainer correction request.\n` +
    `Opening line: ${openingText}\n` +
    `FEN: ${context.fen}\n` +
    `Played move: ${context.playedMove}\n` +
    `Theoretical move: ${context.correctMove}\n` +
    `Explain clearly why the theoretical move is preferred in this line and give one memory tip.`
  )
}

export default function ChatPanel({
  fen,
  pgn,
  bestMove,
  evaluation,
  topLines,
  autoExplainContext,
  openingContext,
  weaknessProfile,
  trainerFeedbackContext,
}) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hello! Share a position or game and I will help you analyse it.',
    },
  ])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const lastAutoIdRef = useRef(null)
  const lastTrainerIdRef = useRef(null)
  const messagesRef = useRef(null)
  const bottomRef = useRef(null)
  const shouldAutoScrollRef = useRef(true)

  const newId = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`

  const messagesDigest = useMemo(
    () => messages.map(m => `${m.id}:${m.text.length}`).join('|'),
    [messages],
  )

  const scrollToBottom = (behavior = 'auto') => {
    const el = bottomRef.current
    if (!el) return
    el.scrollIntoView({ block: 'end', behavior })
  }

  const onMessagesScroll = () => {
    const el = messagesRef.current
    if (!el) return
    const thresholdPx = 28
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    shouldAutoScrollRef.current = distanceFromBottom <= thresholdPx
  }

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      scrollToBottom('auto')
    }
  }, [messagesDigest])

  const buildPayload = (userPrompt, history) => ({
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
  })

  async function callClaudeStream({ userPrompt, history, onText }) {
    const response = await fetch(`${ANTHROPIC_API_URL}?stream=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(buildPayload(userPrompt, history)),
    })

    if (!response.ok || !response.body) {
      const details = await response.text()
      throw new Error(`Claude API error (${response.status}): ${details}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let out = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const events = buffer.split('\n\n')
      buffer = events.pop() || ''

      for (const evt of events) {
        // Parse minimal SSE: we only care about `data:` lines.
        const dataLines = evt
          .split('\n')
          .filter(l => l.startsWith('data:'))
          .map(l => l.replace(/^data:\s?/, ''))
          .join('\n')

        if (!dataLines) continue
        if (dataLines === '[DONE]') continue

        let json
        try {
          json = JSON.parse(dataLines)
        } catch {
          continue
        }

        if (json?.type === 'content_block_delta' && json?.delta?.type === 'text_delta') {
          const chunk = json.delta.text || ''
          if (chunk) {
            out += chunk
            onText(out)
          }
        }

        if (json?.type === 'message_stop') {
          return out || 'No response from Claude.'
        }

        if (json?.type === 'error' || json?.error) {
          throw new Error(
            `Claude stream error: ${json?.error?.message || json?.message || 'unknown'}`,
          )
        }
      }
    }

    return out || 'No response from Claude.'
  }

  const sendToClaude = async ({ prompt, appendUserText }) => {
    setError('')
    setIsSending(true)

    const history = messages.filter(m => m.role === 'user' || m.role === 'assistant')
    const assistantId = newId()
    if (appendUserText) {
      setMessages(prev => [...prev, { id: newId(), role: 'user', text: appendUserText }])
    }

    try {
      // If user is currently at the bottom, keep following the stream.
      // If they've scrolled up, don't force-jump.
      onMessagesScroll()

      setMessages(prev => {
        return [...prev, { id: assistantId, role: 'assistant', text: '' }]
      })

      const answer = await callClaudeStream({
        userPrompt: prompt,
        history,
        onText: text => {
          setMessages(prev => {
            const idx = prev.findIndex(m => m.id === assistantId)
            if (idx < 0) return prev
            const next = [...prev]
            next[idx] = { ...next[idx], text }
            return next
          })
        },
      })

      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === assistantId)
        if (idx < 0) return prev
        const next = [...prev]
        next[idx] = { ...next[idx], text: answer }
        return next
      })
    } catch (err) {
      setError(err.message || 'Failed to call Claude API.')
      setMessages(prev => [
        ...prev,
        {
          id: newId(),
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

  useEffect(() => {
    if (!trainerFeedbackContext?.id) return
    if (lastTrainerIdRef.current === trainerFeedbackContext.id) return
    lastTrainerIdRef.current = trainerFeedbackContext.id

    void sendToClaude({
      prompt: makeTrainerPrompt(trainerFeedbackContext),
      appendUserText: `Trainer mistake: played ${trainerFeedbackContext.playedMove}, expected ${trainerFeedbackContext.correctMove}`,
    })
  }, [trainerFeedbackContext]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = () => {
    const text = input.trim()
    if (!text || isSending) return
    setInput('')
    const prompt = makeFollowupPrompt(text, {
      fen,
      pgn,
      bestMove,
      evaluation,
      topLines,
      openingContext,
      weaknessProfile,
    })
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
      <div className="messages" ref={messagesRef} onScroll={onMessagesScroll}>
        {messages.map((m, i) => (
          <div key={m.id || i} className={`message ${m.role}`}>
            <span className="bubble">
              {m.role === 'assistant' ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {m.text}
                </ReactMarkdown>
              ) : (
                m.text
              )}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
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
