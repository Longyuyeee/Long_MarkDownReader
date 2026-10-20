// Schema/driver unit tests, never a substitute for installed Windows acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {test} from 'node:test'
import {graphExplorationChecks,validateInstalledGraphExploration} from './lib/installed-v1-1-11-evidence.mjs'
import {assertInstalledReleaseRuntime} from './lib/installed-release-runtime.mjs'
const example=()=>{
 const sourceFiles=Array.from({length:180},(_,i)=>({path:'C:/LongEditR5ILibrary/graph/'+i+'.md',before:'a'.repeat(64),after:'a'.repeat(64)})),pose={x:5,y:-10,zoom:1.2}
 const manifest={appVersion:'1.1.11',sourceCommit:'b'.repeat(40),artifacts:[{target:'nsis',sha256:'c'.repeat(64)}]}
 return [{appVersion:manifest.appVersion,sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts[0].sha256,harnessSourceCommit:'d'.repeat(40),executableSha256:'e'.repeat(64),status:'passed',evidenceLevel:'installed-webview-input-native-graph-ipc-and-disk',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,checks:graphExplorationChecks.map(id=>({id,status:'passed'})),sourceFiles,nativeGraph:{ownedFiles:180,nodes:540,edges:900,selectedNodeId:'actual'},selectedNodeId:'actual',labels:[{id:'actual',text:'实际选择的长中文图谱节点标题',left:20,right:200,top:20,bottom:43}],poses:Object.fromEntries(['refresh','pan','failure','retry','neighbor','mindmap'].map(key=>[key,{before:{...pose},after:{...pose}}])),failedGraphNodes:540,retriedGraphNodes:540,offlineRootRestored:true,initialErrorObserved:true,initialRetryObserved:true,layouts:['自动网络','树状层级','组织结构','放射聚焦','时间线'],themes:['专业 · 克制网格','多彩 · 语义光域','专注 · 纯净画布'],singleClickStayed:true,doubleClickPath:sourceFiles[17].path,documentContentVisible:true,inputTrace:['click','keydown','input','pointerdown','pointermove'].map(type=>({type,trusted:true})),runtimeErrors:[],errorOverlay:false},manifest]
}
test('current installed graph evidence binds 12 actual workflows, exact bytes, all sources and native user input',()=>{
 assert.doesNotThrow(()=>validateInstalledGraphExploration(...example()))
 for(const mutate of [r=>r.checks.pop(),r=>r.status='running',r=>r.nativeBridgeMocked=true,r=>r.sourceFiles.pop(),r=>r.sourceFiles[17].after='0'.repeat(64),r=>r.selectedNodeId='stale',r=>r.labels.push({...r.labels[0],id:'overlap'}),r=>r.poses.refresh.after.x++,r=>r.offlineRootRestored=false,r=>r.nativeGraph.ownedFiles=179,r=>r.inputTrace[0].trusted=false,r=>r.inputTrace=[],r=>r.layouts.pop(),r=>r.runtimeErrors.push('real failure'),r=>r.doubleClickPath=r.sourceFiles[18].path,r=>r.installerSha256='f'.repeat(64),r=>r.sourceCommit='0'.repeat(40)]){
  const [r,m]=example();mutate(r);assert.throws(()=>validateInstalledGraphExploration(r,m))
 }
 const [windowsReport,windowsManifest]=example();windowsReport.doubleClickPath='\\\\?\\'+windowsReport.sourceFiles[17].path.replaceAll('/','\\');assert.doesNotThrow(()=>validateInstalledGraphExploration(windowsReport,windowsManifest))
 const [notRendered,notRenderedManifest]=example();notRendered.documentContentVisible=false;assert.throws(()=>validateInstalledGraphExploration(notRendered,notRenderedManifest))
})
test('installed driver keeps the real bridge, trusted input, strict isolated root and byte comparisons',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-11-workflow.mjs','utf8')
 for(const token of ['RUNNER_ENVIRONMENT','github-hosted','LONGEDIT_R5I_DISPOSABLE',"assert.ok(['1.1.11','1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25'].includes(appVersion))",'nativeUserInput','Input.dispatchMouseEvent','build_link_graph','fs.readFile','renameOwnedOfflineFixture','validateInstalledGraphExploration','await restoreRoot()'])assert.ok(source.includes(token),token)
 for(const forbidden of ['dispatchEvent(', '__TAURI_INTERNALS__=', '__TAURI_INTERNALS__ =', 'force:true','force: true','isDirty=false','isDirty = false'])assert.ok(!source.includes(forbidden),forbidden)
})

