import test from 'node:test'
import assert from 'node:assert/strict'
import { captureTextExport } from '../src/mobile/textExport.ts'
import { packAssetPath, preparePack, scanPackReferences, packArchive, packName } from '../src/mobile/portablePack.ts'
const snapshot = content => captureTextExport({ rootId: 'local', relativePath: 'notes/随记.md', content, expectedSignature: 'old', revision: 1, dirty: true })
const image = { dataUrl: 'data:image/png;base64,AQID', width: 1, height: 1, bytes: 3 }
const store = { readImage: async () => image, readAttachment: async () => ({ base64: 'AAH/' }) }

test('附件地址只解码一次并限制资料库边界，保留 fragment/query', () => {
  assert.deepEqual(packAssetPath('notes/a.md', '../files/%E5%9B%BE%20%23.png#zoom'), { path: 'files/图 #.png', suffix: '#zoom' })
  assert.deepEqual(packAssetPath('notes/a.md', '../files/%252e%252e.pdf?q=1'), { path: 'files/%2e%2e.pdf', suffix: '?q=1' })
  for (const href of ['../../x.pdf', '/a', '//host/a', 'file:a', 'content:a', '%2f%2fhost/a', '..\\a', '%00', '%GG', '']) assert.throws(() => packAssetPath('notes/a.md', href), undefined, href)
  for (const href of ['https://a/a.pdf', 'http://a', 'mailto:a@b', 'tel:10086', '#章节']) assert.equal(packAssetPath('notes/a.md', href), null)
})
test('改写普通与引用式附件，保留 BOM/混合换行/标题，代码和网页链接保持原样', async () => {
  const source = '\ufeff# 文😀\r\n![图][p]\r[资料](../files/a.pdf#page=2 "标题")\n`![code](missing)`\r\n[网页](https://example.com)\r\n\r\n[p]: ../img/a.png\r\n'
  const pack = await preparePack(store, snapshot(source))
  assert.equal(pack.assets.length, 2)
  assert.equal(pack.assets[0].sourcePath, 'img/a.png')
  assert.equal(pack.content, source.replace('![图][p]', '![图](<assets/001-a.png>)').replace('[资料](../files/a.pdf#page=2 "标题")', '[资料](<assets/002-a.pdf#page=2> "标题")'))
  assert.equal(snapshot(source).content, source)
})
test('重复源文件只读一次，同名不同文件分开；图片和文件链接复用同一附件', async () => {
  let images = 0, files = 0
  const pack = await preparePack({ readImage: async () => { images++; return image }, readAttachment: async () => { files++; return { base64: '' } } }, snapshot('![a](a.png) [a](a.png) [b](../other/a.png)'))
  assert.equal(images, 1); assert.equal(files, 1); assert.equal(pack.assets.length, 2)
  assert.match(pack.content, /001-a.png/); assert.match(pack.content, /002-a.png/); assert.equal(pack.assets[1].bytes, 0)
})
test('复杂表格/嵌套图片/HTML/网络图片阻止不完整打包，引用外链本身保留', () => {
  for (const value of ['![a](https://a/b.png)', '<img src="a.png">', '[![a](a.png)](file.pdf)', '|图|\n|--|\n|![a](a.png)|', '> 多行\n> ![a](a.png)']) assert.throws(() => scanPackReferences(value, 'a.md'), undefined, value)
  assert.deepEqual(scanPackReferences('```md\n![a](bad)\n```\n[普通](https://a)', 'a.md'), [])
})
test('缺失附件失败时不写源文件或生成部分成功包', async () => {
  let calls = 0
  await assert.rejects(() => preparePack({ ...store, readAttachment: async () => { calls++; throw new Error('NOT_FOUND: 已移动') } }, snapshot('[资料](a.pdf)')), /a.pdf.*已移动/)
  assert.equal(calls, 1)
})
test('附件数量/单个字节/总字节/图片像素均在写出前限制', async () => {
  await assert.rejects(() => preparePack(store, snapshot(Array.from({ length: 25 }, (_, i) => `[${i}](${i}.pdf)`).join(' '))), /24/)
  const big = Buffer.alloc(2 * 1024 * 1024).toString('base64')
  await assert.rejects(() => preparePack({ ...store, readAttachment: async () => ({ base64: Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') }) }, snapshot('[a](a.pdf)')), /2 MiB/)
  await assert.rejects(() => preparePack({ ...store, readAttachment: async () => ({ base64: big }) }, snapshot(Array.from({ length: 5 }, (_, i) => `[${i}](${i}.pdf)`).join(' '))), /8 MiB/)
  await assert.rejects(() => preparePack({ ...store, readImage: async () => ({ ...image, width: 4000, height: 4000 }) }, snapshot('![a](a.png)')), /像素/)
})
test('TXT 不解释 Markdown，包为标准 ZIP 并有 textbundle 顶层，命名有界', async () => {
  const input = { ...snapshot('![literal](a.png)'), relativePath: '随记.txt' }, pack = await preparePack(store, input), archive = packArchive(pack)
  assert.equal(pack.content, input.content); assert.equal(pack.assets.length, 0)
  assert.equal(new DataView(archive.buffer).getUint32(0, true), 0x04034b50)
  assert.ok(Buffer.from(archive).includes(Buffer.from('note.textbundle/text.txt')))
  assert.ok(Buffer.from(archive).includes(Buffer.from('public.plain-text')))
  assert.ok(Buffer.byteLength(packName('😀'.repeat(100) + '.md')) < 255)
})
