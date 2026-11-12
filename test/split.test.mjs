// The connected-office patch of the forked collector (StanleySweet/theoffice-agents): a session's time split across the repos of its cwds.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scaleBucket, splitShares } from '../vendor/theoffice-agents/plugin/lib/collect.mjs'

// Two repos, a subfolder of the first rolls up to it; the resolver maps a cwd to its repo.
const REPOS = { '/w/app': '/w/app', '/w/app/_scripts': '/w/app', '/w/app/api': '/w/app/api' }
const resolver = { resolve: (cwd) => ({ path: REPOS[cwd], name: REPOS[cwd].split('/').pop() }) }
const main = { path: '/w/app' }

test('a session splits by the time spent in each repo, per day', () => {
  const cm = { '/w/app': { d1: 30 }, '/w/app/_scripts': { d1: 10 }, '/w/app/api': { d1: 60, d2: 50 } }
  const s = splitShares(cm, ['d1', 'd2'], resolver, main)
  assert.equal(s.main.d1, 0.4)
  assert.equal(s.main.d2, 0)
  assert.deepEqual(s.others.get('/w/app/api').f, { d1: 0.6, d2: 1 })
})

test('a session cached without per-cwd times stays whole on its project', () => {
  const s = splitShares(undefined, ['d1'], resolver, main)
  assert.equal(s.others.size, 0)
  assert.equal(s.main.d1, undefined)
})

test('a scaled bucket keeps its edits only on the main project and never grows', () => {
  const b = { a: 1000, p: 10, t: 4, k: { coding: 2 }, e: ['h1'], i: 100, o: 50, h: { 9: 1000 }, q: {} }
  const half = scaleBucket(b, 0.5, false)
  assert.equal(half.a, 500)
  assert.equal(half.p, 5)
  assert.deepEqual(half.h, { 9: 500 })
  assert.deepEqual(half.e, [])
  assert.deepEqual(scaleBucket(b, 0.5, true).e, ['h1'])
  assert.equal(scaleBucket(b, 1, false), b)
})
