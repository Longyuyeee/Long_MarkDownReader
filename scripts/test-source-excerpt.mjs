import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
const box = { exports: {}, URL, URLSearchParams }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/sourceExcerpt.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, box)
const { sourceExcerpt, parseSourceReference } = box.exports
const imageBox={exports:{}}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/localImagePath.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,imageBox)
const linkBox={exports:{},require:()=>imageBox.exports}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/localMarkdownLinks.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,linkBox)
const {localMarkdownLink}=linkBox.exports

test('excerpt quotes every line and source round-trips special paths and PDF position', () => {
  const text = sourceExcerpt('第一行\n\n第二行', { path: '/库/资料/a #&[1].pdf', title: '资料[1]', page: 4, annotationId: 'note&2' }, '/库')
  assert.ok(text.startsWith('> 第一行\n> \n> 第二行'))
  const href = text.match(/\]\((longedit:.*)\)/)[1]
  assert.deepEqual(JSON.parse(JSON.stringify(parseSourceReference(href, '/新库'))), { path: '/新库/资料/a #&[1].pdf', page: '4', annotation: 'note&2' })
})
test('Windows reference keeps native path identity and library-bound source', () => {
  const root = 'E:\\笔记'
  const text = sourceExcerpt('摘录', { path: root + '\\a.md', title: 'a' }, root)
  const href = text.match(/\]\((longedit:.*)\)/)[1]
  assert.equal(parseSourceReference(href, root).path, root + '\\a.md')
  assert.throws(() => sourceExcerpt('摘录', { path: '/other/a.md', title: 'a' }, '/库'))
  assert.equal(parseSourceReference('longedit://source?path=../outside.md', '/库'), null)
})


test('actual Markdown source click opens the library file with PDF position', async () => {
  const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
  const handler = source.slice(source.indexOf('const openSourceReference ='), source.indexOf('const openPdfReference ='))
  const opened = []
  const context = { localMarkdownLink, parseSourceReference, store: { libraryPath: '/库' }, router: {}, activeTabId: { value: '/库/note.md' }, vditor: null, invoke: async () => ({}),
    findFileFormat: () => ({ id: 'pdf' }), message: { warning() {} },
    openManagedFile: (_router, path, query) => opened.push({ path, query }) }
  vm.runInNewContext(ts.transpileModule(handler + '\nglobalThis.open = openSourceReference', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
  await context.open({ target: { closest: () => ({ getAttribute: () => 'longedit://source?path=a.pdf&page=7&annotation=note' }) }, preventDefault() {}, stopPropagation() {} })
  assert.equal(opened[0].path, '/库/a.pdf')
  assert.equal(opened[0].query.page, '7')
  assert.equal(opened[0].query.annotation, 'note')
  assert.ok(source.includes('@click.capture="openSourceReference"'))
})

test('text excerpts carry a bounded anchor, old links remain readable', () => {
  const excerpt = sourceExcerpt('定位到这一段\n第二行', { path: '/库/a.md', title: 'a' }, '/库')
  assert.equal(parseSourceReference(excerpt.match(/\]\((longedit:.*)\)/)[1], '/库').quote, '定位到这一段')
  const long = sourceExcerpt('字'.repeat(500), { path: '/库/a.md', title: 'a' }, '/库')
  assert.equal(parseSourceReference(long.match(/\]\((longedit:.*)\)/)[1], '/库').quote.length, 160)
  assert.equal(parseSourceReference('longedit://source?path=a.md', '/库').quote, undefined)
})


test('native canonical Windows and UNC source paths resolve within the library', () => {
  const windows = sourceExcerpt('摘录', { path: String.raw`\\?\E:\笔记\a.md`, title: 'a' }, String.raw`E:\笔记`)
  assert.ok(windows.includes('path=a.md'))
  const unc = sourceExcerpt('摘录', { path: String.raw`\\?\UNC\SERVER\Share\a.md`, title: 'a' }, String.raw`\\server\share`)
  assert.ok(unc.includes('path=a.md'))
})

