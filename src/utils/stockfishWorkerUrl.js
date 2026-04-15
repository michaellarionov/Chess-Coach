/**
 * URL for the Stockfish classic Worker (copied to public/stockfish.js).
 * The engine resolves stockfish.wasm relative to this script; it must be the
 * worker entry itself, not loaded via importScripts from another path.
 */
export function getStockfishWorkerUrl() {
  const base = import.meta.env.BASE_URL || '/'
  return new URL('stockfish.js', new URL(base, window.location.origin)).href
}
