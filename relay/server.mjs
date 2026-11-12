// The relay: the only server. It listens on the loopback of the NAS, keeps each person's last push, merges them and
// draws one office. Caddy terminates TLS, checks the viewer's password and adds `X-Office-User`; laptops reach
// /ingest with their own bearer token. No request ever names a path on disk or a command.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { renderLoading, renderSvg, renderTimelapse } from '../vendor/theoffice-agents/plugin/lib/svg.mjs'
import { renderOffice, renderStatus, toPlain } from '../vendor/theoffice-agents/plugin/lib/ascii.mjs'
import { renderTimelapseText } from '../vendor/theoffice-agents/plugin/lib/ascii-timelapse.mjs'
import { dashboardPage } from '../vendor/theoffice-agents/plugin/lib/dashboard-page.mjs'
import { mergeFacts, clockOf, SPEC } from './merge.mjs'
import { redact } from './redact.mjs'
import { createStore, VIEWS } from './store.mjs'

const LIB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'theoffice-agents', 'plugin', 'lib')
/** The console's parts the page draws itself, as upstream serves them. Nothing else under lib/ is served. */
const PAGE_MODULES = new Set(['svg-console.mjs', 'svg-menu.mjs', 'svg-period.mjs', 'period.mjs'])
const MAX_BODY = 1024 * 1024
const WIDTH = { default: 960, min: 320, max: 2400 }
const ZOOM_SCALE = 2.5
const PING_MS = 25_000

const VIEW_SET = new Set(VIEWS)
// What a page may ask for: the timelapse's ranges are chosen by `range`, never by a view name.
const PAGE_VIEWS = new Set(VIEWS.filter((v) => !v.startsWith('timelapse-')))
/** The stored view a timelapse of `range` is drawn from. */
export const lapseView = (range) => (range === 'week' ? 'timelapse' : `timelapse-${range}`)
const RANGES = ['yesterday', 'week', 'month'] // the page's timelapse keys; without one it writes range=undefined
const selectionOf = (params) => {
  const view = params.get('view') ?? 'live'
  const width = params.get('width') === null ? WIDTH.default : Number(params.get('width'))
  const back = Number(params.get('back') ?? 0)
  if (!PAGE_VIEWS.has(view) || !Number.isFinite(width) || width < WIDTH.min || width > WIDTH.max) throw new Error('Invalid selection')
  // The relay keeps no transcripts, so it can serve no page of the past: the page's Back control says so instead of
  // drawing a lie.
  if (back > 0) throw new Error('This relay keeps no past pages')
  const range = RANGES.includes(params.get('range')) ? params.get('range') : 'week'
  return { view, range, width, zoom: params.get('zoom') === '1', quiet: params.get('quiet') === '1' && view === 'live' }
}

function labelOf(header, tokens) {
  const match = /^Bearer (.+)$/.exec(header ?? '')
  if (!match) return null
  const given = Buffer.from(match[1])
  let found = null
  for (const [token, label] of Object.entries(tokens)) {
    const expected = Buffer.from(token)
    if (given.length === expected.length && timingSafeEqual(given, expected)) found = label
  }
  return found
}

/** The whole body as a Buffer, or null when it is over the limit: the request is drained, never buffered past the cap. */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let tooLarge = false
    req.on('data', (chunk) => {
      size += chunk.length
      if (size <= limit) return chunks.push(chunk)
      tooLarge = true
      chunks.length = 0
      req.removeAllListeners('data')
      req.resume()
    })
    req.once('end', () => resolve(tooLarge ? null : Buffer.concat(chunks)))
    req.once('error', reject)
  })
}

