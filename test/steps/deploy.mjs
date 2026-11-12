// A smoke test of the deployment files: they are read, never executed, so it runs anywhere without Docker.
import fs from 'node:fs'
import path from 'node:path'
import { feature, assert, assertEqual } from '../gherkin.mjs'

const ROOT = new URL('../../', import.meta.url).pathname
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')

feature(new URL('../../features/deploy.feature', import.meta.url).pathname, {
  'the deploy directory': (ctx) => { ctx.compose = read('deploy/compose.yaml'); ctx.dockerfile = read('deploy/Dockerfile') },
  'it is read': (ctx) => { ctx.compose ??= read('deploy/compose.yaml') },

  'the compose file declares a relay service': (ctx) => assert(/^ {2}relay:$/m.test(ctx.compose), 'no relay service'),
  'the relay publishes only on the loopback': (ctx) => {
    assert(/127\.0\.0\.1:7311:7311/.test(ctx.compose), 'the port is not published on the loopback')
    assert(!/["']?:?7311:7311/.test(ctx.compose.replace('127.0.0.1:7311:7311', '')), 'a second, wider publication of 7311')
  },
  'the relay restarts unless stopped': (ctx) => assert(/restart: unless-stopped/.test(ctx.compose), 'no restart policy'),
  'the relay has a memory ceiling': (ctx) => assert(/mem_limit:/.test(ctx.compose), 'no mem_limit'),

  'start.sh is executable': (ctx) => fs.accessSync(path.join(ROOT, 'deploy/start.sh'), fs.constants.X_OK),
  'stop.sh is executable': (ctx) => fs.accessSync(path.join(ROOT, 'deploy/stop.sh'), fs.constants.X_OK),

  'the image is built for linux/amd64': (ctx) => assertEqual(/platform: linux\/amd64/.test(ctx.compose), true, 'compose pins amd64'),
  'the timezone is pinned': (ctx) => assert(/TZ=Europe\/Paris/.test(ctx.dockerfile), 'no timezone in the image'),
})
