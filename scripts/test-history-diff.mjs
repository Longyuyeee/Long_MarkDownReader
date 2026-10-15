import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
const context = vm.createContext({ exports: {} })
vm.runInContext(ts.transpile(fs.readFileSync('src/utils/historyDiff.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), context)
const diff = context.exports.historyDiff
const restore = context.exports.restoreHistoryChange
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
test('restore one paragraph keeps other edits, Unicode and mixed separators byte-exact', () => {
  const current = '标题🙂\r\n改动一\n保留\r改动二\r\n尾部', historical = '标题🙂\r\n原文一\n保留\r原文二\r\n尾部'
  assert.equal(diff(current, historical).changes.length, 2)
  assert.equal(restore(current, historical, 0), '标题🙂\r\n原文一\n保留\r改动二\r\n尾部')
  assert.equal(restore(current, historical, 1), '标题🙂\r\n改动一\n保留\r原文二\r\n尾部')
})
test('partial insertion and deletion preserve EOF and final-newline behavior', () => {
  for (const [before, after] of [['A', 'A\nB'], ['A\nB', 'A'], ['A\n', 'A'], ['A', 'A\n'], ['', '正文'], ['正文', ''], ['A\r\nC', 'A\r\nB\r\nC']]) {
    assert.equal(restore(before, after, 0), after, JSON.stringify([before, after]))
  }
})
test('repeated lines do not make a local restore replace other changes', () => {
  const before = '重复\n新一\n重复\n新二\n重复', after = '重复\n旧一\n重复\n旧二\n重复'
  assert.equal(restore(before, after, 1), '重复\n新一\n重复\n旧二\n重复')
  assert.throws(() => restore(before, after, 9), /无法局部恢复/)
  assert.throws(() => restore('x'.repeat(200001), 'y', 0), /无法局部恢复/)
})
