import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const sourceDir = path.join(rootDir, 'data', 'chess-openings')
const outputPath = path.join(rootDir, 'src', 'data', 'openingsByFen.json')
const sourceFiles = ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv']

function normalizeFen(fen) {
  return fen.split(' ').slice(0, 4).join(' ')
}

function parseTsvLine(line) {
  const cols = line.split('\t')
  if (cols.length < 3) return null
  const [eco, name, pgn] = cols
  return { eco, name, pgn }
}

function buildDb() {
  const map = {}
  let records = 0

  for (const file of sourceFiles) {
    const filePath = path.join(sourceDir, file)
    const raw = fs.readFileSync(filePath, 'utf8')
    const lines = raw.split('\n')

    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i].trim()
      if (!line) continue
      const parsed = parseTsvLine(line)
      if (!parsed) continue

      const game = new Chess()
      try {
        game.loadPgn(parsed.pgn)
      } catch {
        continue
      }

      const key = normalizeFen(game.fen())
      if (!map[key]) {
        map[key] = {
          eco: parsed.eco,
          name: parsed.name,
          pgn: parsed.pgn,
        }
        records += 1
      }
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(map))
  return { records, outputPath }
}

const result = buildDb()
console.log(`Generated ${result.records} opening positions at ${result.outputPath}`)
