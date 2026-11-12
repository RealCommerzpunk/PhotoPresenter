import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import QRCode from 'qrcode'
import type { RemoteInfo, RemoteState, ShowCommand } from '@shared/remote'
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
  command(cmd: ShowCommand): void
}

/** Kleiner Webserver für die Fernbedienung vom Handy aus (ohne Passwort, nur im lokalen Netz). */
export class RemoteServer {
  private server: Server | null = null
  private port = 0
  private error: string | undefined
  private clients = new Set<ServerResponse>()

  constructor(private readonly handlers: RemoteHandlers) {}

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
      const server = createServer((req, res) => void this.handle(req, res))
      server.once('error', reject)
      server.listen(port, '0.0.0.0', () => {
        server.off('error', reject)
        this.server = server
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    for (const c of this.clients) c.end()
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
    for (const c of this.clients) c.write(data)
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        return send(res, 200, pageHtml, 'text/html; charset=utf-8')
      }
      if (req.method === 'GET' && url.pathname === '/api/state') {
        return sendJson(res, this.handlers.state())
      }
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        })
        res.write(`data: ${JSON.stringify(this.handlers.state())}\n\n`)
        this.clients.add(res)
        req.on('close', () => this.clients.delete(res))
        return
      }
      if (req.method === 'POST' && url.pathname === '/api/settings') {
        const body = (await readJson(req)) as Record<string, unknown>
        // Nur freigegebene Einstellungen; alles wird danach noch vom Schema geprüft.
        const patch: Record<string, unknown> = {}
        for (const key of REMOTE_KEYS) if (key in body) patch[key] = body[key]
        this.handlers.applySettings(patch as Partial<Settings>)
        return sendJson(res, this.handlers.state())
      }
      if (req.method === 'POST' && url.pathname === '/api/show') {
        const { cmd } = (await readJson(req)) as { cmd: ShowCommand }
        this.handlers.command(cmd)
        return sendJson(res, this.handlers.state())
      }
      send(res, 404, 'Nicht gefunden', 'text/plain; charset=utf-8')
    } catch (err) {
      send(res, 400, String(err), 'text/plain; charset=utf-8')
    }
  }
}

function send(res: ServerResponse, status: number, body: string, type: string): void {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(body)
}

function sendJson(res: ServerResponse, value: unknown): void {
  send(res, 200, JSON.stringify(value), 'application/json; charset=utf-8')
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 1_000_000) reject(new Error('Anfrage zu groß'))
    })
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch (err) {
        reject(err)
      }
    })
  })
}
