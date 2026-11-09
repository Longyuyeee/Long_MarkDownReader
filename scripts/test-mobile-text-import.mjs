import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeImportedText, importedCopyName, importedFileName, importByteLimit } from '../src/mobile/textImport.ts'
test('导入完整保留 UTF-8 BOM、混合换行、中文、emoji 和图片引用', () => {
  const content = '\ufeff# 中文😀\r\n正文\r尾行\n![图](images/a.png)\r\n'
  assert.equal(decodeImportedText(new TextEncoder().encode(content)), content)
  assert.equal(decodeImportedText(new Uint8Array()), '')
})
test('导入按真实字节拒绝超过 4 MiB，不以中文字符数计算', () => {
  assert.equal(decodeImportedText(new TextEncoder().encode('a'.repeat(importByteLimit))).length, importByteLimit)
  assert.throws(() => decodeImportedText(new TextEncoder().encode('中'.repeat(Math.ceil(importByteLimit / 3)))), /4 MiB/)
})
test('损坏 UTF-8、UTF-16 及含零字节内容不会被替换字符静默导入', () => {
  for (const bytes of [[0xff,0xfe,65,0],[0xc3,0x28],[65,0,66]]) assert.throws(() => decodeImportedText(new Uint8Array(bytes)), /UTF-8/)
})
test('文件名支持 MD/TXT/JSON，Unicode 安全截断且不会逃逸目标文件夹', () => {
  assert.equal(importedFileName('../a:b?.MD'), '_a_b_.md')
  assert.equal(importedFileName('', 'text/plain'), '导入文字.txt')
  assert.throws(() => importedFileName('test.pdf','text/plain'), /Markdown/)
  assert.equal(importedFileName('😀'.repeat(80)+'.txt'), '😀'.repeat(40)+'.txt')
  const id = crypto.randomUUID(), name = importedCopyName('😀'.repeat(80)+'.MD', id)
  assert.ok(Buffer.byteLength(name) < 255); assert.ok(!name.includes('/')); assert.ok(!name.includes('\ufffd'))
})
test('同名导入各自保留，单条记录重试始终使用同一位置', () => {
  const id = crypto.randomUUID(), first = importedCopyName('note.md', id)
  assert.equal(first, importedCopyName('note.md',id)); assert.notEqual(first, importedCopyName('note.md',crypto.randomUUID()))
  assert.throws(() => importedCopyName('note.md','../x'), /编号/)
})
