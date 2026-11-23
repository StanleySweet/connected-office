// Vibe (Mistral Vibe CLI) sessions flow into the relay: the vendored collector reads a fake ~/.vibe (a unified
// session: meta.json + journal + active lock, mtimes set with utimes — never the real ~/.vibe), the facts carry
// agent 'vibe', and the relay's drawings show Vex. THEOFFICE_SKIP_CWD_CHECK: fake sessions have no live process.
process.env.THEOFFICE_SKIP_CWD_CHECK = '1'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { collect } from '../vendor/theoffice-agents/plugin/lib/collect.mjs'
import { renderOffice, toPlain } from '../vendor/theoffice-agents/plugin/lib/ascii.mjs'
import { renderSvg } from '../vendor/theoffice-agents/plugin/lib/svg.mjs'
import { CAST, agentId } from '../vendor/theoffice-agents/plugin/lib/cast.mjs'
import { startTestRelay, push, closeRelay, PROXY_HEADER } from './helpers/relay.mjs'
import { factsOf, deskOf } from './helpers/facts.mjs'

const NOW = Date.parse('2026-11-11T14:05:00.000Z')
const SID = '71be0000-0000-4000-8000-0000000000be'
const ago = (ms) => NOW - ms

/** A fake $HOME holding one live Vibe unified session in `work/app`. */
function fakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-home-'))
  const app = path.join(home, 'work', 'app')
  fs.mkdirSync(app, { recursive: true })
  const dir = path.join(home, '.vibe', 'logs', 'session', 'unified', SID)
  fs.mkdirSync(path.join(dir, 'journal'), { recursive: true })
  const delta = (seq, entry, op = 'append_entry') => ({ type: 'projection_delta', sequence: seq, payload: { delta: [{ op, entry }] } })
  const tool = (id, at, toolName, input, status) => delta(0, {
    type: 'effect', id: `effect-${id}`, toolCallId: `call-${id}`, createdAt: at, updatedAt: at,
    detail: { kind: 'tool', toolName, input }, state: { status },
  }, status === 'running' ? 'append_entry' : 'replace_entry')
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
    session_id: SID,
    start_time: new Date(ago(900e3)).toISOString(),
    environment: { working_directory: app },
    title: 'Vibe at work',
    config: { active_model: 'mistral-large-4-0' },
  }))
  fs.writeFileSync(path.join(dir, 'journal', '0000000000000001.jsonl'), [
    delta(1, { type: 'message', role: 'user', id: 'rs-1', createdAt: ago(900e3), updatedAt: ago(900e3), content: [{ type: 'text', text: 'go\nbuild it' }] }),
    tool(1, ago(880e3), 'file_system.bash', { command: 'npm run build', description: 'Build' }, 'running'),
    tool(1, ago(860e3), 'file_system.bash', { command: 'npm run build', description: 'Build' }, 'completed'),
    tool(2, ago(50e3), 'file_system.read_file', { file_path: path.join(app, 'a.js') }, 'running'),
  ].map((o) => `${JSON.stringify(o)}\n`).join(''))
  // the active lock a running session holds
  fs.mkdirSync(path.join(home, '.vibe', 'logs', 'session', 'active'), { recursive: true })
  fs.writeFileSync(path.join(home, '.vibe', 'logs', 'session', 'active', `${SID}.lock`), '')
  // the journal was written 30 s ago: the session is live
  const j = path.join(dir, 'journal', '0000000000000001.jsonl')
  fs.utimesSync(j, ago(30e3) / 1000, ago(30e3) / 1000)
  return home
}

test('a live Vibe session is collected as agent vibe: desk, activity, project, title, model', async () => {
  const facts = await collect({ view: 'live', home: fakeHome(), cacheDir: null, now: NOW, novi: false, git: false })
  assert.equal(facts.live.desks.length, 1)
  const d = facts.live.desks[0]
  assert.equal(d.agent, 'vibe')
  assert.equal(d.state, 'working')
  assert.equal(d.activity.kind, 'reading')
  assert.equal(d.activity.tool, 'Read')
  assert.equal(d.activity.label, 'a.js')
  assert.equal(d.project, 'app')
  assert.equal(d.title, 'Vibe at work')
  assert.equal(d.model, 'mistral-large-4-0')
  assert.ok(facts.accounts.some((a) => a.agent === 'vibe'))
  assert.ok(facts.totals.agents.vibe > 0)
})

test('a Vibe desk is Vex, not Clawd: text head, pixel art figure', async () => {
  assert.equal(agentId('vibe'), 'vibe')
  assert.equal(CAST.vibe.who, 'Vex')
  const facts = await collect({ view: 'live', home: fakeHome(), cacheDir: null, now: NOW, novi: false, git: false })
  assert.match(toPlain(renderOffice(facts, { view: 'live', width: 120 })), /▐V▌/)
  const svg = renderSvg(facts, { view: 'live', width: 1100, animate: false })
  assert.match(svg, /#to-vb[A-Z0-9]/, 'Vex’s figure is drawn')
})

test('a Vibe session whose lock is gone is on the coat rack, not at a desk', async () => {
  const home = fakeHome()
  fs.rmSync(path.join(home, '.vibe', 'logs', 'session', 'active', `${SID}.lock`))
  const facts = await collect({ view: 'live', home, cacheDir: null, now: NOW, novi: false, git: false })
  assert.deepEqual(facts.live.desks, [])
  assert.deepEqual(facts.live.recently_left.map((l) => [l.agent, l.title]), [['vibe', 'Vibe at work']])
})

test('a pushed Vibe desk reaches the relay and is drawn as Vex', async () => {
  const relay = await startTestRelay({ tokens: { t: 'stan' } })
  try {
    const facts = factsOf({ desks: [deskOf('fallout-gn2', { agent: 'vibe', title: 'Vibe at work' })], accounts: [{ agent: 'vibe', label: null, minutes: 12, sessions: 1, live: 1 }] })
    const res = await push(relay, { token: 't', facts })
    assert.equal(res.status, 202)
    const snap = await (await fetch(`${relay.url}/snapshot`, { headers: PROXY_HEADER })).json()
    assert.match(snap.text, /▐V▌/)
    assert.match(snap.svg, /#to-vb[A-Z0-9]/)
    assert.match(snap.text, /Vibe at work|fallout-gn2/)
  } finally {
    await closeRelay(relay)
  }
})
