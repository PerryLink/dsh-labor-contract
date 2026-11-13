#!/usr/bin/env node
/**
 * Acceptance checks over public/synthetic fixtures. Writes ACCEPTANCE.csv and
 * evidence/<run_id>/result.json. No network, no customer data, no legal advice.
 *
 *   node scripts/acceptance.mjs
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTools } from '../lib/plugin/tools.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const errors = []

async function errorCode(promise) {
  try {
    await promise
    return 'NO_ERROR'
  } catch (error) {
    return error?.code ?? error?.name ?? 'UNKNOWN'
  }
}

const contractText = readFileSync(path.join(root, 'samples/quickstart/input/labor-contract.txt'), 'utf8')
const employeeCsv = readFileSync(path.join(root, 'samples/quickstart/input/employees.csv'), 'utf8')
const HEADER = 'employee,position,contract_start,contract_end,probation_months,monthly_salary,probation_salary\n'
const caseText = (term, probation, pay = '') =>
  `劳动合同\n本合同为固定期限劳动合同，自 ${term} 止。试用期为 ${probation} 个月。${pay}\n（合成）`

async function main() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'dsh-labor-contract-acceptance-'))
  try {
    const tools = Object.fromEntries(createTools({ baseDir: path.join(tempDir, 'store') }).map((tool) => [tool.name, tool]))
    const exec = { callId: 'acceptance' }

    const full = await tools['labor_check'].execute({ text: contractText }, exec)
    const empty = await tools['labor_check'].execute({
      text: '劳动合同\n甲方：示范（合成）公司\n乙方：示例员工\n双方签订本合同。',
    }, exec)
    const pro03 = await tools['labor_check'].execute({
      text: caseText('2026-01-01 至 2028-12-31', 6),
    }, exec)
    const pro07 = await tools['labor_check'].execute({
      text: caseText('2026-01-01 至 2028-12-31', 7),
    }, exec)
    const pro13 = await tools['labor_check'].execute({
      text: caseText('2026-01-01 至 2026-12-31', 3),
    }, exec)
    const payAt = await tools['labor_check'].execute({
      text: caseText('2026-01-01 至 2028-12-31', 3, '试用期工资为人民币 8000 元/月，转正后月工资为人民币 10000 元/月。'),
    }, exec)
    const payBelow = await tools['labor_check'].execute({
      text: caseText('2026-01-01 至 2028-12-31', 3, '试用期工资为人民币 7999 元/月，转正后月工资为人民币 10000 元/月。'),
    }, exec)
    const batch = await tools['labor_batch'].execute({ csv: employeeCsv, as_of: '2026-11-02' }, exec)
    const dateCode = await errorCode(
      tools['labor_batch'].execute({
        csv: `${HEADER}甲（合成）,工程师,2026-02-30,2026-12-31,1,8000,8000\n`,
        as_of: '2026-11-02',
      }, exec),
    )
    const pathCode = await errorCode(
      tools['labor_export'].execute({ issues: [], filename: '../evil.csv' }, exec),
    )
    const exported = await tools['labor_export'].execute({ issues: batch.issues, filename: 'acceptance.csv' }, exec)
    const exportedText = readFileSync(exported.path, 'utf8')
    const exportOk = exported.sha256 === sha256(exportedText) && exported.bytes === Buffer.byteLength(exportedText, 'utf8')

    const metrics = [
      {
        req_id: 'LABOR-A01',
        metric: 'nine required clauses present',
        threshold: '9/9',
        actual: `${full.summary.present}/${full.clauses.length}`,
        pass: full.summary.present === 9 && full.summary.missing === 0,
      },
      {
        req_id: 'LABOR-A02',
        metric: 'missing clauses detected',
        threshold: '9',
        actual: empty.summary.missing,
        pass: empty.summary.missing === 9,
      },
      {
        req_id: 'LABOR-A03',
        metric: 'probation cap boundary',
        threshold: 'ok/over/over',
        actual: `${pro03.probation.status}/${pro07.probation.status}/${pro13.probation.status}`,
        pass: pro03.probation.status === 'ok' && pro07.probation.status === 'over_limit' && pro13.probation.status === 'over_limit',
      },
      {
        req_id: 'LABOR-A04',
        metric: '80% probation-pay boundary',
        threshold: 'ok/below_80',
        actual: `${payAt.probation_pay.status}/${payBelow.probation_pay.status}`,
        pass: payAt.probation_pay.status === 'ok' && payBelow.probation_pay.status === 'below_80',
      },
      {
        req_id: 'LABOR-A05',
        metric: '6-person batch issues',
        threshold: '4',
        actual: `${batch.rows}rows/${batch.issues.length}issues`,
        pass: batch.rows === 6 && batch.issues.length === 4,
      },
      {
        req_id: 'LABOR-A06',
        metric: 'expiry window',
        threshold: '1expired/1expiring',
        actual: `${batch.summary.expired}expired/${batch.summary.expiring}expiring`,
        pass: batch.summary.expired === 1 && batch.summary.expiring === 1,
      },
      {
        req_id: 'LABOR-A07',
        metric: 'invalid date error',
        threshold: 'E_LABOR_DATE_INVALID',
        actual: dateCode,
        pass: dateCode === 'E_LABOR_DATE_INVALID',
      },
      {
        req_id: 'LABOR-A08',
        metric: 'export path safety',
        threshold: 'E_LABOR_PATH_INVALID',
        actual: pathCode,
        pass: pathCode === 'E_LABOR_PATH_INVALID',
      },
      {
        req_id: 'LABOR-A09',
        metric: 'export sha256/bytes',
        threshold: 'matches file',
        actual: exportOk ? 'ok' : 'mismatch',
        pass: exportOk && exported.rows === batch.issues.length,
      },
    ]

    let quickstartPass = true
    try {
      execFileSync(process.execPath, ['samples/quickstart/run.mjs', '--check'], { cwd: root, stdio: 'ignore' })
    } catch {
      quickstartPass = false
    }
    const quickstartHash = sha256(readFileSync(path.join(root, 'samples/quickstart/expected/result.json')))
    const quickstart = {
      req_id: 'PS1-QS01',
      metric: 'quickstart 样例与金标一致',
      threshold: '1/1',
      actual: quickstartPass ? 1 : 0,
      pass: quickstartPass,
      evidence_sha256: quickstartHash,
    }

    const failures = metrics.filter((item) => !item.pass)
    for (const failure of failures) errors.push(`${failure.req_id} ${failure.metric}: ${failure.actual}`)
    if (!quickstartPass) errors.push('PS1-QS01 quickstart golden failed')

    const runId = `labor-${Date.now()}`
    const evidence = {
      run_id: runId,
      scope: 'LABOR-S1',
      status: failures.length === 0 && quickstartPass ? 'pass' : 'fail',
      counted: false,
      note: 'synthetic contract and employee CSV only; clause/date checks, not legal advice; 0 real employees',
      metrics,
      pass: failures.length === 0 && quickstartPass,
    }
    const evidenceDir = path.join(root, 'evidence', runId)
    mkdirSync(evidenceDir, { recursive: true })
    const evidenceJson = `${JSON.stringify(evidence, null, 2)}\n`
    writeFileSync(path.join(evidenceDir, 'result.json'), evidenceJson)
    const evidenceHash = sha256(evidenceJson)

    const rows = [
      ...metrics.map((item) => `${item.req_id},${item.metric},${item.threshold},${item.actual},scripts/acceptance.mjs,${evidenceHash},${item.pass},public/synthetic,false`),
      `${quickstart.req_id},${quickstart.metric},${quickstart.threshold},${quickstart.actual},samples/quickstart/run.mjs,${quickstart.evidence_sha256},${quickstart.pass},synthetic/quickstart,true`,
    ]
    writeFileSync(
      path.join(root, 'ACCEPTANCE.csv'),
      `req_id,metric,threshold,actual,script,evidence_sha256,pass,source,counted\n${rows.join('\n')}\n`,
    )

    if (errors.length > 0) {
      for (const error of errors) console.error(`acceptance: ${error}`)
      process.exit(1)
    }
    console.log(`acceptance ok: ${metrics.length}/${metrics.length} public/synthetic + PS1-QS01 quickstart`)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

await main()
