// A person who stopped pushing keeps an older grid; it must not blank the history of the people who still push.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeFacts } from '../relay/merge.mjs'

const entry = (label, at, days, desks) => ({ label, at, facts: { timeline: { kind: 'week', slot_min: 60, per_day: 24, days, desks: desks.map((id) => ({ id, runs: [[0, 1]] })) } } })
const now = Date.UTC(2026, 10, 12, 10)

test('timeline: entries on an older grid are left out, the others still merge', () => {
  const merged = mergeFacts([
    entry('bob', now - 2 * 86_400_000, ['2026-11-09', '2026-11-10'], ['b1', 'b2']),
    entry('alice', now - 60_000, ['2026-11-11', '2026-11-12'], ['s1']),
    entry('alice-windows', now - 1000, ['2026-11-11', '2026-11-12'], []),
  ], { now })
  assert.deepEqual(merged.timeline.desks.map((d) => d.id), ['s1'])
  assert.equal(merged.notes.timeline_mismatch, true)
})

test('timeline: one grid merges every desk, no mismatch', () => {
  const days = ['2026-11-12']
  const merged = mergeFacts([entry('a', now - 5, days, ['a1']), entry('b', now, days, ['b1'])], { now })
  assert.equal(merged.timeline.desks.length, 2)
  assert.equal(merged.notes.timeline_mismatch, false)
})
