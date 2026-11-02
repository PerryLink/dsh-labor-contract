/**
 * Core review logic for dsh-labor-contract.
 *
 * Everything here is a text heuristic over a synthetic or user-supplied contract.
 * It flags clause coverage and a few statutory limits; it does NOT give legal
 * advice, interpret a specific clause, or replace a lawyer / local HR authority.
 */

export type LaborErrorCode =
  | 'E_LABOR_TEXT_EMPTY'
  | 'E_LABOR_CSV_ROW'
  | 'E_LABOR_DATE_INVALID'
  | 'E_LABOR_PATH_INVALID'

const HUMAN: Record<LaborErrorCode, { text: string; next: string }> = {
  E_LABOR_TEXT_EMPTY: {
    text: '劳动合同文本是空的，没有可核对的条款',
    next: '粘贴或传入完整的合同正文（至少包含甲乙双方和条款）后再跑一次',
  },
  E_LABOR_CSV_ROW: {
    text: '员工合同 CSV 的某一行或表头对不上',
    next: '对照样例表头 employee,position,contract_start,contract_end,probation_months,monthly_salary,probation_salary 重新导出，确保每行列数一致',
  },
  E_LABOR_DATE_INVALID: {
    text: '日期不是有效的 YYYY-MM-DD，或日历上不存在',
    next: '把日期改成 2026-01-01 这样的 YYYY-MM-DD（合同结束日可写“无固定期限”），再重试',
  },
  E_LABOR_PATH_INVALID: {
    text: '导出文件名或导出路径不安全',
    next: '只传一个由字母、数字、点、下划线或短横线组成的文件名，例如 labor-issues.csv；不要带 ../、目录分隔符或中文',
  },
}

export class LaborError extends Error {
  readonly code: LaborErrorCode
  /** Technical detail for logs; never part of the user-facing sentence. */
  readonly detail: string

  constructor(code: LaborErrorCode, detail = '') {
    const human = HUMAN[code]
    const where = detail ? `（${detail}）` : ''
    super(`${human.text}${where}（${code}）｜下一步：${human.next}`)
    this.name = 'LaborError'
    this.code = code
    this.detail = detail
  }
}

export const DISCLAIMER_ZH =
  '仅做条款覆盖、日期和比例的格式核对，不构成法律意见；具体合规请咨询执业律师或当地人力资源社会保障部门。'

/* ------------------------------------------------------------------ dates */

export interface Ymd {
  y: number
  m: number
  d: number
}

const DAY_MS = 86_400_000
const iso = (ymd: Ymd) => `${String(ymd.y).padStart(4, '0')}-${String(ymd.m).padStart(2, '0')}-${String(ymd.d).padStart(2, '0')}`
export const formatYmd = iso

/** Strict `YYYY-MM-DD` parser with a real-calendar check. Returns null when invalid. */
export function parseYmd(raw: string): Ymd | null {
  const value = raw.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return { y, m, d }
}

export function ymdToEpochDay(ymd: Ymd): number {
  return Date.UTC(ymd.y, ymd.m - 1, ymd.d) / DAY_MS
}

export function addDays(ymd: Ymd, days: number): Ymd {
  const date = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d) + days * DAY_MS)
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() }
}

/**
 * Whole months covered by an inclusive `[start, end]` range, using the common
 * contract convention (end date included). 2026-01-01..2026-03-31 is 3 months;
 * 2026-01-01..2026-03-30 is 2 whole months plus a remainder.
 */
export function contractTermMonths(start: Ymd, end: Ymd): number {
  const afterEnd = addDays(end, 1)
  let months = (afterEnd.y - start.y) * 12 + (afterEnd.m - start.m)
  if (afterEnd.d < start.d) months -= 1
  return months
}

export function daysBetween(from: Ymd, to: Ymd): number {
  return ymdToEpochDay(to) - ymdToEpochDay(from)
}

/* ---------------------------------------------------------- text helpers */

const clean = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ')

