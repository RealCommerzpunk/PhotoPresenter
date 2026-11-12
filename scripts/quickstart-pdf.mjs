// Erzeugt Quickstart.pdf aus Quickstart.md (Electron druckt eine gestaltete HTML-Seite).
// Aufruf: npm run quickstart  (startet Electron mit diesem Skript als Hauptprozess)
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app, BrowserWindow } from 'electron'
import { marked } from 'marked'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

const css = `
@page { size: A4; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: 'Segoe UI', 'Noto Sans', Arial, sans-serif; color: #1f2937; font-size: 10.4pt; line-height: 1.5; margin: 0; }
.cover { display: flex; align-items: center; gap: 18px; padding: 18px 22px; margin-bottom: 18px;
  border-radius: 14px; background: linear-gradient(120deg, #2c3e50 0%, #34495e 55%, #e8735a 140%); color: #fff; }
.cover img { width: 78px; height: 78px; background: #fff; border-radius: 14px; padding: 6px; }
.cover h1 { margin: 0; font-size: 25pt; letter-spacing: 0.01em; color: #fff; border: 0; }
.cover .sub { opacity: 0.85; font-size: 10.5pt; margin-top: 2px; }
h1 { display: none; }
h2 { font-size: 14.5pt; color: #2c3e50; margin: 20px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #f3a68f;
  break-after: avoid; }
h2 + * { break-before: avoid; }
p { margin: 6px 0; }
p:has(+ table), p:has(+ ul), p:has(+ pre) { break-after: avoid; }
ul, ol { margin: 6px 0; padding-left: 20px; }
li { margin: 3px 0; }
strong { color: #111827; }
a { color: #c0533b; text-decoration: none; }
hr { border: 0; border-top: 1px solid #e5e7eb; margin: 14px 0; }
code { font-family: Consolas, 'DejaVu Sans Mono', monospace; font-size: 9.2pt; background: #f3f4f6; padding: 1px 4px; border-radius: 4px; }
pre { background: #2c3e50; color: #f9fafb; padding: 10px 14px; border-radius: 10px; break-inside: avoid; }
pre code { background: none; color: inherit; padding: 0; font-size: 9pt; line-height: 1.45; }
table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 9.6pt; break-inside: avoid; }
th { text-align: left; background: #2c3e50; color: #fff; font-weight: 600; padding: 5px 8px; }
td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
tr:nth-child(even) td { background: #fbf4f2; }
td:first-child { white-space: nowrap; }
em { color: #6b7280; }
`

const md = await readFile(join(root, 'Quickstart.md'), 'utf8')
const icon = (await readFile(join(root, 'resources', 'icon.png'))).toString('base64')
const [, title = 'PhotoPresenter', rest = md] = md.match(/^#\s+(.+)\n([\s\S]*)$/) ?? []
const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${title}</title>
<style>${css}</style></head><body>
<div class="cover"><img src="data:image/png;base64,${icon}" alt="">
<div><h1 style="display:block">${title}</h1><div class="sub">Version ${pkg.version} · Diashow zum Mitnehmen</div></div></div>
${marked.parse(rest)}
</body></html>`

app.whenReady().then(async () => {
  const tmp = join(app.getPath('temp'), 'pp-quickstart.html')
  await writeFile(tmp, html)
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  await win.loadURL(pathToFileURL(tmp).href)
  const pdf = await win.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#9ca3af;font-family:Segoe UI,Arial;text-align:center">' +
      'PhotoPresenter · Schnellstart · Seite <span class="pageNumber"></span> von <span class="totalPages"></span></div>',
    margins: { marginType: 'custom', top: 0.6, bottom: 0.7, left: 0.65, right: 0.65 }
  })
  await writeFile(join(root, 'Quickstart.pdf'), pdf)
  console.log(`Quickstart.pdf geschrieben (${Math.round(pdf.length / 1024)} KB)`)
  app.quit()
})
