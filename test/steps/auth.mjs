// Every step of this feature is a relay or a token step, shared from common.mjs.
import { feature } from '../gherkin.mjs'
import { common } from './common.mjs'

feature(new URL('../../features/auth.feature', import.meta.url).pathname, { ...common })
