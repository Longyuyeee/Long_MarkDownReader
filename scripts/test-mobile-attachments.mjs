import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { scanImageReferences, replaceImageReference, relativeImageSource, imageMarkdown, imageInsertionText, prepareImageCopy } from '../src/mobile/imageReferences.ts'
import { imageFileInfo } from '../src/mobile/imageFile.ts'
import { EditorState } from '@codemirror/state'
import { sourceRangeChange, sourceSelection } from '../src/mobile/editorOffsets.ts'

test('图片引用定位保留 CRLF、嵌套标签及重复语法，排除代码、转义和 HTML', () => {
  const content = '```md\r\n![same](old.png)\r\n```\r\n\r\n\\![escaped](old.png) `![inline](old.png)`\r\n\r\n# ![same](old.png)\r\n\r\n- ![nested [label]](<a b.png>)\r\n\r\n![ref][id]\r\n\r\n[id]: old.png "caption"\r\n\r\n<img src="old.png">'
  const scan = scanImageReferences(content)
  assert.equal(scan.references.length, 3); assert.equal(scan.unlocated, 0); assert.equal(scan.htmlImages, true)
  for (const ref of scan.references) assert.equal(content.slice(ref.from, ref.to), ref.raw)
  assert.equal(scan.references[1].label, '![nested [label]]')
  const result = replaceImageReference(content, scan.references[2], 'attachments/new.png')
  assert.ok(result.includes('![ref](<attachments/new.png> "caption")'))
  assert.equal(result.slice(0, scan.references[2].from), content.slice(0, scan.references[2].from)); assert.ok(result.includes('[id]: old.png "caption"\r\n'))
})
test('无法精确映射的复杂块明确保留为未定位，不猜测另一个相同文本', () => {
  const source = '> a\n> ![x](old.png)\n\n| col |\n| --- |\n| ![table](old.png) |\n'
  const scan = scanImageReferences(source)
  assert.ok(scan.unlocated >= 1)
  for (const ref of scan.references) assert.equal(source.slice(ref.from, ref.to), ref.raw)
  const ref = scanImageReferences('![x](old.png)').references[0]
  assert.throws(() => replaceImageReference('changed![x](old.png)', ref, 'new.png'), /正文已变化/)
})
test('新图片语法转义说明并编码目标，相对路径不越界或二次解码', () => {
  assert.equal(imageMarkdown('a] [b\\c\n图', 'attachments/x.png'), '![a\\] \\[b\\\\c 图](<attachments/x.png>)')
  assert.equal(relativeImageSource('notes/一.md', '附件/图 %一.png'), '../%E9%99%84%E4%BB%B6/%E5%9B%BE%20%25%E4%B8%80.png')
  assert.equal(relativeImageSource('notes/一.md', 'notes/attachments/a.png'), 'attachments/a.png')
  for (const path of ['../x.png', '/x.png', 'a\\x.png', 'x.svg']) assert.throws(() => relativeImageSource('note.md', path))
  assert.equal(imageInsertionText('# 标题\r\n\r\n正文', 0, 0, '图', 'x.png'), '![图](<x.png>)\r\n\r\n')
  assert.equal(imageInsertionText('正文\r\n', 4, 4, '图', 'x.png'), '\r\n![图](<x.png>)\r\n')
  assert.throws(() => imageInsertionText('文', -1, 0, '图', 'x.png'), /位置已失效/)
})
function storageFixture() {
  const copied = [], read = [], target = { rootId: 'local', relativePath: 'copy.md' }
  const storage = { async readImage(id) { read.push(id.relativePath); return { bytes: 20, width: 10, height: 10 } }, async copyImage(source, note) { copied.push(source.relativePath); return { ...note, notePath: note.relativePath, status: 'ready', imagePath: `attachments/copy-${copied.length}.png` } } }
  return { storage, copied, read, target }
}
test('跨库副本预检全部图片、去重并仅改真实引用，原文和代码示例不变', async () => {
  const f = storageFixture(), source = { rootId: 'external', relativePath: 'notes/a.md' }
  const content = '![one](../images/a.png)\r\n\r\n![two][id]\r\n\r\n[id]: ../images/a.png\r\n\r\n```\r\n![one](../images/a.png)\r\n```\r\n'
  const result = await prepareImageCopy(f.storage, source, f.target, content)
  assert.deepEqual(f.copied, ['images/a.png']); assert.deepEqual(f.read, ['images/a.png'])
  assert.ok(result.startsWith('![one](<attachments/copy-1.png>)\r\n\r\n![two](<attachments/copy-1.png>)'))
  assert.ok(result.includes('```\r\n![one](../images/a.png)\r\n```')); assert.ok(content.startsWith('![one](../images/a.png)'))
})
test('损坏图片、未确认回执、错误身份和容量失败阻止默认副本，不隐式降级纯文字', async () => {
  const source = { rootId: 'external', relativePath: 'a.md' }, content = '![x](x.png)'
  for (const result of [{ status: 'unconfirmed' }, { status: 'ready', rootId: 'other', notePath: 'copy.md', imagePath: 'a.png' }]) {
    const f = storageFixture(); f.storage.copyImage = async () => result
    await assert.rejects(prepareImageCopy(f.storage, source, f.target, content), /未确认/)
  }
  const f = storageFixture(); f.storage.readImage = async () => ({ bytes: 8 * 1024 * 1024 + 1, width: 1, height: 1 })
  await assert.rejects(prepareImageCopy(f.storage, source, f.target, content), /预算/); assert.equal(f.copied.length, 0)
  await assert.rejects(prepareImageCopy(f.storage, source, f.target, '<img src="x.png">'), /无法自动搬迁/)
})
test('图片头边界先于像素解码，拒绝非图片、超字节和超尺寸输入', () => {
  const png = readFileSync(new URL('../src-tauri/icons/128x128.png', import.meta.url))
  assert.deepEqual(imageFileInfo(png), { mime: 'image/png', width: 128, height: 128, bytes: png.length })
  assert.throws(() => imageFileInfo(Buffer.from('<svg></svg>')), /无法识别/)
  assert.throws(() => imageFileInfo(Buffer.alloc(2 * 1024 * 1024 + 1)), /2 MiB/)
  const large = Buffer.from(png); large.writeUInt32BE(5000, 16); large.writeUInt32BE(2000, 20)
  assert.throws(() => imageFileInfo(large), /800 万像素/)
  for (const cut of [0, 1, 10, 20]) assert.throws(() => imageFileInfo(png.subarray(0, cut)))
})
test('真实 CodeMirror 状态在 CRLF 和中文/emoji 中正确转换选区，末尾插图及替换可撤回到精确原文', () => {
  const content = '# 中文\r\n\r\n图😀\r\n\r\n![缺图](missing.png)\r\n'
  const state = EditorState.create({ doc: content, extensions: [EditorState.lineSeparator.of('\r\n')] })
  assert.ok(state.doc.length < content.length)
  assert.equal(sourceSelection(state, state.doc.length, state.doc.length).from, content.length)
  const insert = imageInsertionText(content, content.length, content.length, '图', 'attachments/x.png')
  const appended = state.update(sourceRangeChange(state, content, content.length, content.length, insert)).state
  assert.equal(appended.sliceDoc(), content + insert); assert.ok(appended.selection.main.head <= appended.doc.length)
  const reference = scanImageReferences(content).references[0], updated = replaceImageReference(content, reference, 'attachments/new.png')
  const text = updated.slice(reference.from, updated.length - (content.length - reference.to))
  const replaced = state.update(sourceRangeChange(state, content, reference.from, reference.to, text)).state
  assert.equal(replaced.sliceDoc(), updated); assert.ok(!/(?<!\r)\n/.test(replaced.sliceDoc()))
  assert.throws(() => sourceRangeChange(state, content + '外部变化', 0, 0, insert), /正文已变化/)
})
