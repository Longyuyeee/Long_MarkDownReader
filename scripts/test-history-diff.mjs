import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
const context = vm.createContext({ exports: {} })
vm.runInContext(ts.transpile(fs.readFileSync('src/utils/historyDiff.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), context)
const diff = context.exports.historyDiff
test('diff preserves changed Unicode lines without treating text as HTML', () => {
  const result = diff('标题\r\n当前🙂\n末尾', '标题\n历史<script>\n末尾')
  assert.equal(result.lines.filter(l => l.kind === 'removed')[0].text, '当前🙂')
  assert.equal(result.lines.filter(l => l.kind === 'added')[0].text, '历史<script>')
  assert.equal(result.simplified, false)
})
test('large diff is bounded and reports shortened preview honestly', () => {
  const result = diff(Array(100000).fill('当前').join('\n'), Array(100000).fill('历史').join('\n'))
  assert.equal(result.simplified, true); assert.equal(result.truncated, true)
  assert.ok(result.lines.length <= 2000)
})
