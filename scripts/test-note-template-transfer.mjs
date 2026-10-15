import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
const config = vm.createContext({ exports: {}, TextEncoder })
vm.runInContext(ts.transpile(fs.readFileSync('src/config/noteTemplates.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), config)
const ctx = vm.createContext({ exports: {}, TextEncoder, require: () => config.exports })
vm.runInContext(ts.transpile(fs.readFileSync('src/utils/noteTemplateTransfer.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), ctx)
const { validateTemplateBundle: validate, planTemplateImport: plan } = ctx.exports
const bundle = templates => ({ kind: 'longedit-note-templates', schemaVersion: 1, templates })
test('bundle retains authored Unicode, variables and empty templates without machine identities', () => {
  const output = validate(bundle([{ name: '  沟通🙂  ', content: '# {{title}}\r\n{{date}}' }, { name: '空白自定义', content: '' }]))
  assert.equal(output.templates[0].name, '沟通🙂'); assert.equal(output.templates[0].content, '# {{title}}\r\n{{date}}')
  assert.equal(JSON.stringify(output).includes('defaultNoteTemplates'), false)
})
test('imports reserve builtins and local names, rename file duplicates, and honor selection/skip', () => {
  const entries = [{ name: '会议纪要', content: 'a' }, { name: '项目', content: 'b' }, { name: '项目', content: 'c' }, { name: '不选择', content: '' }]
  const existing = [{ id: 'local', name: '项目', content: '原文' }]
  const output = plan(entries, [0, 1, 2], existing, 'keep-both')
  assert.deepEqual(Array.from(output, entry => entry.name), ['会议纪要 (2)', '项目 (2)', '项目 (3)'])
  assert.equal(existing[0].content, '原文')
  assert.equal(plan(entries, [1, 2], existing, 'skip').every(entry => entry.skipped), true)
  assert.equal(plan(entries, [], existing, 'keep-both').length, 0)
})
test('long names remain valid after collision suffix; malformed/unsupported/oversized data is rejected', () => {
  const name = '🙂'.repeat(80), entry = { name, content: '' }
  assert.equal([...plan([entry], [0], [{ id: 'local', ...entry }], 'keep-both')[0].name].length, 80)
  for (const value of [null, {}, { ...bundle([entry]), schemaVersion: 2 }, bundle([]), bundle([null]), bundle([{ name: 'x', content: 1 }]), bundle([{ name: 'x', content: '中'.repeat(90000) }]), bundle(Array(65).fill(entry))]) assert.throws(() => validate(value))
})
