#!/usr/bin/env node
/**
 * Release gate: metadata lint + public acceptance checks. Every ACCEPTANCE.csv
 * row must have pass=true in column 7 (1-based); the quickstart row must stay
 * counted; at least nine public checks must be present.
 *
 *   node scripts/gate.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

try {
  execFileSync(process.execPath, ['scripts/lint.mjs'], { stdio: 'inherit' })
  execFileSync(process.execPath, ['scripts/acceptance.mjs'], { stdio: 'inherit' })
} catch {
  process.exit(1)
}

const lines = readFileSync('ACCEPTANCE.csv', 'utf8').trim().split('\n')
const header = lines[0]?.split(',') ?? []
if (!header.includes('evidence_sha256') || !header.includes('pass')) {
  console.error('gate: ACCEPTANCE.csv header is missing evidence_sha256/pass')
  process.exit(1)
}
const passIndex = header.indexOf('pass')
const rows = lines.slice(1).filter((line) => line.trim() !== '')
const failing = rows.filter((line) => line.split(',')[passIndex] !== 'true')
if (failing.length > 0) {
  for (const row of failing) console.error(`gate: ${row}`)
  process.exit(1)
}
if (rows.length < 9) {
  console.error(`gate: expected at least 9 acceptance rows, got ${rows.length}`)
  process.exit(1)
}
const quickstart = rows.filter((row) => row.startsWith('PS1-QS01,') && row.endsWith(',true,synthetic/quickstart,true'))
if (quickstart.length !== 1) {
  console.error('gate: PS1-QS01 quickstart row is missing or not counted')
  process.exit(1)
}
console.log(`gate ok: ${rows.length} acceptance rows (${rows.length - 1} public/synthetic + PS1-QS01)`)
