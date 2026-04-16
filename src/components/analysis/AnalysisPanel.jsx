import './AnalysisPanel.css'

export default function AnalysisPanel({
  lines,
  isReady,
  engineError,
  embedded = false,
}) {
  return (
    <div
      className={
        embedded ? 'analysis-panel analysis-panel--embedded' : 'analysis-panel'
      }
    >
      <h2>Engine Analysis</h2>
      <div className="analysis-panel__main">
        <div className="analysis-panel__status">
          {engineError && (
            <p className="status status-error">
              Stockfish failed: {engineError}
            </p>
          )}
          {!engineError && !isReady && (
            <p className="status">Loading Stockfish…</p>
          )}
          {!engineError && isReady && lines.length === 0 && (
            <p className="status">Analysing…</p>
          )}
        </div>
        <ul className="lines">
          {lines.map((line, i) => (
            <li key={i} className="line">
              <span className="score">{line.score}</span>
              <span className="moves">{line.moves}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
