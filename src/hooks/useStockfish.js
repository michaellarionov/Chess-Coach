import { useEffect, useRef, useState } from 'react'
import { getStockfishWorkerUrl } from '../utils/stockfishWorkerUrl.js'
import { formatPvNumberedSan } from '../utils/uciToSan.js'

const DEPTH = 15
const MULTI_PV = 3
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** UCI `info score` cp/mate are from the side to move; convert to White POV. */
function uciScoreToWhitePov(score, fen) {
  const stm = (fen.trim().split(/\s+/)[1] || 'w').toLowerCase()
  const flip = stm === 'b' ? -1 : 1
  if (typeof score.mate === 'number') {
    return { mate: flip * score.mate }
  }
  if (typeof score.cp === 'number') {
    return { cp: flip * score.cp }
  }
  return {}
}

/** Display string from a White-POV { cp } or { mate } object. */
function scoreToRelativeString(score) {
  if (!score) return '?'
  if (typeof score.mate === 'number') {
    const m = score.mate
    return m > 0 ? `M${m}` : `-M${Math.abs(m)}`
  }
  if (typeof score.cp === 'number') {
    const cp = score.cp
    const pawns = (cp / 100).toFixed(2)
    return cp >= 0 ? `+${pawns}` : `${pawns}`
  }
  return '?'
}

/**
 * Parse Stockfish `info` lines (spacing/order can vary between builds).
 */
function parseInfoLine(msg) {
  if (typeof msg !== 'string' || !msg.startsWith('info')) return null
  // Skip lines without a principal variation (currmove, string, etc.)
  if (!/\bpv\b/.test(msg)) return null

  const depthMatch = msg.match(/\bdepth (\d+)\b/)
  const pvMatch = msg.match(/\bpv (.+)/)
  if (!depthMatch || !pvMatch) return null

  const multipvMatch = msg.match(/\bmultipv (\d+)\b/)
  const multipv = multipvMatch ? Number.parseInt(multipvMatch[1], 10) : 1

  const mateMatch = msg.match(/\bmate (-?\d+)\b/)
  const cpMatch = msg.match(/\bcp (-?\d+)\b/)
  const score =
    mateMatch != null
      ? { mate: Number.parseInt(mateMatch[1], 10) }
      : cpMatch != null
        ? { cp: Number.parseInt(cpMatch[1], 10) }
        : null

  if (!score) return null

  return {
    depth: Number.parseInt(depthMatch[1], 10),
    multipv,
    pv: pvMatch[1].trim().split(/\s+/),
    score,
  }
}

export default function useStockfish(fen) {
  const workerRef = useRef(null)
  const analysisIdRef = useRef(0)
  const activeAnalysisRef = useRef(null)
  const busyRef = useRef(false)
  const pendingFenRef = useRef(null)
  const [isReady, setIsReady] = useState(false)
  const [engineError, setEngineError] = useState(null)
  const [lines, setLines] = useState([])
  const [bestMove, setBestMove] = useState(null)
  const [evaluation, setEvaluation] = useState(null)

  const beginSearchRef = useRef(null)

  useEffect(() => {
    const worker = new Worker(getStockfishWorkerUrl())
    workerRef.current = worker

    const flushPending = () => {
      busyRef.current = false
      activeAnalysisRef.current = null
      const next = pendingFenRef.current
      pendingFenRef.current = null
      if (next) {
        queueMicrotask(() => beginSearchRef.current?.(next))
      }
    }

    const applyBestLine = (ctx, mapped, bestUci) => {
      if (ctx.id !== analysisIdRef.current) return
      const bestLine = mapped[0] || null
      setBestMove(bestUci)
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

    worker.onmessage = e => {
      const msg = e.data
      if (typeof msg === 'string' && msg.startsWith('__engine_error__')) {
        console.error('[Stockfish]', msg)
        setEngineError(msg.replace(/^__engine_error__\s*/, '') || 'Engine failed')
        setIsReady(true)
        return
      }
      const activeAnalysis = activeAnalysisRef.current

      if (msg === 'uciok') {
        worker.postMessage('setoption name MultiPV value ' + MULTI_PV)
        worker.postMessage('isready')
      }

      if (msg === 'readyok') {
        setEngineError(null)
        setIsReady(true)
      }

      if (typeof msg === 'string' && msg.startsWith('info')) {
        if (!activeAnalysis) return
        const parsed = parseInfoLine(msg)
        if (!parsed) return

        if (parsed.depth > activeAnalysis.maxDepth) {
          activeAnalysis.maxDepth = parsed.depth
        }
        if (parsed.depth === activeAnalysis.maxDepth) {
          activeAnalysis.pendingByPv[parsed.multipv] = parsed
        }

        // Live eval for the bar: best line (multipv 1) whenever depth increases
        if (
          parsed.multipv === 1 &&
          activeAnalysis.id === analysisIdRef.current &&
          parsed.depth >= (activeAnalysis.lastLiveDepth || 0)
        ) {
          activeAnalysis.lastLiveDepth = parsed.depth
          const wp = uciScoreToWhitePov(parsed.score, activeAnalysis.fen)
          setEvaluation({
            score: scoreToRelativeString(wp),
            cp: typeof wp.cp === 'number' ? wp.cp : null,
            mate: typeof wp.mate === 'number' ? wp.mate : null,
          })
        }
      }

      if (typeof msg === 'string' && msg.startsWith('bestmove')) {
        if (!activeAnalysis) {
          flushPending()
          return
        }
        const moveMatch = msg.match(/^bestmove (\S+)/)
        if (!moveMatch) {
          flushPending()
          return
        }
        const best = moveMatch[1] === '(none)' ? null : moveMatch[1]

        const top = [1, 2, 3]
          .map(i => activeAnalysis.pendingByPv[i])
          .filter(Boolean)
          .slice(0, MULTI_PV)

        const mapped = top.map(item => {
          const wp = uciScoreToWhitePov(item.score, activeAnalysis.fen)
          return {
            score: scoreToRelativeString(wp),
            scoreCp: typeof wp.cp === 'number' ? wp.cp : null,
            scoreMate: typeof wp.mate === 'number' ? wp.mate : null,
            moves: formatPvNumberedSan(activeAnalysis.fen, item.pv),
            pv: item.pv,
            depth: item.depth,
          }
        })

        if (mapped.length === 0) {
          if (best && activeAnalysis.id === analysisIdRef.current) {
            setBestMove(best)
          }
        } else {
          const bestUci = best || mapped[0]?.pv?.[0] || null
          applyBestLine(activeAnalysis, mapped, bestUci)
        }

        flushPending()
      }
    }

    worker.onerror = err => {
      console.error('[Stockfish worker]', err)
      setEngineError(err.message || 'Worker error')
      setIsReady(true)
    }

    worker.postMessage('uci')

    beginSearchRef.current = normalizedFen => {
      if (!workerRef.current) return
      busyRef.current = true
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
        lastLiveDepth: 0,
      }
      activeAnalysisRef.current = localState
      workerRef.current.postMessage('stop')
      workerRef.current.postMessage(`position fen ${normalizedFen}`)
      workerRef.current.postMessage(`go depth ${DEPTH}`)
    }

    return () => {
      worker.postMessage('quit')
      worker.terminate()
      beginSearchRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isReady || !fen) return
    const normalizedFen = fen === 'start' ? START_FEN : fen

    if (busyRef.current) {
      pendingFenRef.current = normalizedFen
      return
    }

    beginSearchRef.current?.(normalizedFen)
  }, [fen, isReady])

  return { lines, isReady, bestMove, evaluation, engineError }
}
