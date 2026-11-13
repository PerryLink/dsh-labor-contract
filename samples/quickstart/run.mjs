#!/usr/bin/env node
/**
 * dsh-labor-contract quickstart — runs the built tools over the bundled
 * synthetic contract and 6-person employee CSV.
 *
 *   node samples/quickstart/run.mjs            # human-readable summary
 *   node samples/quickstart/run.mjs --json     # the golden result on stdout
 *   node samples/quickstart/run.mjs --check    # recompute and diff against the golden file
 *
 * `expected/result.json` is the stdout of `--json`, so it is a real run over
 * the committed sample, not hand-written output. Everything is synthetic and
 * local; the review is a clause/date check, not legal advice.
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTools } from '../../lib/plugin/tools.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const contractPath = path.join(here, 'input', 'labor-contract.txt')
const csvPath = path.join(here, 'input', 'employees.csv')
const expectedPath = path.join(here, 'expected', 'result.json')
const AS_OF = '2026-11-02'
const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--json') ? 'json' : 'summary'

async function run() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dsh-labor-contract-quickstart-'))
  const realTemp = await realpath(tempDir)
  try {
    const tools = Object.fromEntries(createTools({ baseDir: tempDir }).map((tool) => [tool.name, tool]))
    const exec = { callId: 'quickstart' }
    const contractText = await readFile(contractPath, 'utf8')
    const csvText = await readFile(csvPath, 'utf8')

    const check = await tools['labor_check'].execute({ text: contractText }, exec)
    const batch = await tools['labor_batch'].execute({ csv: csvText, as_of: AS_OF }, exec)
    const exported = await tools['labor_export'].execute(
      { issues: batch.issues, filename: 'labor-issues.csv' },
      exec,
    )
    const csvOut = await readFile(exported.path, 'utf8')

    return {
      sample: {
        contract: 'samples/quickstart/input/labor-contract.txt',
        employees: 'samples/quickstart/input/employees.csv',
      },
      as_of: AS_OF,
      check,
      batch,
      export: {
        path: path.relative(realTemp, exported.path).split(path.sep).join('/'),
        rows: exported.rows,
        bytes: exported.bytes,
        sha256: exported.sha256,
        text: csvOut,
      },
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

function summary(result) {
  const { check, batch } = result
  console.log('dsh-labor-contract quickstart - synthetic contract (not legal advice)')
  console.log(
    `clauses: ${check.summary.present} present / ${check.summary.attention} attention / ${check.summary.missing} missing; term ${check.term.months} months`,
  )
  console.log(
    `probation: ${check.probation.months} months, limit ${check.probation.limit_months} -> ${check.probation.status}`,
  )
  console.log(
    `probation pay: ${check.probation_pay.ratio_pct?.toFixed(2)}% -> ${check.probation_pay.status}`,
  )
  console.log(`non-compete: ${check.non_compete.status}`)
  console.log(
    `batch ${result.as_of}: ${batch.rows} employees, ${batch.issues.length} issues, ${batch.summary.expired} expired / ${batch.summary.expiring} expiring`,
  )
  for (const issue of batch.issues) console.log(`  row ${issue.row} ${issue.employee} ${issue.code}`)
  console.log(`export ${result.export.path}: ${result.export.rows} rows, ${result.export.bytes} bytes, sha256 ${result.export.sha256.slice(0, 12)}...`)
}

const result = await run()

if (mode === 'json') {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} else if (mode === 'check') {
  const expected = JSON.parse(await readFile(expectedPath, 'utf8'))
  assert.deepEqual(result, expected)
  summary(result)
  console.log('golden samples/quickstart/expected/result.json matches')
  console.log('quickstart ok')
} else {
  summary(result)
  console.log('run with --check to compare against expected/result.json')
}
