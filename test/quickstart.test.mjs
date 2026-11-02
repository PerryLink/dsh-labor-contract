import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the bundled quickstart inputs are synthetic and non-empty', async () => {
  const contract = await readFile(path.join(packageRoot, 'samples', 'quickstart', 'input', 'labor-contract.txt'), 'utf8')
  const csv = await readFile(path.join(packageRoot, 'samples', 'quickstart', 'input', 'employees.csv'), 'utf8')
  assert.match(contract, /合成样例/)
  assert.match(contract, /2026 年 1 月 1 日/)
  assert.doesNotMatch(contract, /真实员工|身份证号：\d{15,}/)
  const lines = csv.trim().split('\n')
  assert.equal(lines.length, 7)
  assert.match(lines[0], /^employee,position,contract_start,contract_end,probation_months,monthly_salary,probation_salary$/)
})

test('quickstart --check reproduces the committed golden result', () => {
  const result = spawnSync(process.execPath, ['samples/quickstart/run.mjs', '--check'], {
    cwd: packageRoot,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /clauses: 9 present \/ 0 attention \/ 0 missing/)
  assert.match(result.stdout, /batch 2026-11-02: 6 employees, 4 issues/)
  assert.match(result.stdout, /golden samples\/quickstart\/expected\/result\.json matches/)
  assert.match(result.stdout, /quickstart ok/)
})

test('the golden result records the real batch outcome', async () => {
  const golden = JSON.parse(await readFile(path.join(packageRoot, 'samples', 'quickstart', 'expected', 'result.json'), 'utf8'))
  assert.equal(golden.check.summary.present, 9)
  assert.equal(golden.check.probation.status, 'ok')
  assert.equal(golden.check.probation_pay.ratio_pct, 90)
  assert.equal(golden.batch.rows, 6)
  assert.equal(golden.batch.issues.length, 4)
  assert.equal(golden.export.rows, 4)
  assert.equal(golden.export.path, 'exports/labor-issues.csv')
  assert.match(golden.export.text, /^row,employee,position,code,detail_zh\n/)
})
