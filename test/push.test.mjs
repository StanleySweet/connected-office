// The agent skips a push when nothing changed, and pushes again once the last one is RESEND_MS old.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RESEND_MS, pushOnce, collectArgs } from '../agent/push.mjs'
import { lapseView } from '../relay/server.mjs'
import { VIEWS } from '../relay/store.mjs'

const facts = (iso, sessions) => ({ spec: 'x', generated_at: iso, now: { iso }, range: { kind: 'week', to: iso }, sources: { ms: { total: iso.length } }, totals: { sessions } })

test('an unchanged view is skipped, a changed or stale one is pushed', async () => {
  const calls = []
  const fetchImpl = async (url) => { calls.push(url); return { ok: true, status: 202 } }
  const sent = {}
  const push = (f, nowMs) => pushOnce({ relay: 'https://r', token: 't', view: 'week', facts: f, sent, nowMs, fetchImpl })
  assert.equal(await push(facts('10:00', 1), 0), 202)
  assert.equal(await push(facts('10:01', 1), 60e3), 'unchanged', 'only the clock moved')
  assert.equal(await push(facts('10:02', 2), 120e3), 202, 'a session started')
  assert.equal(await push(facts('10:20', 2), 120e3 + RESEND_MS), 202, 'resent after RESEND_MS')
  assert.equal(calls.length, 3)
})

test('a local relay trusts its viewers on the loopback only', async () => {
  const { startRelay } = await import('../relay/server.mjs')
  const r = await startRelay({ port: 0, localViewer: true })
  try { assert.equal((await fetch(`${r.url}/`)).status, 200, 'page without X-Office-User') } finally { await r.close() }
  await assert.rejects(startRelay({ port: 0, host: '0.0.0.0', localViewer: true }), /127\.0\.0\.1/)
})

test('each timelapse range is collected, stored and drawn as its own view', () => {
  for (const range of ['yesterday', 'week', 'month']) {
    const view = lapseView(range)
    assert.ok(VIEWS.includes(view), `${view} is not a stored view`)
    assert.deepEqual(collectArgs(view), range === 'week' ? ['timelapse'] : ['timelapse', range])
  }
})

test('session titles are redacted by default and kept only when asked (the local relay asks)', async () => {
  const { gunzipSync } = await import('node:zlib')
  const withDesk = { ...facts('10:00', 1), live: { desks: [{ id: 'a', agent: 'omp', project: 'p', title: 'Fix the parser' }] } }
  const body = async (keepTitles) => {
    let sent
    await pushOnce({ relay: 'https://r', token: 't', view: 'live', facts: withDesk, keepTitles, sent: {}, fetchImpl: async (_u, o) => { sent = JSON.parse(gunzipSync(o.body)); return { ok: true, status: 202 } } })
    return sent.live.desks[0].title
  }
  assert.notEqual(await body(false), 'Fix the parser')
  assert.equal(await body(true), 'Fix the parser')
})
