import { useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import './GameImportPanel.css'

function getRecentYearMonths(count) {
  const now = new Date()
  const items = []
  for (let i = 0; i < count; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    items.push({
      year: date.getFullYear(),
      month: String(date.getMonth() + 1).padStart(2, '0'),
    })
  }
  return items
}

function summarizeGame(game, username) {
  const whiteUser = game.white?.username || 'White'
  const blackUser = game.black?.username || 'Black'
  const whiteResult = game.white?.result || 'unknown'
  const blackResult = game.black?.result || 'unknown'
  const isUserWhite = whiteUser.toLowerCase() === username.toLowerCase()
  const userResult = isUserWhite ? whiteResult : blackResult
  const opponent = isUserWhite ? blackUser : whiteUser
  const date = game.end_time
    ? new Date(game.end_time * 1000).toLocaleDateString()
    : 'Unknown date'

  return {
    id: game.url || `${whiteUser}-${blackUser}-${game.end_time}`,
    title: `${date} - vs ${opponent}`,
    subtitle: `${whiteUser} (${whiteResult}) vs ${blackUser} (${blackResult})`,
    result: userResult,
    timeClass: game.time_class || 'unknown',
    pgn: game.pgn || '',
  }
}

export default function GameImportPanel({ onLoadGame, onEngage }) {
  const [activeOption, setActiveOption] = useState('')
  const [username, setUsername] = useState('')
  const [pgnInput, setPgnInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [games, setGames] = useState([])

  const recentMonths = useMemo(() => getRecentYearMonths(3), [])

  const fetchRecentGames = async () => {
    const clean = username.trim()
    if (!clean) return

    setIsLoading(true)
    setError('')

    try {
      const requests = recentMonths.map(({ year, month }) =>
        fetch(`https://api.chess.com/pub/player/${clean}/games/${year}/${month}`),
      )
      const responses = await Promise.all(requests)
      const failed = responses.find(r => !r.ok && r.status !== 404)
      if (failed) {
        throw new Error(`Chess.com API returned ${failed.status}`)
      }

      const payloads = await Promise.all(
        responses.map(r => (r.ok ? r.json() : { games: [] })),
      )
      const merged = payloads
        .flatMap(p => p.games || [])
        .filter(game => typeof game.pgn === 'string' && game.pgn.trim().length > 0)
        .sort((a, b) => (b.end_time || 0) - (a.end_time || 0))
        .slice(0, 20)
        .map(game => summarizeGame(game, clean))

      setGames(merged)
      if (merged.length === 0) {
        setError('No recent games found with PGN for this username.')
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch games from Chess.com.')
      setGames([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoad = game => {
    const testGame = new Chess()
    try {
      testGame.loadPgn(game.pgn || '')
    } catch {
      setError('Selected game PGN is invalid.')
      return
    }
    if (testGame.history().length === 0) {
      setError('Selected game PGN is invalid.')
      return
    }
    setError('')
    onLoadGame?.(game.pgn)
    onEngage?.()
  }

  const handleLoadPgn = () => {
    const trimmed = pgnInput.trim()
    if (!trimmed) {
      setError('Paste a PGN before loading.')
      return
    }
    const testGame = new Chess()
    try {
      testGame.loadPgn(trimmed)
    } catch {
      setError('Invalid PGN. Please paste a complete game.')
      return
    }
    if (testGame.history().length === 0) {
      setError('Invalid PGN. Please paste a complete game.')
      return
    }
    setError('')
    onLoadGame?.(trimmed)
    onEngage?.()
  }

  return (
    <div className="game-import-panel">
      <h2>Coach Options</h2>
      <div className="option-list">
        <button
          className={`option-row ${activeOption === 'setup' ? 'active' : ''}`}
          onClick={() => {
            setActiveOption(prev => (prev === 'setup' ? '' : 'setup'))
          }}
        >
          Set up Position
        </button>
        <button
          className={`option-row ${activeOption === 'moves' ? 'active' : ''}`}
          onClick={() => {
            setActiveOption(prev => (prev === 'moves' ? '' : 'moves'))
          }}
        >
          Make Moves
        </button>
        <button
          className={`option-row ${activeOption === 'history' ? 'active' : ''}`}
          onClick={() => {
            setActiveOption(prev => (prev === 'history' ? '' : 'history'))
          }}
        >
          Load from Game History
        </button>
        <button
          className={`option-row ${activeOption === 'pgn' ? 'active' : ''}`}
          onClick={() => {
            setActiveOption(prev => (prev === 'pgn' ? '' : 'pgn'))
          }}
        >
          Load from PGN
        </button>
      </div>

      {activeOption === 'setup' && (
        <p className="import-note">
          Use the board to arrange pieces manually; each legal move updates the
          position and analysis.
        </p>
      )}

      {activeOption === 'moves' && (
        <p className="import-note">
          Drag pieces on the board to play through moves from the current
          position.
        </p>
      )}

      {activeOption === 'history' && (
        <>
          <div className="import-controls">
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Chess.com username"
            />
            <button onClick={fetchRecentGames} disabled={isLoading || !username.trim()}>
              {isLoading ? 'Loading…' : 'Fetch Recent Games'}
            </button>
          </div>
          <ul className="game-list">
            {games.map(game => (
              <li key={game.id} className="game-item">
                <div className="game-meta">
                  <div className="game-title">{game.title}</div>
                  <div className="game-subtitle">{game.subtitle}</div>
                  <div className="game-tags">
                    <span>{game.timeClass}</span>
                    <span>{game.result}</span>
                  </div>
                </div>
                <button onClick={() => handleLoad(game)}>Load</button>
              </li>
            ))}
          </ul>
        </>
      )}

      {activeOption === 'pgn' && (
        <div className="pgn-loader">
          <textarea
            value={pgnInput}
            onChange={e => setPgnInput(e.target.value)}
            placeholder="Paste PGN text here..."
          />
          <button onClick={handleLoadPgn}>Load PGN</button>
        </div>
      )}

      {error && <p className="import-error">{error}</p>}
    </div>
  )
}
