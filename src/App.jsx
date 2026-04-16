import { useEffect, useState } from 'react'
import AccountScreen from './components/account/AccountScreen.jsx'
import AnalysisPanel from './components/analysis/AnalysisPanel.jsx'
import BoardPanel from './components/board/BoardPanel.jsx'
import ChatPanel from './components/chat/ChatPanel.jsx'
import MLPanel from './components/ml/MLPanel.jsx'
import GameImportPanel from './components/import/GameImportPanel.jsx'
import OpeningTrainerPanel from './components/trainer/OpeningTrainerPanel.jsx'
import EndgamePracticePage from './components/endgame/EndgamePracticePage.jsx'
import SettingsPage from './components/settings/SettingsPage.jsx'
import AppHeaderMenu from './components/layout/AppHeaderMenu.jsx'
import useStockfish from './hooks/useStockfish.js'
import { useAuth } from './context/AuthContext.jsx'
import './App.css'

const VIEWS = {
  account: 'account',
  coach: 'coach',
  openingTrainer: 'opening-trainer',
  weaknessProfile: 'weakness-profile',
  endgamePractice: 'endgame-practice',
  settings: 'settings',
}

export default function App() {
  const { user, ready: authReady, logout } = useAuth()
  const [activeView, setActiveView] = useState(VIEWS.account)
  const [hideCoachOptions, setHideCoachOptions] = useState(false)
  const [gameStarted, setGameStarted] = useState(false)
  const [boardNavState, setBoardNavState] = useState({
    moveIndex: 0,
    totalMoves: 0,
    opening: 'Unknown',
    theoryExitPly: null,
  })
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
  const { lines, isReady, bestMove, evaluation, engineError } = useStockfish(fen)

  const handleLoadImportedGame = gamePgn => {
    setExternalPgnToLoad(gamePgn)
    setExternalPgnLoadId(prev => prev + 1)
    setGameStarted(true)
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

  const fullWidthMain =
    activeView === VIEWS.account ||
    activeView === VIEWS.openingTrainer ||
    activeView === VIEWS.weaknessProfile ||
    activeView === VIEWS.endgamePractice ||
    activeView === VIEWS.settings

  useEffect(() => {
    if (!authReady) return
    if (!user && activeView !== VIEWS.account) {
      setActiveView(VIEWS.account)
      return
    }
    if (user && activeView === VIEWS.account) {
      setActiveView(VIEWS.coach)
    }
  }, [authReady, user, activeView])

  const handleLogout = async () => {
    await logout()
    setActiveView(VIEWS.account)
    setHideCoachOptions(false)
    setGameStarted(false)
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-header-inner">
          <h1>Chess Coach</h1>
          <div className="app-header-trailing">
            <nav className="app-header-nav" aria-label="Main">
              {!!user && (
                <button
                  type="button"
                  className={`app-nav-btn${activeView === VIEWS.coach ? ' app-nav-btn--active' : ''}`}
                  onClick={() => setActiveView(VIEWS.coach)}
                >
                  Coach
                </button>
              )}
            </nav>
            {activeView === VIEWS.coach && !!user && (
              <AppHeaderMenu onNavigate={setActiveView} onLogout={handleLogout} />
            )}
          </div>
        </div>
      </header>
      <main
        className={`app-main${fullWidthMain ? ' app-main--full' : ''}`}
      >
        {!authReady ? (
          <div className="app-page">
            <p>Checking session…</p>
          </div>
        ) : !user ? (
          <AccountScreen
            onBack={() => setActiveView(VIEWS.account)}
            onAuthSuccess={() => setActiveView(VIEWS.coach)}
          />
        ) : activeView === VIEWS.openingTrainer ? (
          <div className="app-page">
            <OpeningTrainerPanel
              trainerConfig={trainerConfig}
              progressByLine={trainerProgressByLine}
              onTrainerConfigChange={setTrainerConfig}
            />
          </div>
        ) : activeView === VIEWS.weaknessProfile ? (
          <div className="app-page">
            <MLPanel onProfileChange={setWeaknessProfile} />
          </div>
        ) : activeView === VIEWS.endgamePractice ? (
          <EndgamePracticePage />
        ) : activeView === VIEWS.settings ? (
          <SettingsPage />
        ) : (
          <>
        <div className="left-panel">
          <BoardPanel
            onFenChange={setFen}
            onPgnChange={setPgn}
            onMovePlayed={setLastMoveEvent}
            onNavigationStateChange={setBoardNavState}
            onUserStartedPlaying={() => {
              setHideCoachOptions(true)
              setGameStarted(true)
            }}
            onOpeningChange={setOpeningContext}
            onTrainerFeedback={setTrainerFeedbackContext}
            onTrainerProgress={handleTrainerProgress}
            externalPgnToLoad={externalPgnToLoad}
            externalPgnLoadId={externalPgnLoadId}
            trainerConfig={trainerConfig}
            trainerActive={activeView === VIEWS.openingTrainer}
            evalLine={lines[0]}
            engineLines={lines}
            bestMove={bestMove}
            evaluation={evaluation}
            isEngineReady={isReady}
            engineError={engineError}
          />
        </div>
        <div className="right-panel">
          {gameStarted && (
            <div className="coach-live-panel">
              <div className="board-status">
                <span>
                  Move {boardNavState.moveIndex} / {boardNavState.totalMoves}
                </span>
              </div>
              <AnalysisPanel
                embedded
                lines={lines}
                isReady={isReady}
                engineError={engineError}
                opening={boardNavState.opening}
                theoryExitPly={boardNavState.theoryExitPly}
              />
            </div>
          )}
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
          {!hideCoachOptions && (
            <GameImportPanel
              onLoadGame={pgnText => {
                handleLoadImportedGame(pgnText)
                setGameStarted(true)
              }}
              onEngage={() => setHideCoachOptions(true)}
            />
          )}
        </div>
          </>
        )}
      </main>
    </div>
  )
}
