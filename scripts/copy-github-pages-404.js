// GitHub Pages serves 404.html for missing paths; copying index.html enables SPA-style reloads.
import { copyFileSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const indexHtml = resolve(root, 'dist', 'index.html')
const notFound = resolve(root, 'dist', '404.html')

if (!existsSync(indexHtml)) {
  console.warn('copy-github-pages-404: dist/index.html missing, skipping')
  process.exit(0)
}
copyFileSync(indexHtml, notFound)
console.log('copy-github-pages-404: dist/index.html → dist/404.html')
