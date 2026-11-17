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

test('a local relay keeps session titles on arrival, a shared one drops them', async () => {
  const { startRelay } = await import('../relay/server.mjs')
  const { push } = await import('./helpers/relay.mjs')
  const { factsOf, deskOf } = await import('./helpers/facts.mjs')
  const shown = async (localViewer) => {
    const r = await startRelay({ port: 0, tokens: { t: 'stan' }, localViewer })
    try {
      await push(r, { token: 't', facts: factsOf({ desks: [deskOf('proj', { title: 'Fix the parser' })] }) })
      const snap = await (await fetch(`${r.url}/snapshot`, { headers: localViewer ? {} : { 'X-Office-User': 'caddy' } })).json()
      return snap.text.includes('Fix the parser')
    } finally { await r.close() }
  }
  assert.equal(await shown(true), true)
  assert.equal(await shown(false), false)
})

// A desk with a title and everything else a full keep-titles push would carry.
const chatty = async () => {
  const { factsOf, deskOf } = await import('./helpers/facts.mjs')
  return factsOf({ desks: [deskOf('proj', { title: 'Fix the parser', branch: 'feat/secret', project_path: '/home/alice/proj', worktree: 'wt', meetings: [{ phase: 'open', name: 'Budget talk' }] })] })
}

test('the agent sends no title by default and only titles with keep_titles "titles"', async () => {
  const { gunzipSync } = await import('node:zlib')
  const sentBy = async (keepTitles) => {
    let sent
    await pushOnce({ relay: 'https://r', token: 't', view: 'live', facts: await chatty(), keepTitles, sent: {}, fetchImpl: async (_u, o) => { sent = JSON.parse(gunzipSync(o.body)); return { ok: true, status: 202 } } })
    return sent.live.desks[0]
  }
  assert.equal('title' in await sentBy(undefined), false)
  const desk = await sentBy('titles')
  assert.equal(desk.title, 'Fix the parser')
  for (const k of ['branch', 'project_path', 'worktree']) assert.equal(k in desk, false, k)
  assert.equal('name' in desk.meetings[0], false)
})

test('a shared relay drops titles unless opted in, and then keeps only titles', async () => {
  const { startRelay } = await import('../relay/server.mjs')
  const { push } = await import('./helpers/relay.mjs')
  const stored = async (keepTitles) => {
    const r = await startRelay({ port: 0, tokens: { t: 'bob' }, keepTitles })
    try {
      await push(r, { token: 't', facts: await chatty() }) // an agent that sent everything
      return JSON.stringify(r.store.get('bob', 'live'))
    } finally { await r.close() }
  }
  const off = await stored(false)
  assert.equal(off.includes('Fix the parser'), false)
  const narrow = await stored('titles')
  assert.equal(narrow.includes('Fix the parser'), true)
  for (const secret of ['feat/secret', '/home/alice', 'Budget talk']) assert.equal(narrow.includes(secret), false, secret)
})
