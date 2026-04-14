import { useEffect, useRef } from 'react'
import { Chess } from 'chess.js'
import './BoardPanel.css'

// chessboard.js and jQuery are loaded as globals via <script> tags in index.html
/* global Chessboard */

export default function BoardPanel({ fen, onFenChange, onPgnChange }) {
  const boardRef = useRef(null)
  const boardInstanceRef = useRef(null)
  const gameRef = useRef(new Chess())

  useEffect(() => {
    const game = gameRef.current

    boardInstanceRef.current = Chessboard(boardRef.current, {
      draggable: true,
      position: 'start',
      pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
      onDragStart(_source, piece) {
        if (
          game.isGameOver() ||
          (game.turn() === 'w' && piece.startsWith('b')) ||
          (game.turn() === 'b' && piece.startsWith('w'))
        ) {
          return false
        }
      },
      onDrop(source, target) {
        try {
          game.move({ from: source, to: target, promotion: 'q' })
        } catch {
          return 'snapback'
        }
        onFenChange(game.fen())
        onPgnChange(game.pgn())
      },
      onSnapEnd() {
        boardInstanceRef.current.position(game.fen())
      },
    })

    return () => {
      boardInstanceRef.current?.destroy()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleReset = () => {
    gameRef.current = new Chess()
    boardInstanceRef.current?.start()
    onFenChange('start')
    onPgnChange('')
  }

  return (
    <div className="board-panel">
      <div ref={boardRef} className="chessboard" style={{ width: 480 }} />
      <div className="board-controls">
        <button onClick={handleReset}>Reset</button>
      </div>
    </div>
  )
}
