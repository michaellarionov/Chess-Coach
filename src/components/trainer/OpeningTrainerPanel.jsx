import { useMemo, useState } from 'react'
import openingsByFen from '../../data/openingsByFen.json'
import './OpeningTrainerPanel.css'

function buildLineCatalog() {
  const unique = new Map()
  for (const opening of Object.values(openingsByFen)) {
    const id = `${opening.eco}|${opening.name}|${opening.pgn}`
    if (!unique.has(id)) {
      unique.set(id, { id, eco: opening.eco, name: opening.name, pgn: opening.pgn })
    }
  }
  return [...unique.values()].sort((a, b) => {
    if (a.eco !== b.eco) return a.eco.localeCompare(b.eco)
    if (a.name !== b.name) return a.name.localeCompare(b.name)
    return a.pgn.length - b.pgn.length
  })
}

function masteryPercent(progress) {
  if (!progress || !progress.attempts) return 0
  return Math.round((progress.successes / progress.attempts) * 100)
}

export default function OpeningTrainerPanel({
  trainerConfig,
  progressByLine,
  onTrainerConfigChange,
}) {
  const [query, setQuery] = useState('')
  const lines = useMemo(() => buildLineCatalog(), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? lines.filter(
          line =>
            line.eco.toLowerCase().includes(q) ||
            line.name.toLowerCase().includes(q) ||
            line.pgn.toLowerCase().includes(q),
        )
      : lines
    return base.slice(0, 80)
  }, [lines, query])

  const selectedId = trainerConfig?.line?.id || ''

  return (
    <div className="trainer-panel">
      <h2>Opening Trainer</h2>
      <div className="trainer-controls">
        <label className="trainer-toggle">
          <input
            type="checkbox"
            checked={Boolean(trainerConfig?.enabled)}
            onChange={e =>
              onTrainerConfigChange?.({
                ...trainerConfig,
                enabled: e.target.checked,
                sessionId: Date.now(),
              })
            }
          />
          Enable trainer mode
        </label>
        <select
          value={trainerConfig?.playerColor || 'w'}
          onChange={e =>
            onTrainerConfigChange?.({
              ...trainerConfig,
              playerColor: e.target.value,
              sessionId: Date.now(),
            })
          }
        >
          <option value="w">Train as White</option>
          <option value="b">Train as Black</option>
        </select>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search ECO, opening name, or line..."
        />
      </div>
      <ul className="trainer-line-list">
        {filtered.map(line => {
          const progress = progressByLine?.[line.id]
          const mastery = masteryPercent(progress)
          return (
            <li
              key={line.id}
              className={`trainer-line-item ${selectedId === line.id ? 'selected' : ''}`}
            >
              <button
                onClick={() =>
                  onTrainerConfigChange?.({
                    ...trainerConfig,
                    line,
                    enabled: true,
                    sessionId: Date.now(),
                  })
                }
              >
                <span className="trainer-line-title">
                  {line.eco} - {line.name}
                </span>
                <span className="trainer-line-sub">{line.pgn}</span>
                <span className="trainer-line-progress">
                  Mastery: {mastery}% ({progress?.successes || 0}/{progress?.attempts || 0})
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
