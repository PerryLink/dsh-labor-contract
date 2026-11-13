import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { toCsv } from '../core/csv.js'
import { batchCheck, checkContract, LaborError, type BatchResult, type LaborCheckResult } from '../core/labor.js'
import { safeExportPath } from '../core/safe-path.js'

export interface ToolDeps {
  /** Local write root; the plugin uses `$DSH_HOME/dsh-labor-contract`. */
  baseDir: string
}

const text = (value: string) => [{ type: 'text' as const, text: value }]
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

const nullableNumber = { oneOf: [{ type: 'number' }, { type: 'null' }] as const, required: true as const }

export function createTools(deps: ToolDeps) {
  const check = defineTool({
    name: 'labor_check',
    description:
      'Review one labor contract text: coverage of nine required clauses (term, duties, location, hours, pay, social insurance, protection, termination, dispute), probation cap by contract term, probation pay vs the 80% floor, and a non-compete compensation prompt. Read-only; flags only, not legal advice.',
    parameters: {
      text: { type: 'string', required: true },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          clauses: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                key: { type: 'string', required: true },
                label_zh: { type: 'string', required: true },
                status: { type: 'string', required: true, enum: ['present', 'attention', 'missing'] },
                evidence: { type: 'string', required: true },
                note_zh: { type: 'string', required: true },
              },
            },
          },
          summary: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              present: { type: 'number', required: true },
              attention: { type: 'number', required: true },
              missing: { type: 'number', required: true },
            },
          },
          term: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              type: { type: 'string', required: true, enum: ['fixed', 'open', 'task', 'unknown'] },
              start: { type: 'string', required: true },
              end: { type: 'string', required: true },
              months: nullableNumber,
            },
          },
          probation: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              months: nullableNumber,
              limit_months: nullableNumber,
              term_months: nullableNumber,
              status: { type: 'string', required: true, enum: ['ok', 'over_limit', 'unknown', 'not_applicable'] },
              note_zh: { type: 'string', required: true },
            },
          },
          probation_pay: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              probation_salary_cents: nullableNumber,
              regular_salary_cents: nullableNumber,
              ratio_pct: nullableNumber,
              status: { type: 'string', required: true, enum: ['ok', 'below_80', 'unknown', 'not_applicable'] },
              note_zh: { type: 'string', required: true },
            },
          },
          non_compete: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              mentioned: { type: 'boolean', required: true },
              compensation_mentioned: { type: 'boolean', required: true },
              duration_months: nullableNumber,
              status: { type: 'string', required: true, enum: ['present', 'attention', 'not_applicable'] },
              hint_zh: { type: 'string', required: true },
            },
          },
          disclaimer_zh: { type: 'string', required: true },
        },
      },
      render: (_args, value: LaborCheckResult) => {
        const probation =
          value.probation.months === null
            ? 'not set'
            : `${value.probation.months}m / limit ${value.probation.limit_months ?? '?'}m`
        const ratio = value.probation_pay.ratio_pct === null ? 'n/a' : `${value.probation_pay.ratio_pct.toFixed(2)}%`
        return text(
          `labor_check: clauses ${value.summary.present} present / ${value.summary.attention} attention / ${value.summary.missing} missing; probation ${value.probation.status} (${probation}); pay ${value.probation_pay.status} (${ratio}); non-compete ${value.non_compete.status}`,
        )
      },
    },
    async execute(args) {
      return checkContract(args.text)
    },
  })

  const batch = defineTool({
    name: 'labor_batch',
    description:
      'Batch-check a labor-contract CSV (employee,position,contract_start,contract_end,probation_months,monthly_salary[,probation_salary]): probation over the legal cap, contract expired / expiring within 90 days of as_of, and probation pay below 80% of the agreed wage. Read-only; issues only.',
    parameters: {
      csv: { type: 'string', required: true },
      as_of: { type: 'string' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          as_of: { type: 'string', required: true },
          rows: { type: 'number', required: true },
          issues: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                row: { type: 'number', required: true },
                employee: { type: 'string', required: true },
                position: { type: 'string', required: true },
                code: {
                  type: 'string',
                  required: true,
                  enum: ['CONTRACT_DATE_ORDER', 'PROBATION_OVER_LIMIT', 'PROBATION_PAY_BELOW_80', 'CONTRACT_EXPIRED', 'CONTRACT_EXPIRING'],
                },
                detail_zh: { type: 'string', required: true },
              },
            },
          },
          due: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              expired: { type: 'array', required: true, items: dueItemSchema() },
              expiring: { type: 'array', required: true, items: dueItemSchema() },
            },
          },
          summary: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              rows: { type: 'number', required: true },
              issues: { type: 'number', required: true },
              by_code: { type: 'json', required: true },
              expired: { type: 'number', required: true },
              expiring: { type: 'number', required: true },
            },
          },
        },
      },
      render: (_args, value: BatchResult) =>
        text(
          `labor_batch: ${value.rows} row(s), ${value.issues.length} issue(s), ${value.summary.expired} expired / ${value.summary.expiring} expiring as of ${value.as_of}`,
        ),
    },
    async execute(args) {
      return batchCheck(args.csv, args.as_of)
    },
  })

  const exportIssues = defineTool({
    name: 'labor_export',
    description:
      'Write a labor issue list as quoted UTF-8 CSV under $DSH_HOME/dsh-labor-contract/exports; returns path, row count, bytes and sha256. Local write only; the filename must be one safe component.',
    parameters: {
      issues: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            row: { type: 'number', required: true },
            employee: { type: 'string', required: true },
            position: { type: 'string', required: true },
            code: { type: 'string', required: true },
            detail_zh: { type: 'string', required: true },
          },
        },
      },
      filename: { type: 'string' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          rows: { type: 'number', required: true },
          bytes: { type: 'number', required: true },
          sha256: { type: 'string', required: true },
        },
      },
      render: (_args, value: { path: string; rows: number }) => text(`labor_export: ${value.rows} row(s) -> ${value.path}`),
    },
    async execute(args) {
      const rows = args.issues.map((issue) => [
        String(issue.row),
        issue.employee,
        issue.position,
        issue.code,
        issue.detail_zh,
      ])
      const csv = toCsv([['row', 'employee', 'position', 'code', 'detail_zh'], ...rows])
      const filename =
        args.filename ?? `labor-issues-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
      let filePath: string
      try {
        filePath = await safeExportPath(path.join(deps.baseDir, 'exports'), filename)
      } catch (error) {
        if (error instanceof LaborError) throw error
        throw new LaborError('E_LABOR_PATH_INVALID', String(error))
      }
      try {
        await writeFile(filePath, csv, 'utf8')
      } catch (error) {
        throw new LaborError('E_LABOR_PATH_INVALID', `write failed: ${String(error)}`)
      }
      return { path: filePath, rows: rows.length, bytes: Buffer.byteLength(csv, 'utf8'), sha256: sha256(csv) }
    },
  })

  return [check, batch, exportIssues]
}

function dueItemSchema() {
  return {
    type: 'object' as const,
    additionalProperties: false as const,
    properties: {
      row: { type: 'number' as const, required: true as const },
      employee: { type: 'string' as const, required: true as const },
      position: { type: 'string' as const, required: true as const },
      contract_end: { type: 'string' as const, required: true as const },
      days_left: { type: 'number' as const, required: true as const },
      state: { type: 'string' as const, required: true as const, enum: ['expired', 'expiring'] as const },
    },
  }
}
