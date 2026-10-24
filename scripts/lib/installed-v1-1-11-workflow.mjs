import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {nativeUserInput} from './v118-native-user-input.mjs'
import {visibleMarkdownInput} from './visible-markdown-input.mjs'
import {graphExplorationChecks,validateInstalledGraphExploration} from './installed-v1-1-11-evidence.mjs'
import {renameOwnedOfflineFixture} from './rename-owned-offline-fixture.mjs'
const q=JSON.stringify,sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
const store=`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')`
const normalize=value=>value.replace(/^\\\\\?\\/,'').replaceAll('/','\\').toLowerCase()
export async function runInstalledV1111Workflow({send,evaluate,capture,library,output,sourceCommit,installerSha256,appVersion,installedExecutable}){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');assert.equal(process.env.LONGEDIT_R5I_DISPOSABLE,'1')
 assert.ok(['1.1.11','1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24'].includes(appVersion));assert.equal(path.resolve(library).toLowerCase(),'c:\\longeditr5ilibrary')
 const report={appVersion,sourceCommit,installerSha256,harnessSourceCommit:process.env.GITHUB_SHA,executableSha256:sha(await fs.readFile(installedExecutable)),evidenceLevel:'installed-webview-input-native-graph-ipc-and-disk',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,status:'running',checks:[],poses:{},sourceFiles:[],inputTrace:[],runtimeErrors:[]}
 const ui=nativeUserInput({send,evaluate},{timeoutMs:90000}),check=i=>report.checks.push({id:graphExplorationChecks[i],status:'passed'})
 const invoke=(command,args={})=>evaluate(`window.__TAURI_INTERNALS__.invoke(${q(command)},${q(args)})`)
 const folder=path.join(library,'v1111-graph-'+crypto.randomUUID()),files=Array.from({length:180},(_,i)=>path.join(folder,`图谱验收主题${String(i).padStart(3,'0')} - 项目长期研究与来源证据核对.md`))
 const offline=library+'-v1111-offline-'+crypto.randomUUID();assert.equal(path.dirname(offline),path.dirname(library));assert.ok(offline.startsWith(library+'-v1111-offline-'))
 let moved=false,failure
 const graphReady=()=>ui.waitFor(`document.querySelector('[data-testid="graph-canvas"]')?.dataset.layoutSettled==='true'&&document.querySelector('[data-testid="graph-canvas"]')?.dataset.layoutWorkerState!=='failed'&&document.querySelector('[data-testid="graph-refresh"]')?.disabled===false`,'actual graph, layout and refresh complete')
 const pose=async()=>JSON.parse(await evaluate(`document.querySelector('[data-testid="graph-canvas"]').dataset.cameraPose`))
 const frame=()=>evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))')
 const settled=async()=>{await frame();await ui.waitFor(`document.querySelector('[data-testid="graph-canvas"]')?.dataset.cameraMotionState!=='running'`,'actual camera transition settled');await frame()}
 const refresh=async()=>{await ui.click('[data-testid="graph-refresh"]');await graphReady();await settled()}
 // Names also occur in other notes' wikilinks. A full path is the user's unambiguous query,
 // not an instruction to change ranking or force a particular component selection.
 const select=async()=>{await ui.fill('.graph-search input',files[17]);await ui.key('Enter','Enter',13);await ui.waitFor(`!!document.querySelector('[data-testid="graph-selected-node"]')`,'actual selected graph node');await ui.fill('.graph-search input','');await settled()}
 const markerRelative=path.relative(library,path.join(folder,'.v1111-owned'));report.offlineRenameOperations=[]
 const renameOffline=async(source,target)=>report.offlineRenameOperations.push(await renameOwnedOfflineFixture(source,target,markerRelative))
 const restoreRoot=async()=>{if(moved){await renameOffline(offline,library);moved=false;report.offlineRootRestored=true}}
 try{
  await fs.mkdir(folder,{recursive:false});await fs.writeFile(path.join(folder,'.v1111-owned'),crypto.randomUUID(),{flag:'wx'})
  for(let i=0;i<files.length;i++){const content=`# 图谱验收主题${String(i).padStart(3,'0')} · 项目长期研究与来源证据核对\n\n[[${path.basename(files[(i+1)%files.length],'.md')}]]\n[[${path.basename(files[(i+7)%files.length],'.md')}]]\n`;await fs.writeFile(files[i],content,{flag:'wx'});report.sourceFiles.push({path:files[i],before:sha(Buffer.from(content))})}
  const configuration=await invoke('get_config');assert.equal(normalize(configuration.activeLibraryPath),normalize(library))
  const native=await invoke('build_link_graph',{libraryRoot:library}),owned=native.nodes.filter(n=>files.some(file=>normalize(file)===normalize(n.path))),selected=native.nodes.find(n=>normalize(n.path)===normalize(files[17]))
  assert.equal(owned.length,180);assert.ok(selected);report.nativeGraph={nodes:native.nodes.length,edges:native.edges.length,ownedFiles:owned.length,selectedNodeId:selected.id}
  await evaluate(`window.__v1111Trace=[];window.__v1111Errors=[];for(const type of ['click','keydown','input','pointerdown','pointermove'])addEventListener(type,e=>window.__v1111Trace.push({type,trusted:e.isTrusted}),true);addEventListener('error',e=>window.__v1111Errors.push(e.message));addEventListener('unhandledrejection',e=>window.__v1111Errors.push(String(e.reason)))`)
  await ui.clickText('.app-navigation a','图谱');await graphReady()
  await ui.click('.graph-filter-trigger,.graph-filter-control summary')
  await ui.waitFor(`!!document.querySelector('.reset-filter')?.getClientRects().length`,'actual filter popover is visible')
  if(await evaluate(`!document.querySelector('.reset-filter').disabled`))await ui.click('.reset-filter')
  await ui.click('.graph-filter-trigger,.graph-filter-control summary');await ui.waitFor(`!document.querySelector('.filter-panel')?.getClientRects().length`,'filter popover closed');await settled();check(0)
  await select();report.selectedNodeId=await evaluate(`document.querySelector('[data-testid="graph-selected-node"]').dataset.nodeId`);assert.equal(report.selectedNodeId,selected.id)
  report.labels=JSON.parse(await evaluate(`document.querySelector('[data-testid="graph-canvas"]').dataset.labelDiagnostics`));assert.ok(report.labels.some(l=>l.id===selected.id));await capture('installed-v1111-search.jpg');check(1)
  const before=await pose();await refresh();report.poses.refresh={before,after:await pose()};assert.equal(await evaluate(`document.querySelector('[data-testid="graph-selected-node"]').dataset.nodeId`),selected.id);check(2)
  const rect=await evaluate(`(()=>{const r=document.querySelector('[data-testid="graph-canvas"]').getBoundingClientRect();return {x:r.x+r.width*.5,y:r.y+r.height*.2}})()`)
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x,y:rect.y});await send('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'middle',buttons:4,clickCount:1})
  for(let i=1;i<=6;i++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x+i*9,y:rect.y+i*5,button:'middle',buttons:4})
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x+54,y:rect.y+30,button:'middle',buttons:0,clickCount:1})
  await ui.waitFor(`document.querySelector('[data-testid="graph-canvas"]').dataset.selectedCount==='1'`,'selection retained during true middle pan');await settled()
  const afterPan=await pose();assert.ok(Math.abs(afterPan.x-before.x)>1||Math.abs(afterPan.y-before.y)>1);await refresh();report.poses.pan={before:afterPan,after:await pose()};check(3)
  await fs.access(path.join(folder,'.v1111-owned'));await renameOffline(library,offline);moved=true
  const failPose=await pose();await ui.click('[data-testid="graph-refresh"]');await ui.waitFor(`!!document.querySelector('[data-testid="graph-refresh-error"]')`,'real unavailable-library failure')
  report.failedGraphNodes=Number((await evaluate(`document.querySelector('.graph-stats').textContent`)).match(/\/\s*(\d+)\s*节点/)[1]);report.poses.failure={before:failPose,after:await pose()};await capture('installed-v1111-retained.jpg');check(4)
  await restoreRoot();await ui.clickText('[data-testid="graph-refresh-error"] button','重试');await graphReady();await settled();report.retriedGraphNodes=Number((await evaluate(`document.querySelector('.graph-stats').textContent`)).match(/\/\s*(\d+)\s*节点/)[1]);report.poses.retry={before:failPose,after:await pose()};check(5)
  const prior=await pose();await ui.clickText('.details-actions button','聚焦直接邻居');await ui.waitFor(`!!document.querySelector('[data-testid="graph-neighbor-focus"]')`,'actual local neighbor view');await refresh();await capture('installed-v1111-local.jpg');await ui.click('[data-testid="graph-neighbor-focus-return"]');await ui.waitFor(`document.querySelector('[data-testid="graph-canvas"]')?.dataset.cameraMotionReason==='return-from-neighbors'`,'actual return camera requested');await settled();report.poses.neighbor={before:prior,after:await pose()};check(6)
  const visibleOptions=`[...document.querySelectorAll('.n-base-select-option__content')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>e.textContent.trim())`
  await ui.click('.graph-layout-select');await ui.waitFor(`${visibleOptions}.length===5`,'five visible layout choices');report.layouts=await evaluate(visibleOptions);await ui.key('Escape','Escape',27);await ui.waitFor(`${visibleOptions}.length===0`,'layout popup closed')
  await ui.click('.graph-theme-select');await ui.waitFor(`${visibleOptions}.length===3`,'three visible canvas theme choices');report.themes=await evaluate(visibleOptions);await ui.key('Escape','Escape',27);await ui.waitFor(`${visibleOptions}.length===0`,'theme popup closed');check(7)
  await ui.clickText('.view-switch button','思维导图');await graphReady();await frame();const mindmapPose=await pose();await refresh();report.poses.mindmap={before:mindmapPose,after:await pose()};await capture('installed-v1111-mindmap.jpg');check(8)
  await ui.clickText('.view-switch button','关系网络');await graphReady();await ui.clickText('.app-navigation a','资料库');await ui.waitFor(`!!document.querySelector('.library-mode')`,'return library before genuine initial failure')
  await renameOffline(library,offline);moved=true;await ui.clickText('.app-navigation a','图谱');await ui.waitFor(`!!document.querySelector('[data-testid="graph-initial-error"]')&&!document.querySelector('.empty-graph-hint')`,'genuine initial failure, not empty-library tutorial');report.initialErrorObserved=true;await capture('installed-v1111-initial-error.jpg');await restoreRoot();await ui.clickText('[data-testid="graph-initial-error"] button','重新读取');await graphReady();report.initialRetryObserved=true;check(9)
  await select();await graphReady();await settled();const target=await evaluate(`(()=>{const c=document.querySelector('[data-testid="graph-canvas"]'),r=c.getBoundingClientRect(),p=JSON.parse(c.dataset.cameraPose),f=JSON.parse(c.dataset.cameraFocusDiagnostics);return {x:r.x+p.x+f.point.x*p.zoom,y:r.y+p.y+f.point.y*p.zoom}})()`)
  report.doubleClickTarget=target;report.doubleClickFocus=JSON.parse(await evaluate(`document.querySelector('[data-testid="graph-canvas"]').dataset.cameraFocusDiagnostics`));assert.equal(report.doubleClickFocus.nodeId,selected.id)
  for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...target,button:'left',clickCount:1})
  report.singleClickStayed=await evaluate(`!!document.querySelector('[data-testid="graph-canvas"]')`)
  report.singleClickNodeId=await evaluate(`document.querySelector('[data-testid="graph-selected-node"]')?.dataset.nodeId`);assert.equal(report.singleClickNodeId,selected.id,'actual single click must select the intended canvas node')
  for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...target,button:'left',clickCount:2})
  const activeTab=`${store}.tabs.find(t=>t.id===${store}.activeTabId)`
  await ui.waitFor(`!!document.querySelector('.library-mode')&&${activeTab}?.path&&(${normalize.toString()})(${activeTab}.path)===${q(normalize(files[17]))}`,'actual managed document open by double-click');report.doubleClickPath=await evaluate(`${activeTab}.path`)
  const markdownInput=visibleMarkdownInput('#vditor-lib')
  await ui.waitFor(`(${markdownInput})?.textContent.includes('图谱验收主题017 · 项目长期研究与来源证据核对')&&!document.querySelector('.workspace-error-state,.crash-fallback')`,'actual target document body is rendered, not just its tab');report.documentContentVisible=true;check(10)
  for(const file of report.sourceFiles)file.after=sha(await fs.readFile(file.path))
  report.inputTrace=await evaluate('window.__v1111Trace');report.runtimeErrors=await evaluate('window.__v1111Errors');report.errorOverlay=await evaluate(`!!document.querySelector('.app-error-overlay,.global-error-overlay,#app-startup-error')`);check(11)
  report.status='passed';validateInstalledGraphExploration(report,{appVersion,sourceCommit,artifacts:[{target:'nsis',sha256:installerSha256}]});await capture('installed-v1111-final.jpg')
 }catch(error){failure=error;report.status='failed';report.error={message:String(error),stack:error.stack};await capture('installed-v1111-failure.jpg').catch(()=>{})}
 finally{try{await restoreRoot()}catch(error){report.status='failed';report.restoreError=String(error);failure??=error}finally{await fs.writeFile(path.join(output,'installed-v1111-workflow.json'),JSON.stringify(report,null,2)+'\n')}}
 if(failure)throw failure
 return report
}
