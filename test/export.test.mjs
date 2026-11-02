import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { csvField, toCsv } from '../lib/core/csv.js'
import { safeExportPath } from '../lib/core/safe-path.js'
import { createTools } from '../lib/plugin/tools.js'

const exec = { callId: 'labor-export-test' }
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const ISSUE = {
  row: 3,
  employee: '李二（合成）',
  position: '会计',
  code: 'PROBATION_OVER_LIMIT',
  detail_zh: '试用期 3 个月，超过上限 2 个月。',
}

async function tempDir(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-labor-contract-export-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

test('csvField escapes commas, quotes and newlines and toCsv keeps a trailing newline', () => {
  assert.equal(csvField('plain'), 'plain')
  assert.equal(csvField('甲,乙'), '"甲,乙"')
  assert.equal(csvField('说"是"'), '"说""是"""')
  assert.equal(csvField('第一行\n第二行'), '"第一行\n第二行"')
  assert.equal(toCsv([]), '')
  assert.equal(toCsv([['a', 'b'], ['c', 'd']]), 'a,b\nc,d\n')
})

test('labor.export writes a quoted UTF-8 CSV with path, rows, bytes and sha256', async (t) => {
  const dir = await tempDir(t)
  const baseDir = path.join(dir, 'store')
  const tools = Object.fromEntries(createTools({ baseDir }).map((tool) => [tool.name, tool]))
  const result = await tools['labor.export'].execute({ issues: [ISSUE], filename: 'issues.csv' }, exec)
  assert.equal(result.path, path.join(await realpath(baseDir), 'exports', 'issues.csv'))
  assert.equal(result.rows, 1)
  const expected = toCsv([
    ['row', 'employee', 'position', 'code', 'detail_zh'],
    ['3', '李二（合成）', '会计', 'PROBATION_OVER_LIMIT', '试用期 3 个月，超过上限 2 个月。'],
  ])
  assert.equal(await readFile(result.path, 'utf8'), expected)
  assert.equal(result.bytes, Buffer.byteLength(expected, 'utf8'))
  assert.equal(result.sha256, sha256(expected))
})

test('labor.export quotes commas, quotes and newlines in an issue detail', async (t) => {
  const dir = await tempDir(t)
  const tools = Object.fromEntries(createTools({ baseDir: path.join(dir, 'store') }).map((tool) => [tool.name, tool]))
  const issue = { ...ISSUE, employee: '甲,乙', detail_zh: '第一行\n说"是"；还有,逗号' }
  const result = await tools['labor.export'].execute({ issues: [issue], filename: 'quoted.csv' }, exec)
  const content = await readFile(result.path, 'utf8')
  assert.match(content, /"甲,乙"/)
  assert.match(content, /"第一行\n说""是""；还有,逗号"/)
  assert.equal(result.sha256, sha256(content))
})

test('labor.export writes a header-only CSV for an empty issue list', async (t) => {
  const dir = await tempDir(t)
  const tools = Object.fromEntries(createTools({ baseDir: path.join(dir, 'store') }).map((tool) => [tool.name, tool]))
  const result = await tools['labor.export'].execute({ issues: [], filename: 'empty.csv' }, exec)
  assert.equal(result.rows, 0)
  assert.equal(await readFile(result.path, 'utf8'), 'row,employee,position,code,detail_zh\n')
})

test('labor.export rejects traversal, separators and absolute paths with E_LABOR_PATH_INVALID', async (t) => {
  const dir = await tempDir(t)
  const tools = Object.fromEntries(createTools({ baseDir: path.join(dir, 'store') }).map((tool) => [tool.name, tool]))
  for (const filename of ['../evil.csv', '..\\evil.csv', '/tmp/evil.csv', 'a/b.csv', 'with space.csv', '表格.csv', '', '..', '.']) {
    await assert.rejects(
      () => tools['labor.export'].execute({ issues: [ISSUE], filename }, exec),
      (error) => error.code === 'E_LABOR_PATH_INVALID',
      filename,
    )
  }
})

test('safeExportPath re-anchors a symlinked export directory on its realpath', async (t) => {
  const dir = await tempDir(t)
  const real = path.join(dir, 'real')
  const link = path.join(dir, 'link')
  await mkdir(real)
  await symlink(real, link, 'dir')
  const file = await safeExportPath(link, 'ok.csv')
  assert.ok(file.startsWith(`${await realpath(real)}${path.sep}`), file)
})

test('the default export filename is a dated safe component', async (t) => {
  const dir = await tempDir(t)
  const tools = Object.fromEntries(createTools({ baseDir: path.join(dir, 'store') }).map((tool) => [tool.name, tool]))
  const result = await tools['labor.export'].execute({ issues: [ISSUE] }, exec)
  assert.match(path.basename(result.path), /^labor-issues-\d{8}\.csv$/)
})
