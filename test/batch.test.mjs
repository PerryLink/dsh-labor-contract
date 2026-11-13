import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { batchCheck } from '../lib/core/labor.js'
import { createTools } from '../lib/plugin/tools.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sampleCsv = readFileSync(path.join(root, 'samples/quickstart/input/employees.csv'), 'utf8')
const tools = Object.fromEntries(
  createTools({ baseDir: path.join(os.tmpdir(), 'dsh-labor-contract-batch') }).map((tool) => [tool.name, tool]),
)
const exec = { callId: 'labor-batch-test' }
const batch = (csv, asOf = '2026-11-02') => tools['labor_batch'].execute({ csv, as_of: asOf }, exec)
const HEADER = 'employee,position,contract_start,contract_end,probation_months,monthly_salary,probation_salary\n'

test('the bundled 6-person CSV yields exactly one issue per failing check', async () => {
  const result = await batch(sampleCsv)
  assert.equal(result.as_of, '2026-11-02')
  assert.equal(result.rows, 6)
  assert.equal(result.issues.length, 4)
  assert.deepEqual(
    result.issues.map((issue) => [issue.row, issue.employee, issue.code]),
    [
      [3, '李二（合成）', 'PROBATION_OVER_LIMIT'],
      [4, '王三（合成）', 'CONTRACT_EXPIRED'],
      [5, '赵四（合成）', 'PROBATION_PAY_BELOW_80'],
      [7, '周六（合成）', 'CONTRACT_EXPIRING'],
    ],
  )
  assert.deepEqual(result.summary.by_code, {
    CONTRACT_EXPIRED: 1,
    CONTRACT_EXPIRING: 1,
    PROBATION_OVER_LIMIT: 1,
    PROBATION_PAY_BELOW_80: 1,
  })
  assert.equal(result.summary.expired, 1)
  assert.equal(result.summary.expiring, 1)
  assert.deepEqual(result.due.expired[0], {
    row: 4,
    employee: '王三（合成）',
    position: '销售',
    contract_end: '2026-02-28',
    days_left: -247,
    state: 'expired',
  })
  assert.equal(result.due.expiring[0].days_left, 74)
})

test('probation pay at exactly 80% passes and 79.99% fails', async () => {
  const csv = `${HEADER}
甲（合成）,工程师,2026-01-01,2028-12-31,3,10000,8000
乙（合成）,工程师,2026-01-01,2028-12-31,3,10000,7999
`
  const result = await batch(csv)
  assert.equal(result.issues.length, 1)
  assert.equal(result.issues[0].employee, '乙（合成）')
  assert.equal(result.issues[0].code, 'PROBATION_PAY_BELOW_80')
  assert.match(result.issues[0].detail_zh, /79\.99%/)
})

test('probation cap boundary in batch: 3-month contract gets 1 month, 2-month gets none', async () => {
  const csv = `${HEADER}
三月（合成）,工程师,2026-01-01,2026-03-31,1,8000,8000
两月（合成）,工程师,2026-01-01,2026-02-28,1,8000,8000
`
  const result = await batch(csv, '2025-11-01')
  assert.equal(result.issues.length, 1)
  assert.equal(result.issues[0].employee, '两月（合成）')
  assert.equal(result.issues[0].code, 'PROBATION_OVER_LIMIT')
  assert.match(result.issues[0].detail_zh, /上限 0 个月/)
})

test('contract expiry uses an inclusive 90-day window and a negative expired state', async () => {
  const csv = `${HEADER}
过期（合成）,工程师,2025-01-01,2025-12-31,0,8000,8000
今天（合成）,工程师,2025-01-01,2026-01-01,0,8000,8000
第90天（合成）,工程师,2025-01-01,2026-04-01,0,8000,8000
第91天（合成）,工程师,2025-01-01,2026-04-02,0,8000,8000
`
  const result = await batch(csv, '2026-01-01')
  assert.deepEqual(
    result.issues.map((issue) => [issue.employee, issue.code]),
    [
      ['过期（合成）', 'CONTRACT_EXPIRED'],
      ['今天（合成）', 'CONTRACT_EXPIRING'],
      ['第90天（合成）', 'CONTRACT_EXPIRING'],
    ],
  )
  assert.equal(result.due.expired[0].days_left, -1)
  assert.equal(result.due.expiring[0].days_left, 0)
  assert.equal(result.due.expiring[1].days_left, 90)
})

test('open-ended contracts never expire and allow a 6-month probation', async () => {
  const csv = `${HEADER}
无固定（合成）,工程师,2026-01-01,无固定期限,6,9000,9000
`
  const result = await batch(csv, '2030-01-01')
  assert.equal(result.issues.length, 0)
  assert.deepEqual(result.due, { expired: [], expiring: [] })
})

test('an impossible or badly formatted date raises E_LABOR_DATE_INVALID with the row', async () => {
  const bad = `${HEADER}甲（合成）,工程师,2026-02-30,2026-12-31,1,8000,8000\n`
  await assert.rejects(
    () => batch(bad),
    (error) => {
      assert.equal(error.code, 'E_LABOR_DATE_INVALID')
      assert.match(error.message, /row 2/)
      return true
    },
  )
  const slash = `${HEADER}甲（合成）,工程师,2026/01/01,2026-12-31,1,8000,8000\n`
  await assert.rejects(() => batch(slash), /E_LABOR_DATE_INVALID/)
  await assert.rejects(() => batch(sampleCsv, '2026-13-01'), /E_LABOR_DATE_INVALID/)
})

test('malformed CSV shapes raise E_LABOR_CSV_ROW', async () => {
  await assert.rejects(() => batch(''), /E_LABOR_CSV_ROW/)
  await assert.rejects(() => batch(`${HEADER}`), /E_LABOR_CSV_ROW/)
  await assert.rejects(
    () => batch('employee,position,contract_start\n甲,工程师,2026-01-01\n'),
    /E_LABOR_CSV_ROW/,
  )
  await assert.rejects(
    () => batch(`${HEADER}甲（合成）,工程师,2026-01-01,2026-12-31,1,8000\n`),
    /E_LABOR_CSV_ROW/,
  )
  await assert.rejects(
    () => batch(`${HEADER}甲（合成）,工程师,2026-01-01,2026-12-31,-1,8000,8000\n`),
    /E_LABOR_CSV_ROW/,
  )
  await assert.rejects(
    () => batch(`${HEADER}甲（合成）,工程师,2026-01-01,2026-12-31,1,abc,8000\n`),
    /E_LABOR_CSV_ROW/,
  )
})

test('quoted names with commas and an optional probation_salary column are supported', async () => {
  const csv = `employee,position,contract_start,contract_end,probation_months,monthly_salary
"甲,（合成）",工程师,2026-01-01,2028-12-31,3,10000
`
  const result = await batch(csv)
  assert.equal(result.rows, 1)
  assert.equal(result.issues.length, 0)
})

test('a reversed date range is reported as CONTRACT_DATE_ORDER instead of crashing the batch', async () => {
  const result = await batch(`${HEADER}甲（合成）,工程师,2026-12-31,2026-01-01,0,8000,8000\n`)
  assert.ok(result.issues.some((issue) => issue.code === 'CONTRACT_DATE_ORDER'))
})

test('batchCheck is deterministic without a simulated clock', async () => {
  const one = await batch(sampleCsv)
  const two = await batch(sampleCsv)
  assert.deepEqual(one, two)
  const implicit = batchCheck(sampleCsv)
  assert.match(implicit.as_of, /^\d{4}-\d{2}-\d{2}$/)
})
