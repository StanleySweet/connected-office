// Pure merge of several people's facts into the one office the relay draws. No I/O, no clock of its own: `now` comes
// in from the caller so a test can hold it still.

export const NUM_KEYS = ['sessions', 'subagents', 'workflows', 'desk_minutes', 'agent_minutes', 'prompts', 'tool_calls', 'files_edited', 'commits', 'additions', 'deletions']
const MAP_KEYS = ['activity', 'intern_types', 'models', 'agents']
const DAY_KEYS = ['minutes', 'desk_minutes', 'sessions', 'subagents', 'workflows', 'prompts', 'commits']

/** A person who has not pushed for this long leaves the live floor; their history stays. */
export const STALE_MS = 10 * 60e3
export const SPEC = 'theoffice/1'

/** The office's timezone. Both laptops and the NAS are in it; a mismatch would move every day boundary. */
export const TZ = process.env.OFFICE_TZ ?? 'Europe/Paris'
// Built once: a formatter is expensive to construct and the merge runs on every request.
const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const TIME_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const WEEKDAY_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short' })

/** The relay's own clock, in the office's timezone, as `facts.now`. */
export function clockOf(now = Date.now()) {
  const at = new Date(now)
  const date = DAY_FMT.format(at)
  const time = TIME_FMT.format(at)
  const hour = Number(time.slice(0, 2))
  return {
    iso: at.toISOString(),
    local_date: date,
    local_time: time,
    hour,
    weekday: WEEKDAY_FMT.format(at),
    is_night: hour >= 20 || hour < 7,
  }
}

/**
 * One room per repository: the same repo may be cloned under a different folder name on each machine. Keys are
 * lowercased folder names, values the shared name; anything absent keeps its own name. Empty unless the PROJECT_ALIASES
 * environment variable holds a JSON object, e.g. {"my-repo-clone":"my-repo"}.
 */
export const PROJECT_ALIASES = JSON.parse(process.env.PROJECT_ALIASES || '{}')
const canon = (name) => (typeof name === 'string' ? PROJECT_ALIASES[name.toLowerCase()] ?? name : name)

/** A copy of `v` with every `project` field, and the `name` of every `projects[]` entry, under its canonical name. */
function canonical(v, key) {
  if (Array.isArray(v)) return v.map((x) => canonical(x, key === 'projects' ? 'projects[]' : undefined))
  if (!v || typeof v !== 'object') return key === 'project' ? canon(v) : v
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, key === 'projects[]' && k === 'name' ? canon(x) : canonical(x, k)]))
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const addInto = (dst, src) => { for (const [k, v] of Object.entries(src ?? {})) dst[k] = (dst[k] ?? 0) + num(v) }
const zeros = () => Object.fromEntries(NUM_KEYS.map((k) => [k, 0]))

function emptyProject(name) {
  return { name, ...zeros(), activity: {}, intern_types: {}, models: {}, agents: {}, per_day: {}, per_hour: new Array(24).fill(0), titles: [], top_commits: [], worktrees: [] }
}

function mergeProjects(entries) {
  const byName = new Map()
  for (const { facts } of entries) {
    for (const p of facts.projects ?? []) {
      const name = p.name ?? 'unknown'
      let out = byName.get(name)
      if (!out) byName.set(name, (out = emptyProject(name)))
      for (const k of NUM_KEYS) out[k] += num(p[k])
      for (const k of MAP_KEYS) addInto(out[k], p[k])
      for (const [day, row] of Object.entries(p.per_day ?? {})) {
        out.per_day[day] ??= Object.fromEntries(DAY_KEYS.map((k) => [k, 0]))
        for (const [k, v] of Object.entries(row ?? {})) out.per_day[day][k] = (out.per_day[day][k] ?? 0) + num(v)
      }
      for (const [h, v] of (p.per_hour ?? []).entries()) if (h < 24) out.per_hour[h] += num(v)
      out.titles.push(...(p.titles ?? []))
      out.top_commits.push(...(p.top_commits ?? []))
      out.worktrees.push(...(p.worktrees ?? []))
    }
  }
  return [...byName.values()]
}

function mergeTotals(entries) {
  const totals = { projects: 0, ...zeros(), activity: {}, intern_types: {}, models: {}, agents: {} }
  // Summed, not recomputed from the merged projects: `projects[]` stops at 40 and `projects_more` holds the rest, so a
  // recomputation undercounts a busy month. The pushes' own totals are exact.
  for (const { facts } of entries) {
    const t = facts.totals ?? {}
    totals.projects += num(t.projects)
    for (const k of NUM_KEYS) totals[k] += num(t[k])
    for (const k of MAP_KEYS) addInto(totals[k], t[k])
  }
  return totals
}

