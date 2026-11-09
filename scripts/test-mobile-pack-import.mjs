import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { storedZip } from '../src/mobile/storedZip.ts'
import { packImportName, packImportTarget, parseImportedPack, zipMembers } from '../src/mobile/packImport.ts'
const encode = value => new TextEncoder().encode(value)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMwSV3/HwAEYQJIOvJo2gAAAABJRU5ErkJggg==', 'base64')
const entries = (content = '\ufeff# 中文😀\r\n![图](assets/%E5%9B%BE%20%23.png)\r[空文件](assets/empty.pdf)\n') => [{ name: '笔记.textbundle/info.json', bytes: encode('{"version":2,"type":"net.daringfireball.markdown"}') }, { name: '笔记.textbundle/text.markdown', bytes: encode(content) }, { name: '笔记.textbundle/assets/图 #.png', bytes: png }, { name: '笔记.textbundle/assets/empty.pdf', bytes: new Uint8Array() }]
const zip = files => storedZip(files)
test('标准包完整保留 BOM/混合换行/Unicode、空附件与二进制，引用不需改写', async () => {
  const files = entries(), parsed = await parseImportedPack(zip(files))
  assert.equal(parsed.content, new TextDecoder('utf-8', { ignoreBOM: true }).decode(files[1].bytes)); assert.equal(parsed.assets.length, 2)
  assert.deepEqual(parsed.files.get('assets/图 #.png'), Uint8Array.from(png)); assert.equal(parsed.assets[1].bytes, 0); assert.equal(parsed.assets[0].width, 1)
})
test('兼容独立 Python 生成的 DEFLATE、目录条目、Finder 元数据及无顶层目录的包', async () => {
  const result = spawnSync('python', ['-c', 'import sys,zipfile,io,base64,json; o=io.BytesIO(); z=zipfile.ZipFile(o,"w",zipfile.ZIP_DEFLATED); z.writestr("info.json",\'{"version":2,"type":"public.plain-text"}\'); z.writestr("text.txt",b"\\xef\\xbb\\xbfhello\\r\\n"); z.writestr("assets/",b""); z.writestr("__MACOSX/._text.txt",b"metadata"); z.close(); sys.stdout.buffer.write(o.getvalue())'])
  assert.equal(result.status, 0, result.stderr.toString()); const parsed = await parseImportedPack(result.stdout)
  assert.equal(parsed.textName, 'text.txt'); assert.equal(parsed.content, '\ufeffhello\r\n'); assert.equal(parsed.assets.length, 0)
})
test('拒绝绝对/父级/反斜杠/设备/大小写与规范化同名路径、文件目录碰撞和重叠成员', () => {
  for (const path of ['../escape', '/absolute', 'C:/file', 'a\\b', 'a/./b', 'a//b', 'a\0b']) assert.throws(() => zipMembers(zip([{ name: path, bytes: encode('x') }])))
  for (const paths of [['assets/a', 'assets/A'], ['assets/é', 'assets/e\u0301'], ['assets/a', 'assets/a/b'], ['assets/a', 'assets/a/']]) assert.throws(() => zipMembers(zip(paths.map(name => ({ name, bytes: new Uint8Array() })))))
  const bytes = zip(entries()), members = zipMembers(bytes), view = new DataView(bytes.buffer)
  const end = bytes.length - 22, central = view.getUint32(end + 16, true); view.setUint32(central + 42, members[1].local, true)
  assert.throws(() => zipMembers(bytes))
})
test('拒绝加密、ZIP64、多卷、symlink、中央目录/本地头不一致、截断和 CRC 损坏', async () => {
  const mutations = [
    (v,c)=>v.setUint16(c+8,1,true), (v,c)=>v.setUint32(c+24,0xffffffff,true), (v,c)=>v.setUint16(c+34,1,true), (v,c)=>v.setUint32(c+38,0xa1ff0000,true),
    v=>v.setUint16(8,8,true), v=>v.setUint32(14,0,true),
  ]
  for (const mutate of mutations) { const bytes = zip(entries()), view = new DataView(bytes.buffer), central = view.getUint32(bytes.length-6,true); mutate(view,central); await assert.rejects(()=>parseImportedPack(bytes)) }
  await assert.rejects(()=>parseImportedPack(zip(entries()).subarray(0,40)))
  const corrupted = zip(entries()), first = zipMembers(corrupted)[0]; corrupted[first.start] ^= 1; await assert.rejects(()=>parseImportedPack(corrupted), /CRC/)
})
test('格式/正文/附件清单不完整时阻止存入，代码示例不当作资源', async () => {
  for (const text of ['![缺](assets/missing.png)', '[越界](../outside.pdf)', '![网](https://example.com/a.png)', '<img src="assets/a.png">']) await assert.rejects(()=>parseImportedPack(zip(entries(text))))
  await assert.rejects(()=>parseImportedPack(zip([...entries(), { name: '笔记.textbundle/text.txt', bytes: encode('two') }])) , /一份正文/)
  await assert.rejects(()=>parseImportedPack(zip(entries().filter(entry=>!entry.name.endsWith('info.json')))), /info.json/)
  await assert.rejects(()=>parseImportedPack(zip(entries().map(entry=>entry.name.endsWith('info.json')?{...entry,bytes:encode('{"version":1}')}:entry))), /V2/)
  assert.equal((await parseImportedPack(zip(entries('`![示例](missing)`')))).content, '`![示例](missing)`')
})
test('真实展开上限、正文编码、附件数量/单个/总字节与图片尺寸均受限', async () => {
  const plain = entries('text').slice(0,2)
  await assert.rejects(()=>parseImportedPack(zip([...plain,{name:'笔记.textbundle/assets/a.pdf',bytes:new Uint8Array(2*1024*1024+1)}])), /大小限制/)
  await assert.rejects(()=>parseImportedPack(zip([...plain,...Array.from({length:25},(_,i)=>({name:`笔记.textbundle/assets/${i}.pdf`,bytes:new Uint8Array()}))])), /24/)
  await assert.rejects(()=>parseImportedPack(zip([...plain,...Array.from({length:5},(_,i)=>({name:`笔记.textbundle/assets/${i}.pdf`,bytes:new Uint8Array(2*1024*1024)}))])), /8 MiB/)
  await assert.rejects(()=>parseImportedPack(zip(plain.map(entry=>entry.name.endsWith('text.markdown')?{...entry,bytes:new Uint8Array([0xff,0xfe])}:entry))), /UTF-8/)
  const hugePng=Uint8Array.from(png);new DataView(hugePng.buffer).setUint32(16,0x7fffffff)
  await assert.rejects(()=>parseImportedPack(zip([...plain,{name:'笔记.textbundle/assets/a.png',bytes:hugePng}])), /像素/)
})
test('导入目标带固定 UUID，同名包独立，文件名有界且不能越过资料库', () => {
  const id='01234567-89ab-cdef-0123-456789abcdef', target=packImportTarget('../随记-附件包.textpack',id,'text.markdown')
  assert.match(target.path, /^_随记-附件-01234567-89ab-cdef-0123-456789abcdef\/_随记.md$/)
  assert.deepEqual(packImportTarget('随记-附件包.textpack',id,'text.txt'),{folder:`随记-附件-${id}`,note:'随记.txt',path:`随记-附件-${id}/随记.txt`})
  assert.notEqual(packImportTarget('a.textpack',id,'text.md').path,packImportTarget('a.textpack',crypto.randomUUID(),'text.md').path)
  assert.ok(Buffer.byteLength(packImportTarget('😀'.repeat(200)+'.textpack',id,'text.md').folder)<255)
  assert.equal(packImportName('a.zip'),'a.zip'); assert.throws(()=>packImportName('a.pdf')); assert.throws(()=>packImportTarget('a.textpack','../escape','text.md'))
})
test('压缩流实际展开远大于伪造的声明时，立即停止且不接受部分正文', async () => {
  const bytes=await readFile(new URL('../tests/android-storage-provider/src/main/assets/pack-import/bomb.textpack',import.meta.url))
  await assert.rejects(()=>parseImportedPack(bytes), /实际展开大小超限/)
})
