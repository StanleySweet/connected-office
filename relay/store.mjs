// The last push of each person, per view: kept in memory and mirrored to one small JSON file per person and view, so a
// restart of the relay does not empty the office. Nothing here reads a transcript; the facts were already redacted.
import fs from 'node:fs'
import path from 'node:path'

// `timelapse` is the week's replay; the other ranges are pushed as views of their own (lapseView).
export const VIEWS = ['live', 'today', 'week', 'month', 'work', 'timelapse', 'timelapse-yesterday', 'timelapse-month']

const fileOf = (label, view) => `${String(label).replace(/[^\w.-]/g, '_')}__${view}.json`

export function createStore({ dir }) {
  const rows = new Map()
  const key = (label, view) => `${label}\u0000${view}`

  if (dir) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue
      try {
        const saved = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
        if (saved?.label && VIEWS.includes(saved.view) && saved.facts) rows.set(key(saved.label, saved.view), saved)
      } catch { /* a torn file is a lost push, not a broken relay */ }
    }
  }

  return {
    put(label, view, facts, at = Date.now()) {
      const row = { label, view, at, facts }
      rows.set(key(label, view), row)
      if (!dir) return row
      const target = path.join(dir, fileOf(label, view))
      const temporary = `${target}.${process.pid}.tmp`
      fs.writeFileSync(temporary, JSON.stringify(row), { mode: 0o600 })
      fs.renameSync(temporary, target)
      return row
    },
    get: (label, view) => rows.get(key(label, view)) ?? null,
    /** Every push this person has made, all views: what a test counts to prove a push replaced the previous one. */
    count: (label) => [...rows.values()].filter((r) => r.label === label).length,
    /** Every person's latest push for one view, as the merge wants it. */
    list: (view) => [...rows.values()].filter((r) => r.view === view),
  }
}