function repairHarness() {
 const source=fs.readFileSync('src/views/LibraryMode.vue','utf8'),handler=source.slice(source.indexOf('const openRepairedSource ='),source.indexOf('const openPdfReference ='))
 const href='longedit://source?path=old.md&quote=hello';let content=`[source](${href})`;const calls=[],tab={path:'/库/note.md',isDirty:false}
 const editor={getCurrentMode:()=> 'wysiwyg',getValue:()=>content,setValue:next=>{content=next;calls.push('edit')},vditor:{undo:{addToUndoStack:()=>calls.push('undo')}}}
 const context={URL,localMarkdownLink,parseSourceReference,editorModeChangeBusy:{value:false},editorLoading:{value:false},suppressEditorInput:false,recordWindowDraftActivity(){},updateWordCount(){},syncOutlineManual(){},applyVditorSourceRepair:(editor,original,href,next,expected,count)=>{assert.equal(editor.getValue(),original);assert.equal(count,1);assert.equal(expected,original.replace(href,next));content=expected;calls.push('edit','apply')},store:{libraryPath:'/库',updateTabContent:()=>calls.push('draft')},router:{},activeTabId:{value:tab.path},activeIsMarkdown:{value:true},activeFormatCanEdit:{value:true},vditor:editor,tabs:{value:[tab]},referenceRepairRequest:{value:null},searchNavigationSequence:0,findFileFormat:()=>({}),searchResultPath:(path,root)=>path.startsWith(root+'/')?path.slice(root.length+1):path,message:{warning:text=>calls.push(text),success(){}},snapshotWindowDrafts(){},
 invoke:async(command,args)=>{if(command==='preview_source_link_repair'){calls.push('preview');return {content:args.content.replace(args.originalUri,args.replacementUri),count:1}}if(args.path==='/库/old.md')throw Error('missing');return{}},openManagedFile:(_router,path)=>calls.push('open:'+path)}
 vm.runInNewContext(ts.transpileModule(handler+'\nglobalThis.open = openSourceReference',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context)
 return {context,calls,tab,content:()=>content,run:()=>context.open({target:{closest:()=>({getAttribute:()=>href})},preventDefault(){},stopPropagation(){}}),apply:path=>context.referenceRepairRequest.value.commit({...context.referenceRepairRequest.value.source,path})}
}

test('source repair waits for explicit confirmation and applies the verified link to the current draft only',async()=>{
 const h=repairHarness();await h.run();assert.equal(h.tab.isDirty,false);assert.equal(h.calls.includes('edit'),false);await h.apply('/库/new.md');assert.match(h.content(),/path=new.md&quote=hello/);assert.equal(h.tab.isDirty,true);assert.equal(h.calls.filter(x=>x==='apply').length,1);assert.ok(h.calls.includes('draft'))
})
test('cancel, invalid path, readonly note and changed target never rewrite a source',async()=>{
 const cancel=repairHarness();await cancel.run();assert.equal(cancel.calls.includes('edit'),false)
 for(const path of ['/库/../escape.md','E:/outside.md']){const h=repairHarness();await h.run();await assert.rejects(()=>h.apply(path));assert.equal(h.calls.includes('edit'),false)}
 const readonly=repairHarness();readonly.context.activeFormatCanEdit.value=false;await readonly.run();assert.equal(readonly.context.referenceRepairRequest.value,null)
 const mode=repairHarness();await mode.run();mode.context.vditor.getCurrentMode=()=> 'sv';await assert.rejects(()=>mode.apply('/库/new.md'));assert.equal(mode.calls.includes('edit'),false)
 const changed=repairHarness();await changed.run();changed.context.activeTabId.value='/库/other.md';await assert.rejects(()=>changed.apply('/库/new.md'));assert.equal(changed.calls.includes('edit'),false)
})
test('generic source links retain a verified PDF digest and reject malformed digests',()=>{
 const digest='a'.repeat(64);assert.equal(parseSourceReference('longedit://source?path=a.pdf&page=2&sha256='+digest,'/库').sourceDigest,digest);assert.equal(parseSourceReference('longedit://source?path=a.pdf&sha256=broken','/库'),null)
})
