// Thin wrapper that loads the Stockfish WASM engine inside a Web Worker.
// We try multiple URL forms so it works in browser, Capacitor, and Tauri.
function loadStockfishScript() {
  const candidates = [
    '/stockfish.js',
    './stockfish.js',
    '../stockfish.js',
    new URL('/stockfish.js', self.location.origin).toString(),
    new URL('./stockfish.js', self.location.href).toString(),
  ]

  let loaded = false
  for (const src of candidates) {
    try {
      importScripts(src)
      loaded = true
      break
    } catch {
      // try next path variant
    }
  }

  if (!loaded) {
    throw new Error('Unable to load stockfish.js in worker.')
  }
}

loadStockfishScript()

let engine = null

async function getEngine() {
  if (!engine) {
    // Stockfish() is exposed as a global by the importScripts call above
    engine = await Stockfish() // eslint-disable-line no-undef
    engine.addMessageListener(msg => self.postMessage(msg))
  }
  return engine
}

self.onmessage = async e => {
  const sf = await getEngine()
  sf.postMessage(e.data)
}
