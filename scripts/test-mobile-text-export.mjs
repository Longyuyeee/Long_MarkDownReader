import test from 'node:test'
import assert from 'node:assert/strict'
import { captureTextExport, textExportName } from '../src/mobile/textExport.ts'

test('导出快照独立固定，保留 BOM、混合换行、中文、emoji 及图片语法', () => {
  const content = '\ufeff# 中文😀\r\n\r正文\n![图](attachments/a.png)\r\n'
  const source = { rootId: 'local', relativePath: '笔记.md', content, expectedSignature: 'old', revision: 7, dirty: true }
  const snapshot = captureTextExport(source)
  source.content = '后来输入'; source.revision++
  assert.equal(snapshot.content, content); assert.equal(snapshot.revision, 7); assert.equal(snapshot.expectedSignature, 'old'); assert.equal(snapshot.dirty, true)
  assert.ok(Object.isFrozen(snapshot)); assert.match(snapshot.recoveryId, /^[\da-f-]{36}$/)
  assert.notEqual(captureTextExport(source).recoveryId, snapshot.recoveryId)
})
test('导出名字限制单层且按 Unicode 字符截断，保留受支持扩展名', () => {
  assert.equal(textExportName('folder/a:b?.MD'), 'a_b_-导出副本.md')
  assert.equal(textExportName('folder/... .txt'), '笔记-导出副本.txt')
  assert.equal(textExportName(`${'😀'.repeat(80)}.md`), `${'😀'.repeat(55)}-导出副本.md`)
  assert.ok(Buffer.byteLength(textExportName(`${'😀'.repeat(80)}.md`)) < 255)
  assert.equal(textExportName('a\u0000\u007fb.txt'), 'a__b-导出副本.txt')
})
test('导出 UTF-8 字节上限包含 BOM，允许空文和准确 4 MiB，不以字符数代替字节', () => {
  const input = { rootId: 'local', relativePath: 'a.txt', expectedSignature: null, revision: 1, dirty: false }
  assert.equal(captureTextExport({ ...input, content: '' }).content, '')
  assert.equal(captureTextExport({ ...input, content: 'a'.repeat(4 * 1024 * 1024) }).content.length, 4 * 1024 * 1024)
  assert.throws(() => captureTextExport({ ...input, content: '\ufeff' + 'a'.repeat(4 * 1024 * 1024 - 2) }), /4 MiB/)
  assert.throws(() => captureTextExport({ ...input, relativePath: 'a.pdf', content: '' }), /不支持导出/)
})
