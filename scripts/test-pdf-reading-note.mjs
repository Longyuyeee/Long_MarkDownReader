import fs from 'node:fs'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import ts from 'typescript'
const load=async file=>import('data:text/javascript;base64,'+Buffer.from(ts.transpile(fs.readFileSync(file,'utf8'),{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64'))
const {readingNoteMarkdown,appendReadingDraft,annotationPageFilter}=await load('src/utils/pdfReadingNote.ts')
const {parsePdfReferenceUri}=await load('src/utils/pdfReference.ts')
test('PDF notes page range works for one page, disjoint ranges and rejects invalid/outside ranges',()=>{
 assert.deepEqual([...annotationPageFilter('1',1)],[1]);assert.deepEqual([...annotationPageFilter('1-3，5',6)],[1,2,3,5]);assert.equal(annotationPageFilter('',4),null)
 for(const v of ['0','3-2','8','1,,2','1e2'])assert.throws(()=>annotationPageFilter(v,6))
})
test('PDF reading note retains quote and optional comment, escapes Markdown and only includes snapshot items',()=>{
 const a={id:'a',page:2,color:'blue',quote:'**原文**\n[不是链接](file:///private)',comment:'<script>保留为文字</script>',createdAt:1}
 const snapshot={relativePath:'研究.pdf',items:[{annotation:a,label:'研究.pdf · 第 2 页',uri:'longedit://pdf?path=x.pdf&page=2&annotation=a&sha256='+'a'.repeat(64)}]}
 const all=readingNoteMarkdown(snapshot,'page',true),noComments=readingNoteMarkdown(snapshot,'color',false)
 assert.ok(all.includes('## 第 2 页')&&all.includes('\\*\\*原文\\*\\*')&&all.includes('评论：\\<script\\>'))
 assert.ok(noComments.includes('## 蓝色')&&!noComments.includes('评论：'));assert.equal((all.match(/longedit:\/\/pdf/g)||[]).length,1)
})
test('Draft insertion never writes and appends to latest content while keeping save identity',()=>{
 const tab={path:'C:/library/笔记.md',content:'未保存草稿\n继续输入',textSignature:'original',isDirty:false}
 appendReadingDraft(tab,'新摘录');assert.equal(tab.content,'未保存草稿\n继续输入\n\n新摘录\n');assert.equal(tab.isDirty,true);assert.equal(tab.textSignature,'original')
 for(const patch of [{external:true},{textReadOnlyReason:'只读'},{content:undefined},{textSignature:undefined},{textLoadError:'读取失败'}])assert.throws(()=>appendReadingDraft({...tab,...patch},'不要插入'))
})
test('PDF reference validates digest, keeps legacy compatibility and rejects traversal',()=>{
 const base='longedit://pdf?path=资料%2F阅读.pdf&page=2&annotation=a'
 assert.equal(parsePdfReferenceUri(base).sourceDigest,undefined);assert.equal(parsePdfReferenceUri(base+'&sha256='+'a'.repeat(64)).sourceDigest,'a'.repeat(64))
 assert.equal(parsePdfReferenceUri(base+'&sha256=bad'),null);assert.equal(parsePdfReferenceUri(base.replace('资料%2F阅读.pdf','..%2Fprivate.pdf')),null)
})
