// Copies large binary assets from node_modules into public/ so they can be
// served by Vite without being committed to git.
import { copyFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const pub = resolve(root, 'public')

mkdirSync(pub, { recursive: true })

const copies = [
  // Stockfish WASM: lite SINGLE-THREADED build works without SharedArrayBuffer / COOP+COEP.
  // The default stockfish.js uses pthreads and stays on "Loading…" on many static hosts.
  ['stockfish/bin/stockfish-18-lite-single.js', 'stockfish.js'],
  ['stockfish/bin/stockfish-18-lite-single.wasm', 'stockfish.wasm'],
  // chessboard.js jQuery plugin (no ESM exports — loaded as global)
  ['@chrisoakman/chessboardjs/dist/chessboard-1.0.0.min.js',  'chessboard-1.0.0.min.js'],
  ['@chrisoakman/chessboardjs/dist/chessboard-1.0.0.min.css', 'chessboard-1.0.0.min.css'],
  // jQuery (required by chessboard.js)
  ['jquery/dist/jquery.min.js', 'jquery.min.js'],
]

for (const [src, dest] of copies) {
  copyFileSync(
    resolve(root, 'node_modules', src),
    resolve(pub, dest),
  )
  console.log(`copied ${src} → public/${dest}`)
}
