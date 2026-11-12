// Minimal, deterministic facts builders: the shapes the collector prints, small enough to read in a failing test.
export const DAY = '2026-11-09'
export const NOW = '2026-11-09T12:00:00.000Z'

const EMPTY_NUMBERS = {
  sessions: 0, subagents: 0, workflows: 0, desk_minutes: 0, agent_minutes: 0,
  prompts: 0, tool_calls: 0, files_edited: 0, commits: 0, additions: 0, deletions: 0,
}

export function factsOf({ desks = [], projects = [], accounts = [], perDay = {}, now = NOW } = {}) {
  return {
    spec: 'theoffice/1',
    generated_at: now,
    range: { kind: 'week', from: '2026-11-03T00:00:00.000Z', to: now, days: [DAY], label: 'Mon 9 Nov' },
    now: { iso: now, local_date: DAY, local_time: '13:00', hour: 13, weekday: 'Mon', is_night: false },
    live: { counts: {}, desks, recently_left: [] },
    projects,
    projects_more: 0,
    contractors: [],
    accounts,
    totals: { ...EMPTY_NUMBERS, activity: {}, intern_types: {}, models: {}, agents: {} },
    per_day: perDay,
    per_hour: new Array(24).fill(0),
  }
}

let seat = 0

export function deskOf(project, extra = {}) {
  seat += 1
  return {
    id: `desk-${seat}`,
    project,
    title: 'a session',
    status: 'busy',
    state: 'working',
    activity: { kind: 'coding', tool: 'Edit', label: 'file.js', since: '2026-11-09T11:00:00.000Z' },
    started_at: '2026-11-09T10:00:00.000Z',
    last_seen: '2026-11-09T11:59:00.000Z',
    interns: [],
    meetings: [],
    ...extra,
  }
}

export function projectOf(name, { agentMinutes = 0, perDay = {} } = {}) {
  return {
    name,
    path: `/home/alice/${name}`,
    ...EMPTY_NUMBERS,
    agent_minutes: agentMinutes,
    activity: {},
    intern_types: {},
    models: {},
    per_day: perDay,
    per_hour: new Array(24).fill(0),
    titles: [],
    top_commits: [],
    worktrees: [],
  }
}
