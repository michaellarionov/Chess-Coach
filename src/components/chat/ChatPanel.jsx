import { useState } from 'react'
import './ChatPanel.css'

export default function ChatPanel({ fen, pgn }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hello! Share a position or game and I will help you analyse it.' },
  ])
  const [input, setInput] = useState('')

  const send = () => {
    const text = input.trim()
    if (!text) return
    setMessages(prev => [...prev, { role: 'user', text }])
    setInput('')
    // TODO: wire up to Claude / LLM API
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
        />
        <button onClick={send}>Send</button>
      </div>
    </div>
  )
}
