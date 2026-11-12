// Startet die App (Entwicklungsmodus) mit dem Demo-Datenordner des Repos: Data/
// Einstellungen und Gesichtsindex werden dort gespeichert und gehören ins Git
// (nur settings.json und faces.json, Zwischenspeicher sind per .gitignore ausgenommen).
// Aufruf: npm run demo   bzw.   npm run demo -- --show
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const data = join(root, 'Data')
mkdirSync(data, { recursive: true })

const env = { ...process.env, PP_USER_DATA: data }
// Manche Editor-Terminals setzen das; dann startet Electron als reines Node.
delete env.ELECTRON_RUN_AS_NODE

console.log(`Demo-Daten: ${data}`)
const child = spawn('npx', ['electron-vite', 'dev', ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true
})
child.on('exit', (code) => process.exit(code ?? 0))
