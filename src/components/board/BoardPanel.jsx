import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import openingsByFen from '../../data/openingsByFen.json'
import AnalysisPanel from '../analysis/AnalysisPanel.jsx'
import './BoardPanel.css'

// chessboard.js and jQuery are loaded as globals via <script> tags in index.html
/* global Chessboard */

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function scoreToWhiteFraction(score) {
  if (!score) return 0.5
  if (score.startsWith('M')) return 1
  if (score.startsWith('-M')) return 0
  const value = Number.parseFloat(score)
  if (Number.isNaN(value)) return 0.5
  const normalized = 1 / (1 + Math.exp(-value / 1.6))
  return Math.min(1, Math.max(0, normalized))
}

/**
 * Map engine score to bar fill (0 = Black ahead, 1 = White ahead).
 * `evaluation` cp/mate are White POV (normalized in useStockfish from UCI SPOV).
 */
function engineScoreToBarFraction({ cp, mate }) {
  if (typeof mate === 'number') {
    return mate > 0 ? 1 : 0
  }
  if (typeof cp === 'number') {
    const pawns = cp / 100
    const normalized = 1 / (1 + Math.exp(-pawns / 1.6))
    return Math.min(1, Math.max(0, normalized))
  }
  return null
}

/** White POV: +1 white ahead, −1 black ahead (used for label placement). */
function evalWhiteAdvantageSign(evaluation, evalLine) {
  if (evaluation) {
    if (typeof evaluation.mate === 'number') {
      if (evaluation.mate > 0) return 1
      if (evaluation.mate < 0) return -1
      return 0
    }
    if (typeof evaluation.cp === 'number') {
      if (evaluation.cp > 0) return 1
      if (evaluation.cp < 0) return -1
      return 0
    }
    const s = evaluation.score
    if (typeof s === 'string') {
      if (s.startsWith('M') && !s.startsWith('-M')) return 1
      if (s.startsWith('-M')) return -1
      const n = Number.parseFloat(s.replace(/^\+/, ''))
      if (!Number.isNaN(n)) {
        if (n > 0) return 1
        if (n < 0) return -1
      }
    }
  }
  const fallback = evalLine?.score
  if (typeof fallback === 'string') {
    if (fallback.startsWith('M') && !fallback.startsWith('-M')) return 1
    if (fallback.startsWith('-M')) return -1
    const n = Number.parseFloat(fallback.replace(/^\+/, ''))
    if (!Number.isNaN(n)) {
      if (n > 0) return 1
      if (n < 0) return -1
    }
  }
  return 0
}

/** Short eval text inside the bar (e.g. 0.3, −1.2, M2). */
function formatEvalBarLabel(evaluation, evalLine) {
  if (evaluation && typeof evaluation.mate === 'number') {
    const m = evaluation.mate
    if (m > 0) return `M${m}`
    if (m < 0) return `-M${Math.abs(m)}`
    return 'M0'
  }
  if (evaluation && typeof evaluation.cp === 'number') {
    const p = evaluation.cp / 100
    return p.toFixed(1)
  }
  const fallback = evalLine?.score || evaluation?.score
  if (typeof fallback !== 'string') return null
  const n = Number.parseFloat(fallback.replace(/^\+/, ''))
  if (!Number.isNaN(n)) return n.toFixed(1)
  if (/^-?M\d+/.test(fallback)) return fallback.replace(/^\+/, '')
  return null
}

function normalizeFen(fen) {
  return fen.split(' ').slice(0, 4).join(' ')
}

function getOpeningForFen(fen) {
  const key = normalizeFen(fen)
  return openingsByFen[key] || null
}

function analyzeOpeningTrail(moves) {
  const game = new Chess()
  const perPly = [getOpeningForFen(game.fen())]
  let lastKnown = perPly[0]
  let lastKnownPly = perPly[0] ? 0 : null
  let theoryExitPly = null

  for (let i = 0; i < moves.length; i += 1) {
    game.move(moves[i])
    const opening = getOpeningForFen(game.fen())
    perPly.push(opening)

    if (opening) {
      lastKnown = opening
      lastKnownPly = i + 1
    } else if (theoryExitPly == null && perPly[i]) {
      theoryExitPly = i + 1
    }
  }

  return { perPly, lastKnown, lastKnownPly, theoryExitPly }
}

