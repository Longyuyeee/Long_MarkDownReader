// Actual Wry + production Vue + real native IPC + generated disk files.
// Input is sent to WebView2, never to the user's desktop or simulated adapters.
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {withDeadline} from './lib/with-deadline.mjs'
import {assertHostedSearchAudit,fixturePaths,nativeSearchProduct} from './lib/v118-native-search-fixture.mjs'
import {nativeUserInput} from './lib/v118-native-user-input.mjs'
assertHostedSearchAudit()
const [phase,root,_repo,output]=process.argv.slice(2),fixture=fixturePaths(root)
assert.equal(phase,'user');assert.equal(process.env.LONGEDIT_NATIVE_PRODUCT_COMMIT,nativeSearchProduct)
const owner=JSON.parse(await fs.readFile(path.join(root,'.v118-native-owner'),'utf8'))
assert.equal(owner.kind,'generated-search-fixture');assert.match(owner.nonce,/^[a-f0-9-]{36}$/)
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
const draftPath=path.join(fixture.library,'zz-项目预算.md'),changedPath=path.join(fixture.library,'a-0001-记录.md')
const referencePath=path.join(fixture.library,'a-0000-记录.md')
const pdfPath=path.join(fixture.library,'多批注.pdf'),sidecar=pdfPath+'.annotations.json'
const originals=new Map(await Promise.all([draftPath,changedPath,referencePath,pdfPath,sidecar].map(async name=>[name,await fs.readFile(name)])))
const report={schemaVersion:1,status:'running',phase:'user',evidenceLevel:'actual-wry-webview-input-events-generated-disk-not-installed',
  productCommit:nativeSearchProduct,harnessCommit:process.env.GITHUB_SHA,runtimeBaseVersion:'1.1.7',
  executableSha256:hash(await fs.readFile(process.env.LONGEDIT_NATIVE_EXECUTABLE)),sourceUserContentIncluded:false,
  nativeBridgeMocked:false,desktopInputUsed:false,checks:[],runtimeErrors:[],inputTrace:[],sourceFiles:[],draftChecks:[]}
