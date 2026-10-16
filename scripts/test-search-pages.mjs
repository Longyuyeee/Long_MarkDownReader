import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSearchPages } from '../src/services/searchPages.ts'
const match = (n, root='C:/library') => ({ path:`${root}/${n}.md`, title:`${n}.md`, objectType:'markdown', matchKind:'body', context:'项目预算', score:60, extractionFailed:false })
const file = n => ({ path:match(n).path, title:match(n).title, matches:[match(n)], mayHaveMoreMatches:true, locationLimitPerKind:5, unlocatedLimitPerKind:1 })
const frame = (offset=0, count=40, extra={}) => ({ sessionId:'session', snapshotId:'snapshot', files:Array.from({length:count},(_,n)=>file(n+offset)), pageOffset:offset,
  nextCursor:offset+count<120?`p:${offset+count}`:null, scanState:'ready', scanComplete:true, totalFiles:120, ...extra })
const definition = (extra={}) => ({ libraryRoot:'C:/library',query:'项目 预算 -旧版',sort:'relevance',channel:'library',kind:'single',...extra })
const deferred = () => { let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject} }
function harness(handler, options={}) {
  const calls=[], closes=[]
  const page=createSearchPages(async(command,args)=>{
    if(command==='close_knowledge_search'){closes.push(args);return true}
    calls.push({command,args});return handler(args.request, calls.length)
  }, {autoMs:0,...options})
  return {page,calls,closes}
}
test('file pages append only the issued same-snapshot end and preserve locator payloads', async()=>{
  const located=file(0);located.matches=[{...match(0),matchKind:'annotation',annotationId:'a',page:2},{...match(0),matchKind:'annotation',annotationId:'b',page:3}]
  const h=harness(request=>request.cursor?frame(40):frame(0,40,{files:[located,...Array.from({length:39},(_,n)=>file(n+1))]}))
  await h.page.start(definition());await h.page.loadMore()
  assert.equal(h.page.files.value.length,80);assert.equal(h.calls[1].args.request.cursor,'p:40')
  assert.deepEqual(h.page.files.value[0].matches.map(m=>m.annotationId),['a','b']);assert.equal(h.calls[0].command,'search_knowledge_page');h.page.dispose()
})
test('a failed next page retains loaded files and retries exactly the same cursor',async()=>{
  const h=harness((request,n)=>{if(n===2)throw {code:'busy'};return request.cursor?frame(40):frame()})
  await h.page.start(definition());await h.page.loadMore();assert.equal(h.page.files.value.length,40);assert.equal(h.page.errorCode.value,'busy')
  await h.page.retry();assert.deepEqual(h.calls[2].args,h.calls[1].args);assert.equal(h.page.files.value.length,80);h.page.dispose()
})
test('expired re-search preserves old files while waiting and preserves conditions',async()=>{
  const pending=deferred();const h=harness((request,n)=>n===1?frame():n===2?Promise.reject({code:'expired'}):pending.promise)
  await h.page.start(definition());await h.page.loadMore();const retry=h.page.retry();assert.equal(h.page.files.value.length,40)
  assert.equal(h.calls[2].args.request.cursor,null);assert.equal(h.calls[2].args.request.query,'项目 预算 -旧版')
  pending.resolve(frame());await retry;assert.equal(h.page.error.value,'');h.page.dispose()
})
test('a newly ranked view waits for explicit refresh and never appends into the old list',async()=>{
  const h=harness(request=>request.cursor==='w:1'?frame(0,40,{snapshotId:'new',files:Array.from({length:40},(_,n)=>file(n+50)),continueCursor:null,refreshCursor:'w:2'}):frame(0,40,{continueCursor:'w:1',refreshCursor:'w:1'}))
  await h.page.start(definition({kind:'libraries',channel:'palette'}));await h.page.continueSearch()
  assert.equal(h.page.files.value[0].path,file(0).path);assert.equal(h.page.pendingView.value.snapshotId,'new')
  const count=h.calls.length;await h.page.loadMore();assert.equal(h.calls.length,count)
  await h.page.applyPending();assert.equal(h.page.files.value[0].path,file(50).path);h.page.dispose()
})
test('same-view progress cannot rewind the already-loaded page cursor',async()=>{
  const h=harness(request=>request.cursor==='p:40'?frame(40,40,{continueCursor:'w:1',refreshCursor:'w:1'}):request.cursor==='p:80'?frame(80,40,{continueCursor:'w:1',refreshCursor:'w:1'}):frame(0,40,{continueCursor:request.cursor==='w:1'?null:'w:1',refreshCursor:'w:2'}))
  await h.page.start(definition({kind:'libraries',channel:'palette'}));await h.page.loadMore();await h.page.continueSearch()
  assert.equal(h.page.nextPage.value,'p:80');await h.page.loadMore();assert.equal(h.page.files.value.length,120);h.page.dispose()
})
test('late query reply cannot replace new results or close the newer native session',async()=>{
  const old=deferred();const h=harness((_request,n)=>n===1?old.promise:frame(0,1,{sessionId:'new',snapshotId:'new',files:[file('new')],nextCursor:null,totalFiles:1}))
  const first=h.page.start(definition());await h.page.start(definition({query:'新条件'}));old.resolve(frame(0,1,{sessionId:'old',files:[file('old')]}));await first
  assert.equal(h.page.files.value[0].title,'new.md');assert.ok(h.closes.some(c=>c.sessionId==='old'));assert.ok(!h.closes.some(c=>c.sessionId==='new'));h.page.dispose()
})
for(const dispose of [false,true]) test(`${dispose?'unmount':'clear'} retires a late initial session`,async()=>{
  const pending=deferred();const h=harness(()=>pending.promise);const first=h.page.start(definition());if(dispose)h.page.dispose();else h.page.reset()
  pending.resolve(frame());await first;assert.equal(h.page.files.value.length,0);assert.ok(h.closes.some(c=>c.sessionId==='session'&&c.channel==='library'))
})
test('preparation is bounded and resumable, never reported as a completed empty result',async()=>{
  const h=harness(()=>frame(0,0,{snapshotId:null,pageOffset:null,nextCursor:'w:1',scanState:'preparing',scanComplete:false,totalFiles:null}))
  await h.page.start(definition());assert.equal(h.calls.length,1);assert.equal(h.page.busy.value,false);assert.equal(h.page.canContinue.value,true);assert.equal(h.page.nextPage.value,null);h.page.dispose()
})
test('automatic preparation stops when a usable first page is ready',async()=>{
  const h=harness((_req,n)=>n===1?frame(0,0,{pageOffset:null,scanState:'preparing',scanComplete:false,totalFiles:null,nextCursor:'w:1',snapshotId:null}):frame(),{autoMs:300,pollMs:1})
  await h.page.start(definition());assert.equal(h.calls.length,2);assert.equal(h.page.files.value.length,40);h.page.dispose()
})
test('restoring previously loaded depth reads only the necessary pages',async()=>{
  const h=harness(request=>request.cursor?frame(40):frame(),{autoMs:300})
  await h.page.start(definition(),{loadUntil:80});assert.equal(h.calls.length,2);assert.equal(h.page.files.value.length,80);h.page.dispose()
})
test('invalid phrase never invokes IPC, unknown native error never exposes raw paths',async()=>{
  const h=harness(()=>{throw Error('C:/private/sensitive-user-file.md')})
  await h.page.start(definition({query:'"未结束'}));assert.equal(h.calls.length,0);assert.match(h.page.error.value,/结束双引号/)
  await h.page.start(definition());assert.doesNotMatch(h.page.error.value,/private|sensitive/);assert.match(h.page.error.value,/重试/);h.page.dispose()
})
test('explicit tag mode uses the page protocol and keeps exact tag case',async()=>{
  const h=harness(()=>frame(0,0,{nextCursor:null,totalFiles:0}));await h.page.start(definition({query:'#Budget',matchMode:'tag'}))
  assert.equal(h.calls[0].args.request.matchMode,'tag');assert.equal(h.calls[0].args.request.query,'#Budget');h.page.dispose()
})
test('duplicate or cross-snapshot next pages fail without touching the old list',async()=>{
  for(const response of [frame(40,40,{snapshotId:'other'}),frame(40,1,{files:[file(0)]})]) {
    const h=harness(request=>request.cursor?response:frame());await h.page.start(definition());await h.page.loadMore()
    assert.equal(h.page.files.value.length,40);assert.ok(h.page.error.value);h.page.dispose()
  }
})
test('a malformed protocol response cannot become successful no-results',async()=>{
  const h=harness(()=>[]);await h.page.start(definition());assert.equal(h.page.status.value,null);assert.ok(h.page.error.value);h.page.dispose()
})
test('a malformed reply retires its allocated native session and invalid input retry stays local',async()=>{
  const h=harness(()=>({sessionId:'malformed',files:null}));await h.page.start(definition())
  assert.ok(h.closes.some(call=>call.sessionId==='malformed'));assert.ok(h.page.error.value)
  await h.page.start(definition({query:'"未结束'}));const count=h.calls.length
  await h.page.retry();assert.equal(h.calls.length,count);assert.match(h.page.error.value,/结束双引号/);h.page.dispose()
})
test('all failures, partial success with zero files and complete zero remain distinct',async()=>{
  for(const state of ['failed','limited','ready']) {
    const h=harness(()=>frame(0,0,{scanState:state,scanComplete:state==='ready',totalFiles:state==='ready'?0:null,nextCursor:null}))
    await h.page.start(definition());assert.equal(h.page.status.value.scanState,state);assert.equal(h.page.status.value.totalFiles,state==='ready'?0:null);h.page.dispose()
  }
})