// `localViewer`: a relay bound to the loopback for one person's own machine (agent/local.mjs) has no Caddy in front to set
// X-Office-User; it trusts its viewers, and refuses to start that way on any other address.
export async function startRelay({ port = 7311, host = '127.0.0.1', tokens = {}, dir = null, localViewer = false } = {}) {
  if (localViewer && host !== '127.0.0.1') throw new Error('localViewer needs host 127.0.0.1')
  const store = createStore({ dir })
  const clients = new Set()
  const drawings = new Map()
  const nonce = randomBytes(18).toString('base64url')
  const headers = {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}' 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'`,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  }

  const draw = (view, selection) => {
    const merged = mergeFacts(store.list(view === 'timelapse' ? lapseView(selection.range) : view), { now: Date.now() })
    const scale = selection.zoom ? { scale: ZOOM_SCALE } : {}
    if (view === 'timelapse') {
      const svg = renderTimelapse(merged, { width: selection.width, card: true, ...scale })
      return { merged, svg, text: toPlain(renderTimelapseText(merged, { width: 100 })) }
    }
    const drawn = view === 'live' ? 'all' : view
    // No onBeat: it steps every animation onto a shared beat to spare the desktop pane's CPU, which makes walks hop. A page
    // people look at gets the smooth animations instead (Chromium then repaints every frame: ~9% of a core while visible).
    const svg = renderSvg(merged, { view: drawn, width: selection.width, card: true, liveClock: true, ...(selection.quiet ? { quiet: true } : {}), ...scale })
    return { merged, svg, text: toPlain(renderOffice(merged, { view: drawn, width: 100 })) }
  }

  /** The drawing of a selection, with the previous one handed back untouched when it is the same, so a page does not
   *  reload its image (and restart its walkers) for nothing. */
  const snapshot = (selection) => {
    const key = JSON.stringify(selection)
    const { merged, svg, text } = draw(selection.view, selection)
    const kept = drawings.get(key)
    if (kept && kept.svg === svg) return kept.payload
    const status = renderStatus(merged, { width: 120 })
    const payload = {
      revision: randomBytes(12).toString('base64url'),
      svg,
      text,
      label: merged.range?.label ?? 'The Office',
      status,
      alt: `The Office, merged from ${merged.accounts.length} account${merged.accounts.length === 1 ? '' : 's'}. Right now: ${status}`,
      generatedAt: merged.generated_at,
      today: merged.now.local_date,
    }
    drawings.set(key, { svg, payload })
    return payload
  }

  const broadcast = (event, data) => {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const res of clients) if (!res.destroyed) res.write(frame)
  }

  const server = http.createServer(async (req, res) => {
    const send = (code, body, type = 'text/plain; charset=utf-8') => {
      if (res.destroyed) return
      res.writeHead(code, { ...headers, 'Content-Type': type })
      res.end(req.method === 'HEAD' ? undefined : body)
    }
    try {
      const url = new URL(req.url, 'http://relay')
      if (url.pathname === '/health') return send(200, 'ok')

      const ingest = /^\/ingest\/([\w-]+)$/.exec(url.pathname)
      if (ingest) {
        if (req.method !== 'POST') return send(405, 'Method not allowed')
        const view = ingest[1]
        if (!VIEW_SET.has(view)) return send(404, 'Unknown view')
        const label = labelOf(req.headers.authorization, tokens)
        if (!label) return send(401, 'Unauthorized')
        const body = await readBody(req, MAX_BODY)
        if (body === null) return send(413, 'Body is too large')
        let facts
        try {
          const raw = req.headers['content-encoding'] === 'gzip' ? gunzipSync(body) : body
          facts = JSON.parse(raw.toString('utf8'))
        } catch { return send(400, 'Invalid JSON') }
        if (!facts || typeof facts !== 'object') return send(400, 'Invalid facts')
        // A different spec means a different shape: keep the previous facts rather than draw a half-understood office.
        if (facts.spec !== SPEC) return send(409, `This relay speaks ${SPEC}`)
        store.put(label, view, redact(facts))
        drawings.clear()
        broadcast('change', { label, view })
        return send(202, 'Accepted')
      }

      // Everything below is the viewer's: Caddy has already checked the password and set this header.
      if (!localViewer && !req.headers['x-office-user']) return send(401, 'Unauthorized')
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'Method not allowed')

      const lib = /^\/lib\/([\w-]+\.mjs)$/.exec(url.pathname)?.[1]
      if (lib) {
        if (!PAGE_MODULES.has(lib)) return send(404, 'Not found')
        return send(200, fs.readFileSync(path.join(LIB, lib), 'utf8'), 'text/javascript; charset=utf-8')
      }

      let selection
      try { selection = selectionOf(url.searchParams) } catch (error) { return send(400, error.message) }

      if (url.pathname === '/') return send(200, dashboardPage({ nonce, selection, restore: !url.searchParams.has('view'), stoppable: false, today: clockOf().local_date }), 'text/html; charset=utf-8')
      if (url.pathname === '/waiting') return send(200, renderLoading(selection.view === 'timelapse' ? 'week' : selection.view, { width: selection.width, card: true }), 'image/svg+xml; charset=utf-8')
      if (url.pathname === '/snapshot') {
        try { return send(200, JSON.stringify(snapshot(selection)), 'application/json; charset=utf-8') } catch { return send(503, 'Could not draw the office') }
      }
      if (url.pathname === '/events') {
        res.writeHead(200, { ...headers, 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no' })
        res.write('retry: 3000\n\n')
        clients.add(res)
        req.socket.setTimeout(0)
        const ping = setInterval(() => { if (!res.destroyed) res.write(': ping\n\n') }, PING_MS)
        ping.unref?.()
        const leave = () => { clearInterval(ping); clients.delete(res) }
        req.once('close', leave)
        res.once('close', leave)
        return
      }
      return send(404, 'Not found')
    } catch { send(400, 'Invalid request') }
  })

  server.requestTimeout = 60_000
  server.headersTimeout = 10_000
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => { server.off('error', reject); resolve() })
  })
  const url = `http://${host}:${server.address().port}`

  const close = () => new Promise((resolve, reject) => {
    broadcast('bye', {})
    for (const res of clients) res.end()
    clients.clear()
    server.close((error) => (error ? reject(error) : resolve()))
    server.closeIdleConnections()
    setTimeout(() => server.closeAllConnections(), 300).unref()
  })

  return { url, close, store }
}

/** One `token label` per line, `#` comments allowed: revoking a person is deleting their line and restarting. */
export function tokensFrom(file) {
  const tokens = {}
  if (!file || !fs.existsSync(file)) return tokens
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const [token, label] = trimmed.split(/\s+/)
    if (token && label) tokens[token] = label
  }
  return tokens
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 7311)
  const dir = process.env.CACHE_DIR ?? '/data'
  // HOST=0.0.0.0 in the image: a container's loopback is unreachable from Caddy or from a published port.
  startRelay({ port, host: process.env.HOST ?? '127.0.0.1', tokens: tokensFrom(process.env.TOKENS_FILE), dir })
    .then(({ url }) => console.log(`connected-office relay on ${url}, cache ${dir}`))
    .catch((error) => { console.error(error.message); process.exit(1) })
}
