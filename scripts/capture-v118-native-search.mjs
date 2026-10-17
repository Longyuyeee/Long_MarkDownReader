// Real Tauri/Wry invoke calls in a disposable hosted Windows runner. No browser
// mock adapter, direct Rust-function bridge, desktop input or installer claims.
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { withDeadline } from './lib/with-deadline.mjs'
import { assertHostedSearchAudit,createNativeSearchFixture,fixturePaths,groupIdentity,nativeSearchProduct } from './lib/v118-native-search-fixture.mjs'
import { searchRuntimeIdentity, matchesSearchRuntimeTarget } from './lib/v118-search-runtime-identity.mjs'
assertHostedSearchAudit()
const [mode,root,repo,output]=process.argv.slice(2),fixture=fixturePaths(root)
if(mode==='fixture'){await createNativeSearchFixture(root,repo,{unregisteredEntries:Number(process.env.LONGEDIT_SEARCH_UNREGISTERED_ENTRIES||0)});process.exit(0)}
assert.ok(['baseline','disk'].includes(mode));const identity=searchRuntimeIdentity()
assert.ok(!identity.installed||mode==='baseline','installed restart evidence must come from a real process restart, never a page reload')
await fs.access(path.join(root,'.v118-native-owner'))
const executable=path.resolve(process.env.LONGEDIT_NATIVE_EXECUTABLE||'')
const executableSha256=crypto.createHash('sha256').update(await fs.readFile(executable)).digest('hex')
const endpoint=identity.endpoint,connections=[],calls=[],checks=[]
const report={...identity,schemaVersion:1,status:'running',phase:mode,evidenceLevel:identity.installed?'installed-tauri-ipc-and-disk':'debug-tauri-wry-real-ipc-and-generated-disk-not-installed',productCommit:identity.productCommit,harnessCommit:process.env.GITHUB_SHA,executableSha256,runtimeBaseVersion:identity.runtimeBaseVersion,sourceUserContentIncluded:false,desktopInputUsed:false,checks,calls,samples:[]}
const pressureEntries=await fs.readdir(path.join(fixture.library,'a-枚举压力'))
assert.equal(pressureEntries.length,21050);assert.ok(pressureEntries.every(name=>name.endsWith('.unknown-longedit-audit')))
report.generatedFixture={unregisteredEntries:pressureEntries.length}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function connect(predicate){
  let target,lastTargets=[],lastConnectionError=''
  for(let n=0;n<160;n++){
    const targets=await fetch(endpoint+'/json/list').then(r=>r.json()).catch(error=>{lastConnectionError=String(error);return []})
    lastTargets=targets.map(({id,type,url,title})=>({id,type,url,title}))
    target=targets.find(item=>item.type==='page'&&item.webSocketDebuggerUrl&&predicate(item))
    if(target)break
    await delay(250)
  }
  if(!target){report.connectionDiagnostics={lastTargets,lastConnectionError};throw Error('the intended real Wry target was not advertised; see connectionDiagnostics')}
  const socket=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let sequence=0
  connections.push(socket)
  await withDeadline(()=>new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})}),10000,'connect actual WebView2')
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data),entry=pending.get(message.id);if(!entry)return;pending.delete(message.id);message.error?entry.reject(Error(message.error.message)):entry.resolve(message.result)})
  const send=(method,params={})=>withDeadline(()=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))}),30000,method)
  const evaluate=async expression=>{const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));return response.result.value}
  return {send,evaluate,invoke:async(command,args={})=>{
    const start=performance.now(),result=await evaluate(`(async()=>{try{return {ok:true,value:await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})}}catch(error){return {ok:false,error}}})()`)
    calls.push({window:target.url.includes('quick-note')?'quick-note':'main',command,elapsedMs:Math.round((performance.now()-start)*1000)/1000,ok:result.ok,...(!result.ok?{code:result.error?.code||String(result.error)}:{})})
    if(!result.ok)throw result.error
    return result.value
  }}
}
let main
const request=(extra={})=>({libraryRoot:fixture.library,query:'预算',sort:'relevance',pageSize:40,channel:'library',matchMode:'content',cursor:null,...extra})
const page=(req,connection=main)=>connection.invoke('search_knowledge_page',{request:req})
const close=(frame,channel='library',connection=main)=>connection.invoke('close_knowledge_search',{sessionId:frame.sessionId,channel})
const rejectCode=async(work,codes)=>{await assert.rejects(work,error=>codes.includes(error?.code),`expected structured ${codes.join('/')}`)}
async function readySingle(req){let frame,initialExaminedSources;const start=performance.now();for(let n=0;n<200;n++){frame=await page(req);if(n===0)initialExaminedSources=frame.examinedSources;if(frame.scanState!=='preparing'){report.samples.push({kind:'single-ready',query:req.query,elapsedMs:performance.now()-start,workCalls:n+1,indexed:frame.indexed,initialExaminedSources});return frame}assert.equal(frame.totalFiles,null);assert.equal(frame.scanComplete,false);assert.equal(frame.files.length,0);assert.ok(frame.nextCursor);req={...req,cursor:frame.nextCursor}}throw Error('single search did not make bounded progress')}
async function allSingle(req){let frame=await readySingle(req);const first=frame,files=[...frame.files];let pages=1;while(frame.nextCursor){frame=await page({...req,cursor:frame.nextCursor});assert.equal(frame.snapshotId,first.snapshotId);assert.equal(frame.pageOffset,files.length);files.push(...frame.files);pages++;assert.ok(pages<=250)}assert.equal(new Set(files.map(file=>file.path)).size,files.length);return {first,files,pages}}
const multiRequest=(extra={})=>({libraryRoot:null,query:'预算',sort:'relevance',pageSize:40,channel:'palette',cursor:null,...extra})
async function allLibraries(req){let frame;for(let n=0;n<200;n++){frame=await main.invoke('search_knowledge_libraries_page',{request:req});if(!frame.continueCursor)break;req={...req,cursor:frame.continueCursor};await delay(20)}assert.equal(frame.continueCursor,null);const first=frame,files=[...frame.files];for(let n=0;frame.nextCursor&&n<250;n++){frame=await main.invoke('search_knowledge_libraries_page',{request:{...req,cursor:frame.nextCursor}});assert.equal(frame.snapshotId,first.snapshotId);assert.equal(frame.pageOffset,files.length);files.push(...frame.files)}assert.equal(new Set(files.map(file=>file.path)).size,files.length);return {first,files}}
try{
  main=await connect(target=>matchesSearchRuntimeTarget(target,identity))
  for(let n=0;n<120&&!await main.evaluate('!!window.__TAURI_INTERNALS__?.invoke');n++)await delay(100)
  // The native bridge precedes Vue bootstrap in a development WebView. Wait
  // for the actual user-facing route and loaded store, not an arbitrary sleep
  // or a search retry that could conceal an expired first request.
  const surfaceReady=`(() => { const app=document.querySelector('#app').__vue_app__; const store=app?.config.globalProperties.$pinia?._s.get('app'); return !!document.querySelector('.settings-view') && !document.querySelector('#app-startup-screen') && store?.configReady===true && store.activeLibraryPath===${JSON.stringify(fixture.library)}; })()`
  for(let n=0;n<600&&!await main.evaluate(surfaceReady);n++)await delay(100)
  assert.equal(await main.evaluate(surfaceReady),true,'actual settings page and fixture store must finish bootstrap before a user search')
  assert.equal(await main.invoke('plugin:app|version'),identity.runtimeBaseVersion)
  const config=await main.invoke('get_config');assert.equal(config.activeLibraryPath,fixture.library);assert.equal(config.libraries.length,3)
  checks.push('actual-product-identity-and-generated-config')
  if(mode==='disk'){
    const baseline=JSON.parse(await fs.readFile(path.join(output,'native-baseline.json'),'utf8'))
    assert.equal(baseline.executableSha256,executableSha256,'restart must use the same executable bytes')
    const disk=await allSingle(request());assert.equal(disk.first.indexed,true,'fresh process must use the persisted index, not a new cold scan')
    assert.deepEqual(groupIdentity(disk.files),baseline.expectedGroups);await close(disk.first)
    checks.push('same-executable-restart-disk-index-has-identical-244-groups-and-locators')
  }else{
    const cold=await allSingle(request());assert.equal(cold.files.length,244);assert.equal(cold.first.totalFiles,244);assert.equal(cold.first.indexed,false);assert.ok(cold.pages>5)
    assert.equal(report.samples[0].initialExaminedSources,0,'production entry budget must pause enumeration before matching any source')
    checks.push('production-entry-budget-resumes-generated-21050-unregistered-files')
    assert.match(cold.files[0].title,/项目预算/)
    const pdf=cold.files.find(file=>file.title==='多批注.pdf');assert.equal(pdf.matches.filter(match=>match.matchKind==='annotation').length,5);assert.ok(pdf.matches.every(match=>match.page===1&&match.annotationId));assert.equal(pdf.mayHaveMoreMatches,true)
    assert.equal(cold.files.filter(file=>file.title==='同名.md').length,2)
    assert.ok(!cold.files.some(file=>file.path.includes('.private')))
    checks.push('real-cold-work-and-seven-file-pages-pass-200-with-locators-and-private-exclusion')
    const nextRequest=request({cursor:cold.first.nextCursor}),one=await page(nextRequest),again=await page(nextRequest);assert.deepEqual(one,again)
    await rejectCode(()=>page({...nextRequest,sort:'modified'}),['requestMismatch'])
    await close(cold.first)
    checks.push('same-cursor-is-idempotent-and-sort-binding-rejects-mixed-pages')
    for(const [extra,code] of [[{pageSize:0},'invalidRequest'],[{matchMode:'tag',query:'预算'},'invalidRequest'],[{libraryRoot:path.join(root,'not-configured')},'scopeUnavailable']])await rejectCode(()=>page(request(extra)),[code])
    // Serde rejection is a transport-level string, before application error DTOs.
    await assert.rejects(()=>page({...request(),owner:'spoof'}))
    checks.push('camel-case-request-validation-and-unconfigured-scope-are-enforced-by-real-ipc')
    const tags=await allSingle(request({query:'#Budget',matchMode:'tag'}));assert.equal(tags.files.length,243);assert.ok(tags.files.every(file=>file.matches[0].matchKind==='tag'));await close(tags.first)
    const modified=await allSingle(request({sort:'modified'}));assert.equal(modified.files.length,244);for(let n=1;n<modified.files.length;n++)assert.ok(modified.files[n-1].modifiedAtMs>=modified.files[n].modifiedAtMs);await close(modified.first)
    checks.push('exact-case-tag-pages-and-native-modification-order')
    const first=await readySingle(request()),palette=await readySingle(request({channel:'palette'}))
    assert.equal(await close(first,'palette'),false);assert.deepEqual(await page(request({cursor:first.nextCursor})),await page(request({cursor:first.nextCursor})))
    await main.invoke('open_quick_note')
    const quick=await connect(target=>target.url.includes('quick-note'))
    assert.equal(await close(first,'library',quick),false)
    await rejectCode(()=>page(request({cursor:first.nextCursor}),quick),['expired'])
    assert.equal((await page(request({cursor:first.nextCursor}))).pageOffset,40)
    const own=await page(request({query:'不存在-quick'}),quick);assert.equal(await close(own,'library',quick),true)
    await close(first);await close(palette,'palette')
    checks.push('native-window-label-and-channel-isolation-prevent-cross-window-close-or-page')
    if(identity.installed)await main.invoke('plugin:window|close',{label:await quick.evaluate('window.__TAURI_INTERNALS__.metadata.currentWindow.label')})
    const all=await allLibraries(multiRequest());assert.equal(all.files.length,487);assert.equal(all.first.scanState,'limited');assert.equal(all.first.totalFiles,null);assert.ok(all.first.libraries.some(library=>library.state==='unavailable'));assert.equal(all.first.libraries.filter(library=>library.state==='ready').length,2);await close(all.first,'palette')
    const failed=await allLibraries(multiRequest({libraryRoot:fixture.missing}));assert.equal(failed.first.scanState,'failed');assert.equal(failed.files.length,0);assert.equal(failed.first.scanComplete,false);await close(failed.first,'palette')
    const empty=await allLibraries(multiRequest({libraryRoot:fixture.library,query:'不存在-413987'}));assert.equal(empty.first.scanState,'ready');assert.equal(empty.first.totalFiles,0);assert.equal(empty.first.scanComplete,true);await close(empty.first,'palette')
    checks.push('487-healthy-files-survive-one-offline-library-and-all-failure-is-not-complete-empty')
    const before=await readySingle(request()),changed=one.files[0].path,original=await fs.readFile(changed)
    await fs.appendFile(changed,'\n用户刚修改的自有夹具\n')
    await rejectCode(()=>page(request({cursor:before.nextCursor})),['expired'])
    await fs.writeFile(changed,original)
    checks.push('source-change-expires-a-real-issued-page-before-stale-data-is-returned')
    await main.invoke('rebuild_knowledge_index',{libraryRoot:fixture.library})
    for(let n=0;n<300;n++){const status=await main.invoke('get_knowledge_index_status',{libraryRoot:fixture.library});if(status.state==='ready')break;assert.notEqual(status.state,'error');await delay(100)}
    await delay(250)
    const warm=await allSingle(request());assert.equal(warm.first.indexed,true);assert.equal(warm.files.length,244);assert.deepEqual(groupIdentity(warm.files),groupIdentity(cold.files));await close(warm.first)
    report.expectedGroups=groupIdentity(warm.files)
    checks.push('real-rebuild-memory-cache-matches-cold-groups-and-persists-for-restart')
  }
  report.uiObservation=await main.evaluate('({title:document.title,hash:location.hash,errorOverlay:!!document.querySelector("#crash-screen,#runtime-error-notice,.route-error-notice,.global-error-overlay,.startup-fatal-screen")})')
  assert.equal(report.uiObservation.errorOverlay,false)
  report.status='passed'
}catch(error){report.status='failed';report.error=error&&typeof error==='object'?{message:error.message,code:error.code,stack:error.stack}:String(error);throw error}
finally{
  if(main)await main.send('Page.captureScreenshot',{format:'png'}).then(result=>fs.writeFile(path.join(output,`native-${mode}.png`),Buffer.from(result.data,'base64'))).catch(()=>{})
  await fs.writeFile(path.join(output,identity.installed?'installed-v118-baseline.json':`native-${mode}.json`),JSON.stringify(report,null,2)+'\n')
  for(const socket of connections)socket.close()
}
