// The merge is pure: these steps build facts by hand, merge them, and read the result. No relay, no disk.
import { feature, assert, assertEqual } from '../gherkin.mjs'
import { factsOf, deskOf, projectOf, DAY } from '../helpers/facts.mjs'
import { mergeFacts, PROJECT_ALIASES } from '../../relay/merge.mjs'
import { common } from './common.mjs'

const ROOM = 'connected-office'

const deskFacts = (agentMinutes) => factsOf({ desks: [deskOf(ROOM)], projects: [projectOf(ROOM, { agentMinutes })] })

feature(new URL('../../features/merge.feature', import.meta.url).pathname, {
  ...common,

  "Alice's facts hold a desk in project \"connected-office\"": (ctx) => { ctx.alice = deskFacts(0); ctx.stanAt = Date.now() },
  "Bob's facts hold a desk in project \"connected-office\"": (ctx) => { ctx.bob = deskFacts(40); ctx.bobAt = Date.now() },

  'the folder names "proj-a" and "proj-b" stand for "shared"': () => { PROJECT_ALIASES['proj-a'] = 'shared'; PROJECT_ALIASES['proj-b'] = 'shared' },
  "Alice's facts hold a desk in project \"proj-a\"": (ctx) => { ctx.alice = factsOf({ desks: [deskOf('proj-a')], projects: [projectOf('proj-a', {})] }); ctx.stanAt = Date.now() },
  "Bob's facts hold a desk in project \"proj-b\"": (ctx) => { ctx.bob = factsOf({ desks: [deskOf('proj-b')], projects: [projectOf('proj-b', {})] }); ctx.bobAt = Date.now() },
  'both desks sit in the room "shared"': (ctx) => assert(ctx.merged.live.desks.every((d) => d.project === 'shared'), 'a desk is in another room'),
  'the merged office holds only the project "shared"': (ctx) => assertEqual(ctx.merged.projects.map((p) => p.name).join(','), 'shared', 'projects'),

  'the relay merges the latest facts of both people': (ctx) => {
    const now = ctx.now ?? Date.now()
    ctx.merged = mergeFacts([
      { label: 'alice', at: ctx.stanAt ?? now, facts: ctx.alice },
      { label: 'bob', at: ctx.bobAt ?? now, facts: ctx.bob },
    ], { now })
  },

  "Alice's facts hold an account with no label": (ctx) => { ctx.alice = factsOf({ accounts: [{ agent: 'claude', label: null, minutes: 10, sessions: 1, live: 0 }] }) },
  "the relay merges Alice's facts alone": (ctx) => { ctx.merged = mergeFacts([{ label: 'alice', at: Date.now(), facts: ctx.alice }], { now: Date.now() }) },
  'an account is labelled "alice"': (ctx) => assert(ctx.merged.accounts.some((a) => a.label === 'alice'), 'no account labelled alice'),
  'no account label holds "null"': (ctx) => assert(!ctx.merged.accounts.some((a) => String(a.label).includes('null')), 'an account label holds null'),
  'the merged office holds 2 desks': (ctx) => assertEqual(ctx.merged.live.desks.length, 2, 'desks'),
  'both desks sit in the room "connected-office"': (ctx) => {
    assert(ctx.merged.live.desks.every((d) => d.project === ROOM), 'a desk is in another room')
  },

  'Alice\'s facts report 60 agent minutes for project "connected-office"': (ctx) => {
    ctx.alice = factsOf({ projects: [projectOf(ROOM, { agentMinutes: 60 })] })
    ctx.alice.totals.agent_minutes = 60
    ctx.stanAt = Date.now()
  },
  'Bob\'s facts report 40 agent minutes for project "connected-office"': (ctx) => {
    ctx.bob = factsOf({ projects: [projectOf(ROOM, { agentMinutes: 40 })] })
    ctx.bob.totals.agent_minutes = 40
    ctx.bobAt = Date.now()
  },
  'project "connected-office" reports 100 agent minutes': (ctx) => {
    const project = ctx.merged.projects.find((p) => p.name === ROOM)
    assert(project, 'project missing')
    assertEqual(project.agent_minutes, 100, 'agent minutes')
  },
  'the merged totals report 100 agent minutes': (ctx) => assertEqual(ctx.merged.totals.agent_minutes, 100, 'totals agent minutes'),

  'Alice\'s facts report 30 minutes on day "2026-11-09"': (ctx) => {
    ctx.alice = factsOf({ perDay: { [DAY]: { minutes: 30 } } })
    ctx.stanAt = Date.now()
  },
  'Bob\'s facts report 45 minutes on day "2026-11-09"': (ctx) => {
    ctx.bob = factsOf({ perDay: { [DAY]: { minutes: 45 } } })
    ctx.bobAt = Date.now()
  },
  'the merged day "2026-11-09" reports 75 minutes': (ctx) => assertEqual(ctx.merged.per_day[DAY].minutes, 75, 'day minutes'),

  "Bob's facts were pushed 30 minutes ago": (ctx) => { ctx.bobAt = Date.now() - 30 * 60e3 },
  'the merged office holds only Alice\'s desks': (ctx) => {
    assertEqual(ctx.merged.live.desks.length, 1, 'desks')
    assertEqual(ctx.merged.live.desks[0].account, 'alice', 'account')
  },
  'project "connected-office" still reports Bob\'s agent minutes': (ctx) => {
    const project = ctx.merged.projects.find((p) => p.name === ROOM)
    assert(project, 'project missing')
    assertEqual(project.agent_minutes, 40, 'agent minutes')
  },
})
