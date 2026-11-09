import test from 'node:test'
import assert from 'node:assert/strict'
import { jsonDiagnosticLines } from '../src/mobile/jsonDiagnostic.ts'

test('诊断摘录保留 BOM 源文偏移，混合换行只展示问题前后一行', () => {
  const source = '\uFEFF{\r\n  "标题":"读书😎",\r  "items":[1,2,]\n}\r\n'
  assert.deepEqual(jsonDiagnosticLines(source, source.indexOf(']')), [
    { number: 2, text: '  "标题":"读书😎",', current: false },
    { number: 3, text: '  "items":[1,2,]', current: true },
    { number: 4, text: '}', current: false },
  ])
  assert.equal(source.startsWith('\uFEFF{\r\n'), true)
})

test('长行围绕问题位置截取并保留 Unicode 码点，不将整份文档放进预览', () => {
  const source = '前'.repeat(500) + '😎'.repeat(100) + 'TARGET]' + '后'.repeat(500)
  const [line] = jsonDiagnosticLines(source, source.indexOf(']'))
  assert.equal(line.current, true); assert.equal(line.number, 1)
  assert.ok(line.text.startsWith('…')); assert.ok(line.text.endsWith('…')); assert.ok(line.text.includes('TARGET]'))
  assert.ok(Array.from(line.text).length <= 162); assert.equal(line.text.isWellFormed(), true)
})

test('空文档、起止边界与无效或超预算偏移不会生成错误定位材料', () => {
  assert.deepEqual(jsonDiagnosticLines('', 0), [{ number: 1, text: '', current: true }])
  assert.deepEqual(jsonDiagnosticLines('first\r\nlast', 0), [{ number: 1, text: 'first', current: true }, { number: 2, text: 'last', current: false }])
  assert.equal(jsonDiagnosticLines('first\r\nlast', 11).at(-1).current, true)
  for (const offset of [-1, 3, NaN, 0.5]) assert.deepEqual(jsonDiagnosticLines('{}', offset), [])
  assert.deepEqual(jsonDiagnosticLines('x'.repeat(262145), 1), [])
})
