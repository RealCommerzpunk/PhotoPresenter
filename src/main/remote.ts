import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import QRCode from 'qrcode'
import type { QueueOp, RemoteInfo, RemoteState, ShowCommand, ShowNotice } from '@shared/remote'
import { REMOTE_KEYS } from '@shared/remote'
import type { Settings } from '@shared/settings'
import pageHtml from './remote.html?raw'

/**
 * IPv4-Adressen dieses Rechners, die ein Handy erreichen kann. Das iPhone-Hotspot-Netz
 * (172.20.10.x) kommt zuerst, dann übliche Heimnetze.
 */
export function localAddresses(): string[] {
  const found: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) {
        found.push(a.address)
      }
    }
  }
  const rank = (ip: string): number =>
    ip.startsWith('172.20.10.') ? 0 : ip.startsWith('192.168.') ? 1 : ip.startsWith('10.') ? 2 : 3
  return found.sort((a, b) => rank(a) - rank(b))
}

export interface RemoteHandlers {
  state(): RemoteState
  applySettings(patch: Partial<Settings>): void
  command(cmd: ShowCommand, arg?: string): void
  /** Alle Fotos des Ordners (relativ) für die Galerie. */
  photos(): Promise<string[]>
  /** Vorschaubild als JPEG. */
  thumb(name: string): Promise<Buffer | null>
  queue(op: QueueOp): void
  /** Programm-Icon (PNG) für Lesezeichen und Startbildschirm des Handys. */
  icon?(): Promise<Buffer | null>
  /** Wörterbuch der Handy-Seite in der Sprache des Presenters. */
  i18n?(): { lang: string; de: Record<string, string>; msg: Record<string, string> }
}

/** Verbundenes Handy (Server-Sent Events). */
interface Client {
  send(text: string): void
  close(): void
}

const MAX_BODY = 1_000_000

/**
 * Kleiner Webserver für die Fernbedienung vom Handy aus (ohne Passwort, nur im lokalen Netz).
 * Die Logik steckt in `fetch` (Request → Response); der Node-Server reicht nur durch. So kann
 * ein Testfenster in der Entwicklung dieselbe Logik auch ohne Netzwerk nutzen.
 */
export class RemoteServer {
  private server: Server | null = null
  private port = 0
  private error: string | undefined
  private clients = new Set<Client>()

  constructor(private readonly handlers: RemoteHandlers) {}

  /** Tatsächlich belegter Port (0, wenn der Server nicht läuft). */
  get boundPort(): number {
    return this.server ? this.port : 0
  }

  /** Startet (oder startet neu) auf dem gewünschten Port; belegt → die nächsten 10 probieren. */
  async start(wanted: number): Promise<void> {
    await this.stop()
    for (let port = wanted; port < wanted + 10; port++) {
      try {
        await this.listen(port)
        this.port = port
        this.error = undefined
        return
      } catch (err) {
        this.error = `Port ${wanted} nicht verfügbar: ${(err as Error).message}`
      }
    }
  }

