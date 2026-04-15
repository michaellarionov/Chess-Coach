import { useEffect, useRef, useState } from 'react'

const DEPTH = 15
const MULTI_PV = 3
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function scoreToRelativeString(score, turn) {
  if (!score) return '?'
  if (typeof score.mate === 'number') {
    const mate = turn === 'b' ? -score.mate : score.mate
    return mate > 0 ? `M${mate}` : `-M${Math.abs(mate)}`
  }
  if (typeof score.cp === 'number') {
    const cp = turn === 'b' ? -score.cp : score.cp
    const pawns = (cp / 100).toFixed(2)
    return cp >= 0 ? `+${pawns}` : `${pawns}`
  }
  return '?'
}

function parseFenTurn(fen) {
  return fen.split(' ')[1] || 'w'
}

function parseInfoLine(msg) {
  const depthMatch = msg.match(/depth (\d+)/)
  const pvIdxMatch = msg.match(/multipv (\d+)/)
  const pvMatch = msg.match(/ pv (.+)/)
  if (!depthMatch || !pvIdxMatch || !pvMatch) return null

  const cpMatch = msg.match(/ cp (-?\d+)/)
  const mateMatch = msg.match(/ mate (-?\d+)/)
  const line = pvMatch[1].trim().split(/\s+/)
  const score =
    mateMatch != null
      ? { mate: Number.parseInt(mateMatch[1], 10) }
      : cpMatch != null
        ? { cp: Number.parseInt(cpMatch[1], 10) }
        : null

  if (!score) return null

  return {
    depth: Number.parseInt(depthMatch[1], 10),
    multipv: Number.parseInt(pvIdxMatch[1], 10),
    pv: line,
    score,
  }
}

export default function useStockfish(fen) {
  const workerRef = useRef(null)
  const analysisIdRef = useRef(0)
  const activeAnalysisRef = useRef(null)
  const [isReady, setIsReady] = useState(false)
  const [lines, setLines] = useState([])
  const [bestMove, setBestMove] = useState(null)
  const [evaluation, setEvaluation] = useState(null)

  useEffect(() => {
    // stockfish npm package exposes a WASM worker via this URL
    // Classic worker (not module) so that importScripts works inside it
    const worker = new Worker(
      new URL('../workers/stockfish.worker.js', import.meta.url),
    )
    workerRef.current = worker

    worker.onmessage = e => {
      const msg = e.data
      const activeAnalysis = activeAnalysisRef.current

      if (msg === 'uciok') {
        worker.postMessage('setoption name MultiPV value ' + MULTI_PV)
        worker.postMessage('isready')
      }

      if (msg === 'readyok') {
        setIsReady(true)
      }

      if (typeof msg === 'string' && msg.startsWith('info depth')) {
        if (!activeAnalysis) return
        const parsed = parseInfoLine(msg)
        if (!parsed) return
        if (parsed.depth > activeAnalysis.maxDepth) {
          activeAnalysis.maxDepth = parsed.depth
        }
        if (parsed.depth === activeAnalysis.maxDepth) {
          activeAnalysis.pendingByPv[parsed.multipv] = parsed
        }
      }

      if (typeof msg === 'string' && msg.startsWith('bestmove')) {
        if (!activeAnalysis) return
        const moveMatch = msg.match(/^bestmove (\S+)/)
        if (!moveMatch) return
        const best = moveMatch[1] === '(none)' ? null : moveMatch[1]

        const top = [1, 2, 3]
          .map(i => activeAnalysis.pendingByPv[i])
          .filter(Boolean)
          .slice(0, MULTI_PV)

        const turn = parseFenTurn(activeAnalysis.fen)
        const mapped = top.map(item => ({
          score: scoreToRelativeString(item.score, turn),
          scoreCp: typeof item.score.cp === 'number' ? item.score.cp : null,
          scoreMate:
            typeof item.score.mate === 'number' ? item.score.mate : null,
          moves: item.pv.slice(0, 6).join(' '),
          pv: item.pv,
          depth: item.depth,
        }))

        const bestLine = mapped[0] || null
        if (activeAnalysis.id === analysisIdRef.current) {
          setBestMove(best)
          setLines(mapped)
          setEvaluation(
            bestLine
              ? {
                  score: bestLine.score,
                  cp: bestLine.scoreCp,
                  mate: bestLine.scoreMate,
                }
              : null,
          )
        }
        activeAnalysisRef.current = null
      }
    }

    worker.postMessage('uci')

    return () => {
      worker.postMessage('quit')
      worker.terminate()
    }
  }, [])

  useEffect(() => {
    if (!isReady || !fen) return
    const normalizedFen = fen === 'start' ? START_FEN : fen
    analysisIdRef.current += 1
    const analysisId = analysisIdRef.current
    setLines([])
    setBestMove(null)
    setEvaluation(null)

    const localState = {
      id: analysisId,
      fen: normalizedFen,
      pendingByPv: {},
      maxDepth: 0,
    }
    activeAnalysisRef.current = localState
    workerRef.current.postMessage('stop')
    workerRef.current.postMessage(`position fen ${normalizedFen}`)
    workerRef.current.postMessage(`go depth ${DEPTH}`)
  }, [fen, isReady])

  return { lines, isReady, bestMove, evaluation }
}