let socket,send,evaluate,modifiedBytes,failure
const store=`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')`
const library='.knowledge-search-results',palette='.command-palette-container',input='.search-area input'
const count=scope=>`document.querySelectorAll(${JSON.stringify(scope+' .search-file-card')}).length`
const q=value=>JSON.stringify(value)
const pathKey=value=>value.replaceAll('\\','/').replace(/^\/\/\?\//,'').toLowerCase()
const capture=async name=>{const result=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,'user-'+name+'.png'),Buffer.from(result.data,'base64'))}
try{
  const endpoint='http://127.0.0.1:9458'
  let target
  for(let n=0;n<160;n++){
    const targets=await fetch(endpoint+'/json/list').then(r=>r.json()).catch(()=>[])
    target=targets.find(t=>t.type==='page'&&t.url.startsWith('http://127.0.0.1:14200/')&&!t.url.includes('quick-note'))
    if(target)break;await new Promise(resolve=>setTimeout(resolve,250))
  }
  assert.ok(target?.webSocketDebuggerUrl,'actual main WebView target required')
  socket=new WebSocket(target.webSocketDebuggerUrl);const pending=new Map();let sequence=0
  await withDeadline(()=>new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})}),10000,'user phase native target')
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data)
    if(message.method==='Runtime.exceptionThrown')report.runtimeErrors.push(message.params.exceptionDetails)
    const entry=pending.get(message.id);if(!entry)return;pending.delete(message.id)
    message.error?entry.reject(Error(message.error.message)):entry.resolve(message.result)
  })
  send=(method,params={})=>withDeadline(()=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))}),30000,method)
  evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value}
  await send('Runtime.enable')
  const ui=nativeUserInput({send,evaluate},{timeoutMs:30000})
  await ui.waitFor(`!!document.querySelector('.settings-view')&&${store}?.configReady===true`,'actual Settings and store bootstrap')
  assert.equal(await evaluate('window.__TAURI_INTERNALS__.invoke("plugin:app|version")'),'1.1.7')
  assert.equal(await evaluate(`${store}.activeLibraryPath`),fixture.library)
  await evaluate(`(() => {window.__v118UserInputTrace=[];for(const type of ['click','keydown','input'])document.addEventListener(type,event=>{const trace=window.__v118UserInputTrace;if(trace.length<600)trace.push({type,key:event.key||'',trusted:event.isTrusted,target:event.target?.getAttribute?.('aria-label')||event.target?.tagName||''})},true)})()`)
  await ui.clickText('.app-navigation a','资料库')
  await ui.waitFor(`!!document.querySelector('.library-mode')&&document.querySelector('.knowledge-index-strip')?.classList.contains('state-ready')`,'library and real persisted index')
  await ui.fill(input,'预算')
  await ui.waitFor(`${count(library)}===40&&!document.querySelector('${library} [aria-busy="true"]')`,'first real 40 file cards')
  await ui.clickText(library+' button','加载更多文件')
  await ui.waitFor(`${count(library)}===80`,'80 real native file cards')
  report.initialFiles=80
  await ui.click(library+' button[aria-label="打开 zz-项目预算.md"]')
  await ui.waitFor(`document.querySelector('#vditor-lib .vditor-wysiwyg')?.textContent.includes('保留最相关文件原文')`,'correct main Markdown editor')
  assert.equal(pathKey(await evaluate(`${store}.activeTabId`)),pathKey(draftPath))
  assert.equal(await evaluate(`!!document.querySelector('[aria-label="参考资料（只读）"]')`),false)
  report.checks.push('trusted-ui-library-80-files-and-main-editor')
  const draftText='我正在写正式预算，这段修改请保留，不要替我保存。'
  await ui.fill('#vditor-lib .vditor-wysiwyg [contenteditable="true"]',draftText)
  await ui.waitFor(`(()=>{const s=${store},t=s.tabs.find(t=>t.id===s.activeTabId);return t?.isDirty&&t.content.includes(${q(draftText)})})()`,'actual dirty draft after trusted input')
  const draftState=await evaluate(`(()=>{const s=${store},t=s.tabs.find(t=>t.id===s.activeTabId);return {path:t.path,content:t.content,dirty:t.isDirty}})()`)
  report.draftContentSha256=hash(Buffer.from(draftState.content))
  const assertDraft=async(active=true)=>{
    const current=await evaluate(`(()=>{const s=${store},t=s.tabs.find(t=>t.path===${q(draftState.path)});return t?{path:t.path,content:t.content,dirty:t.isDirty}:null})()`)
    assert.deepEqual(current,draftState,'main draft identity/content/dirty flag must survive')
    if(active)assert.equal(await evaluate(`${store}.activeTabId`),draftState.path,'reference/search must not switch the main document')
    assert.equal(hash(await fs.readFile(draftPath)),hash(originals.get(draftPath)),'no automatic source save')
    report.draftChecks.push({name:path.basename(draftPath),dirty:current.dirty,contentSha256:hash(Buffer.from(current.content))})
  }
  await ui.clickText('button','返回刚才的搜索结果')
  await ui.waitFor(`${count(library)}===80`,'return keeps loaded depth')
  await ui.click(library+' button[aria-label="在侧边参考 a-0000-记录.md"]')
  await ui.waitFor(`!!document.querySelector('[aria-label="参考资料（只读）"]')`,'explicit readonly reference')
  await ui.waitFor(`document.querySelector('[aria-label="参考资料（只读）"]')?.textContent.includes('保留正文 0')`,'correct other document in the readonly reference')
  await assertDraft();await capture('draft-reference')
  await ui.click('button[aria-label="关闭参考"]')
  report.checks.push('trusted-ui-dirty-draft-explicit-reference-no-disk-write')
  modifiedBytes=Buffer.concat([originals.get(changedPath),Buffer.from('\n外部刚补充的自有测试记录\n')])
  await fs.writeFile(changedPath,modifiedBytes)
  // Allow the real OS watcher to deliver the controlled event; do not retry
  // a page request until a failure magically appears.
  await new Promise(resolve=>setTimeout(resolve,250))
  await ui.clickText(library+' button','加载更多文件')
  await ui.waitFor(`!!document.querySelector('${library} .search-page-error')`,'real source change expires the issued page')
  assert.equal(await evaluate(count(library)),80)
  report.expiryText=await evaluate(`document.querySelector('${library} .search-page-error').textContent`)
  assert.match(report.expiryText,/搜索现场已变化或过期/);await capture('expired-page')
  await ui.click(library+' .search-page-error button')
  await ui.waitFor(`document.querySelector('${library} .search-page-line')?.textContent.includes('暂时保留上次结果')`,'new frontend retains old view during real native preparation')
  assert.equal(await evaluate(count(library)),80);await capture('refresh-retained')
  await ui.waitFor(`${count(library)}===80&&!document.querySelector('${library} [aria-busy="true"]')&&!document.querySelector('${library} .search-page-error')`,'real refresh restores 80 files')
  await assertDraft();report.refreshFiles=80
  report.checks.push('real-source-change-ui-expiry-refresh-restores-80')
  await ui.click(input);await ui.tabTo(library+' select[aria-label="搜索结果排序"]')
  await ui.key('Home','Home',36);await ui.key('ArrowDown','ArrowDown',40)
  await ui.waitFor(`document.querySelector('${library} select')?.value==='modified'&&${count(library)}===40&&!document.querySelector('${library} [aria-busy="true"]')`,'keyboard selects native modification sort')
  assert.match(await evaluate(`document.querySelector('${library} .search-file-title').textContent`),/a-0001-记录/)
  await assertDraft();await capture('modified-sort')
  report.checks.push('trusted-keyboard-native-modification-sort')
  await ui.key('p','KeyP',80,2)
  await ui.waitFor(`!!document.querySelector('${palette}')`,'actual command palette')
  await ui.click(palette+' .palette-scope')
  await ui.clickText('.n-base-select-option','全部资料库')
  await ui.fill(palette+' input[aria-label="搜索资料或命令"]','预算')
  await ui.waitFor(`${count(palette)}>=40&&!document.querySelector('${palette} [aria-busy="true"]')`,'actual cross-library cards')
  await ui.clickTarget(`[...document.querySelectorAll('${palette} .search-file-card')].find(e=>e.querySelector('.search-file-path')?.textContent.includes('学习资料库'))?.querySelector('.search-file-title')`)
  await ui.waitFor(`document.querySelector('${palette} [role="alert"]')?.textContent.includes('未保存')`,'cross-library main-open rejects unsaved draft')
  assert.equal(await evaluate(`${store}.activeLibraryPath`),fixture.library);await assertDraft();await capture('cross-library-draft-block')
  report.checks.push('trusted-palette-cross-library-draft-rejection')
  await ui.key('Escape','Escape',27)
  await ui.waitFor(`!document.querySelector('${palette}')`,'palette closes')
  await ui.fill(input,'预算位置3')
  await ui.waitFor(`${count(library)}===1&&!document.querySelector('${library} [aria-busy="true"]')`,'specific real PDF annotation result')
  await ui.click(library+' .search-match-open')
  await ui.waitFor(`!!document.querySelector('.pdf-view .annotation-card.active')&&document.querySelector('.annotation-editor textarea')?.value==='预算位置3'`,'actual PDF viewer selects the requested annotation')
  const pdfState=await evaluate(`({hash:location.hash,page:document.querySelector('input[aria-label="跳转到 PDF 页码"]')?.value,comment:document.querySelector('.annotation-editor textarea')?.value})`)
  const routeQuery=new URLSearchParams(pdfState.hash.slice(pdfState.hash.indexOf('?')+1))
  assert.equal(routeQuery.get('annotation'),'批注-3');assert.equal(pdfState.page,'1')
  assert.equal(pathKey(routeQuery.get('path')),pathKey(pdfPath));await assertDraft(false)
  report.pdf={annotationId:'批注-3',page:1,comment:pdfState.comment};await capture('pdf-annotation')
  report.checks.push('trusted-pdf-annotation-identity-and-draft-preservation')
  report.uiObservation=await evaluate('({hash:location.hash,errorOverlay:!!document.querySelector("#crash-screen,#runtime-error-notice,.route-error-notice,.global-error-overlay,.startup-fatal-screen")})')
  assert.equal(report.uiObservation.errorOverlay,false)
  assert.deepEqual(report.runtimeErrors,[])
}catch(error){failure=error;report.error={message:error?.message||String(error),stack:error?.stack}}
finally{
  try{
    if(modifiedBytes){assert.equal(hash(await fs.readFile(changedPath)),hash(modifiedBytes),'do not overwrite an unexpected fixture edit');await fs.writeFile(changedPath,originals.get(changedPath))}
    for(const [name,bytes] of originals){const after=hash(await fs.readFile(name));assert.equal(after,hash(bytes),'source bytes changed: '+name);report.sourceFiles.push({name:path.relative(fixture.library,name),before:hash(bytes),after})}
  }catch(error){failure ||= error;report.cleanupError=String(error)}
  if(evaluate)report.inputTrace=await evaluate('window.__v118UserInputTrace||[]').catch(()=>[])
  if(send)await capture(failure?'failure':'final').catch(()=>{})
  report.status=failure?'failed':'passed'
  await fs.writeFile(path.join(output,'native-user.json'),JSON.stringify(report,null,2)+'\n')
  socket?.close()
}
if(failure)throw failure
