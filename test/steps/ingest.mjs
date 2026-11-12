// Ingest: a push replaces the previous one, wakes the open pages, and survives a restart.
import { feature } from '../gherkin.mjs'
import { common } from './common.mjs'

feature(new URL('../../features/ingest.feature', import.meta.url).pathname, { ...common })
