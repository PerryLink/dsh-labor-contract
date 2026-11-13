import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as plugin from '../lib/plugin/index.js'
import { createTools } from '../lib/plugin/tools.js'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contractPath = path.join(packageRoot, 'samples', 'quickstart', 'input', 'labor-contract.txt')

test('createTools exposes the three labor_* tools with unique names and summaries', () => {
  const tools = createTools({ baseDir: path.join(os.tmpdir(), 'dsh-labor-contract-smoke') })
  assert.deepEqual(tools.map((tool) => tool.name), ['labor_check', 'labor_batch', 'labor_export'])
  assert.equal(new Set(tools.map((tool) => tool.name)).size, 3)
  for (const tool of tools) {
    assert.ok(tool.name.startsWith('labor_'))
    assert.ok(tool.description.length > 0)
    assert.equal(typeof tool.execute, 'function')
    assert.equal(typeof tool.output.render, 'function')
  }
})

test('resolveBaseDir defaults to $DSH_HOME/dsh-labor-contract and honors the override', () => {
  assert.equal(plugin.resolveBaseDir({ DSH_HOME: '/tmp/dsh-home' }), path.join('/tmp/dsh-home', 'dsh-labor-contract'))
  assert.equal(
    plugin.resolveBaseDir({ DSH_HOME: '/tmp/dsh-home', DSH_LABOR_CONTRACT_HOME: '/tmp/labor-home' }),
    '/tmp/labor-home',
  )
})

test('apply() registers the tools and writes exports under the documented root', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-labor-contract-apply-'))
  const previous = process.env.DSH_LABOR_CONTRACT_HOME
  process.env.DSH_LABOR_CONTRACT_HOME = dir
  t.after(async () => {
    if (previous === undefined) delete process.env.DSH_LABOR_CONTRACT_HOME
    else process.env.DSH_LABOR_CONTRACT_HOME = previous
    await rm(dir, { recursive: true, force: true })
  })

  const registered = []
  await plugin.apply({ tools: { register(tool) { registered.push(tool) } } })
  assert.equal(plugin.name, 'dsh-labor-contract')
  assert.deepEqual(plugin.inject, ['tools'])
  assert.equal(registered.length, 3)

  const check = registered.find((tool) => tool.name === 'labor_check')
  const result = await check.execute({ text: '劳动合同\n甲方：合成公司\n乙方：合成员工\n' }, { callId: 'apply' })
  assert.equal(result.summary.missing, 9)

  const exportIssues = registered.find((tool) => tool.name === 'labor_export')
  const exported = await exportIssues.execute({ issues: [], filename: 'apply.csv' }, { callId: 'apply' })
  assert.ok(exported.path.startsWith(`${dir}${path.sep}exports${path.sep}`), exported.path)
})
