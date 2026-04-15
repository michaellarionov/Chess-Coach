import { useEffect, useRef, useState } from 'react'
import * as tf from '@tensorflow/tfjs'
import { Chess } from 'chess.js'
import './MLPanel.css'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const PHASES = ['opening', 'middlegame', 'endgame']
const PIECES = ['p', 'n', 'b', 'r', 'q', 'k']
const POSITIONS = ['open', 'semi-open', 'closed', 'tactical']
const STOCKFISH_DEPTH = 10

function oneHot(items, value) {
  return items.map(item => (item === value ? 1 : 0))
}

function encodeFeature(sample) {
  return [
    ...oneHot(PHASES, sample.phase),
    ...oneHot(PIECES, sample.piece),
    ...oneHot(POSITIONS, sample.positionType),
  ]
}

function evalToWhiteCp(score, fen) {
  const turn = fen.split(' ')[1] || 'w'
  if (typeof score.cp === 'number') {
    return turn === 'w' ? score.cp : -score.cp
  }
  if (typeof score.mate === 'number') {
    const mateCp = score.mate > 0 ? 10000 : -10000
    return turn === 'w' ? mateCp : -mateCp
  }
  return 0
}

function detectPhase(board, ply) {
  const pieces = board.board().flat().filter(Boolean)
  const material = pieces
    .filter(piece => piece.type !== 'k')
    .reduce((acc, piece) => {
      const valueMap = { p: 1, n: 3, b: 3, r: 5, q: 9 }
      return acc + (valueMap[piece.type] || 0)
    }, 0)

  if (ply <= 16) return 'opening'
  if (material <= 26) return 'endgame'
  return 'middlegame'
}

function detectPositionType(board) {
  const pieces = board.board().flat().filter(Boolean)
  const pawns = pieces.filter(piece => piece.type === 'p').length
  const legalMoves = board.moves({ verbose: true })
  const tacticalMoves = legalMoves.filter(
    move => move.captured || move.san.includes('+'),
  ).length

  if (tacticalMoves >= 6) return 'tactical'
  if (pawns >= 14) return 'closed'
  if (pawns <= 8) return 'open'
  return 'semi-open'
}

function classifyByCpl(cpl) {
  if (cpl >= 120) return 'blunder'
  if (cpl >= 50) return 'mistake'
  if (cpl >= 25) return 'inaccuracy'
  return 'ok'
}

function makeWeaknessSummary(profile) {
  if (!profile || profile.topPatterns.length === 0) return 'No clear recurring weakness pattern detected yet.'
  const top = profile.topPatterns[0]
  return `Most frequent issue: ${top.phase} ${top.pieceName} moves in ${top.positionType} positions (${Math.round(top.mistakeRate * 100)}% error rate).`
}

