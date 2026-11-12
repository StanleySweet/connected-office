// One entry point for `node --test test/all.test.mjs`: importing a step file registers its feature's scenarios.
import { after } from 'node:test'
import { closeAll } from './steps/common.mjs'
import './steps/merge.mjs'
import './steps/identity.mjs'
import './steps/auth.mjs'
import './steps/redaction.mjs'
import './steps/ingest.mjs'
import './steps/deploy.mjs'
import './split.test.mjs'
import './push.test.mjs'
import './copilot.test.mjs'
import './timeline.test.mjs'

after(closeAll)
