import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { parseImportedPack, packImportName, packImportTarget } from '../src/mobile/packImport.ts'
const root=new URL('../tests/fixtures/mobile-external-packs/',import.meta.url), manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'))
const sha=b=>createHash('sha256').update(b).digest('hex'), bytes=name=>readFile(new URL(name,root))
function independent(archive){const r=spawnSync('python',['-c','import sys,zipfile,io,json,base64;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));assert z.testzip() is None;print(json.dumps({i.filename:base64.b64encode(z.read(i)).decode() for i in z.infolist() if not i.is_dir()}))'],{input:archive});assert.equal(r.status,0,r.stderr.toString());return Object.fromEntries(Object.entries(JSON.parse(r.stdout)).map(([name,value])=>[name,Buffer.from(value,'base64')]))}
test('公开许可语料逐字节符合固定上游身份，使用独立 ZIP/CRC 校验',async()=>{
 for(const[name,expected]of Object.entries(manifest.samples)){const archive=await bytes(name);assert.equal(archive.length,expected.bytes);assert.equal(sha(archive),expected.sha256);const members=independent(archive);assert.deepEqual(Object.keys(members).sort(),Object.keys(expected.members).sort());for(const[path,b]of Object.entries(members)){assert.equal(sha(b),expected.members[path].sha256);assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex'),expected.members[path].gitBlob)}}
 assert.equal(manifest.samples['fsnotes-ios.textpack'].members['FSNotes 4.0 for iOS.textbundle/text.markdown'].gitBlob,'567ee36782b2ff0a275c487f04a311a97a1021a4')
})
test('实际公开 TextPack 与 FSNotes 原始成员保持正文、图片及特殊语法字节',async()=>{
 for(const name of ['shinyfrog-v2.textpack','fsnotes-ios.textpack']){const b=await bytes(name),p=await parseImportedPack(b),members=independent(b),prefix=Object.keys(members).find(n=>n.endsWith('/info.json')).split('/')[0]+'/';assert.equal(p.content, members[prefix+p.textName].toString());assert.equal(p.assets.length,1);for(const a of p.assets)assert.equal(sha(p.files.get(a.path)),sha(members[prefix+a.path]))}
 const p=await parseImportedPack(await bytes('fsnotes-ios.textpack'));assert.ok(p.content.includes('```mermaid'));assert.ok(p.content.includes('[[WikiLinks with emoji 😎]]'));assert.equal(p.assets[0].width,128)
})
test('ZIP 扩展名与 TextPack 走相同验证，目标去掉完整容器后缀且固定身份',()=>{
 const id='01234567-89ab-cdef-0123-456789abcdef',expected=packImportTarget('来自 FSNotes.textpack',id,'text.markdown')
 for(const name of ['来自 FSNotes.zip','来自 FSNotes.textpack.zip','来自 FSNotes.ZIP']){assert.equal(packImportName(name),name);assert.deepEqual(packImportTarget(name,id,'text.markdown'),expected)}
 assert.throws(()=>packImportName('notes.pdf'));assert.throws(()=>packImportTarget('notes.zip','../outside','text.md'))
})
test('支持 ZIP 后，普通压缩包、多笔记包与缺失附件仍被内容验证拒绝',async()=>{
 const cases=[['not-a-bundle.zip',/不支持的文件/],['multiple-notes.zip',/ZIP/],['missing-assets.zip',/缺少包内附件/]]
 for(const[name,reason]of cases){const archive=await bytes(name);await assert.rejects(()=>parseImportedPack(archive),reason)}
})
test('来源 URL 等上游元信息保持惰性，不成为笔记或新增资源',async()=>{
 const p=await parseImportedPack(await bytes('shinyfrog-v2.textpack'));assert.equal(p.assets.length,1);assert.equal([...p.files.keys()].filter(name=>name.startsWith('assets/')).length,1);assert.ok(!p.content.includes('johndoe'));assert.ok(!p.content.includes('Example.app'))
})
