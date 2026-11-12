// Runs on a laptop: every so often, ask the plugin's collector for each view, redact it, and push it to the relay.
// Nothing but redacted activity facts leaves this machine. No inbound port, no daemon beyond this timer.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { excludeProjects, namesOutside, redact } from '../relay/redact.mjs'

const run = promisify(execFile)
const HERE = path.dirname(fileURLToPath(import.meta.url)) // URL.pathname gives /C:/… on Windows

/**
 * The collector: the submodule vendor/theoffice-agents (fork StanleySweet/theoffice-agents, branch `feat/connected-office-features` =
 * upstream release + patches that split a session's time across its repos). It needs no plugin install, so it runs the same on every
 * laptop. Its own cache: the plugin's cache has no per-cwd times, and sessions read from it would not be split.
 */
export function findCollector() {
  return path.join(HERE, '..', 'vendor', 'theoffice-agents', 'plugin', 'scripts', 'office.mjs')
}

const CACHE = path.join(os.homedir(), '.cache', 'connected-office')

/** The collector's words for a view: `timelapse-yesterday` is `timelapse yesterday`. */
export const collectArgs = (view) => view.split('-')

export async function collect(file, view) {
  const { stdout } = await run(process.execPath, [file, ...collectArgs(view), '--json'], { maxBuffer: 32 * 1024 * 1024, env: { ...process.env, THEOFFICE_CACHE_DIR: CACHE } })
  return JSON.parse(stdout)
}

/**
 * The facts' fingerprint without what moves on every run (the clock: `generated_at`, `now`, `range.to`; the collector's
 * own timings and cache counters: `sources`): equal when nothing happened since the last push.
 */
export function fingerprint(facts) {
  const { generated_at: _g, now: _n, sources: _s, range, ...rest } = facts ?? {}
  const { to: _t, ...stable } = range ?? {}
  return createHash('sha256').update(JSON.stringify({ ...rest, range: stable })).digest('hex')
}

/** Even unchanged, a view is pushed again after this long, so the relay's clock and "last seen" stay fresh. */
export const RESEND_MS = 15 * 60_000

/**
 * Collect, filter, redact and push one view. `sent` (per view: { hash, at }) skips a push whose facts did not change
 * since the last one, unless it is RESEND_MS old; the skip is reported as 'unchanged'.
 */
export async function pushOnce({ relay, token, view, file, exclude = [], onlyUnder = [], sent = {}, nowMs = Date.now(), fetchImpl = fetch, facts: given }) {
  const raw = given ?? await collect(file, view)
  const facts = redact(excludeProjects(raw, [...exclude, ...namesOutside(raw, onlyUnder, os.homedir())]))
  const hash = fingerprint(facts)
  const prev = sent[view]
  if (prev && prev.hash === hash && nowMs - prev.at < RESEND_MS) return 'unchanged'
  const response = await fetchImpl(`${relay.replace(/\/$/, '')}/ingest/${view}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', Authorization: `Bearer ${token}` },
    body: gzipSync(JSON.stringify(facts)),
  })
  if (!response.ok) throw new Error(`${view}: relay answered ${response.status}`)
  sent[view] = { hash, at: nowMs }
  return response.status
}

export const DEFAULT_EVERY = { live: 60, today: 60, week: 60, work: 300, month: 300, timelapse: 300, 'timelapse-yesterday': 900, 'timelapse-month': 900 }

async function main() {
  const configFile = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? path.join(HERE, 'config.json')
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
  const every = { ...DEFAULT_EVERY, ...(config.every ?? {}) }
  const file = config.collector ?? findCollector()
  if (!file) throw new Error('No theoffice plugin found under ~/.claude/plugins/cache')
  console.log(`collector ${file}`)
  const last = {}
  const sent = {}
  const once = process.argv.includes('--once')
  const tick = async () => {
    for (const [view, seconds] of Object.entries(every)) {
      if (last[view] && Date.now() - last[view] < seconds * 1000) continue
      last[view] = Date.now()
      try {
        const status = await pushOnce({ relay: config.relay, token: config.token, view, file, exclude: config.exclude, onlyUnder: config.only_under, sent })
        console.log(`${new Date().toISOString()} ${view} ${status}`)
      } catch (error) {
        // The relay keeps the last good facts; a failed push is retried at the next tick.
        console.error(`${new Date().toISOString()} ${view} failed: ${error.message}`)
      }
    }
    if (once) process.exit(0)
  }
  await tick()
  setInterval(tick, 15_000)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exit(1) })
