// collectCopilot against a fake home (copied fixtures under a temp dir, mtimes set with utimes): never the real ~/.copilot.
process.env.THEOFFICE_SKIP_CWD_CHECK = '1'   // fake sessions have no process (liveness by cwd)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectCopilot } from '../vendor/theoffice-agents/plugin/lib/collect.mjs'
import { collect } from '../vendor/theoffice-agents/plugin/lib/collect.mjs'
import { renderOffice, toPlain } from '../vendor/theoffice-agents/plugin/lib/ascii.mjs'
import { renderSvg } from '../vendor/theoffice-agents/plugin/lib/svg.mjs'
import { CAST, agentId } from '../vendor/theoffice-agents/plugin/lib/cast.mjs'

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/copilot')
const NOW = Date.parse('2026-11-11T14:05:00.000Z')
const resolver = { resolve: (p) => ({ name: path.basename(p), path: p, worktree: null }) }
const ctx = { nowMs: NOW, resolver, skipCwd: true }   // fake sessions have no process (liveness by cwd)

/** A fake home holding the fixture sessions, every file's mtime set to `mtimeMs` (a session's activity). */
function fakeHome(mtimeMs = NOW - 3600e3) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-home-'))
  fs.cpSync(FIX, path.join(home, '.copilot'), { recursive: true })
  touchAll(path.join(home, '.copilot', 'session-state'), mtimeMs)
  return home
}
function touchAll(dir, ms) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) touchAll(p, ms)
    fs.utimesSync(p, ms / 1000, ms / 1000)
  }
}
const session = (home, id) => path.join(home, '.copilot', 'session-state', id)

test('missing ~/.copilot gives no desks', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-empty-'))
  assert.deepEqual(collectCopilot(ctx, home), [])
})

test('a recent session shows, an old one is hidden', () => {
  const desks = collectCopilot(ctx, fakeHome())
  assert.deepEqual(desks.map((d) => d.id), ['recent-s'])
  const [d] = desks
  assert.equal(d.agent, 'copilot')
  assert.equal(d.pid, null)
  assert.equal(d.project, 'project-a')
  assert.equal(d.title, 'Recent Working Session')
  assert.equal(d.branch, 'main')
  assert.equal(d.state, 'idle')
  assert.equal(d.last_seen, '2026-11-11T14:00:00.000Z')
})

test('malformed or missing workspace.yaml is skipped', () => {
  const home = fakeHome()
  fs.writeFileSync(path.join(session(home, 'old-session-002'), 'workspace.yaml'), '\u0000garbage: [\nnot yaml')
  fs.rmSync(path.join(session(home, 'minimal-session-003'), 'workspace.yaml'))
  fs.mkdirSync(session(home, 'empty-dir'))
  assert.deepEqual(collectCopilot(ctx, home).map((d) => d.id), ['recent-s'])
})

test('two folders with the same session id make one desk', () => {
  const home = fakeHome()
  fs.cpSync(session(home, 'recent-session-001'), session(home, 'copy-of-recent'), { recursive: true })
  assert.equal(collectCopilot(ctx, home).length, 1)
})

test('file mtime within 15 s means thinking, else idle', () => {
  const home = fakeHome()
  const dir = session(home, 'recent-session-001')
  fs.writeFileSync(path.join(dir, 'events.jsonl'), '')   // content is never read, only the mtime
  fs.utimesSync(path.join(dir, 'events.jsonl'), (NOW - 5e3) / 1000, (NOW - 5e3) / 1000)
  const busy = collectCopilot(ctx, home)[0]
  assert.equal(busy.state, 'working')
  assert.equal(busy.status, 'busy')
  assert.equal(busy.activity.kind, 'thinking')
  fs.utimesSync(path.join(dir, 'events.jsonl'), (NOW - 60e3) / 1000, (NOW - 60e3) / 1000)
  assert.equal(collectCopilot(ctx, home)[0].state, 'idle')
})

test('a session whose files are fresh stays shown though updated_at is old', () => {
  const home = fakeHome(NOW - 2e3)
  assert.equal(collectCopilot(ctx, home).length, 3)
})

test('collect() with a home shows the desk and the office draws it', async () => {
  const home = fakeHome()
  const claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-claude-'))
  const facts = await collect({ view: 'today', home, claudeDir, cacheDir: null, now: NOW, novi: false, git: false })
  assert.deepEqual(facts.live.desks.map((d) => d.account), ['GitHub Copilot'])
  assert.match(toPlain(renderOffice(facts, { width: 100 })), /project-a/)
})

test('a Copilot desk is Copi, not Clawd: text head, pixel art figure, legend and account', async () => {
  assert.equal(agentId('copilot'), 'copilot')
  assert.equal(CAST.copilot.who, 'Copi')
  const claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-claude-'))
  const facts = await collect({ view: 'today', home: fakeHome(), claudeDir, cacheDir: null, now: NOW, novi: false, git: false })
  assert.equal(facts.live.desks[0].agent, 'copilot')
  const lines = renderOffice(facts, { view: 'live', width: 100 })
  assert.ok(lines.flat().some(([t, r]) => r === 'copilot' && t.includes('▐=▌')), 'the head, in Copi\'s role')
  assert.match(toPlain(lines), /Copi\/Copilot/)
  const svg = renderSvg(facts, { view: 'live', width: 1100, animate: false })
  assert.match(svg, /id="to-cp(?:-f-\w+|T0|T1|L|R|H|D|B|A|Z|K0|K1)"/, 'a Copi figure is drawn')
  assert.ok(svg.includes('Copi · Copilot') && svg.includes('GitHub Copilot'))
  assert.doesNotMatch(svg, /Clawd/)
})