export default function MLPanel({ onProfileChange }) {
  const [username, setUsername] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [status, setStatus] = useState('Enter a Chess.com username to build your weakness profile.')
  const [profile, setProfile] = useState(null)
  const workerRef = useRef(null)
  const engineReadyRef = useRef(false)
  const resolverRef = useRef(null)
  const analysisStateRef = useRef(null)

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage('quit')
        workerRef.current.terminate()
      }
    }
  }, [])

  const ensureWorker = () =>
    new Promise((resolve, reject) => {
      if (engineReadyRef.current && workerRef.current) {
        resolve()
        return
      }

      const worker = new Worker(
        new URL('../../workers/stockfish.worker.js', import.meta.url),
      )
      workerRef.current = worker

      worker.onmessage = e => {
        const msg = e.data
        if (msg === 'uciok') {
          worker.postMessage('setoption name MultiPV value 1')
          worker.postMessage('isready')
          return
        }
        if (msg === 'readyok') {
          engineReadyRef.current = true
          resolve()
          return
        }

        if (typeof msg === 'string' && msg.startsWith('info depth')) {
          const state = analysisStateRef.current
          if (!state) return
          const depthMatch = msg.match(/depth (\d+)/)
          const cpMatch = msg.match(/ cp (-?\d+)/)
          const mateMatch = msg.match(/ mate (-?\d+)/)
          const pvMatch = msg.match(/ pv (.+)/)
          if (!depthMatch || !pvMatch) return
          const depth = Number.parseInt(depthMatch[1], 10)
          if (depth < state.depth) return
          state.depth = depth
          state.pv = pvMatch[1].trim().split(/\s+/)
          state.cp = cpMatch ? Number.parseInt(cpMatch[1], 10) : null
          state.mate = mateMatch ? Number.parseInt(mateMatch[1], 10) : null
          return
        }

        if (typeof msg === 'string' && msg.startsWith('bestmove')) {
          const state = analysisStateRef.current
          const resolveCurrent = resolverRef.current
          if (!state || !resolveCurrent) return
          const bestMove = msg.match(/^bestmove (\S+)/)?.[1] || null
          resolverRef.current = null
          analysisStateRef.current = null
          resolveCurrent({
            bestMove: bestMove === '(none)' ? null : bestMove,
            cp: state.cp,
            mate: state.mate,
            pv: state.pv || [],
          })
        }
      }

      worker.onerror = err => reject(err)
      worker.postMessage('uci')
    })

  const analyzeFen = fen =>
    new Promise(resolve => {
      const worker = workerRef.current
      analysisStateRef.current = { depth: 0, cp: null, mate: null, pv: [] }
      resolverRef.current = resolve
      worker.postMessage('stop')
      worker.postMessage(`position fen ${fen || START_FEN}`)
      worker.postMessage(`go depth ${STOCKFISH_DEPTH}`)
    })

  const fetchLast100Games = async cleanUsername => {
    const archivesRes = await fetch(
      `https://api.chess.com/pub/player/${cleanUsername}/games/archives`,
    )
    if (!archivesRes.ok) {
      throw new Error(`Failed to fetch archives (${archivesRes.status}).`)
    }
    const archivesJson = await archivesRes.json()
    const archiveUrls = (archivesJson.archives || []).slice(-12).reverse()

    const games = []
    for (const url of archiveUrls) {
      if (games.length >= 100) break
      const monthRes = await fetch(url)
      if (!monthRes.ok) continue
      const monthJson = await monthRes.json()
      const monthGames = (monthJson.games || []).filter(game => game.pgn)
      for (const game of monthGames.reverse()) {
        if (games.length >= 100) break
        games.push(game)
      }
    }
    return games
  }

  const buildProfile = async () => {
    const cleanUsername = username.trim().toLowerCase()
    if (!cleanUsername) return
    setIsRunning(true)
    setStatus('Preparing engine...')
    setProfile(null)

    try {
      await ensureWorker()
      setStatus('Fetching games from Chess.com...')
      const games = await fetchLast100Games(cleanUsername)
      if (games.length === 0) {
        throw new Error('No games found for this user.')
      }

      const samples = []
      let analyzedGames = 0

      for (const [gameIdx, game] of games.entries()) {
        const whiteName = (game.white?.username || '').toLowerCase()
        const blackName = (game.black?.username || '').toLowerCase()
        const userColor =
          whiteName === cleanUsername ? 'w' : blackName === cleanUsername ? 'b' : null
        if (!userColor) continue

        const chess = new Chess()
        try {
          chess.loadPgn(game.pgn)
        } catch {
          continue
        }
        const moves = chess.history({ verbose: true })
        const board = new Chess()
        let beforeEvalRaw = await analyzeFen(board.fen())
        let beforeEvalCp = evalToWhiteCp(beforeEvalRaw, board.fen())

        for (let ply = 0; ply < moves.length; ply += 1) {
          const move = moves[ply]
          const phase = detectPhase(board, ply + 1)
          const positionType = detectPositionType(board)
          board.move(move)
          const afterEvalRaw = await analyzeFen(board.fen())
          const afterEvalCp = evalToWhiteCp(afterEvalRaw, board.fen())

          if (move.color === userColor) {
            const beforeForMover = move.color === 'w' ? beforeEvalCp : -beforeEvalCp
            const afterForMover = move.color === 'w' ? afterEvalCp : -afterEvalCp
            const cpl = Math.max(0, beforeForMover - afterForMover)
            const severity = classifyByCpl(cpl)
            samples.push({
              phase,
              piece: move.piece,
              positionType,
              cpl,
              severity,
              target: severity === 'inaccuracy' || severity === 'mistake' || severity === 'blunder' ? 1 : 0,
            })
          }

          beforeEvalCp = afterEvalCp
        }

        analyzedGames += 1
        setStatus(
          `Analyzing with Stockfish: game ${gameIdx + 1}/${games.length}, samples ${samples.length}`,
        )
      }

      if (samples.length < 30) {
        throw new Error('Not enough analyzed moves to train a profile yet.')
      }

      setStatus('Training TensorFlow.js classifier...')
      const xsData = samples.map(encodeFeature)
      const ysData = samples.map(sample => sample.target)
      const xs = tf.tensor2d(xsData)
      const ys = tf.tensor2d(ysData, [ysData.length, 1])
      const model = tf.sequential({
        layers: [
          tf.layers.dense({ units: 16, activation: 'relu', inputShape: [xsData[0].length] }),
          tf.layers.dense({ units: 8, activation: 'relu' }),
          tf.layers.dense({ units: 1, activation: 'sigmoid' }),
        ],
      })
      model.compile({ optimizer: tf.train.adam(0.01), loss: 'binaryCrossentropy' })
      await model.fit(xs, ys, { epochs: 25, batchSize: 32, verbose: 0 })

      const patternMap = new Map()
      for (const sample of samples) {
        const key = `${sample.phase}|${sample.piece}|${sample.positionType}`
        if (!patternMap.has(key)) {
          patternMap.set(key, {
            key,
            phase: sample.phase,
            piece: sample.piece,
            pieceName:
              { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[
                sample.piece
              ] || sample.piece,
            positionType: sample.positionType,
            count: 0,
            mistakes: 0,
            blunders: 0,
            inaccuracies: 0,
            totalCpl: 0,
          })
        }
        const item = patternMap.get(key)
        item.count += 1
        item.totalCpl += sample.cpl
        if (sample.severity === 'blunder') item.blunders += 1
        if (sample.severity === 'mistake') item.mistakes += 1
        if (sample.severity === 'inaccuracy') item.inaccuracies += 1
      }

      const enriched = []
      for (const item of patternMap.values()) {
        const input = tf.tensor2d([encodeFeature(item)])
        const predTensor = model.predict(input)
        const risk = predTensor.dataSync()[0]
        input.dispose()
        predTensor.dispose()

        const errorCount = item.blunders + item.mistakes + item.inaccuracies
        const mistakeRate = errorCount / item.count
        enriched.push({
          ...item,
          avgCpl: item.totalCpl / item.count,
          mistakeRate,
          predictedRisk: risk,
          score: mistakeRate * Math.log(item.count + 1) + risk * 0.35,
        })
      }

      enriched.sort((a, b) => b.score - a.score)
      const topPatterns = enriched.slice(0, 5)
      const builtProfile = {
        analyzedGames,
        analyzedSamples: samples.length,
        topPatterns,
        summary: makeWeaknessSummary({ topPatterns }),
      }

      xs.dispose()
      ys.dispose()
      model.dispose()
      tf.disposeVariables()

      setProfile(builtProfile)
      onProfileChange?.(builtProfile)
      setStatus('Weakness profile ready.')
    } catch (err) {
      const message = err?.message || 'Failed to build weakness profile.'
      setStatus(message)
      onProfileChange?.(null)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="ml-panel">
      <h2>Your Weakness Profile</h2>
      <div className="ml-controls">
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Chess.com username"
          disabled={isRunning}
        />
        <button onClick={buildProfile} disabled={isRunning || !username.trim()}>
          {isRunning ? 'Analyzing…' : 'Analyze Last 100 Games'}
        </button>
      </div>
      <p className="ml-status">{status}</p>
      {profile && (
        <div className="ml-results">
          <p className="ml-summary">{profile.summary}</p>
          <p className="ml-meta">
            Games: {profile.analyzedGames} | Moves analyzed: {profile.analyzedSamples}
          </p>
          <ul className="weakness-list">
            {profile.topPatterns.map(pattern => (
              <li key={pattern.key} className="weakness-item">
                <span>
                  {pattern.phase} / {pattern.pieceName} / {pattern.positionType}
                </span>
                <span>
                  {Math.round(pattern.mistakeRate * 100)}% mistakes ({pattern.count} samples)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
