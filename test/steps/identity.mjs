// Identity: the token names the person, the person names the desks, and a laptop with several agent homes keeps both
// names in `label@account`.
import { feature, assert, assertEqual } from '../gherkin.mjs'
import { factsOf, deskOf } from '../helpers/facts.mjs'
import { push } from '../helpers/relay.mjs'
import { common, mergedOf, relayFor } from './common.mjs'

feature(new URL('../../features/identity.feature', import.meta.url).pathname, {
  ...common,

  'every desk of that push carries the account "alice"': (ctx) => {
    const merged = mergedOf(ctx)
    assert(merged.live.desks.length > 0, 'no desk')
    assert(merged.live.desks.every((d) => d.account === 'alice'), 'a desk is not Alice\'s')
  },

  'the merged facts list an account labelled "bob"': (ctx) => {
    const merged = mergedOf(ctx)
    assert(merged.accounts.some((a) => a.label === 'bob'), 'no account labelled bob')
  },

  'a push whose desks carry the account "work"': (ctx) => {
    ctx.facts = factsOf({ desks: [deskOf('connected-office', { account: 'work' })] })
  },
  'that push arrives with that token': async (ctx) => {
    const relay = await relayFor(ctx)
    ctx.response = await push(relay, { view: 'live', facts: ctx.facts, token: ctx.token })
    assertEqual(ctx.response.status, 202, 'status')
  },
  'his desks carry the account "alice@work"': (ctx) => {
    const merged = mergedOf(ctx)
    assertEqual(merged.live.desks.length, 1, 'desks')
    assertEqual(merged.live.desks[0].account, 'alice@work', 'account')
  },
})
