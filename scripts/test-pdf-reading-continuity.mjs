import fs from 'node:fs'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import ts from 'typescript'
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(s,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64')
const dependency=url(fs.readFileSync('src/utils/pdfReadingNote.ts','utf8'))
const {managedReadingMarkdown,readingNoteBlocks,readingUpdateSnapshot,readingUpdateChanges,replaceReadingNote}=await import(url(fs.readFileSync('src/utils/pdfReadingContinuity.ts','utf8').replace("'./pdfReadingNote'",JSON.stringify(dependency))))
const item=(id,comment='原评论')=>({annotation:{id,kind:'comment',color:'yellow',page:1,quote:'原摘录',comment,rects:[],createdAt:1,updatedAt:1},uri:'longedit://pdf?path=Paper.pdf&page=1&annotation='+id+'&sha256='+'a'.repeat(64),label:'Paper.pdf · 第 1 页'})
const snapshot={sourceDigest:'a'.repeat(64),sourceSignature:'fixture',relativePath:'Paper.pdf',knownAnnotationIds:['a','b','unselected'],items:[item('a'),item('b')],missingIds:[]}
test('managed boundaries preserve exact outside prose and prevent duplicate identity on repeat updates',()=>{
 const generated=managedReadingMarkdown(snapshot,'page',true),before='用户补写\r\n\r\n'+generated+'\r\n最后的未保存补写\r\n',block=readingNoteBlocks(before)[0]
 assert.equal(block.edited,false)
 const fresh={...snapshot,items:[item('a','修改后的评论'),item('b')]},after=replaceReadingNote(before,block,fresh),parsed=readingNoteBlocks(after)
 assert.equal(parsed.length,1);assert.equal(parsed[0].metadata.id,block.metadata.id);assert.ok(after.startsWith('用户补写\r\n\r\n')&&after.endsWith('\r\n最后的未保存补写\r\n'));assert.equal(parsed[0].edited,false)
 assert.equal(replaceReadingNote(after,parsed[0],fresh),after)
})
test('user edits inside generated text refuse replacement and allow explicit append without changing original',()=>{
 const before=managedReadingMarkdown(snapshot,'color',true).replace('评论：原评论','评论：我自己补写的文字'),block=readingNoteBlocks(before)[0]
 assert.equal(block.edited,true);assert.throws(()=>replaceReadingNote(before,block,snapshot))
 const after=replaceReadingNote(before,block,snapshot,true);assert.ok(after.startsWith(before));assert.equal(readingNoteBlocks(after).length,2)
})
test('deleted annotations retain their excerpts by default; adding genuinely new ids does not select old unselected ones',()=>{
 const fresh={...snapshot,knownAnnotationIds:['a','unselected','new'],items:[item('a','新评论'),item('new')],missingIds:['b']}
 assert.deepEqual(readingUpdateChanges(snapshot,fresh),{added:1,changed:1,deleted:1})
 assert.deepEqual(readingUpdateSnapshot(snapshot,fresh,false).items.map(i=>i.annotation.id),['a','new','b'])
 assert.deepEqual(readingUpdateSnapshot(snapshot,fresh,true).items.map(i=>i.annotation.id),['a','new'])
 const generated=managedReadingMarkdown(readingUpdateSnapshot(snapshot,fresh,false),'page',true);assert.ok(generated.includes('原批注已删除，保留原摘录'));assert.equal(readingNoteBlocks(generated)[0].edited,false)
})
test('legacy, fenced examples and malformed boundaries never infer a replaceable user section',()=>{
 assert.deepEqual(readingNoteBlocks('# 旧笔记\n\n[来源](longedit://pdf?path=x.pdf)\n'),[])
 const managed=managedReadingMarkdown(snapshot,'page',true)
 assert.deepEqual(readingNoteBlocks('```md\n'+managed+'```\n'),[])
 for(const text of [managed.replace('pdf-reading:end','broken:end'),managed+managed,'<!-- longedit:pdf-reading:v1 broken -->\n'])assert.throws(()=>readingNoteBlocks(text))
})