function mergeDays(entries) {
  const perDay = {}
  for (const { facts } of entries) {
    for (const [day, row] of Object.entries(facts.per_day ?? {})) {
      perDay[day] ??= Object.fromEntries(DAY_KEYS.map((k) => [k, 0]))
      for (const [k, v] of Object.entries(row ?? {})) perDay[day][k] = (perDay[day][k] ?? 0) + num(v)
    }
  }
  return perDay
}

function mergeHours(entries) {
  const perHour = new Array(24).fill(0)
  for (const { facts } of entries) for (const [h, v] of (facts.per_hour ?? []).entries()) if (h < 24) perHour[h] += num(v)
  return perHour
}

const stamp = (desk, label) => ({ ...desk, account: !desk.account || desk.account === label ? label : `${label}@${desk.account}` })

function mergeAccounts(entries) {
  const rows = []
  for (const { label, facts } of entries) {
    const own = facts.accounts ?? []
    if (own.length) {
      for (const a of own) rows.push({ agent: a.agent ?? 'claude', label: a.label ? `${label}@${a.label}` : label, minutes: num(a.minutes), sessions: num(a.sessions), live: num(a.live) })
      continue
    }
    const t = facts.totals ?? {}
    rows.push({ agent: 'claude', label, minutes: num(t.agent_minutes), sessions: num(t.sessions), live: (facts.live?.desks ?? []).length })
  }
  return rows
}

const timelineKey = (t) => `${t.kind ?? 'week'}|${t.slot_min ?? 60}|${(t.days ?? []).join(',')}`

/**
 * Two timelines merge only when they describe the same grid (`kind`, `slot_min`, `days`): slot indexes are then the
 * same slots. Entries on another grid than the freshest one are left out, and the mismatch is reported to the caller.
 */
export function mergeTimeline(entries, newest) {
  const all = entries.filter((e) => e.facts.timeline)
  if (!all.length) return { timeline: undefined, mismatch: false }
  // The freshest push sets the grid; a person who stopped pushing (an older week, month or day) is left out rather than
  // blanking everyone else's history.
  const key = timelineKey((all.includes(newest) ? newest : all[0]).facts.timeline)
  const withTimeline = all.filter((e) => timelineKey(e.facts.timeline) === key)
  const mismatch = withTimeline.length !== all.length
  const first = withTimeline[0].facts.timeline
  const days = first.days ?? []
  return {
    mismatch,
    timeline: {
      ...first,
      slots: days.length * Math.round(1440 / Math.max(1, num(first.slot_min) || 60)),
      start: 0,
      desks: withTimeline.flatMap((e) => e.facts.timeline.desks ?? []),
      meetings: withTimeline.flatMap((e) => e.facts.timeline.meetings ?? []),
      commits: withTimeline.flatMap((e) => e.facts.timeline.commits ?? []),
    },
  }
}

/**
 * The merged office of every entry, `[{ label, at, facts }]`. Desks of a stale person leave the live floor; everything
 * counted still includes them. `range` and the timeline come from the freshest entry.
 */
export function mergeFacts(entries, { now = Date.now(), staleMs = STALE_MS } = {}) {
  const live = entries.filter((e) => e.facts && typeof e.facts === 'object').map((e) => ({ ...e, facts: canonical(e.facts) }))
  const newest = live.reduce((a, b) => (!a || b.at > a.at ? b : a), null)
  const { timeline, mismatch } = mergeTimeline(live, newest)
  const desks = live
    .filter((e) => now - e.at <= staleMs)
    .flatMap((e) => (e.facts.live?.desks ?? []).map((d) => stamp(d, e.label)))
  const recentlyLeft = live
    .flatMap((e) => e.facts.live?.recently_left ?? [])
    .sort((a, b) => String(b.left_at ?? '').localeCompare(String(a.left_at ?? '')))
    .slice(0, 12)
  return {
    spec: SPEC,
    generated_at: new Date(now).toISOString(),
    range: newest?.facts.range ?? { kind: 'week', from: new Date(now).toISOString(), to: new Date(now).toISOString(), days: [clockOf(now).local_date] },
    now: clockOf(now),
    live: { counts: {}, desks, recently_left: recentlyLeft },
    projects: mergeProjects(live),
    projects_more: live.reduce((n, e) => n + num(e.facts.projects_more), 0),
    contractors: live.flatMap((e) => e.facts.contractors ?? []),
    accounts: mergeAccounts(live),
    totals: mergeTotals(live),
    per_day: mergeDays(live),
    per_hour: mergeHours(live),
    ...(timeline ? { timeline } : {}),
    sources: [],
    notes: { stale: live.filter((e) => now - e.at > staleMs).map((e) => e.label), timeline_mismatch: mismatch },
  }
}
