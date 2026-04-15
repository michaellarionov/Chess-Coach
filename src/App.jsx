import { useEffect, useState } from 'react'
import BoardPanel from './components/board/BoardPanel.jsx'
import AnalysisPanel from './components/analysis/AnalysisPanel.jsx'
import ChatPanel from './components/chat/ChatPanel.jsx'
import MLPanel from './components/ml/MLPanel.jsx'
import GameImportPanel from './components/import/GameImportPanel.jsx'
import OpeningTrainerPanel from './components/trainer/OpeningTrainerPanel.jsx'
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
  const [weaknessProfile, setWeaknessProfile] = useState(null)
  const [trainerConfig, setTrainerConfig] = useState({
    enabled: false,
    playerColor: 'w',
    line: null,
    sessionId: 0,
  })
  const [trainerProgressByLine, setTrainerProgressByLine] = useState(() => {
    try {
      const raw = localStorage.getItem('openingTrainerProgress')
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })
  const [trainerFeedbackContext, setTrainerFeedbackContext] = useState(null)
  const [autoExplainContext, setAutoExplainContext] = useState(null)
  const { lines, isReady, bestMove, evaluation } = useStockfish(fen)

  const handleLoadImportedGame = gamePgn => {
    setExternalPgnToLoad(gamePgn)
    setExternalPgnLoadId(prev => prev + 1)
  }

  const handleTrainerProgress = ({ lineId, success }) => {
    if (!lineId) return
    setTrainerProgressByLine(prev => {
      const current = prev[lineId] || { attempts: 0, successes: 0 }
      const next = {
        ...prev,
        [lineId]: {
          attempts: current.attempts + 1,
          successes: current.successes + (success ? 1 : 0),
        },
      }
      localStorage.setItem('openingTrainerProgress', JSON.stringify(next))
      return next
    })
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
      weaknessProfile,
      weaknessSummary: weaknessProfile?.summary || null,
    })
  }, [lastMoveEvent, fen, evaluation, bestMove, lines, openingContext, weaknessProfile])

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
            onTrainerFeedback={setTrainerFeedbackContext}
            onTrainerProgress={handleTrainerProgress}
            externalPgnToLoad={externalPgnToLoad}
            externalPgnLoadId={externalPgnLoadId}
            trainerConfig={trainerConfig}
            evalLine={lines[0]}
            engineLines={lines}
            bestMove={bestMove}
            evaluation={evaluation}
            isEngineReady={isReady}
          />
        </div>
        <div className="right-panel">
          <OpeningTrainerPanel
            trainerConfig={trainerConfig}
            progressByLine={trainerProgressByLine}
            onTrainerConfigChange={setTrainerConfig}
          />
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
            weaknessProfile={weaknessProfile}
            trainerFeedbackContext={trainerFeedbackContext}
          />
          <MLPanel onProfileChange={setWeaknessProfile} />
        </div>
      </main>
    </div>
  )
}
