import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTools } from '../lib/plugin/tools.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tools = Object.fromEntries(
  createTools({ baseDir: path.join(os.tmpdir(), 'dsh-labor-contract-unit') }).map((tool) => [tool.name, tool]),
)
const exec = { callId: 'labor-check-test' }
const check = (text) => tools['labor_check'].execute({ text }, exec)
const contract = (text) => `劳动合同\n${text}\n（合成测试文本）`

test('the bundled synthetic contract covers all nine required clauses', async () => {
  const result = await check(readFileSync(path.join(root, 'samples/quickstart/input/labor-contract.txt'), 'utf8'))
  assert.equal(result.clauses.length, 9)
  assert.deepEqual(
    result.clauses.map((clause) => clause.key),
    ['term', 'duties', 'location', 'hours', 'pay', 'insurance', 'protection', 'termination', 'dispute'],
  )
  assert.equal(result.summary.present, 9)
  assert.equal(result.summary.attention, 0)
  assert.equal(result.summary.missing, 0)
  assert.ok(result.clauses.every((clause) => clause.status === 'present'))
  assert.deepEqual(result.term, { type: 'fixed', start: '2026-01-01', end: '2028-12-31', months: 36 })
  assert.equal(result.probation.status, 'ok')
  assert.equal(result.probation.months, 3)
  assert.equal(result.probation.limit_months, 6)
  assert.equal(result.probation_pay.status, 'ok')
  assert.equal(result.probation_pay.ratio_pct, 90)
  assert.equal(result.non_compete.status, 'present')
  assert.match(result.disclaimer_zh, /不构成法律意见/)
})

test('a contract with no clause text reports all nine clauses missing', async () => {
  const result = await check(contract('甲方：示范（合成）公司\n乙方：示例员工\n双方本着平等自愿原则签订本合同。'))
  assert.equal(result.summary.missing, 9)
  assert.equal(result.summary.present, 0)
  assert.ok(result.clauses.every((clause) => clause.status === 'missing'))
  assert.ok(result.clauses.every((clause) => clause.note_zh.length > 0))
})

test('clause headings without details are reported as attention, not present', async () => {
  const headings = [
    '第一条 合同期限',
    '第二条 工作内容',
    '第三条 工作地点',
    '第四条 工作时间',
    '第五条 劳动报酬',
    '第六条 社会保险',
    '第七条 劳动保护',
    '第八条 劳动合同的解除',
    '第九条 争议解决',
  ].join('\n')
  const result = await check(contract(headings))
  assert.equal(result.summary.attention, 9)
  assert.equal(result.summary.present, 0)
  assert.equal(result.summary.missing, 0)
  for (const clause of result.clauses) {
    assert.equal(clause.status, 'attention', clause.key)
    assert.ok(clause.evidence.length > 0, clause.key)
  }
})

test('empty and whitespace-only contract text raise E_LABOR_TEXT_EMPTY', async () => {
  await assert.rejects(() => check(''), /E_LABOR_TEXT_EMPTY/)
  await assert.rejects(() => check('   \n\t  '), /E_LABOR_TEXT_EMPTY/)
})