function pgnToUciMoves(pgn) {
  const game = new Chess()
  game.loadPgn(pgn)
  return game
    .history({ verbose: true })
    .map(move => `${move.from}${move.to}${move.promotion || ''}`)
}

function getColorToMoveAtPly(ply) {
  return ply % 2 === 0 ? 'w' : 'b'
}

function getChessComPieceUrl(pieceCode) {
  return `https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${pieceCode.toLowerCase()}.png`
}

export default function BoardPanel({
  fen,
  onFenChange,
  onPgnChange,
  onMovePlayed,
  onOpeningChange,
  onTrainerFeedback,
  onTrainerProgress,
  externalPgnToLoad,
  externalPgnLoadId,
  trainerConfig,
  evalLine,
  engineLines,
  bestMove,
  evaluation,
  isEngineReady,
  engineError,
}) {
  const calcBoardSize = () => {
    if (typeof window === 'undefined') return 480
    const viewport = window.innerWidth
    if (viewport <= 520) return Math.max(280, Math.min(360, viewport - 64))
    if (viewport <= 900) return 420
    return 480
  }

  const boardRef = useRef(null)
  const boardInstanceRef = useRef(null)
  const liveGameRef = useRef(new Chess())
  const historyMovesRef = useRef([])
  const moveIndexRef = useRef(0)
  const [historyMoves, setHistoryMoves] = useState([])
  const [moveGrades, setMoveGrades] = useState([])
  const [moveIndex, setMoveIndex] = useState(0)
  const [pgnInput, setPgnInput] = useState('')
  const [pgnError, setPgnError] = useState('')
  const [openingState, setOpeningState] = useState(() => analyzeOpeningTrail([]))
  const [trainerHintMove, setTrainerHintMove] = useState(null)
  const [trainerMessage, setTrainerMessage] = useState('')
  const [boardSize, setBoardSize] = useState(calcBoardSize)
  const pendingGradeRef = useRef(null)
  const bestMoveRef = useRef(bestMove)
  const evaluationRef = useRef(evaluation)
  const linesRef = useRef(engineLines)
  const trainerLineMovesRef = useRef([])
  const trainerRef = useRef({
    started: false,
    hadMistake: false,
    complete: false,
  })

  useEffect(() => {
    bestMoveRef.current = bestMove
    evaluationRef.current = evaluation
    linesRef.current = engineLines
  }, [bestMove, evaluation, engineLines])

  useEffect(() => {
    const onResize = () => setBoardSize(calcBoardSize())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!boardInstanceRef.current) return
    boardInstanceRef.current.resize?.()
    boardInstanceRef.current.position?.(liveGameRef.current.fen())
  }, [boardSize])

  const evalFraction = useMemo(() => {
    if (evaluation && (evaluation.cp != null || evaluation.mate != null)) {
      const fromEngine = engineScoreToBarFraction(evaluation)
      if (fromEngine != null) return fromEngine
    }
    return scoreToWhiteFraction(evaluation?.score || evalLine?.score)
  }, [evaluation, evalLine])
  const trainerEnabled = Boolean(trainerConfig?.enabled && trainerConfig?.line)

  const finishTrainerAttempt = success => {
    if (!trainerEnabled || trainerRef.current.complete) return
    trainerRef.current.complete = true
    onTrainerProgress?.({
      lineId: trainerConfig.line.id,
      success,
    })
  }

  const maybeAutoPlayTrainerOpponent = () => {
    if (!trainerEnabled) return
    const expectedMoves = trainerLineMovesRef.current
    if (expectedMoves.length === 0) return

    const game = liveGameRef.current
    const nextHistory = [...historyMovesRef.current]
    const userColor = trainerConfig.playerColor || 'w'

    while (nextHistory.length < expectedMoves.length) {
      const sideToMove = getColorToMoveAtPly(nextHistory.length)
      if (sideToMove === userColor) break
      const expectedUci = expectedMoves[nextHistory.length]
      const move = game.move({
        from: expectedUci.slice(0, 2),
        to: expectedUci.slice(2, 4),
        promotion: expectedUci.slice(4) || 'q',
      })
      if (!move) break
      nextHistory.push(move)
    }

    if (nextHistory.length !== historyMovesRef.current.length) {
      setHistoryMoves(nextHistory)
      setMoveGrades(prev => {
        const next = [...prev]
        while (next.length < nextHistory.length) {
          next.push(null)
        }
        return next
      })
      updatePosition(nextHistory.length, nextHistory)
    }

    if (nextHistory.length >= expectedMoves.length) {
      setTrainerMessage('Line complete. Great job!')
      setTrainerHintMove(null)
      finishTrainerAttempt(!trainerRef.current.hadMistake)
    }
  }

  const updatePosition = (nextMoveIndex, moves = historyMoves) => {
    const game = new Chess()
    for (let i = 0; i < nextMoveIndex; i += 1) {
      game.move(moves[i])
    }

    liveGameRef.current = game
    historyMovesRef.current = moves
    moveIndexRef.current = nextMoveIndex
    boardInstanceRef.current?.position(game.fen())
    setMoveIndex(nextMoveIndex)
    onFenChange(game.fen())
    onPgnChange(game.pgn())

    const trail = analyzeOpeningTrail(moves)
    setOpeningState(trail)
    const currentOpening = trail.perPly[nextMoveIndex] || null
    const theoryExited =
      trail.theoryExitPly != null && nextMoveIndex >= trail.theoryExitPly
    onOpeningChange?.({
      currentOpening,
      lastKnownOpening: trail.lastKnown,
      theoryExitPly: trail.theoryExitPly,
      theoryExited,
      ply: nextMoveIndex,
    })
  }

  const applyPgnToBoard = pgnText => {
    const trimmed = pgnText.trim()
    if (!trimmed) {
      handleReset()
      return true
    }

    const game = new Chess()
    try {
      game.loadPgn(trimmed)
    } catch {
      setPgnError('Invalid PGN. Please check the notation and try again.')
      return false
    }

    const moves = game.history({ verbose: true })
    setPgnError('')
    setHistoryMoves(moves)
    setMoveGrades(moves.map(() => null))
    historyMovesRef.current = moves
    const initialPly = 0
    moveIndexRef.current = initialPly
    updatePosition(initialPly, moves)
    return true
  }

  const moveToUci = move =>
    `${move.from}${move.to}${move.promotion ? move.promotion : ''}`

  const classifyMove = ({ moveUci, bestMoveUci, mover, bestCp, nextCp, topPvs }) => {
    const moverBest = mover === 'w' ? bestCp : -bestCp
    const moverPlayed = mover === 'w' ? nextCp : -nextCp
    const centipawnLoss = Math.max(0, moverBest - moverPlayed)
    const topMoveSet = new Set(topPvs.map(pv => pv?.[0]).filter(Boolean))

    let label = 'Blunder'
    if (moveUci === bestMoveUci) label = 'Best'
    else if (topMoveSet.has(moveUci) && centipawnLoss <= 5) label = 'Brilliant'
    else if (centipawnLoss <= 10) label = 'Excellent'
    else if (centipawnLoss <= 30) label = 'Good'
    else if (centipawnLoss <= 60) label = 'Inaccuracy'
    else if (centipawnLoss <= 120) label = 'Mistake'

    return { label, centipawnLoss: Math.round(centipawnLoss) }
  }

  useEffect(() => {
    const pending = pendingGradeRef.current
    if (!pending || !evaluation || typeof evaluation.cp !== 'number') return
    const nextCp = evaluation.cp
    const grade = classifyMove({
      moveUci: pending.moveUci,
      bestMoveUci: pending.bestMoveUci,
      mover: pending.mover,
      bestCp: pending.bestCp,
      nextCp,
      topPvs: pending.topPvs,
    })
    setMoveGrades(prev => {
      const next = [...prev]
      next[pending.moveNumber - 1] = grade
      return next
    })
    pendingGradeRef.current = null
  }, [evaluation])

  useEffect(() => {
    boardInstanceRef.current = Chessboard(boardRef.current, {
      draggable: true,
      position: 'start',
      pieceTheme(pieceCode) {
        return getChessComPieceUrl(pieceCode)
      },
      onDragStart(_source, piece) {
        const game = liveGameRef.current
        const userColor = trainerConfig?.playerColor || 'w'
        if (
          game.isGameOver() ||
          (game.turn() === 'w' && piece.startsWith('b')) ||
          (game.turn() === 'b' && piece.startsWith('w')) ||
          (trainerEnabled && game.turn() !== userColor)
        ) {
          return false
        }
      },
      onDrop(source, target) {
        const game = liveGameRef.current
        try {
          const priorIndex = moveIndexRef.current
          const move = game.move({ from: source, to: target, promotion: 'q' })
          const moveUci = moveToUci(move)

          if (trainerEnabled) {
            if (!trainerRef.current.started) {
              trainerRef.current = {
                started: true,
                hadMistake: false,
                complete: false,
              }
            }
            const expectedUci = trainerLineMovesRef.current[priorIndex]
            if (expectedUci && moveUci !== expectedUci) {
              game.undo()
              trainerRef.current.hadMistake = true
              setTrainerHintMove(expectedUci)
              setTrainerMessage(
                `Deviation at move ${Math.floor(priorIndex / 2) + 1}. Expected ${expectedUci}.`,
              )
              onTrainerFeedback?.({
                id: `${trainerConfig?.line?.id || 'line'}-${priorIndex}-${moveUci}`,
                fen: game.fen(),
                playedMove: moveUci,
                correctMove: expectedUci,
                opening: trainerConfig?.line || null,
              })
              return 'snapback'
            }
            setTrainerHintMove(null)
            setTrainerMessage('')
          }

          const currentEval = evaluationRef.current
          const best = bestMoveRef.current
          const topPvs = (linesRef.current || []).map(line => line.pv)

          if (best && currentEval && typeof currentEval.cp === 'number') {
            pendingGradeRef.current = {
              moveNumber: priorIndex + 1,
              moveUci,
              mover: move.color,
              bestMoveUci: best,
              bestCp: currentEval.cp,
              topPvs,
            }
          } else {
            pendingGradeRef.current = null
          }

          const nextHistory = historyMovesRef.current.slice(0, priorIndex)
          nextHistory.push(move)
          historyMovesRef.current = nextHistory
          moveIndexRef.current = nextHistory.length
          setHistoryMoves(nextHistory)
          setMoveGrades(prev => {
            const next = prev.slice(0, priorIndex)
            next.push(null)
            return next
          })
          setMoveIndex(nextHistory.length)
          onMovePlayed?.({
            fen: game.fen(),
            moveSan: move.san,
            moveUci,
            ply: nextHistory.length,
          })

          if (trainerEnabled) {
            setTimeout(() => {
              maybeAutoPlayTrainerOpponent()
            }, 120)
          }
        } catch {
          return 'snapback'
        }
        onFenChange(game.fen())
        onPgnChange(game.pgn())
      },
      onSnapEnd() {
        boardInstanceRef.current.position(liveGameRef.current.fen())
      },
    })

    return () => {
      boardInstanceRef.current?.destroy()
    }
  }, [
    onFenChange,
    onPgnChange,
    onMovePlayed,
    onOpeningChange,
    onTrainerFeedback,
    trainerConfig,
    trainerEnabled,
  ])

  useEffect(() => {
    const trail = analyzeOpeningTrail(historyMovesRef.current)
    const currentOpening = trail.perPly[moveIndexRef.current] || null
    onOpeningChange?.({
      currentOpening,
      lastKnownOpening: trail.lastKnown,
      theoryExitPly: trail.theoryExitPly,
      theoryExited: false,
      ply: moveIndexRef.current,
    })
  }, [onOpeningChange])

  const handleReset = () => {
    liveGameRef.current = new Chess()
    boardInstanceRef.current?.start()
    setHistoryMoves([])
    setMoveIndex(0)
    setMoveGrades([])
    historyMovesRef.current = []
    moveIndexRef.current = 0
    pendingGradeRef.current = null
    setPgnInput('')
    setPgnError('')
    const trail = analyzeOpeningTrail([])
    setOpeningState(trail)
    onOpeningChange?.({
      currentOpening: trail.perPly[0] || null,
      lastKnownOpening: trail.lastKnown,
      theoryExitPly: trail.theoryExitPly,
      theoryExited: false,
      ply: 0,
    })
    onFenChange(START_FEN)
    onPgnChange('')
  }

  const handleLoadPgn = () => {
    applyPgnToBoard(pgnInput)
  }

  const handleStepBack = () => {
    if (moveIndex === 0) return
    updatePosition(moveIndex - 1)
  }

  const handleStepForward = () => {
    if (moveIndex >= historyMoves.length) return
    updatePosition(moveIndex + 1)
  }

  useEffect(() => {
    if (!externalPgnLoadId || !externalPgnToLoad) return
    setPgnInput(externalPgnToLoad)
    applyPgnToBoard(externalPgnToLoad)
    // Only react when a new external load id arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalPgnLoadId])

  useEffect(() => {
    if (!trainerConfig?.sessionId) return
    if (!trainerEnabled || !trainerConfig.line?.pgn) {
      trainerLineMovesRef.current = []
      trainerRef.current = { started: false, hadMistake: false, complete: false }
      setTrainerHintMove(null)
      setTrainerMessage('')
      return
    }

    try {
      trainerLineMovesRef.current = pgnToUciMoves(trainerConfig.line.pgn)
      trainerRef.current = { started: true, hadMistake: false, complete: false }
      setTrainerHintMove(null)
      setTrainerMessage(
        `Training: ${trainerConfig.line.eco} - ${trainerConfig.line.name}`,
      )
      handleReset()
      setTimeout(() => {
        maybeAutoPlayTrainerOpponent()
      }, 100)
    } catch {
      trainerLineMovesRef.current = []
      setTrainerMessage('Could not parse selected opening line.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainerConfig?.sessionId])

  const currentOpening = openingState.perPly[moveIndex] || null
  const theoryExited =
    openingState.theoryExitPly != null && moveIndex >= openingState.theoryExitPly

  const evalBarLabel =
    !engineError && isEngineReady
      ? formatEvalBarLabel(evaluation, evalLine)
      : null
  const evalAdv = evalWhiteAdvantageSign(evaluation, evalLine)

  return (
    <div className="board-panel">
      <div className="board-stage">
        <div
          className="eval-bar"
          style={{
            height: boardSize,
            background: `linear-gradient(to top, #f2f2f2 0%, #f2f2f2 ${evalFraction * 100}%, #222 ${evalFraction * 100}%, #222 100%)`,
          }}
          title={`Eval (White POV): ${evaluation?.score ?? evalLine?.score ?? '…'}`}
        >
          {evalBarLabel != null && (
            <span
              className={
                evalAdv >= 0
                  ? 'eval-bar__value eval-bar__value--bottom'
                  : 'eval-bar__value eval-bar__value--top'
              }
            >
              {evalBarLabel}
            </span>
          )}
        </div>
        <div className="board-wrap">
          <div
            ref={boardRef}
            className="chessboard"
            style={{ width: boardSize, height: boardSize }}
          />
        </div>
      </div>
      <div className="board-panel-analysis">
        <AnalysisPanel
          embedded
          fen={fen}
          lines={engineLines}
          bestMove={bestMove}
          evaluation={evaluation}
          isReady={isEngineReady}
          engineError={engineError}
        />
      </div>
      <div className="fen-display">
        <strong>FEN:</strong> {fen}
      </div>
      <textarea
        className="pgn-input"
        placeholder="Paste PGN here..."
        value={pgnInput}
        onChange={e => setPgnInput(e.target.value)}
      />
      {pgnError && <p className="pgn-error">{pgnError}</p>}
      <div className="board-controls">
        <button onClick={handleLoadPgn}>Load PGN</button>
        <button onClick={handleStepBack} disabled={moveIndex === 0}>
          ◀ Back
        </button>
        <button
          onClick={handleStepForward}
          disabled={moveIndex === historyMoves.length}
        >
          Forward ▶
        </button>
        <button onClick={handleReset}>Reset</button>
      </div>
      <div className="board-status">
        <span>
          Move {moveIndex} / {historyMoves.length}
        </span>
      </div>
      <div className="opening-status">
        <span>
          Opening:{' '}
          {currentOpening
            ? `${currentOpening.eco} - ${currentOpening.name}`
            : openingState.lastKnown
              ? `${openingState.lastKnown.eco} - ${openingState.lastKnown.name}`
              : 'Unknown'}
        </span>
        {theoryExited && (
          <span className="theory-exit">
            Out of theory at ply {openingState.theoryExitPly}
          </span>
        )}
      </div>
      {trainerMessage && <p className="trainer-message">{trainerMessage}</p>}
      <ul className="move-grade-list">
        {historyMoves.map((move, idx) => {
          const grade = moveGrades[idx]
          return (
            <li key={`${idx}-${move.san}`} className="move-grade-item">
              <span className="move-grade-san">
                {idx + 1}. {move.san}
              </span>
              <span className={`move-grade-label ${grade ? grade.label.toLowerCase() : 'pending'}`}>
                {grade ? `${grade.label} (${grade.centipawnLoss} cp)` : 'Pending'}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
