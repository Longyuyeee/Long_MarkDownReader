import fs from 'node:fs'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import ts from 'typescript'
import {readingCopyFixtureNote} from './lib/installed-v1-1-33-workflow.mjs'
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(s,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64')
const dependency=url(fs.readFileSync('src/utils/pdfReadingNote.ts','utf8'))
const {managedReadingMarkdown,readingNoteBlocks,readingUpdateSnapshot,readingUpdateChanges,replaceReadingNote}=await import(url(fs.readFileSync('src/utils/pdfReadingContinuity.ts','utf8').replace("'./pdfReadingNote'",JSON.stringify(dependency))))
const item=(id,comment='原评论')=>({annotation:{id,kind:'comment',color:'yellow',page:1,quote:'原摘录',comment,rects:[],createdAt:1,updatedAt:1},uri:'longedit://pdf?path=Paper.pdf&page=1&annotation='+id+'&sha256='+'a'.repeat(64),label:'Paper.pdf · 第 1 页'})
const snapshot={sourceDigest:'a'.repeat(64),sourceSignature:'fixture',relativePath:'Paper.pdf',knownAnnotationIds:['a','b','unselected'],items:[item('a'),item('b')],missingIds:[]}

test('dependency-free installed fixture matches production and remains updatable after a path remap',()=>{
 const id='00000000-0000-4000-8000-000000000033',annotation={id:'copy-reading-1',kind:'comment',page:1,color:'yellow',rects:[],quote:'',comment:'跨库之后仍能看到的评论',createdAt:1,updatedAt:1},uri='longedit://pdf?path='+encodeURIComponent('来源/研究 来源.pdf')+'&page=1&annotation=copy-reading-1&sha256='+'a'.repeat(64),source={relativePath:'来源/研究 来源.pdf',sourceDigest:'a'.repeat(64),sourceSignature:'fixture',knownAnnotationIds:['copy-reading-1'],items:[{annotation,uri,label:'研究 来源.pdf · 第 1 页'}]}
 const generated=readingCopyFixtureNote(source,id)
 assert.equal(generated,managedReadingMarkdown(source,'page',true,id))
 const mapped=structuredClone(source);mapped.relativePath='收件/研究 来源.pdf';mapped.items[0].uri=uri.replace(encodeURIComponent(source.relativePath),encodeURIComponent(mapped.relativePath))
 const marker=/<!-- longedit:pdf-reading:v1 [A-Za-z0-9+/=]+ -->/,updatedMarker=managedReadingMarkdown(mapped,'page',true,id).match(marker)[0],content='自己的补写\r\n'+generated.replace(marker,updatedMarker).replaceAll(uri,mapped.items[0].uri).replaceAll('\n','\r\n')+'\r\n保留末尾补写\r\n',block=readingNoteBlocks(content)[0]
 assert.equal(block.edited,false);assert.deepEqual(block.metadata.snapshot,mapped)
 const fresh=structuredClone(mapped);fresh.items[0].annotation.comment='后来更新的评论'
 const after=replaceReadingNote(content,block,fresh);assert.ok(after.startsWith('自己的补写\r\n')&&after.endsWith('\r\n保留末尾补写\r\n'));assert.equal(readingNoteBlocks(after)[0].edited,false);assert.ok(after.includes('后来更新的评论'))
})
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
test('copied managed notes retain their generated body across libraries and remain updatable',()=>{
 const original=managedReadingMarkdown(snapshot,'page',true),block=readingNoteBlocks(original)[0]
 const copied={...snapshot,relativePath:'收件/Paper.pdf',items:snapshot.items.map(i=>({...i,uri:i.uri.replace('path=Paper.pdf','path='+encodeURIComponent('收件/Paper.pdf'))}))}
 // The native copy rewrites only URI spans and the metadata marker, keeping all body prose.
 const marker=managedReadingMarkdown(copied,'page',true,block.metadata.id).split('\n')[0]
 const content='自己的补写\n'+original.replace(original.split('\n')[0],marker).replaceAll('path=Paper.pdf','path='+encodeURIComponent('收件/Paper.pdf'))+'\n自己的后记'
 const live=readingNoteBlocks(content)[0];assert.equal(live.edited,false)
 const next={...copied,items:[{...copied.items[0],annotation:{...copied.items[0].annotation,comment:'更新后的评论'}},copied.items[1]]}
 const updated=replaceReadingNote(content,live,next);assert.ok(updated.startsWith('自己的补写\n')&&updated.endsWith('\n自己的后记'));assert.ok(updated.includes('更新后的评论'));assert.equal(readingNoteBlocks(updated)[0].edited,false)
 const edited=content.replace('评论：原评论','评论：我的补写');assert.equal(readingNoteBlocks(edited)[0].edited,true);assert.throws(()=>replaceReadingNote(edited,readingNoteBlocks(edited)[0],next))
})