  private listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => void this.handleNode(req, res))
      server.once('error', reject)
      server.listen(port, '0.0.0.0', () => {
        server.off('error', reject)
        this.server = server
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    for (const c of this.clients) c.close()
    this.clients.clear()
    const server = this.server
    this.server = null
    this.port = 0
    if (server) await new Promise<void>((r) => server.close(() => r()))
  }

  /** Adressen und QR-Code für die Anzeige in den Einstellungen und in der Show. */
  async info(enabled: boolean): Promise<RemoteInfo> {
    const urls = this.server ? localAddresses().map((ip) => `http://${ip}:${this.port}/`) : []
    const qrSvg = urls[0]
      ? await QRCode.toString(urls[0], { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      : undefined
    return { enabled, running: !!this.server, port: this.port, urls, qrSvg, error: this.error }
  }

  /** Neuen Zustand an alle verbundenen Handys schicken. */
  broadcast(): void {
    if (!this.clients.size) return
    const data = `data: ${JSON.stringify(this.handlers.state())}\n\n`
    for (const c of this.clients) c.send(data)
  }

  /** Rückmeldung (z. B. „Herzen gestartet“) an alle verbundenen Handys. */
  notify(notice: ShowNotice): void {
    const data = `event: notice\ndata: ${JSON.stringify(notice)}\n\n`
    for (const c of this.clients) c.send(data)
  }

  /** Beantwortet eine Anfrage der Handy-Seite. */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const { method } = request
    try {
      if (method === 'GET' && url.pathname === '/') {
        return text(200, pageHtml, 'text/html; charset=utf-8')
      }
      if (
        method === 'GET' &&
        (url.pathname === '/icon.png' || url.pathname === '/apple-touch-icon.png')
      ) {
        const image = await this.handlers.icon?.()
        if (!image) return text(404, 'Kein Icon')
        return new Response(new Uint8Array(image), {
          headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' }
        })
      }
      if (method === 'GET' && url.pathname === '/api/i18n') {
        return json(this.handlers.i18n?.() ?? { lang: 'de', de: {}, msg: {} })
      }
      if (method === 'GET' && url.pathname === '/api/state') return json(this.handlers.state())
      if (method === 'GET' && url.pathname === '/api/events') return this.events()
      if (method === 'POST' && url.pathname === '/api/settings') {
        const body = (await readJson(request)) as Record<string, unknown>
        // Nur freigegebene Einstellungen; alles wird danach noch vom Schema geprüft.
        const patch: Record<string, unknown> = {}
        for (const key of REMOTE_KEYS) if (key in body) patch[key] = body[key]
        this.handlers.applySettings(patch as Partial<Settings>)
        return json(this.handlers.state())
      }
      if (method === 'POST' && url.pathname === '/api/show') {
        const { cmd, arg } = (await readJson(request)) as { cmd: ShowCommand; arg?: unknown }
        this.handlers.command(cmd, typeof arg === 'string' ? arg.slice(0, 500) : undefined)
        return json(this.handlers.state())
      }
      if (method === 'GET' && url.pathname === '/api/photos') {
        return json({ files: await this.handlers.photos() })
      }
      if (method === 'GET' && url.pathname === '/api/thumb') {
        const image = await this.handlers.thumb(url.searchParams.get('n') ?? '')
        if (!image) return text(404, 'Kein Vorschaubild')
        return new Response(new Uint8Array(image), {
          headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=86400' }
        })
      }
      if (method === 'POST' && url.pathname === '/api/queue') {
        this.handlers.queue((await readJson(request)) as QueueOp)
        return json(this.handlers.state())
      }
      return text(404, 'Nicht gefunden')
    } catch (err) {
      return text(400, String(err))
    }
  }

  /** Ereignisstrom: sofort der aktuelle Zustand, danach jede Änderung und jeder Hinweis. */
  private events(): Response {
    const encoder = new TextEncoder()
    let client: Client | undefined
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        // Nach einem Abbruch wirft der Strom; dann gilt das Handy als getrennt.
        const drop = (): void => {
          if (client) this.clients.delete(client)
        }
        client = {
          send: (data) => {
            try {
              controller.enqueue(encoder.encode(data))
            } catch {
              drop()
            }
          },
          close: () => {
            try {
              controller.close()
            } catch {
              // schon geschlossen
            }
          }
        }
        this.clients.add(client)
        client.send(`data: ${JSON.stringify(this.handlers.state())}\n\n`)
      },
      cancel: () => {
        if (client) this.clients.delete(client)
      }
    })
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    })
  }

  /** Node-Anfrage in einen Fetch-Request übersetzen und die Antwort zurückstreamen. */
  private async handleNode(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = req.method === 'POST' ? await readBody(req) : undefined
      const request = new Request(`http://localhost${req.url ?? '/'}`, {
        method: req.method,
        headers: { 'Content-Type': req.headers['content-type'] ?? 'application/json' },
        body
      })
      const response = await this.fetch(request)
      res.writeHead(response.status, Object.fromEntries(response.headers))
      if (!response.body) return void res.end()
      const reader = response.body.getReader()
      req.on('close', () => void reader.cancel().catch(() => undefined))
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
      res.end()
    } catch (err) {
      if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(String(err))
    }
  }
}

function text(status: number, body: string, type = 'text/plain; charset=utf-8'): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': type, 'Cache-Control': 'no-store' }
  })
}

function json(value: unknown): Response {
  return text(200, JSON.stringify(value), 'application/json; charset=utf-8')
}

async function readJson(request: Request): Promise<unknown> {
  const raw = await request.text()
  if (raw.length > MAX_BODY) throw new Error('Anfrage zu groß')
  return raw ? JSON.parse(raw) : {}
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > MAX_BODY) {
        reject(new Error('Anfrage zu groß'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}
