// One relay per scenario, on a random port, with its own cache directory: steps talk to it over HTTP exactly as a
// laptop and a browser do.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startRelay } from '../../relay/server.mjs'

export const PROXY_HEADER = { 'X-Office-User': 'caddy' }

export async function startTestRelay({ tokens = {}, dir } = {}) {
  const cacheDir = dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'connected-office-test-'))
  const relay = await startRelay({ port: 0, tokens, dir: cacheDir })
  return { ...relay, cacheDir, tokens }
}

/** A push, as `agent/push.mjs` sends it. */
export async function push(relay, { view = 'live', facts, token, headers = {} } = {}) {
  return fetch(`${relay.url}/ingest/${view}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: typeof facts === 'string' ? facts : JSON.stringify(facts),
  })
}

export async function closeRelay(relay) {
  await relay.close()
  fs.rmSync(relay.cacheDir, { recursive: true, force: true })
}
