import { useEffect, useRef, useState } from 'react'

const DEPTH = 18
const MULTI_PV = 3

function cpToString(cp, turn) {
  // cp is from White's perspective; flip when it's Black's turn
  const score = turn === 'b' ? -cp : cp
  const pawns = (score / 100).toFixed(2)
  return score >= 0 ? `+${pawns}` : `${pawns}`
}

export default function useStockfish(fen) {
  const workerRef = useRef(null)
  const [isReady, setIsReady] = useState(false)
  const [lines, setLines] = useState([])

  useEffect(() => {
    // stockfish npm package exposes a WASM worker via this URL
    // Classic worker (not module) so that importScripts works inside it
    const worker = new Worker(
      new URL('../workers/stockfish.worker.js', import.meta.url),
    )
    workerRef.current = worker

    const pending = {}

    worker.onmessage = e => {
      const msg = e.data

      if (msg === 'uciok') {
        worker.postMessage('setoption name MultiPV value ' + MULTI_PV)
        worker.postMessage('isready')
      }

      if (msg === 'readyok') {
        setIsReady(true)
      }

      if (typeof msg === 'string' && msg.startsWith('info depth')) {
        const pvIdx = (msg.match(/multipv (\d+)/) || [])[1]
        if (!pvIdx) return

        const depthMatch = msg.match(/depth (\d+)/)
        const cpMatch = msg.match(/ cp (-?\d+)/)
        const mateMatch = msg.match(/ mate (-?\d+)/)
        const pvMatch = msg.match(/ pv (.+)/)

        if (!pvMatch) return

        const depth = depthMatch ? parseInt(depthMatch[1]) : 0
        const moves = pvMatch[1].split(' ').slice(0, 6).join(' ')

        let score = '?'
        if (mateMatch) {
          const m = parseInt(mateMatch[1])
          score = m > 0 ? `M${m}` : `-M${Math.abs(m)}`
        } else if (cpMatch) {
          // fen turn is the 2nd space-separated token
          const turn = fen === 'start' ? 'w' : fen.split(' ')[1]
          score = cpToString(parseInt(cpMatch[1]), turn)
        }

        pending[pvIdx] = { score, moves, depth }

        // Publish when we have all 3 lines at same depth
        const depths = Object.values(pending).map(l => l.depth)
        if (
          Object.keys(pending).length === MULTI_PV &&
          depths.every(d => d === depths[0])
        ) {
          setLines([1, 2, 3].map(i => pending[i]).filter(Boolean))
        }
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
    setLines([])
    workerRef.current.postMessage('stop')
    workerRef.current.postMessage(
      `position fen ${fen === 'start' ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' : fen}`,
    )
    workerRef.current.postMessage(`go depth ${DEPTH}`)
  }, [fen, isReady])

  return { lines, isReady }
}
