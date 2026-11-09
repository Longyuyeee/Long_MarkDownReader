import test from 'node:test'
import assert from 'node:assert/strict'
import {filterAnnotations,orderedAnnotations,addReadingSelection,selectedReadingDocument,curatedReadingNote} from '../src/mobile/pdfCuration.ts'
const annotation=(id,page=1,color='yellow',comment=id)=>({id,page,color,comment,kind:'comment',rects:[],quote:'',createdAt:1,updatedAt:1})
const doc={schemaVersion:1,source:{pdfFile:'阅读.pdf',size:1,modifiedAt:1},annotations:[annotation('third',3,'blue','CAFÉ ideas'),annotation('first',1,'green','安静 阅读'),annotation('second',1,'yellow','ＦＯＯ bar')]}
const all={query:'',color:'all',currentPage:null},ref={rootId:'local',sourceSignature:'a'.repeat(64)}
test('combined filters match quote and thoughts, normalize width and case, require every word',()=>{
 assert.deepEqual(filterAnnotations(doc.annotations,{...all,query:'  foo BAR  '}).map(a=>a.id),['second'])
 assert.deepEqual(filterAnnotations(doc.annotations,{...all,color:'green',currentPage:1,query:'安静 阅读'}).map(a=>a.id),['first'])
 assert.equal(filterAnnotations(doc.annotations,{...all,color:'blue',currentPage:1}).length,0)
 assert.deepEqual(filterAnnotations([{...annotation('q'),quote:'Café',comment:'Ideas'}],{...all,query:'cafe\u0301 IDEAS'}).map(a=>a.id),['q'])
})
test('ordering is deterministic and never mutates the input',()=>{const before=JSON.stringify(doc);assert.deepEqual(orderedAnnotations(doc.annotations).map(a=>a.id),['first','second','third']);assert.equal(JSON.stringify(doc),before)})
test('filtering never removes hidden selected IDs',()=>{const selected=addReadingSelection(['third'],filterAnnotations(doc.annotations,{...all,color:'green'}).map(a=>a.id));assert.deepEqual(selected,['third','first']);assert.deepEqual(selectedReadingDocument(doc,selected).annotations.map(a=>a.id),['first','third'])})
test('bulk union deduplicates and rejects over 200 atomically',()=>{const original=Array.from({length:199},(_,i)=>String(i));assert.equal(addReadingSelection(original,['198','new']).length,200);assert.throws(()=>addReadingSelection(original,['new','more']),/200/);assert.equal(original.length,199)})
test('missing, duplicate, empty and excessive selections do not silently generate a subset',()=>{for(const ids of [[],['gone'],['first','first'],Array(201).fill('first')])assert.throws(()=>selectedReadingDocument(doc,ids));assert.equal(doc.annotations.length,3)})
test('chosen note includes exactly chosen excerpts with escaped text and full source links',()=>{const result=curatedReadingNote('阅读.pdf',doc,['third','first'],ref);assert.equal(result.document.annotations.length,2);assert.ok(result.content.includes('安静 阅读'));assert.ok(result.content.includes('CAFÉ ideas'));assert.ok(!result.content.includes('ＦＯＯ'));assert.equal((result.content.match(/longedit:\/\/pdf/g)||[]).length,2);assert.ok(result.content.includes('sha256='+ref.sourceSignature));assert.ok(result.content.indexOf('第 1 页')<result.content.indexOf('第 3 页'))})
test('preview snapshot is isolated from later immutable document replacement',()=>{const result=curatedReadingNote('阅读.pdf',doc,['first'],ref),saved=result.content;const newer={...doc,annotations:doc.annotations.map(a=>({...a,comment:'changed'}))};assert.ok(!result.content.includes('changed'));assert.equal(result.content,saved);assert.notEqual(curatedReadingNote('阅读.pdf',newer,['first'],ref).content,saved)})
test('large selections reject before saving and leave all originals available',()=>{const source={...doc,annotations:Array.from({length:7},(_,i)=>annotation('long'+i,1,'yellow','字'.repeat(20000)))};assert.throws(()=>curatedReadingNote('阅读.pdf',source,source.annotations.map(a=>a.id),ref),/128 KiB/);assert.equal(source.annotations[0].comment.length,20000)})
