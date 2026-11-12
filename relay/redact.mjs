// Pure redaction, run on the laptop before every push and again on the relay when it stores a push.
//
// An allowlist, not a denylist: a text field is kept only when its path is listed below. A field added by a later
// upstream version is therefore dropped until someone reads the diff and lists it on purpose, which is the only rule
// that survives an upstream update. Numbers and booleans are always kept: a count cannot carry prose.

/** Scalar paths a drawing reads as text. Everything else that is a string is dropped. */
const ALLOW = new Set([
  'spec',
  'generated_at',
  'range.kind', 'range.from', 'range.to', 'range.days', 'range.label',
  'now.iso', 'now.local_date', 'now.local_time', 'now.hour', 'now.weekday', 'now.is_night',
  'live.desks.id', 'live.desks.project', 'live.desks.agent', 'live.desks.account', 'live.desks.model',
  'live.desks.status', 'live.desks.state', 'live.desks.idle_reason', 'live.desks.entrypoint',
  'live.desks.started_at', 'live.desks.last_seen',
  'live.desks.activity.kind', 'live.desks.activity.tool', 'live.desks.activity.since',
  'live.desks.interns.agent', 'live.desks.interns.type', 'live.desks.interns.started_at',
  'live.desks.meetings.phase',
  'live.recently_left.project', 'live.recently_left.left_at', 'live.recently_left.agent',
  'projects.name', 'projects.top_commits.time',
  'timeline.kind', 'timeline.label', 'timeline.days', 'timeline.slot_min', 'timeline.slots', 'timeline.start',
  'timeline.desks.id', 'timeline.desks.project', 'timeline.desks.agent', 'timeline.desks.account',
  'timeline.meetings.phase',
  'timeline.commits.project',
  'accounts.agent', 'accounts.label',
  'contractors.tool', 'contractors.project', 'contractors.start', 'contractors.end',
])

/** What `--keep-titles` adds back: the prose the drawing could show, for a debugging session on a trusted network. */
const TITLES = [
  'live.desks.title', 'live.desks.branch', 'live.desks.worktree', 'live.desks.project_path',
  'live.desks.interns.description', 'live.desks.meetings.name', 'live.desks.meetings.labels',
  'live.recently_left.title', 'contractors.title',
  'projects.path', 'projects.titles', 'projects.top_commits.subject', 'projects.worktrees', 'timeline.desks.title',
]

/** Never kept, even as a number: a process id names nothing the drawing needs. */
const DROP = new Set(['pid'])

function walk(value, path, allow) {
  if (typeof value === 'number' || typeof value === 'boolean') return value // also inside a list: per_hour, slots
  if (Array.isArray(value)) return value.map((v) => walk(v, path, allow)).filter((v) => v !== undefined)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, v] of Object.entries(value)) {
      if (DROP.has(key)) continue
      if (typeof v === 'number' || typeof v === 'boolean') { out[key] = v; continue }
      const kept = walk(v, path ? `${path}.${key}` : key, allow)
      if (kept !== undefined) out[key] = kept
    }
    return out
  }
  return allow.has(path) ? value : undefined
}

/** The facts with every text field the drawing does not read removed. Pure: never mutates its input. */
export function redact(facts, { keepTitles = false } = {}) {
  if (!facts || typeof facts !== 'object') return facts
  const allow = keepTitles ? new Set([...ALLOW, ...TITLES]) : ALLOW
  return walk(facts, '', allow)
}

/** Arrays whose entries belong to one project, and the field that names it. */
const PER_PROJECT = [['live', 'desks', 'project'], ['live', 'recently_left', 'project'], ['projects', null, 'name'],
  ['timeline', 'desks', 'project'], ['timeline', 'commits', 'project'], ['contractors', null, 'project']]

/** `into[k] -= from[k]` for every number both share, recursing into objects and arrays; never below 0. */
function subtract(into, from) {
  if (!into || !from || typeof into !== 'object' || typeof from !== 'object') return
  for (const k of Object.keys(into)) {
    if (typeof into[k] === 'number' && typeof from[k] === 'number') into[k] = Math.max(0, into[k] - from[k])
    else if (into[k] && typeof into[k] === 'object') subtract(into[k], from[k])
  }
}

/**
 * The facts without any trace of the listed projects (names compared without case): their entries are removed and their
 * numbers taken out of the totals, per-day and per-hour counts, account minutes and live counts. Run on the laptop
 * before the push: an excluded project never leaves the machine. Pure: never mutates its input.
 * shortcut: a project past the collector's 40-project cap (`projects_more`) has no entry, so its time stays in the
 * totals; raise the cap upstream if that matters.
 */
export function excludeProjects(facts, names = []) {
  if (!facts || typeof facts !== 'object' || !names.length) return facts
  const out = structuredClone(facts)
  const banned = new Set(names.map((n) => String(n).toLowerCase()))
  const isBanned = (name) => banned.has(String(name ?? '').toLowerCase())
  for (const p of (out.projects ?? []).filter((e) => isBanned(e?.name))) {
    if (out.totals) {
      subtract(out.totals, p)
      if (typeof out.totals.projects === 'number') out.totals.projects = Math.max(0, out.totals.projects - 1)
    }
    subtract(out.per_day, p.per_day)
    subtract(out.per_hour, p.per_hour)
    for (const [agent, minutes] of Object.entries(p.agents ?? {})) {
      const accounts = (out.accounts ?? []).filter((a) => a.agent === agent)
      if (accounts.length === 1) subtract(accounts[0], { minutes }) // several accounts per agent: no split known, left as is
    }
  }
  const counts = out.live?.counts
  for (const d of (out.live?.desks ?? []).filter((e) => isBanned(e?.project))) {
    if (!counts) break
    subtract(counts, { desks: 1, [d.status]: 1, interns: d.interns?.length ?? 0, meetings: d.meetings?.length ?? 0 })
  }
  for (const [top, sub, field] of PER_PROJECT) {
    const parent = sub ? out[top] : out
    const key = sub ?? top
    if (Array.isArray(parent?.[key])) parent[key] = parent[key].filter((e) => !isBanned(e?.[field]))
  }
  return out
}

/**
 * Names of the projects (and live desks) whose folder is not under one of `prefixes` (`~` is the home directory):
 * what `only_under` adds to `exclude`, so a new project outside them is hidden without anyone listing it.
 * A project with no path is kept: there is nothing to judge it by.
 */
export function namesOutside(facts, prefixes = [], home = '') {
  if (!prefixes.length) return []
  // one form for both systems: `/` separators, and a Windows drive's path compared whatever its case
  const norm = (p) => { const s = String(p).replace(/\\/g, '/').replace(/\/+$/, ''); return /^[a-z]:/i.test(s) ? s.toLowerCase() : s }
  const roots = prefixes.map((p) => norm(p.replace(/^~(?=[\\/]|$)/, home)))
  const inside = (dir) => { const d = norm(dir); return roots.some((r) => d === r || d.startsWith(`${r}/`)) }
  const out = new Set()
  for (const p of facts?.projects ?? []) if (p?.path && !inside(p.path)) out.add(p.name)
  for (const d of facts?.live?.desks ?? []) if (d?.project_path && !inside(d.project_path)) out.add(d.project)
  return [...out]
}