function evidenceFor(text: string, pattern: RegExp): string {
  const sentences = clean(text)
    .split(/[。；;\n]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  for (const sentence of sentences) {
    if (pattern.test(sentence)) return sentence.length > 72 ? `${sentence.slice(0, 71)}…` : sentence
  }
  return ''
}

function has(text: string, pattern: RegExp): boolean {
  return pattern.test(text)
}

/* --------------------------------------------------------------- clauses */

export type ClauseStatus = 'present' | 'attention' | 'missing'

export interface ClauseResult {
  key: string
  label_zh: string
  status: ClauseStatus
  evidence: string
  note_zh: string
}

interface ClauseSpec {
  key: string
  label_zh: string
  pattern: RegExp
  specific: RegExp
  attentionNote: string
  missingNote: string
}

const CLAUSES: ClauseSpec[] = [
  {
    key: 'term',
    label_zh: '合同期限',
    pattern: /合同期限|期限类型|固定期限|无固定期限|以完成一定工作任务为期限|本合同自/,
    specific: /20\d{2}\s*年[\s\S]{0,16}20\d{2}\s*年|20\d{2}-\d{1,2}-\d{1,2}|无固定期限|以完成一定工作任务为期限/,
    attentionNote: '有期限条款，但没看到明确的起止日期或“无固定期限”表述。',
    missingNote: '未找到合同期限条款，建议写明固定期限起止日期、无固定期限或以完成一定工作任务为期限。',
  },
  {
    key: 'duties',
    label_zh: '工作内容',
    pattern: /工作内容|工作岗位|岗位职责|职务|职位/,
    specific: /(岗位|职务|职位)(?:为|是|：|:)|担任|工程师|会计|销售|客服|仓管|经理|专员|主管|助理|技术员|操作工|设计师|顾问|程序员/,
    attentionNote: '有工作内容条款，但没有看到具体岗位或职责描述。',
    missingNote: '未找到工作内容条款，建议写明岗位名称和主要职责。',
  },
  {
    key: 'location',
    label_zh: '工作地点',
    pattern: /工作地点|办公地点|工作场所/,
    specific:
      /工作地点(?:为|是|：|:)|办公地点(?:为|是|：|:)|(北京|上海|天津|重庆|杭州|南京|广州|深圳|成都|武汉|西安|苏州|宁波|青岛|长沙|郑州|合肥|福州|厦门)(市|区|县)?|(省|市|区|县)[\s\S]{0,12}(路|街|号)/,
    attentionNote: '有工作地点条款，但没有看到城市、区县或具体地址。',
    missingNote: '未找到工作地点条款，建议写明实际工作城市/地址，避免用“全国”“根据需要安排”一笔带过。',
  },
  {
    key: 'hours',
    label_zh: '工时与休息休假',
    pattern: /工作时间|工时|休息休假|休息日|休假/,
    specific: /标准工时|综合计算工时|不定时|每日[\s\S]{0,6}(小时|工作时间)|每周[\s\S]{0,6}(天|小时)|双休|休息日|法定节假日|年休假/,
    attentionNote: '有工时条款，但没看到标准工时/综合计算工时/不定时中的哪一种，或每周工作时长。',
    missingNote: '未找到工时与休息休假条款，建议写明朝九晚六等作息、工时制度及休息休假安排。',
  },
  {
    key: 'pay',
    label_zh: '劳动报酬',
    pattern: /劳动报酬|工资|薪酬|月薪|薪资/,
    specific: /(工资|薪酬|月薪|劳动报酬)[\s\S]{0,30}?\d[\d,]*(?:\.\d{1,2})?\s*元|\d[\d,]*(?:\.\d{1,2})?\s*元[\s\S]{0,10}(工资|薪酬)/,
    attentionNote: '有劳动报酬条款，但没有看到明确的金额或计算方式。',
    missingNote: '未找到劳动报酬条款，建议写明工资标准、发放日期和支付方式。',
  },
  {
    key: 'insurance',
    label_zh: '社会保险',
    pattern: /社会保险|社保|五险/,
    specific: /(社会保险|社保)[\s\S]{0,20}(缴纳|参加|办理|参保)|五险|养老保险|医疗保险|失业保险|工伤保险|生育保险/,
    attentionNote: '有社会保险条款，但没有看到“依法缴纳/参加”或具体险种。',
    missingNote: '未找到社会保险条款，建议写明依法参加养老、医疗、失业、工伤、生育保险并按时足额缴纳。',
  },
  {
    key: 'protection',
    label_zh: '劳动保护与劳动条件',
    pattern: /劳动保护|劳动条件|职业危害|职业病|安全生产/,
    specific: /劳动条件|职业危害|职业病|防护用品|劳动保护用品|安全培训|安全生产|健康检查|体检/,
    attentionNote: '有劳动保护条款，但没有看到劳动条件、防护用品或职业健康检查的具体安排。',
    missingNote: '未找到劳动保护与劳动条件条款，建议写明劳动保护用品、安全培训及职业健康检查安排。',
  },
  {
    key: 'termination',
    label_zh: '解除与终止',
    pattern: /解除|终止|辞职|辞退/,
    specific: /(解除|终止)[\s\S]{0,80}(通知|补偿|经济补偿|协商一致|提前三十日|提前30日)|经济补偿|赔偿金/,
    attentionNote: '有解除/终止条款，但没有看到通知期、协商一致或经济补偿的处理方式。',
    missingNote: '未找到解除与终止条款，建议写明协商解除、提前通知期和经济补偿的适用情形。',
  },
  {
    key: 'dispute',
    label_zh: '争议解决',
    pattern: /争议解决|劳动争议|争议|仲裁|诉讼/,
    specific: /(劳动争议|争议)[\s\S]{0,80}(仲裁|诉讼)|仲裁委员会|劳动人事争议仲裁院|人民法院/,
    attentionNote: '有争议条款，但没有看到协商、仲裁或诉讼的具体路径。',
    missingNote: '未找到争议解决条款，建议写明先协商，协商不成向有管辖权的劳动人事争议仲裁委员会申请仲裁。',
  },
]

export interface ClauseSummary {
  present: number
  attention: number
  missing: number
}

function reviewClauses(text: string): { clauses: ClauseResult[]; summary: ClauseSummary } {
  const clauses = CLAUSES.map((spec) => {
    if (!has(text, spec.pattern)) {
      return { key: spec.key, label_zh: spec.label_zh, status: 'missing' as const, evidence: '', note_zh: spec.missingNote }
    }
    if (!has(text, spec.specific)) {
      return { key: spec.key, label_zh: spec.label_zh, status: 'attention' as const, evidence: evidenceFor(text, spec.pattern), note_zh: spec.attentionNote }
    }
    return { key: spec.key, label_zh: spec.label_zh, status: 'present' as const, evidence: evidenceFor(text, spec.specific), note_zh: '' }
  })
  const summary = {
    present: clauses.filter((clause) => clause.status === 'present').length,
    attention: clauses.filter((clause) => clause.status === 'attention').length,
    missing: clauses.filter((clause) => clause.status === 'missing').length,
  }
  return { clauses, summary }
}

/* ---------------------------------------------------------- contract dates */

export interface ContractTerm {
  type: 'fixed' | 'open' | 'task' | 'unknown'
  start: Ymd | null
  end: Ymd | null
  months: number | null
  invalid_dates: string[]
}

const CN_DATE = /(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(?:起|开始)?\s*(?:至|到|—|–|-|～|~)\s*(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/
const ISO_DATE = /(20\d{2})-(\d{1,2})-(\d{1,2})\s*(?:至|到|—|–|-|～|~)\s*(20\d{2})-(\d{1,2})-(\d{1,2})/

function toYmd(y: string, m: string, d: string): Ymd | null {
  const raw = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  return parseYmd(raw)
}

export function extractContractTerm(text: string): ContractTerm {
  const source = clean(text)
  const match = CN_DATE.exec(source) ?? ISO_DATE.exec(source)
  if (match) {
    const start = toYmd(match[1]!, match[2]!, match[3]!)
    const end = toYmd(match[4]!, match[5]!, match[6]!)
    const invalid: string[] = []
    if (!start) invalid.push(`${match[1]}-${match[2]}-${match[3]}`)
    if (!end) invalid.push(`${match[4]}-${match[5]}-${match[6]}`)
    if (!start || !end) return { type: 'fixed', start, end, months: null, invalid_dates: invalid }
    const months = contractTermMonths(start, end)
    if (months < 0) return { type: 'fixed', start, end, months: null, invalid_dates: [`结束日期早于开始日期：${iso(end)}`] }
    return { type: 'fixed', start, end, months, invalid_dates: [] }
  }
  if (/无固定期限/.test(source)) return { type: 'open', start: null, end: null, months: null, invalid_dates: [] }
  if (/以完成一定工作任务为期限/.test(source)) return { type: 'task', start: null, end: null, months: null, invalid_dates: [] }
  return { type: 'unknown', start: null, end: null, months: null, invalid_dates: [] }
}

/* ------------------------------------------------------------ probation */

export interface ProbationCheck {
  months: number | null
  limit_months: number | null
  term_months: number | null
  status: 'ok' | 'over_limit' | 'unknown' | 'not_applicable'
  note_zh: string
}

const CN_NUMERALS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
}

function parseCount(raw: string): number | null {
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw)
  if (raw === '十') return 10
  if (raw.length === 2 && raw[0] === '十' && CN_NUMERALS[raw[1]!] !== undefined) return 10 + CN_NUMERALS[raw[1]!]!
  if (raw.length === 2 && raw[1] === '十' && CN_NUMERALS[raw[0]!] !== undefined) return CN_NUMERALS[raw[0]!]! * 10
  if (raw.length === 1 && CN_NUMERALS[raw] !== undefined) return CN_NUMERALS[raw]!
  return null
}

const PROBATION_MENTION = /试用期(?:为|是|：|:)?\s*(?:人民币)?\s*(\d+(?:\.\d+)?|[一二两三四五六七八九十]{1,3})\s*(个月|月|日|天|年)/
const NO_PROBATION = /(?:无|不约定|不设|取消)试用期/

export function parseProbationMonths(text: string): number | null {
  const source = clean(text)
  const match = PROBATION_MENTION.exec(source)
  if (match) {
    const count = parseCount(match[1]!)
    if (count === null) return null
    if (match[2] === '年') return count * 12
    if (match[2] === '日' || match[2] === '天') return Math.round((count / 30) * 100) / 100
    return count
  }
  if (NO_PROBATION.test(source)) return 0
  return null
}

/** Statutory probation cap: <3m → 0, 3m–<1y → 1, 1y–<3y → 2, >=3y / open-ended → 6. */
export function probationLimitMonths(term: ContractTerm): number | null {
  if (term.type === 'open') return 6
  if (term.type === 'task') return 0
  if (term.type !== 'fixed' || term.months === null) return null
  if (term.months < 3) return 0
  if (term.months < 12) return 1
  if (term.months < 36) return 2
  return 6
}

function reviewProbation(text: string, term: ContractTerm): ProbationCheck {
  const months = parseProbationMonths(text)
  const limit = probationLimitMonths(term)
  if (months === null) {
    return {
      months: null,
      limit_months: limit,
      term_months: term.months,
      status: 'not_applicable',
      note_zh: '没有识别到试用期约定；若合同实际约定过试用期，请确认条款写法。',
    }
  }
  if (months === 0) {
    return { months: 0, limit_months: limit, term_months: term.months, status: 'not_applicable', note_zh: '合同未约定试用期。' }
  }
  if (limit === null) {
    const reason =
      term.type === 'unknown'
        ? '没能从文本里识别出合同期限，无法判断试用期上限。'
        : '合同日期无法解析，无法判断试用期上限。'
    return { months, limit_months: null, term_months: term.months, status: 'unknown', note_zh: reason }
  }
  if (months > limit) {
    const limitText = limit === 0 ? '不得约定试用期' : `不得超过 ${limit} 个月`
    return {
      months,
      limit_months: limit,
      term_months: term.months,
      status: 'over_limit',
      note_zh: `试用期 ${months} 个月超过法定上限：该合同期限${limitText}。`,
    }
  }
  return {
    months,
    limit_months: limit,
    term_months: term.months,
    status: 'ok',
    note_zh: `试用期 ${months} 个月，未超过该合同期限的上限 ${limit} 个月。`,
  }
}

/* --------------------------------------------------------- probation pay */

const MONEY = '(\\d[\\d,]*(?:\\.\\d{1,2})?)'
const PROBATION_PAY = new RegExp(
  `试用期(?:工资|月工资|薪酬|薪资)(?:为|是|：|:)?\\s*(?:人民币)?\\s*${MONEY}\\s*元`,
)
const REGULAR_PAY_EXPLICIT = new RegExp(
  `(?:转正后|转正|正式)(?:的)?(?:月)?(?:工资|薪酬|薪资)(?:为|是|：|:)?\\s*(?:人民币)?\\s*${MONEY}\\s*元`,
)
const REGULAR_PAY_FALLBACK = new RegExp(
  `(?:月工资|月薪|劳动报酬|工资)(?:为|是|：|:)?\\s*(?:人民币)?\\s*${MONEY}\\s*元`,
)

function toCents(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const value = Number(raw.replace(/,/g, ''))
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

export interface ProbationPayCheck {
  probation_salary_cents: number | null
  regular_salary_cents: number | null
  ratio_pct: number | null
  status: 'ok' | 'below_80' | 'unknown' | 'not_applicable'
  note_zh: string
}

export function reviewProbationPay(text: string): ProbationPayCheck {
  const source = clean(text)
  const probation = toCents(PROBATION_PAY.exec(source)?.[1])
  let regular = toCents(REGULAR_PAY_EXPLICIT.exec(source)?.[1])
  if (regular === null) {
    // Remove the probation sentence so "试用期工资" is never mistaken for the regular wage.
    const withoutProbation = source.replace(/试用期[^。；\n]*/g, '')
    regular = toCents(REGULAR_PAY_FALLBACK.exec(withoutProbation)?.[1])
  }
  if (probation === null || regular === null) {
    return {
      probation_salary_cents: probation,
      regular_salary_cents: regular,
      ratio_pct: null,
      status: 'unknown',
      note_zh: '没同时识别到试用期工资和转正后月工资，无法计算 80% 比例。',
    }
  }
  const ratio = Math.round((probation * 10_000) / regular) / 100
  const below = probation * 100 < regular * 80
  return {
    probation_salary_cents: probation,
    regular_salary_cents: regular,
    ratio_pct: ratio,
    status: below ? 'below_80' : 'ok',
    note_zh: below
      ? `试用期工资为约定工资的 ${ratio.toFixed(2)}%，低于 80% 下限；同时还要不低于当地最低工资标准。`
      : `试用期工资为约定工资的 ${ratio.toFixed(2)}%，不低于 80%；仍需确认不低于当地最低工资标准。`,
  }
}

/* ---------------------------------------------------------- non-compete */

const NON_COMPETE_HINT =
  '竞业限制需在限制期限内按月支付经济补偿；未约定补偿时，劳动者可主张按离职前十二个月平均工资的 30% 按月支付；竞业限制期限不得超过二年。'

export interface NonCompeteCheck {
  mentioned: boolean
  compensation_mentioned: boolean
  duration_months: number | null
  status: 'present' | 'attention' | 'not_applicable'
  hint_zh: string
}

export function reviewNonCompete(text: string): NonCompeteCheck {
  const source = clean(text)
  if (!/竞业限制|竞业禁止/.test(source)) {
    return { mentioned: false, compensation_mentioned: false, duration_months: null, status: 'not_applicable', hint_zh: NON_COMPETE_HINT }
  }
  const compensation = /(?:竞业限制|竞业禁止)[\s\S]{0,160}?(?:经济补偿|补偿金|补偿)/.test(source)
  const durationMatch =
    /(?:竞业限制|竞业禁止)(?:期限|期间|期)?(?:为|是|：|:)?\s*(\d+|[一二两三四五六七八九十]{1,3})\s*(年|个月)/.exec(source)
  let duration: number | null = null
  if (durationMatch) {
    const count = parseCount(durationMatch[1]!)
    if (count !== null) duration = durationMatch[2] === '年' ? count * 12 : count
  }
  const tooLong = duration !== null && duration > 24
  const status = !compensation || tooLong ? 'attention' : 'present'
  const reasons: string[] = []
  if (!compensation) reasons.push('提到了竞业限制，但没有看到按月支付经济补偿的约定')
  if (tooLong) reasons.push(`竞业限制期限 ${duration} 个月，超过二年上限`)
  return {
    mentioned: true,
    compensation_mentioned: compensation,
    duration_months: duration,
    status,
    hint_zh: reasons.length > 0 ? `${reasons.join('；')}。${NON_COMPETE_HINT}` : NON_COMPETE_HINT,
  }
}

/* ------------------------------------------------------------- check API */

export interface LaborCheckResult {
  clauses: ClauseResult[]
  summary: ClauseSummary
  term: { type: 'fixed' | 'open' | 'task' | 'unknown'; start: string; end: string; months: number | null }
  probation: ProbationCheck
  probation_pay: ProbationPayCheck
  non_compete: NonCompeteCheck
  disclaimer_zh: string
}

export function checkContract(text: string): LaborCheckResult {
  if (typeof text !== 'string' || text.trim() === '') throw new LaborError('E_LABOR_TEXT_EMPTY')
  const source = clean(text)
  const { clauses, summary } = reviewClauses(source)
  const term = extractContractTerm(source)
  return {
    clauses,
    summary,
    term: {
      type: term.type,
      start: term.start ? iso(term.start) : '',
      end: term.end ? iso(term.end) : '',
      months: term.months,
    },
    probation: reviewProbation(source, term),
    probation_pay: reviewProbationPay(source),
    non_compete: reviewNonCompete(source),
    disclaimer_zh: DISCLAIMER_ZH,
  }
}

/* ------------------------------------------------------------------ CSV */

export type IssueCode =
  | 'CONTRACT_DATE_ORDER'
  | 'PROBATION_OVER_LIMIT'
  | 'PROBATION_PAY_BELOW_80'
  | 'CONTRACT_EXPIRED'
  | 'CONTRACT_EXPIRING'

export interface BatchIssue {
  row: number
  employee: string
  position: string
  code: IssueCode
  detail_zh: string
}

export interface DueItem {
  row: number
  employee: string
  position: string
  contract_end: string
  days_left: number
  state: 'expired' | 'expiring'
}

export interface BatchResult {
  as_of: string
  rows: number
  issues: BatchIssue[]
  due: { expired: DueItem[]; expiring: DueItem[] }
  summary: {
    rows: number
    issues: number
    by_code: Record<string, number>
    expired: number
    expiring: number
  }
}

export type OpenEnded = 'open'

export interface EmployeeRow {
  row: number
  employee: string
  position: string
  contract_start: Ymd
  contract_end: Ymd | OpenEnded
  probation_months: number
  monthly_salary_cents: number
  probation_salary_cents: number | null
}

/** RFC 4180-style CSV parser: quoted fields, embedded commas/quotes/newlines, CRLF. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') {
        quoted = false
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"' && cell.trim() === '') {
      quoted = true
    } else if (ch === ',') {
      row.push(cell.trim())
      cell = ''
    } else if (ch === '\n') {
      row.push(cell.trim())
      rows.push(row)
      row = []
      cell = ''
    } else if (ch === '\r') {
      // normalized by the next \n or ignored at EOF
    } else {
      cell += ch
    }
  }
  if (quoted) throw new LaborError('E_LABOR_CSV_ROW', 'unclosed quoted field')
  if (cell !== '' || row.length > 0) {
    row.push(cell.trim())
    rows.push(row)
  }
  return rows
}

const REQUIRED = ['employee', 'position', 'contract_start', 'contract_end', 'probation_months', 'monthly_salary'] as const

function moneyCents(raw: string, row: number): number {
  const value = raw.replace(/,/g, '').trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new LaborError('E_LABOR_CSV_ROW', `row ${row}: invalid monthly_salary ${JSON.stringify(raw)}`)
  }
  const cents = Math.round(Number(value) * 100)
  if (cents <= 0) throw new LaborError('E_LABOR_CSV_ROW', `row ${row}: monthly_salary must be positive`)
  return cents
}

function dateCell(raw: string, row: number, field: string): Ymd {
  const value = raw.trim()
  const parsed = parseYmd(value)
  if (!parsed) throw new LaborError('E_LABOR_DATE_INVALID', `row ${row}: ${field}=${JSON.stringify(value)}`)
  return parsed
}

export function parseEmployeesCsv(csv: string): EmployeeRow[] {
  const table = parseCsv(csv).filter((cells) => cells.some((cell) => cell !== ''))
  if (table.length === 0) throw new LaborError('E_LABOR_CSV_ROW', 'CSV is empty')
  const header = table[0]!.map((cell) => cell.toLowerCase())
  const index = new Map(header.map((name, i) => [name, i]))
  for (const name of REQUIRED) {
    if (!index.has(name)) throw new LaborError('E_LABOR_CSV_ROW', `missing header column: ${name}`)
  }
  const probationSalaryIndex = index.get('probation_salary')
  const rows: EmployeeRow[] = []
  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i]!
    const rowNumber = i + 1
    if (cells.length !== header.length) {
      throw new LaborError('E_LABOR_CSV_ROW', `row ${rowNumber}: expected ${header.length} columns, got ${cells.length}`)
    }
    const at = (name: string) => cells[index.get(name)!] ?? ''
    const employee = at('employee')
    const position = at('position')
    if (employee === '' || position === '') throw new LaborError('E_LABOR_CSV_ROW', `row ${rowNumber}: employee/position required`)
    const probationRaw = at('probation_months').trim()
    if (!/^\d+$/.test(probationRaw)) throw new LaborError('E_LABOR_CSV_ROW', `row ${rowNumber}: probation_months must be a non-negative integer`)
    const endRaw = at('contract_end').trim()
    const contractEnd = /^(无固定期限|open-ended|open)$/i.test(endRaw) ? ('open' as const) : dateCell(endRaw, rowNumber, 'contract_end')
    const probationSalaryRaw = probationSalaryIndex === undefined ? '' : (cells[probationSalaryIndex] ?? '').trim()
    const probationSalary = probationSalaryRaw === '' ? null : moneyCents(probationSalaryRaw, rowNumber)
    rows.push({
      row: rowNumber,
      employee,
      position,
      contract_start: dateCell(at('contract_start'), rowNumber, 'contract_start'),
      contract_end: contractEnd,
      probation_months: Number(probationRaw),
      monthly_salary_cents: moneyCents(at('monthly_salary'), rowNumber),
      probation_salary_cents: probationSalary,
    })
  }
  if (rows.length === 0) throw new LaborError('E_LABOR_CSV_ROW', 'CSV has a header but no employee rows')
  return rows
}

const moneyText = (cents: number) => (cents / 100).toFixed(2)
const EXPIRING_WINDOW_DAYS = 90

function limitForRow(row: EmployeeRow): number {
  if (row.contract_end === 'open') return 6
  const months = contractTermMonths(row.contract_start, row.contract_end)
  if (months < 3) return 0
  if (months < 12) return 1
  if (months < 36) return 2
  return 6
}

export function batchCheck(csv: string, asOfRaw?: string): BatchResult {
  const asOf = asOfRaw === undefined || asOfRaw.trim() === '' ? new Date().toISOString().slice(0, 10) : asOfRaw.trim()
  const asOfDate = parseYmd(asOf)
  if (!asOfDate) throw new LaborError('E_LABOR_DATE_INVALID', `as_of=${JSON.stringify(asOf)}`)
  const rows = parseEmployeesCsv(csv)
  const issues: BatchIssue[] = []
  const due: DueItem[] = []

  for (const row of rows) {
    if (row.contract_end !== 'open') {
      const days = daysBetween(asOfDate, row.contract_end)
      if (days < 0) {
        issues.push({
          row: row.row,
          employee: row.employee,
          position: row.position,
          code: 'CONTRACT_EXPIRED',
          detail_zh: `合同已于 ${iso(row.contract_end)} 到期（${-days} 天前），请确认是否续签或终止。`,
        })
        due.push({ row: row.row, employee: row.employee, position: row.position, contract_end: iso(row.contract_end), days_left: days, state: 'expired' })
      } else if (days <= EXPIRING_WINDOW_DAYS) {
        issues.push({
          row: row.row,
          employee: row.employee,
          position: row.position,
          code: 'CONTRACT_EXPIRING',
          detail_zh: `合同将于 ${iso(row.contract_end)} 到期（还剩 ${days} 天），已进入 ${EXPIRING_WINDOW_DAYS} 天续签提醒窗口。`,
        })
        due.push({ row: row.row, employee: row.employee, position: row.position, contract_end: iso(row.contract_end), days_left: days, state: 'expiring' })
      }
      const termMonths = contractTermMonths(row.contract_start, row.contract_end)
      if (termMonths < 0) {
        issues.push({
          row: row.row,
          employee: row.employee,
          position: row.position,
          code: 'CONTRACT_DATE_ORDER',
          detail_zh: '合同结束日期早于开始日期，请更正日期。',
        })
      }
    }
    const limit = limitForRow(row)
    if (row.probation_months > limit) {
      issues.push({
        row: row.row,
        employee: row.employee,
        position: row.position,
        code: 'PROBATION_OVER_LIMIT',
        detail_zh: `试用期 ${row.probation_months} 个月，超过该合同期限的上限 ${limit} 个月。`,
      })
    }
    if (row.probation_months > 0 && row.probation_salary_cents !== null) {
      if (row.probation_salary_cents * 100 < row.monthly_salary_cents * 80) {
        const ratio = Math.round((row.probation_salary_cents * 10_000) / row.monthly_salary_cents) / 100
        issues.push({
          row: row.row,
          employee: row.employee,
          position: row.position,
          code: 'PROBATION_PAY_BELOW_80',
          detail_zh: `试用期工资 ${moneyText(row.probation_salary_cents)} 元，为约定月工资 ${moneyText(row.monthly_salary_cents)} 元的 ${ratio.toFixed(2)}%，低于 80% 下限。`,
        })
      }
    }
  }

  const byCode = new Map<string, number>()
  for (const issue of issues) byCode.set(issue.code, (byCode.get(issue.code) ?? 0) + 1)
  const by_code = Object.fromEntries([...byCode.entries()].sort(([a], [b]) => a.localeCompare(b)))
  const expired = due.filter((item) => item.state === 'expired')
  const expiring = due.filter((item) => item.state === 'expiring')
  return {
    as_of: asOf,
    rows: rows.length,
    issues,
    due: { expired, expiring },
    summary: { rows: rows.length, issues: issues.length, by_code, expired: expired.length, expiring: expiring.length },
  }
}

export { EXPIRING_WINDOW_DAYS }
