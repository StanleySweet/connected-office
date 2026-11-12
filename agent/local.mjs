// This machine's whole office, live and unfiltered, for its owner only: a relay on 127.0.0.1 (no Caddy, no login, no
// exclude or only_under) fed by this machine's collector, with the same smooth page as the shared one. Nothing leaves
// the machine. Usage: node agent/local.mjs [port]   (default 7320; page at http://127.0.0.1:<port>/)
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { startRelay } from '../relay/server.mjs'
import { DEFAULT_EVERY, findCollector, pushOnce } from './push.mjs'

const port = Number(process.argv[2] ?? 7320)
const token = randomBytes(24).toString('base64url') // lives in this process only
const relay = await startRelay({ port, tokens: { [token]: os.userInfo().username }, dir: path.join(os.homedir(), '.cache', 'connected-office', 'local-relay'), localViewer: true })
const file = findCollector()
console.log(`local office on ${relay.url}/ (collector ${file})`)
const last = {}
const sent = {}
const tick = async () => {
  for (const [view, seconds] of Object.entries(DEFAULT_EVERY)) {
    if (last[view] && Date.now() - last[view] < seconds * 1000) continue
    last[view] = Date.now()
    try { await pushOnce({ relay: relay.url, token, view, file, sent }) } catch (error) { console.error(`${new Date().toISOString()} ${view} failed: ${error.message}`) }
  }
}
await tick()
setInterval(tick, 15_000)
