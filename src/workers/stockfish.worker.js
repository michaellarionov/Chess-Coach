// Thin wrapper that loads the Stockfish WASM engine inside a Web Worker.
// stockfish.js in /public is the Emscripten-compiled browser build from the
// stockfish npm package's bin/ directory.
importScripts('/stockfish.js')

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