test('probation cap follows the 0 / 1 / 2 / 6 month boundaries', async () => {
  const cases = [
    { term: '2026-01-01 至 2028-12-31', months: 6, status: 'ok', limit: 6 },
    { term: '2026-01-01 至 2028-12-31', months: 7, status: 'over_limit', limit: 6 },
    { term: '2026-01-01 至 2028-11-30', months: 6, status: 'over_limit', limit: 2 },
    { term: '2026-01-01 至 2026-12-31', months: 2, status: 'ok', limit: 2 },
    { term: '2026-01-01 至 2026-12-31', months: 3, status: 'over_limit', limit: 2 },
    { term: '2026-01-01 至 2026-03-31', months: 1, status: 'ok', limit: 1 },
    { term: '2026-01-01 至 2026-03-31', months: 2, status: 'over_limit', limit: 1 },
    { term: '2026-01-01 至 2026-02-28', months: 1, status: 'over_limit', limit: 0 },
  ]
  for (const item of cases) {
    const result = await check(contract(`本合同为固定期限劳动合同，自 ${item.term} 止。试用期为 ${item.months} 个月。`))
    assert.equal(result.probation.limit_months, item.limit, item.term)
    assert.equal(result.probation.status, item.status, item.term)
  }
  const openEnded = await check(contract('本合同为无固定期限劳动合同。试用期为 6 个月。'))
  assert.equal(openEnded.term.type, 'open')
  assert.equal(openEnded.probation.limit_months, 6)
  assert.equal(openEnded.probation.status, 'ok')
  const taskBased = await check(contract('本合同以完成一定工作任务为期限。试用期为 1 个月。'))
  assert.equal(taskBased.term.type, 'task')
  assert.equal(taskBased.probation.limit_months, 0)
  assert.equal(taskBased.probation.status, 'over_limit')
  const unknown = await check(contract('试用期为 1 个月。'))
  assert.equal(unknown.term.type, 'unknown')
  assert.equal(unknown.probation.status, 'unknown')
})

test('probation pay uses the 80% floor with an inclusive boundary', async () => {
  const atFloor = await check(contract('试用期工资为人民币 8000 元/月，转正后月工资为人民币 10000 元/月。'))
  assert.equal(atFloor.probation_pay.status, 'ok')
  assert.equal(atFloor.probation_pay.ratio_pct, 80)
  const below = await check(contract('试用期工资为人民币 7999 元/月，转正后月工资为人民币 10000 元/月。'))
  assert.equal(below.probation_pay.status, 'below_80')
  assert.equal(below.probation_pay.ratio_pct, 79.99)
  assert.equal(below.probation_pay.probation_salary_cents, 799900)
  const full = await check(contract('试用期工资为人民币 10000 元/月，转正后月工资为人民币 10000 元/月。'))
  assert.equal(full.probation_pay.status, 'ok')
  assert.equal(full.probation_pay.ratio_pct, 100)
  const unknown = await check(contract('试用期工资为人民币 8000 元/月。'))
  assert.equal(unknown.probation_pay.status, 'unknown')
  assert.equal(unknown.probation_pay.ratio_pct, null)
})

test('non-compete reports compensation and the two-year duration cap', async () => {
  const absent = await check(contract('本合同自 2026-01-01 至 2028-12-31。'))
  assert.equal(absent.non_compete.status, 'not_applicable')
  assert.equal(absent.non_compete.mentioned, false)

  const noPay = await check(contract('乙方离职后应遵守竞业限制，期限为 2 年。'))
  assert.equal(noPay.non_compete.mentioned, true)
  assert.equal(noPay.non_compete.compensation_mentioned, false)
  assert.equal(noPay.non_compete.status, 'attention')

  const paid = await check(contract('竞业限制期限为 2 年，甲方按月支付经济补偿。'))
  assert.equal(paid.non_compete.status, 'present')
  assert.equal(paid.non_compete.duration_months, 24)

  const tooLong = await check(contract('竞业限制期限为 3 年，甲方按月支付经济补偿。'))
  assert.equal(tooLong.non_compete.duration_months, 36)
  assert.equal(tooLong.non_compete.status, 'attention')
  assert.match(tooLong.non_compete.hint_zh, /不得超过二年/)
})

test('term parsing accepts Chinese and ISO dates and rejects impossible dates', async () => {
  const chinese = await check(contract('本合同自 2026 年 1 月 1 日起至 2027 年 12 月 31 日止。'))
  assert.deepEqual(chinese.term, { type: 'fixed', start: '2026-01-01', end: '2027-12-31', months: 24 })
  const iso = await check(contract('本合同自 2026-01-01 至 2027-01-01 止。'))
  assert.equal(iso.term.months, 12)
  const impossible = await check(contract('本合同自 2026-02-30 至 2027-01-01 止。试用期为 1 个月。'))
  assert.equal(impossible.term.type, 'fixed')
  assert.equal(impossible.term.months, null)
  assert.equal(impossible.probation.status, 'unknown')
})
