import { useState } from 'react'
import BoardPanel from './components/board/BoardPanel.jsx'
import AnalysisPanel from './components/analysis/AnalysisPanel.jsx'
import ChatPanel from './components/chat/ChatPanel.jsx'
import MLPanel from './components/ml/MLPanel.jsx'
import './App.css'

export default function App() {
  const [fen, setFen] = useState('start')
  const [pgn, setPgn] = useState('')

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1>Chess Coach</h1>
      </header>
      <main className="app-main">
        <div className="left-panel">
          <BoardPanel fen={fen} onFenChange={setFen} onPgnChange={setPgn} />
        </div>
        <div className="right-panel">
          <AnalysisPanel fen={fen} />
          <ChatPanel fen={fen} pgn={pgn} />
          <MLPanel fen={fen} pgn={pgn} />
        </div>
      </main>
    </div>
  )
}
