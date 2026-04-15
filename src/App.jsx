import { useEffect, useState } from 'react'
import BoardPanel from './components/board/BoardPanel.jsx'
import AnalysisPanel from './components/analysis/AnalysisPanel.jsx'
import ChatPanel from './components/chat/ChatPanel.jsx'
import MLPanel from './components/ml/MLPanel.jsx'
import GameImportPanel from './components/import/GameImportPanel.jsx'
import useStockfish from './hooks/useStockfish.js'
import './App.css'

export default function App() {
  const [fen, setFen] = useState(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  )
  const [pgn, setPgn] = useState('')
  const [externalPgnToLoad, setExternalPgnToLoad] = useState('')
  const [externalPgnLoadId, setExternalPgnLoadId] = useState(0)
  const [lastMoveEvent, setLastMoveEvent] = useState(null)
  const [openingContext, setOpeningContext] = useState(null)
  const [autoExplainContext, setAutoExplainContext] = useState(null)
  const { lines, isReady, bestMove, evaluation } = useStockfish(fen)

  const handleLoadImportedGame = gamePgn => {
    setExternalPgnToLoad(gamePgn)
    setExternalPgnLoadId(prev => prev + 1)
  }

  useEffect(() => {
    if (!lastMoveEvent) return
    if (fen !== lastMoveEvent.fen) return
    if (!evaluation || typeof evaluation.cp !== 'number') return

    setAutoExplainContext({
      id: `${lastMoveEvent.ply}-${lastMoveEvent.moveUci}-${lastMoveEvent.fen}`,
      fen: lastMoveEvent.fen,
      movePlayed: lastMoveEvent.moveSan,
      movePlayedUci: lastMoveEvent.moveUci,
      bestMove: bestMove || 'unknown',
      centipawnEval: evaluation.cp,
      evalText: evaluation.score || 'unknown',
      topLines: lines.map(line => line.moves),
      opening: openingContext?.currentOpening || openingContext?.lastKnownOpening || null,
      theoryExitPly: openingContext?.theoryExitPly ?? null,
      theoryExited: openingContext?.theoryExited ?? false,
    })
  }, [lastMoveEvent, fen, evaluation, bestMove, lines, openingContext])

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
            onMovePlayed={setLastMoveEvent}
            onOpeningChange={setOpeningContext}
            externalPgnToLoad={externalPgnToLoad}
            externalPgnLoadId={externalPgnLoadId}
            evalLine={lines[0]}
            engineLines={lines}
            bestMove={bestMove}
            evaluation={evaluation}
            isEngineReady={isReady}
          />
        </div>
        <div className="right-panel">
          <GameImportPanel onLoadGame={handleLoadImportedGame} />
          <AnalysisPanel
            lines={lines}
            bestMove={bestMove}
            evaluation={evaluation}
            isReady={isReady}
          />
          <ChatPanel
            fen={fen}
            pgn={pgn}
            bestMove={bestMove}
            evaluation={evaluation}
            topLines={lines}
            autoExplainContext={autoExplainContext}
            openingContext={openingContext}
          />
          <MLPanel fen={fen} pgn={pgn} />
        </div>
      </main>
    </div>
  )
}
