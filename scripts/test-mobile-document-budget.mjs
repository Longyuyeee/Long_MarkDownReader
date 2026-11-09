import assert from 'node:assert/strict'
import test from 'node:test'
import { findDocumentMatches, previewWithinBudget, READING_BUDGET, sourceFragments, sourcePages, sourceReadingReason } from '../src/mobile/documentBudget.ts'

const find = (text, query, signal = new AbortController().signal) => findDocumentMatches(text.length, (from, to) => text.slice(from, to), query, signal)
test('Reading budget uses UTF-8 bytes and distinguishes line count and long lines', () => {
  assert.equal(sourceReadingReason('# 读书\r\n\r\n普通文稿😀'), '')
  assert.equal(sourceReadingReason('中'.repeat(45000)), '文稿较长')
  assert.equal(sourceReadingReason('甲\r\n'.repeat(2000)), '文稿行数较多')
  assert.equal(sourceReadingReason('a'.repeat(16385)), '文稿包含较长的行')
  assert.ok(sourceReadingReason('a'.repeat(4 * 1024 * 1024)))
})
test('Dense preview output is bounded before constructing any live DOM', () => {
  assert.ok(previewWithinBudget('<p>普通<strong>重点</strong></p>'))
  assert.equal(previewWithinBudget('<b></b>'.repeat(2001)), false)
  assert.equal(previewWithinBudget('x'.repeat(READING_BUDGET.html + 1)), false)
})
test('Source pages rejoin byte-for-byte, preserving mixed breaks, emoji and giant lines', () => {
  const source = 'x'.repeat(16382) + '\r\n' + 'x'.repeat(16383) + '😀' + '<script>原文</script>\n\r' + '甲'.repeat(70000)
  const pages = sourcePages(source)
  assert.equal(pages.map(({ from, to }) => source.slice(from, to)).join(''), source)
  for (const range of pages) {
    assert.ok(range.to - range.from <= READING_BUDGET.page)
    assert.ok(!/[\uD800-\uDBFF]/.test(source[range.to - 1]))
    assert.ok(!(source[range.to - 1] === '\r' && source[range.to] === '\n'))
  }
  assert.deepEqual(sourcePages(''), [{ from: 0, to: 0 }])
})
test('Chunked search matches literal Unicode, symbols and matches spanning slice boundaries', async () => {
  const source = 'x'.repeat(16382) + '甲😀[ ]乙\r\n' + 'x'.repeat(16382) + '甲😀[ ]乙\r\nKELVIN kelvin'
  for (const query of ['甲😀[ ]乙', '[ ]', '\r\n', 'kelvin', '😀']) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const expected = [...source.matchAll(new RegExp(escaped, 'giu'))].map(match => ({ from: match.index, to: match.index + match[0].length }))
    assert.deepEqual((await find(source, query)).matches, expected)
  }
  assert.deepEqual((await find('a'.repeat(40000), 'aaa')).matches, Array.from({ length: 1000 }, (_, i) => ({ from: i * 3, to: i * 3 + 3 })))
})
test('Accessible source fragments preserve every character and cross-fragment highlights', () => {
  const source = 'x'.repeat(127) + '😀甲乙\r\n' + '\r\n'.repeat(100) + '末尾'
  const parts = sourceFragments(source, { from: 0, to: source.length }, { from: 126, to: 132 })
  assert.equal(parts.map(part => part.before + part.hit + part.after).join(''), source)
  assert.equal(parts.map(part => part.hit).join(''), source.slice(126, 132))
  for (const part of parts) assert.ok((part.before + part.hit + part.after).length <= 128)
  const incomplete = 'x'.repeat(127) + '\uD800'
  assert.equal(sourceFragments(incomplete, { from: 0, to: incomplete.length }, null).map(part => part.before).join(''), incomplete)
})
test('Non-overlap is preserved across chunks and result counts remain bounded', async () => {
  const source = 'x'.repeat(16383) + 'aaaaa' + 'x'.repeat(16383) + 'aaaaa'
  assert.deepEqual((await find(source, 'aaa')).matches, [{ from: 16383, to: 16386 }, { from: 32771, to: 32774 }])
  const result = await find('命中 '.repeat(1200), '命中')
  assert.equal(result.matches.length, 1000); assert.equal(result.truncated, true)
})
test('Large document search yields to cancellation and never returns partial success', async () => {
  const controller = new AbortController(), text = 'a'.repeat(4 * 1024 * 1024)
  const pending = find(text, '末尾', controller.signal)
  setTimeout(() => controller.abort(), 0)
  assert.equal(await pending, null)
  assert.equal(await find(text, 'a', controller.signal), null)
  assert.deepEqual(await find(text, ''), { matches: [], truncated: false })
})
