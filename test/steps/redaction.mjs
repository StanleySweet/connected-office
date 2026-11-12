// Redaction is the privacy core: these steps push private text through the redactor and prove it does not come out.
import { feature, assert, assertEqual } from '../gherkin.mjs'
import { factsOf, deskOf, projectOf } from '../helpers/facts.mjs'
import { excludeProjects, namesOutside, redact } from '../../relay/redact.mjs'

const ROOM = 'connected-office'

feature(new URL('../../features/redaction.feature', import.meta.url).pathname, {
  'facts with a desk titled "Client contract review"': (ctx) => {
    ctx.facts = factsOf({ desks: [deskOf(ROOM, { title: 'Client contract review' })] })
  },
  'the agent redacts them': (ctx) => { ctx.redacted = redact(ctx.facts) },
  'facts with a specialist intern, an activity since 11:00 and a commit at 10:30': (ctx) => {
    ctx.facts = factsOf({
      desks: [deskOf(ROOM, { interns: [{ agent: 'claude', type: 'mister-handy', description: 'secret task' }] })],
      projects: [{ ...projectOf(ROOM), top_commits: [{ subject: 'private', time: '2026-11-09T10:30:00.000Z' }] }],
    })
  },
  'the intern is still a specialist, the activity still starts at 11:00 and the commit still has its time': (ctx) => {
    const desk = ctx.redacted.live.desks[0]
    assertEqual(desk.interns[0].type, 'mister-handy', 'intern type')
    assert(!('description' in desk.interns[0]), 'an intern description survived')
    assertEqual(desk.activity.since, '2026-11-09T11:00:00.000Z', 'activity since')
    assertEqual(ctx.redacted.projects[0].top_commits[0].time, '2026-11-09T10:30:00.000Z', 'commit time')
  },
  'facts where hour 8 counts 20 agent minutes': (ctx) => {
    ctx.facts = factsOf()
    ctx.facts.per_hour[8] = 20
  },
  'hour 8 still counts 20 agent minutes': (ctx) => assertEqual(ctx.redacted.per_hour[8], 20, 'minutes of hour 8'),
  'the agent redacts them keeping titles': (ctx) => { ctx.redacted = redact(ctx.facts, { keepTitles: true }) },

  'no desk carries a title': (ctx) => assert(!ctx.redacted.live.desks.some((d) => 'title' in d), 'a title survived'),
  'the desk still names its project': (ctx) => assertEqual(ctx.redacted.live.desks[0].project, ROOM, 'project'),
  'the desk carries the title "Client contract review"': (ctx) => assertEqual(ctx.redacted.live.desks[0].title, 'Client contract review', 'title'),

  'facts with a desk whose activity label is "secret-token.txt"': (ctx) => {
    ctx.facts = factsOf({ desks: [deskOf(ROOM, { activity: { kind: 'coding', tool: 'Read', label: 'secret-token.txt' } })] })
  },
  'no desk carries an activity label': (ctx) => assert(!('label' in ctx.redacted.live.desks[0].activity), 'a label survived'),

  'facts with a project path "/Users/alice/Dev/private"': (ctx) => {
    ctx.facts = factsOf({
      desks: [deskOf(ROOM, { branch: 'feat/private-thing', worktree: 'private-thing' })],
      projects: [{ ...projectOf(ROOM), path: '/Users/alice/Dev/private' }],
    })
  },
  'no project carries a path': (ctx) => assert(!ctx.redacted.projects.some((p) => 'path' in p), 'a path survived'),
  'no desk carries a branch': (ctx) => assert(!ctx.redacted.live.desks.some((d) => 'branch' in d), 'a branch survived'),

  'facts with a commit subject "fix: rotate the api key"': (ctx) => {
    ctx.facts = factsOf({ projects: [{ ...projectOf(ROOM), top_commits: [{ sha: 'abc1234', subject: 'fix: rotate the api key' }] }] })
  },
  'no project carries commit subjects': (ctx) => {
    assert(!ctx.redacted.projects.some((p) => (p.top_commits ?? []).some((c) => 'subject' in c)), 'a commit subject survived')
  },

  'facts with a desk and a project "side-project" and a desk in "connected-office"': (ctx) => {
    ctx.facts = factsOf({ desks: [deskOf('side-project'), deskOf(ROOM)], projects: [projectOf('side-project'), projectOf(ROOM)] })
  },
  'the agent excludes "SIDE-PROJECT" and redacts them': (ctx) => { ctx.redacted = redact(excludeProjects(ctx.facts, ['SIDE-PROJECT'])) },
  'nothing names "side-project"': (ctx) => assert(!JSON.stringify(ctx.redacted).includes('side-project'), 'side-project survived'),

  'facts where "side-project" worked 120 minutes and "connected-office" 30 minutes on 2026-11-09': (ctx) => {
    // Shaped like the collector: totals and per-day counts already sum both projects.
    const day = (minutes) => ({ '2026-11-09': { minutes, sessions: 1 } })
    ctx.facts = factsOf({
      projects: [{ ...projectOf('side-project', { agentMinutes: 120 }), per_day: day(120) }, { ...projectOf(ROOM, { agentMinutes: 30 }), per_day: day(30) }],
      perDay: day(150),
    })
    ctx.facts.totals = { ...ctx.facts.totals, projects: 2, agent_minutes: 150 }
  },
  'the agent excludes "side-project" and redacts them': (ctx) => { ctx.redacted = redact(excludeProjects(ctx.facts, ['side-project'])) },
  'the totals count 30 agent minutes and 1 project': (ctx) => {
    assertEqual(ctx.redacted.totals.agent_minutes, 30, 'agent minutes')
    assertEqual(ctx.redacted.totals.projects, 1, 'projects')
  },
  '2026-11-09 counts 30 minutes': (ctx) => assertEqual(ctx.redacted.per_day['2026-11-09'].minutes, 30, 'minutes of the day'),

  'facts with a project in "/home/alice/Dev/work/api" and one in "/home/alice/Dev/side-project/lobby"': (ctx) => {
    ctx.facts = factsOf({ projects: [
      { ...projectOf('api'), path: '/home/alice/Dev/work/api' },
      { ...projectOf('lobby'), path: '/home/alice/Dev/side-project/lobby' },
    ] })
  },
  'the agent keeps only "~/Dev/work" and redacts them': (ctx) => {
    ctx.redacted = redact(excludeProjects(ctx.facts, namesOutside(ctx.facts, ['~/Dev/work'], '/home/alice')))
  },
  'facts with a project in "c:\\Users\\alice\\Dev\\work\\api" and one in "C:\\Users\\alice\\Dev\\side-project\\lobby"': (ctx) => {
    ctx.facts = factsOf({ projects: [
      { ...projectOf('api'), path: 'c:\\Users\\alice\\Dev\\work\\api' },
      { ...projectOf('lobby'), path: 'C:\\Users\\alice\\Dev\\side-project\\lobby' },
    ] })
  },
  'the agent on Windows keeps only "~/Dev/work" and redacts them': (ctx) => {
    ctx.redacted = redact(excludeProjects(ctx.facts, namesOutside(ctx.facts, ['~/Dev/work'], 'C:\\Users\\alice')))
  },
  'nothing names "lobby"': (ctx) => assert(!JSON.stringify(ctx.redacted).includes('lobby'), 'lobby survived'),
  'a project is named "api"': (ctx) => assert(ctx.redacted.projects.some((p) => p.name === 'api'), 'api is gone'),
})

