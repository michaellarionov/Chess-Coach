import { useEffect, useState } from 'react'
import useStockfish from '../../hooks/useStockfish.js'
import './AnalysisPanel.css'

export default function AnalysisPanel({ fen }) {
  const { lines, isReady } = useStockfish(fen)

  return (
    <div className="analysis-panel">
      <h2>Engine Analysis</h2>
      {!isReady && <p className="status">Loading Stockfish…</p>}
      {isReady && lines.length === 0 && <p className="status">Analysing…</p>}
      <ul className="lines">
        {lines.map((line, i) => (
          <li key={i} className="line">
            <span className="score">{line.score}</span>
            <span className="moves">{line.moves}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
