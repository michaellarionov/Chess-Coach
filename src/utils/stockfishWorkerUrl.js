/**
 * URL for the Stockfish classic Worker (copied to public/stockfish.js).
 * The engine resolves stockfish.wasm relative to this script; it must be the
 * worker entry itself, not loaded via importScripts from another path.
 */
export function getStockfishWorkerUrl() {
  const base = import.meta.env.BASE_URL || '/'
  const isAbsoluteBase =
    base.startsWith('/') || /^https?:\/\//i.test(base)
  if (isAbsoluteBase) {
    return new URL('stockfish.js', new URL(base, window.location.origin)).href
  }
  // Relative base (e.g. `./` from `vite build`) — must resolve from the page URL, not origin-only.
  return new URL('stockfish.js', document.baseURI).href
}
