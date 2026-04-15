import { useState } from 'react'
import BoardPanel from './components/board/BoardPanel.jsx'
import AnalysisPanel from './components/analysis/AnalysisPanel.jsx'
import ChatPanel from './components/chat/ChatPanel.jsx'
import MLPanel from './components/ml/MLPanel.jsx'
import useStockfish from './hooks/useStockfish.js'
import './App.css'

export default function App() {
  const [fen, setFen] = useState(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  )
  const [pgn, setPgn] = useState('')
  const { lines, isReady, bestMove, evaluation } = useStockfish(fen)

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1>Chess Coach</h1>
      </header>
      <main className="app-main">
        <div className="left-panel">
          <BoardPanel
            fen={fen}
            onFenChange={setFen}
            onPgnChange={setPgn}
            evalLine={lines[0]}
            engineLines={lines}
            bestMove={bestMove}
            evaluation={evaluation}
            isEngineReady={isReady}
          />
        </div>
        <div className="right-panel">
          <AnalysisPanel
            lines={lines}
            bestMove={bestMove}
            evaluation={evaluation}
            isReady={isReady}
          />
          <ChatPanel fen={fen} pgn={pgn} />
          <MLPanel fen={fen} pgn={pgn} />
        </div>
      </main>
    </div>
  )
}
