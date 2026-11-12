// Steps shared by several features: a relay on a random port, tokens, pushes, the event stream. One relay per
// scenario, closed with its cache directory when the run ends.
import { factsOf, deskOf } from '../helpers/facts.mjs'
import { startTestRelay, push, closeRelay, PROXY_HEADER } from '../helpers/relay.mjs'
import { mergeFacts } from '../../relay/merge.mjs'
import { assert, assertEqual } from '../gherkin.mjs'

const relays = []

export async function closeAll() {
  for (const relay of relays.splice(0)) await closeRelay(relay).catch(() => {})
}

export async function relayFor(ctx) {
  if (ctx.relay) return ctx.relay
  ctx.tokens ??= {}
  ctx.relay = await startTestRelay({ tokens: ctx.tokens, dir: ctx.dir })
  relays.push(ctx.relay)
  return ctx.relay
}

/** The office the relay would draw from what it holds, merged now. */
export const mergedOf = (ctx, view = 'live') => mergeFacts(ctx.relay.store.list(view), { now: Date.now() })

async function readChange(ctx, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  const decoder = new TextDecoder()
  while (!ctx.buffer.includes('event: change') && Date.now() < deadline) {
    const chunk = await Promise.race([
      ctx.reader.read(),
      new Promise((resolve) => setTimeout(() => resolve({ done: true }), Math.max(1, deadline - Date.now()))),
    ])
    if (chunk.value) ctx.buffer += decoder.decode(chunk.value)
    if (chunk.done) break
  }
  return ctx.buffer.includes('event: change')
}

export const common = {
  'a token issued for "alice"': async (ctx) => { ctx.tokens = { ...(ctx.tokens ?? {}), 'token-alice': 'alice' }; ctx.token = 'token-alice' },
  'a token issued for "bob"': async (ctx) => { ctx.tokens = { ...(ctx.tokens ?? {}), 'token-bob': 'bob' }; ctx.token = 'token-bob' },

  'a push arrives with that token': async (ctx) => {
    const relay = await relayFor(ctx)
    ctx.response = await push(relay, { view: ctx.view ?? 'live', facts: ctx.facts ?? factsOf({ desks: [deskOf('connected-office')] }), token: ctx.token })
  },
  'another push arrives with that token': async (ctx) => {
    const relay = await relayFor(ctx)
    ctx.response = await push(relay, { view: ctx.view ?? 'live', facts: ctx.facts ?? factsOf({ desks: [deskOf('connected-office')] }), token: ctx.token })
  },
  'a push arrives without an Authorization header': async (ctx) => {
    const relay = await relayFor(ctx)
    ctx.response = await push(relay, { facts: factsOf() })
  },
  'a push arrives with the bearer token "not-a-real-token"': async (ctx) => {
    const relay = await relayFor(ctx)
    ctx.response = await push(relay, { facts: factsOf(), token: 'not-a-real-token' })
  },
  'a push of 2 megabytes arrives with that token': async (ctx) => {
    const relay = await relayFor(ctx)
    ctx.response = await push(relay, { facts: 'x'.repeat(2 * 1024 * 1024), token: ctx.token })
  },
  'a push with the spec "theoffice/1" has been accepted': async (ctx) => {
    const relay = await relayFor(ctx)
    ctx.response = await push(relay, { facts: { ...factsOf({ desks: [deskOf('connected-office')] }), spec: 'theoffice/1' }, token: ctx.token })
    assertEqual(ctx.response.status, 202, 'first push')
  },
  'a push whose spec is "theoffice/2" arrives with that token': async (ctx) => {
    const relay = await relayFor(ctx)
    ctx.response = await push(relay, { facts: { ...factsOf(), spec: 'theoffice/2' }, token: ctx.token })
  },

  'the relay answers 202': (ctx) => assertEqual(ctx.response.status, 202, 'status'),
  'the relay answers 401': (ctx) => assertEqual(ctx.response.status, 401, 'status'),
  'the relay answers 409': (ctx) => assertEqual(ctx.response.status, 409, 'status'),
  'the relay answers 413': (ctx) => assertEqual(ctx.response.status, 413, 'status'),

  'the relay holds exactly 1 push for "alice"': (ctx) => assertEqual(ctx.relay.store.count('alice'), 1, 'pushes kept'),
  'the relay still holds 1 push for "alice"': (ctx) => assertEqual(ctx.relay.store.count('alice'), 1, 'pushes kept'),
  'the relay still holds the "theoffice/1" push': (ctx) => {
    const kept = ctx.relay.store.get('alice', 'live')
    assert(kept, 'no push kept')
    assertEqual(kept.facts.spec, 'theoffice/1', 'kept spec')
  },

  'a browser asks for the page without the proxy header': async (ctx) => {
    const relay = await relayFor(ctx)
    ctx.response = await fetch(`${relay.url}/`)
  },

  'a page listening on the event stream': async (ctx) => {
    const relay = await relayFor(ctx)
    const controller = new AbortController()
    const response = await fetch(`${relay.url}/events`, { headers: PROXY_HEADER, signal: controller.signal })
    assertEqual(response.status, 200, 'event stream status')
    ctx.reader = response.body.getReader()
    ctx.controller = controller
    ctx.buffer = ''
  },
  'the listening page receives a change signal': async (ctx) => {
    const seen = await readChange(ctx)
    ctx.controller.abort()
    assert(seen, 'no change event received')
  },

  'the relay restarts': async (ctx) => {
    const dir = ctx.relay.cacheDir
    await ctx.relay.close()
    ctx.relay = await startTestRelay({ tokens: ctx.tokens, dir })
    relays.push(ctx.relay)
  },
}
