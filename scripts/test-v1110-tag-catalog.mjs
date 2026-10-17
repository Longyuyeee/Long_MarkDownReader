import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTagCatalogPages } from '../src/services/tagCatalogPages.ts'
const ready=(count=600,extra={})=>({sessionId:'catalog',nextCursor:null,scanState:'ready',scanComplete:true,tags:count?[{tag:'项目',count}]:[],examinedNotes:count,totalNotes:count,unreadSources:0,warnings:[],...extra})
const preparing=(count=256,extra={})=>ready(count,{scanState:'preparing',scanComplete:false,totalNotes:null,nextCursor:`w:${count}`, ...extra})
function harness(handler) { const calls=[],closes=[];const model=createTagCatalogPages(async(command,args)=>{if(command==='close_knowledge_search'){closes.push(args);return true}calls.push(args.request);return handler(args.request,calls.length)},{autoMs:0});return {model,calls,closes} }
test('600-note catalog advances by issued cursors, never treats partial counts as totals and closes its own channel',async()=>{
 const h=harness(request=>request.cursor==='w:512'?ready():preparing(request.cursor?512:256))
 await h.model.start('C:/lib');assert.equal(h.model.status.value.totalNotes,null);assert.equal(h.model.tags.value[0].count,256)
 await h.model.continueScan();await h.model.continueScan();assert.equal(h.model.tags.value[0].count,600);assert.equal(h.model.status.value.totalNotes,600)
 assert.deepEqual(h.calls.map(r=>r.cursor),[null,'w:256','w:512']);h.model.dispose();assert.equal(h.closes.at(-1).channel,'tagCatalog')
})
test('failed or incomplete refresh keeps prior tags explicitly stale, only complete empty statistics clears them',async()=>{
 let mode='good';const h=harness(()=>{if(mode==='fail')throw {code:'busy'};return mode==='partial'?preparing(1,{scanState:'limited',nextCursor:null,warnings:['未读完']}):ready(mode==='empty'?0:600)})
 await h.model.start('C:/lib');mode='fail';await h.model.restart();assert.equal(h.model.tags.value[0].count,600);assert.ok(h.model.retaining.value&&h.model.error.value)
 mode='partial';await h.model.restart();assert.equal(h.model.tags.value[0].count,600);assert.equal(h.model.pendingStatus.value.scanComplete,false);assert.ok(h.model.error.value)
 mode='empty';await h.model.restart();assert.equal(h.model.tags.value.length,0);assert.equal(h.model.status.value.totalNotes,0);h.model.dispose()
})
test('same-cursor retry cannot duplicate counts and stale library responses cannot replace the active library',async()=>{
 let fail=true;const h=harness(request=>{if(request.cursor&&fail)throw {code:'busy'};return request.cursor?ready():preparing()})
 await h.model.start('C:/a');await h.model.continueScan();fail=false;await h.model.retry();assert.equal(h.calls[1].cursor,h.calls[2].cursor);assert.equal(h.model.tags.value[0].count,600)
 h.model.dispose();let resolve;const late=new Promise(done=>resolve=done);const next=harness((_,n)=>n===1?late:ready(1,{sessionId:'new'}));const old=next.model.start('C:/old');await next.model.start('C:/new');resolve(ready());await old
 assert.equal(next.model.tags.value[0].count,1);assert.equal(next.model.status.value.sessionId,'new');assert.ok(next.closes.some(c=>c.sessionId==='catalog'));next.model.dispose()
})
test('unknown or contradictory totals and malformed rows are not accepted as complete',async()=>{
 for(const invalid of [ready(1,{scanComplete:false}),ready(1,{totalNotes:2}),ready(1,{tags:[{tag:'项目',count:2}]}),preparing(1,{nextCursor:null}),ready(1,{tags:[{tag:'项目',count:1},{tag:'项目',count:1}]})]){
  const h=harness(()=>invalid);await h.model.start('C:/lib');assert.equal(h.model.tags.value.length,0);assert.ok(h.model.error.value);h.model.dispose()
 }
})
