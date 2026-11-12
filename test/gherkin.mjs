// A Gherkin runner with no dependency: a .feature file is the specification, and a scenario whose step has no
// implementation fails with that step's own text, so the code cannot quietly drift from the spec.
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const HEAD = /^(Feature|Scenario|Scenario Outline|Background|Examples):\s*(.*)$/
const STEP = /^(Given|When|Then|And|But)\s+(.+)$/

/** Scenarios of a .feature file: `[{ name, steps: [{ keyword, text }] }]`. */
export function readFeature(file) {
  const scenarios = []
  let current = null
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('@')) continue
    const head = HEAD.exec(line)
    if (head) {
      current = head[1].startsWith('Scenario') ? { name: head[2], steps: [] } : null
      if (current) scenarios.push(current)
      continue
    }
    const step = STEP.exec(line)
    if (step && current) current.steps.push({ keyword: step[1], text: step[2] })
  }
  return scenarios
}

/**
 * Registers every scenario of `file` as a node:test test. `steps` maps a step's exact text to `async (ctx) => {}`,
 * where `ctx` is shared by the scenarios of that file: one object per scenario, so a scenario never sees another's.
 */
export function feature(file, steps) {
  const name = path.basename(file)
  for (const scenario of readFeature(file)) {
    test(`${name} › ${scenario.name}`, async () => {
      const ctx = {}
      for (const step of scenario.steps) {
        const run = steps[step.text]
        if (!run) throw new Error(`No implementation for step: ${step.keyword} ${step.text} — in "${name} › ${scenario.name}"`)
        await run(ctx)
      }
    })
  }
}

export const assert = (ok, message) => { if (!ok) throw new Error(message) }

export const assertEqual = (actual, expected, what) => {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}
