import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { webcrypto } from 'node:crypto'
import { test } from 'node:test'
function load(file){const exports={};vm.runInNewContext(ts.transpile(fs.readFileSync(file,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{exports,crypto:webcrypto,TextEncoder});return exports}
const p=load('src/utils/portableWorkSession.ts'),w=load('src/utils/workSessions.ts')
const plain=value=>JSON.parse(JSON.stringify(value))
function session(){return {version:1,id:'sample',name:'周五交付',libraryRoot:'C:/private-old-root',savedAt:100,tabs:[{id:'C:/private-old-root/项目/纪要.md',path:'C:/private-old-root/项目/纪要.md',title:'SECRET TITLE',isDirty:true,content:'PRIVATE BODY',pinned:true},{id:'C:/private-old-root/报告.pdf',path:'C:/private-old-root/报告.pdf',title:'报告',isDirty:false}],activeTabId:'C:/private-old-root/项目/纪要.md',search:{query:'交付 -旧版',types:['markdown','pdf'],selected:JSON.stringify(['C:/private-old-root/报告.pdf','PRIVATE EXCERPT']),scroll:123,loadedFiles:80,sort:'modified'},views:{'C:/private-old-root/报告.pdf':{scrollTop:500,scrollLeft:0,section:'7',zoom:1.2,draft:'PRIVATE BODY',selection:'PRIVATE EXCERPT',externalApplication:'C:/private-tool.exe'}},reference:{path:'C:/private-old-root/报告.pdf',title:'PRIVATE TITLE',query:'交付',page:7,content:'PRIVATE REFERENCE'}}}
test('portable whitelist keeps order, view, pin and search depth without old paths, body, snippets, tools or secrets',()=>{
 const bundle=p.exportableWorkSession(session()),raw=JSON.stringify(bundle)
 for(const secret of ['private-old-root','PRIVATE','SECRET','content','selected','externalApplication','libraryRoot'])assert.equal(raw.includes(secret),false,secret)
 assert.deepEqual(plain(bundle.files.map(f=>f.relativePath)),['项目/纪要.md','报告.pdf']);assert.equal(bundle.files[0].pinned,true);assert.equal(bundle.search.scroll,123);assert.equal(bundle.search.loadedFiles,80);assert.equal(bundle.files[1].view.section,'7')
 const restored=p.materializeWorkSession(bundle,'E:/新资料','new-id')
 assert.equal(restored.tabs[0].path,'E:/新资料/项目/纪要.md');assert.equal(restored.activeTabId,restored.tabs[0].path);assert.equal(restored.reference.path,'E:/新资料/报告.pdf');assert.equal(restored.search.selected,'')
 assert.equal(p.exportableWorkSession(session(),false).search,undefined)
})
test('relative paths reject Windows traversal, aliases, private metadata and device names',()=>{
 for(const value of ['../secret.md','C:/note.md','/note.md','a\\b.md','a//b.md','a/./b.md','a/../b.md','a/.longedit/config.json','.git/index','con.md','NUL.txt','a/COM1.json','a/file.','a /b.md','a/b:stream','http://site','%bad\u0000'])assert.throws(()=>p.sessionRelativePath(value),undefined,value)
 assert.equal(p.relativeSessionPath('C:/notes','\\\\?\\C:\\notes\\中文 & #.md'),'中文 & #.md')
 assert.equal(p.relativeSessionPath('\\\\server\\share\\notes','\\\\?\\UNC\\server\\share\\notes\\文档.md'),'文档.md')
 assert.throws(()=>p.relativeSessionPath('C:/notes','C:/notes2/a.md'))
})
test('strict import rejects unknown fields, invalid schemas, duplicate paths and invalid ranges, never normalizing away hostile input',()=>{
 const good=p.exportableWorkSession(session())
 for(const change of [x=>x.content='PRIVATE',x=>x.libraryRoot='C:/private',x=>x.schemaVersion=2,x=>x.files=[],x=>x.files[0].relativePath='../escape',x=>x.files.push({...x.files[0]}),x=>x.activePath='other.md',x=>x.files[0].view={scrollTop:0,scrollLeft:0,draft:'secret'},x=>x.search.selected='private',x=>x.search.scroll=-1,x=>x.search.loadedFiles=1.5,x=>x.reference.page=0,x=>x.files[1].view.section='C:/private']){const input=structuredClone(plain(good));change(input);assert.throws(()=>p.validatePortableWorkSession(input));}
})
test('relocation preserves active file, pin and reference without silently merging two existing targets',()=>{
 const bundle=p.exportableWorkSession(session()),moved=p.remapPortableFile(bundle,'报告.pdf','调研/报告.pdf')
 assert.equal(moved.reference.relativePath,'调研/报告.pdf');assert.equal(moved.files[1].view.section,'7');assert.equal(bundle.reference.relativePath,'报告.pdf')
 assert.throws(()=>p.remapPortableFile(bundle,'报告.pdf','项目/纪要.md'),/重复/)
})
test('preflight partitions real available files and missing reference without losing the original repairable record',()=>{
 const original=session(),ready=p.availableWorkSession(original,{libraryRoot:'C:/private-old-root',files:[{relativePath:'项目/纪要.md',state:'ready',path:'\\\\?\\C:\\private-old-root\\项目\\纪要.md'},{relativePath:'报告.pdf',state:'missing',reason:'未找到'}]})
 assert.equal(ready.session.tabs.length,1);assert.equal(ready.missing.length,1);assert.equal(ready.session.reference,undefined);assert.equal(original.tabs.length,2)
 assert.throws(()=>p.availableWorkSession(original,{libraryRoot:'E:/other',files:[]}))
 assert.throws(()=>p.availableWorkSession(original,{libraryRoot:original.libraryRoot,files:[]}))
})
test('canonical alias merging preserves the exact dirty model and the existing storage namespace',()=>{
 const dirty={id:'C:/notes/a.md',path:'C:/notes/a.md',isDirty:true,content:'PRIVATE'}
 const result=w.mergeSessionTabs([dirty],[{id:'canonical',path:'\\\\?\\C:\\notes\\a.md',isDirty:false}])
 assert.equal(result.length,1);assert.equal(result[0],dirty);assert.equal(w.workSessionKey('C:/notes'),'longedit.work-sessions.v1:c%3A%2Fnotes')
})

test('preflight rejects substituted reference identities and unexpected or incomplete checks',()=>{
 const original=session();original.reference.path='C:/private-old-root/参考.md'
 const files=[{relativePath:'项目/纪要.md',state:'ready',path:original.tabs[0].path},{relativePath:'报告.pdf',state:'missing'},{relativePath:'参考.md',state:'ready',path:'C:/private-old-root/另一个.md'}]
 assert.throws(()=>p.availableWorkSession(original,{libraryRoot:original.libraryRoot,files}),/身份/)
 files[2].path='C:/private-old-root/参考.md'
 assert.equal(p.availableWorkSession(original,{libraryRoot:original.libraryRoot,files}).session.reference.path,files[2].path)
 delete files[2].path
 assert.throws(()=>p.availableWorkSession(original,{libraryRoot:original.libraryRoot,files}),/位置/)
 files[2].path='C:/private-old-root/参考.md'
 assert.throws(()=>p.availableWorkSession(original,{libraryRoot:original.libraryRoot,files:[...files,{relativePath:'多余.md',state:'missing'}]}),/清单/)
})

test('internal page identifiers may contain separators without being mistaken for an absolute disk path',()=>{
 const original=session();original.views[original.tabs[1].path].section='diagram/page:review'
 const bundle=p.exportableWorkSession(original)
 assert.equal(bundle.files[1].view.section,'diagram/page:review')
 assert.equal(p.materializeWorkSession(bundle,'E:/new','scene').views['E:/new/报告.pdf'].section,'diagram/page:review')
 for(const section of ['C:/private','C:private','/home/private','\\\\server\\private','file:///C:/private','../private'])assert.throws(()=>p.validatePortableView({scrollTop:0,scrollLeft:0,section}),undefined,section)
})
