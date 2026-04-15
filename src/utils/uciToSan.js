import { Chess } from 'chess.js'

/** Limit half-moves shown so the UI stays usable with very deep PVs. */
const MAX_PV_HALFMOVES = 80

/**
 * Format a principal variation as numbered SAN from the current position, e.g.
 * `1. e4 e5 2. Nf3 Nc6` or `12... Kh8 13. Qf7#` when Black is to move.
 */
export function formatPvNumberedSan(fen, pvUci) {
  if (!pvUci?.length) return '…'
  const slice = pvUci.slice(0, MAX_PV_HALFMOVES)
  try {
    const game = new Chess(fen)
    const tokens = fen.trim().split(/\s+/)
    const fullmove = Math.max(1, parseInt(tokens[5] || '1', 10) || 1)
    let moveNo = fullmove
    let whiteToMove = tokens[1] !== 'b'
    const parts = []
    let line = ''

    for (const uci of slice) {
      if (!uci || typeof uci !== 'string' || uci.length < 4) break
      const from = uci.slice(0, 2)
      const to = uci.slice(2, 4)
      const p = uci[4]?.toLowerCase()
      const promotion = p && 'qrnb'.includes(p) ? p : undefined
      const move = game.move({ from, to, promotion })
      if (!move) break

      if (whiteToMove) {
        if (line) parts.push(line.trim())
        line = `${moveNo}. ${move.san}`
        whiteToMove = false
      } else if (line) {
        line += ` ${move.san}`
        parts.push(line.trim())
        line = ''
        moveNo += 1
        whiteToMove = true
      } else {
        parts.push(`${moveNo}... ${move.san}`.trim())
        moveNo += 1
        whiteToMove = true
      }
    }
    if (line) parts.push(line.trim())
    const out = parts.join(' ')
    return out || '…'
  } catch {
    return slice[0] ? uciMoveToSan(fen, slice[0]) : '…'
  }
}

/** Convert a single UCI move (e.g. e2e4, e7e8q) to SAN in the given position. */
export function uciMoveToSan(fen, uci) {
  if (!uci || typeof uci !== 'string' || uci.length < 4) return uci || '…'
  try {
    const game = new Chess(fen)
    const from = uci.slice(0, 2)
    const to = uci.slice(2, 4)
    const p = uci[4]
    const promotion =
      p && 'qrnb'.includes(p.toLowerCase()) ? p.toLowerCase() : undefined
    const move = game.move({ from, to, promotion })
    return move?.san ?? uci
  } catch {
    return uci
  }
}
