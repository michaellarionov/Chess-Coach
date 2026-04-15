import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
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

export default function BoardPanel({
  fen,
  onFenChange,
  onPgnChange,
  evalLine,
  engineLines,
  bestMove,
  evaluation,
  isEngineReady,
}) {
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
  const pendingGradeRef = useRef(null)
  const bestMoveRef = useRef(bestMove)
  const evaluationRef = useRef(evaluation)
  const linesRef = useRef(engineLines)

  useEffect(() => {
    bestMoveRef.current = bestMove
    evaluationRef.current = evaluation
    linesRef.current = engineLines
  }, [bestMove, evaluation, engineLines])

  const evalFraction = useMemo(
    () => scoreToWhiteFraction(evaluation?.score || evalLine?.score),
    [evaluation, evalLine],
  )

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
      pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
      onDragStart(_source, piece) {
        const game = liveGameRef.current
        if (
          game.isGameOver() ||
          (game.turn() === 'w' && piece.startsWith('b')) ||
          (game.turn() === 'b' && piece.startsWith('w'))
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
  }, [onFenChange, onPgnChange])

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
    onFenChange(START_FEN)
    onPgnChange('')
  }

  const handleLoadPgn = () => {
    const trimmed = pgnInput.trim()
    if (!trimmed) {
      handleReset()
      return
    }

    const game = new Chess()
    try {
      game.loadPgn(trimmed)
    } catch {
      setPgnError('Invalid PGN. Please check the notation and try again.')
      return
    }

    const moves = game.history({ verbose: true })
    setPgnError('')
    setHistoryMoves(moves)
    setMoveGrades(moves.map(() => null))
    historyMovesRef.current = moves
    moveIndexRef.current = moves.length
    updatePosition(moves.length, moves)
  }

  const handleStepBack = () => {
    if (moveIndex === 0) return
    updatePosition(moveIndex - 1)
  }

  const handleStepForward = () => {
    if (moveIndex >= historyMoves.length) return
    updatePosition(moveIndex + 1)
  }

  return (
    <div className="board-panel">
      <div className="board-stage">
        <div className="eval-bar">
          <div
            className="eval-black"
            style={{ height: `${(1 - evalFraction) * 100}%` }}
          />
          <div
            className="eval-white"
            style={{ height: `${evalFraction * 100}%` }}
          />
        </div>
        <div className="board-wrap">
          <div ref={boardRef} className="chessboard" style={{ width: 480 }} />
          {bestMove && bestMove.length >= 4 && (
            <svg className="bestmove-overlay" viewBox="0 0 480 480">
              {(() => {
                const files = 'abcdefgh'
                const from = bestMove.slice(0, 2)
                const to = bestMove.slice(2, 4)
                const fromFile = files.indexOf(from[0])
                const toFile = files.indexOf(to[0])
                const fromRank = Number.parseInt(from[1], 10)
                const toRank = Number.parseInt(to[1], 10)
                if (
                  fromFile < 0 ||
                  toFile < 0 ||
                  Number.isNaN(fromRank) ||
                  Number.isNaN(toRank)
                ) {
                  return null
                }
                const fromX = fromFile * 60 + 30
                const fromY = (8 - fromRank) * 60 + 30
                const toX = toFile * 60 + 30
                const toY = (8 - toRank) * 60 + 30
                return (
                  <>
                    <defs>
                      <marker
                        id="bestmove-arrowhead"
                        markerWidth="7"
                        markerHeight="7"
                        refX="6"
                        refY="3.5"
                        orient="auto"
                      >
                        <polygon points="0 0, 7 3.5, 0 7" fill="#23e7b5" />
                      </marker>
                    </defs>
                    <line
                      x1={fromX}
                      y1={fromY}
                      x2={toX}
                      y2={toY}
                      stroke="#23e7b5"
                      strokeWidth="8"
                      strokeLinecap="round"
                      markerEnd="url(#bestmove-arrowhead)"
                      opacity="0.85"
                    />
                  </>
                )
              })()}
            </svg>
          )}
        </div>
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
        <span>
          Eval: {!isEngineReady ? 'Loading…' : evaluation?.score ?? evalLine?.score ?? '…'}
        </span>
      </div>
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