test('governance loading repair has real-component early-click proof and preserves the native topic assertion',()=>{
 const proof=JSON.parse(fs.readFileSync('docs/evidence/v1111-health-handoff-final-guarded/results.json','utf8'))
 assert.equal(proof.checks.length,4);assert.deepEqual(proof.errors,[]);assert.ok(proof.checks[0].includes('during initial load'))
 const graph=fs.readFileSync('src/components/GraphView.vue','utf8')
 for(const token of ['pendingHealthFocus','pendingHealthFocus?.libraryRoot === root','queuedFocus.nodeId','current() && selectedNode.value?.id === queuedNode.id','pendingHealthFocus = null'])assert.ok(graph.includes(token),token)
 const driver=fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs','utf8'),part=driver.slice(driver.indexOf('const selectedTopic = knowledgePulse.topics[0]'),driver.indexOf("await capture('installed-knowledge-topic-centered.jpg')"))
 assert.ok(part.includes("nativeUserInput({send,evaluate}).click"));assert.ok(part.includes('selectedTopic.nodeId'));assert.ok(part.includes('selectedTopic.title'));assert.ok(!part.includes('layoutSettled'),'do not wait away an early click to hide the product race')
})

test('real router omitted visibility defaults to true without removing explicit hidden-response isolation',()=>{
 const proof=JSON.parse(fs.readFileSync('docs/evidence/v1111-route-props-final/results.json','utf8'))
 assert.equal(proof.checks.length,5);assert.deepEqual(proof.errors,[])
 const graph=fs.readFileSync('src/components/GraphView.vue','utf8'),fixture=fs.readFileSync('scripts/fixtures/v1111-graph-browser.mjs','utf8')
 assert.ok(graph.includes('withDefaults(defineProps<{ show?: boolean }>(), { show: true })'))
 assert.ok(graph.includes('graphLoopMounted && props.show !== false'))
 assert.ok(fixture.includes("params.has('omittedShow')?h(RouterView)"),'the real RouterView, not an always-true wrapper, must cover omitted props')
})

test('v1.1.11 manifest requires graph evidence and every inherited report with the same executable and driver',()=>{
 // In-memory schema mutation only; original public evidence is never edited.
 const manifest=JSON.parse(fs.readFileSync('docs/evidence/v1.1.10-release/artifact-manifest.json','utf8'))
 manifest.appVersion=manifest.sourceVersion='1.1.11'
 const bytes=new Map(),reports={}
 for(const [key,item]of Object.entries(manifest.runtimeSmoke.reports))reports[key]=JSON.parse(fs.readFileSync(item.path,'utf8').replaceAll('1.1.10','1.1.11'))
 reports.graphExploration={...example()[0],sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts.find(a=>a.target==='nsis').sha256,executableSha256:reports.searchCompleteness.executableSha256,harnessSourceCommit:reports.searchCompleteness.harnessSourceCommit}
 const update=()=>{manifest.runtimeSmoke.reports=Object.fromEntries(Object.entries(reports).map(([key,value])=>{const file='docs/evidence/v1-1-11-candidate-lifecycle/'+key+'.json',buffer=Buffer.from(JSON.stringify(value));bytes.set(file,buffer);return[key,{path:file,sha256:crypto.createHash('sha256').update(buffer).digest('hex')}]}))}
 update();assert.doesNotThrow(()=>assertInstalledReleaseRuntime(manifest,file=>bytes.get(file)))
 for(const key of Object.keys(reports)){
  const value=reports[key];delete reports[key];update();assert.throws(()=>assertInstalledReleaseRuntime(manifest,file=>bytes.get(file)),key);reports[key]=value
 }
 for(const field of ['executableSha256','harnessSourceCommit']){
  const original=reports.graphExploration[field];reports.graphExploration[field]='0'.repeat(original.length);update();assert.throws(()=>assertInstalledReleaseRuntime(manifest,file=>bytes.get(file)),field);reports.graphExploration[field]=original
 }
})
