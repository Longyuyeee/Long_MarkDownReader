import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { history, undo, redo } from '@codemirror/commands'
import { languageCases, canonicalCases } from './mobile-code-language-cases.mjs'
import { codeFormats, codeFileInfo, codeExtensions, codeMimeFile, codeFileAccept, mobileTextPattern } from '../src/mobile/codeFormats.ts'
import { codeLanguage } from '../src/mobile/codeLanguage.ts'
import { codeIndentChange } from '../src/mobile/codeLineActions.ts'
import { sourceFormat, sourceSlice } from '../src/mobile/sourceFormat.ts'
import { importedFileName, importedCopyName } from '../src/mobile/textImport.ts'
import { textExportName } from '../src/mobile/textExport.ts'
import { LibrarySearchIndex } from '../src/mobile/librarySearch.ts'
test('移动代码登记与独立任务覆盖一致：32 扩展名、20 种模式，含剩余 24 扩展名',()=>{
 assert.equal(codeFormats.length,20);assert.equal(codeExtensions.length,32);assert.deepEqual([...codeExtensions].sort(),languageCases.map(c=>c.ext).sort());const desktop=JSON.parse(readFileSync('shared/file-formats.json')).formats;const families=['javascript','typescript','python','rust','go','jvm-code','c-family','shell','sql','web-source'];assert.deepEqual(desktop.filter(f=>families.includes(f.id)).flatMap(f=>f.extensions.map(e=>e.slice(1))).sort(),[...codeExtensions].sort());for(const c of languageCases){const format=codeFileInfo('目录/NAME.'+c.ext.toUpperCase());assert.equal(format.language,c.language);assert.equal(format.label,c.label);assert.equal(format.highlight,c.highlight);assert.ok(desktop.some(f=>f.extensions.includes('.'+c.ext)));assert.equal(mobileTextPattern.test('a.'+c.ext),true);assert.ok(codeFileAccept.split(',').includes('.'+c.ext))}assert.equal(codeExtensions.filter(e=>!['js','mjs','cjs','ts','py','html','htm','css'].includes(e)).length,24)
})
test('MIME 缺名称仅使用登记的源码身份，具体文件名优先且不把媒体 / 二进制变成源码',()=>{
 for(const f of codeFormats)for(const mime of [f.mime,...f.aliases]){assert.equal(codeMimeFile(mime.toUpperCase()+'; charset=UTF-8'),'导入源码.'+f.extensions[0]);assert.equal(importedFileName('',mime),'导入源码.'+f.extensions[0])}for(const c of languageCases)assert.equal(importedFileName('a.'+c.ext,'text/plain'),'a.'+c.ext);for(const ext of ['exe','class','jar','env','pdf','bat','swift','svelte']){assert.equal(codeFileInfo('a.'+ext),undefined);assert.throws(()=>importedFileName('a.'+ext,'text/javascript'))}for(const mime of ['video/mp2t','application/java-vm','application/octet-stream','text/plain'])assert.equal(codeMimeFile(mime),'');assert.equal(codeMimeFile('text/x-c++src'),'导入源码.cpp')
})
test('原生 MIME 及 Manifest 快照与同一登记严格一致，避免平台漂移',()=>{
 const r=spawnSync(process.execPath,['--experimental-strip-types','scripts/generate-mobile-code-formats.mjs','--check'],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr)
})
test('已声明高亮的模式实际解析源码，JSX / TSX / Vue 明确不构建混合语法树',()=>{
 for(const c of canonicalCases){const state=EditorState.create({doc:c.source,extensions:[codeLanguage(c.language)]});const tree=ensureSyntaxTree(state,state.doc.length,300);if(c.highlight){assert.ok(tree,c.language);assert.ok(tree.length>0,c.language);assert.ok(tree.topNode.firstChild,c.language)}else assert.equal(tree?.topNode.firstChild||null,null,c.language)}
})
test('所有扩展名在独立副本与导出中保持，增减缩进历史不改 BOM、Unicode 或混合行尾',()=>{
 const id='456789ab-1234-4567-8901-123456789abc';for(const c of languageCases){const name=importedFileName('a.'+c.ext.toUpperCase());assert.equal(importedCopyName(name,id),'a-导入-'+id+'.'+c.ext);assert.equal(textExportName(name),'a-导出副本.'+c.ext);let state=EditorState.create({doc:c.source,selection:{anchor:1},extensions:[history(),sourceFormat(c.source),codeLanguage(c.language)]});const dispatch=tr=>{state=tr.state};dispatch(state.update(codeIndentChange(state)));const expected='\uFEFF  '+c.source.slice(1);assert.equal(sourceSlice(state),expected);undo({state,dispatch});assert.equal(sourceSlice(state),c.source);redo({state,dispatch});assert.equal(sourceSlice(state),expected)}
})
test('边界扩展名按完整文件后缀识别，不接受扩展名伪装或父路径',()=>{
 assert.equal(codeFileInfo('folder/file.d.ts').language,'typescript');assert.equal(codeFileInfo('folder/C.HTM').language,'html');for(const path of ['file.rs.exe','file.rs/other','file.rs\\other','file.rs.backup','folder.rs/file','source','a.env.local'])assert.equal(codeFileInfo(path),undefined)
})
test('资料库搜索实际读取全部 32 种已保存源码，继续排除隐藏和未知格式',async()=>{
 const documents=new Map(languageCases.map(c=>['case.'+c.ext,{rootId:'local',relativePath:'case.'+c.ext,content:c.source,signature:c.ext,modified:1}]))
 documents.set('.env',{rootId:'local',relativePath:'.env',content:'原文😎 secret',signature:'env',modified:1});documents.set('binary.exe',{rootId:'local',relativePath:'binary.exe',content:'原文😎 secret',signature:'exe',modified:1})
 const reads=[],storage={async roots(){return[{id:'local',available:true}]},async list(){return{entries:[...documents].map(([name,d])=>({name,relativePath:name,directory:false,size:Buffer.byteLength(d.content)})),truncated:false}},async read(id){reads.push(id.relativePath);return documents.get(id.relativePath)}}
 const index=new LibrarySearchIndex('local');await index.build(storage);assert.equal(index.status.phase,'ready');assert.equal(index.status.indexed,32);assert.equal(index.search('原文😎','content').total,32);assert.equal(reads.length,32);assert.equal(index.search('secret').total,0);assert.equal(reads.includes('.env'),false);assert.equal(reads.includes('binary.exe'),false)
})
