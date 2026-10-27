// Generated in-memory verifier inputs, not installed acceptance evidence.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {test} from 'node:test'
import {parse} from 'yaml'
import vm from 'node:vm'
import {installedSessionBootProbe,installedSessionBridgeProbe} from './lib/installed-session-boot.mjs'
import {workSessionChecks,validateInstalledWorkSession} from './lib/installed-v1-1-9-evidence.mjs'
import {assertInstalledReleaseRuntime} from './lib/installed-release-runtime.mjs'
import {assertV121DevelopmentBoundary,assertV121UpdaterStatus} from './lib/v121-updater-status.mjs'
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),json=file=>JSON.parse(fs.readFileSync(file,'utf8'))
test('reload probe waits through absent app/Pinia/reader, without hiding real script exceptions',()=>{
 const expression=installedSessionBootProbe(100)
 for(const app of [null,{}, {__vue_app__:{}},{__vue_app__:{config:{globalProperties:{$pinia:{_s:new Map()}}}}}])assert.equal(vm.runInNewContext(expression,{performance:{timeOrigin:200},document:{querySelector:()=>app}}),false)
 const app={__vue_app__:{config:{globalProperties:{$pinia:{_s:new Map([['app',{configReady:true}]])}}}}}
 const ready=(origin,reader)=>vm.runInNewContext(expression,{performance:{timeOrigin:origin},document:{querySelector:selector=>selector==='#app'?app:reader}})
 assert.equal(ready(100,{}),false);assert.equal(ready(200,null),false);assert.equal(ready(200,{}),true)
 assert.throws(()=>installedSessionBootProbe(NaN));assert.throws(()=>vm.runInNewContext(expression,{performance:{timeOrigin:200},document:{querySelector:()=>{throw Error('real script error')}}}),/real script error/)
})
test('secondary permission checks must wait for an actual callable bridge',()=>{
 for(const window of [{},{__TAURI_INTERNALS__:{}},{__TAURI_INTERNALS__:{invoke:'not a function'}}])assert.equal(vm.runInNewContext(installedSessionBridgeProbe(),{window}),false)
 assert.equal(vm.runInNewContext(installedSessionBridgeProbe(),{window:{__TAURI_INTERNALS__:{invoke(){}}}}),true)
})
function scene(){return {appVersion:'1.1.9',sourceCommit:'a'.repeat(40),harnessSourceCommit:'b'.repeat(40),executableSha256:'c'.repeat(64),installerSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-webview-input-native-picker-and-disk',sourceUserContentIncluded:false,nativeBridgeMocked:false,desktopInputUsed:false,nativePickerScope:'disposable-github-hosted-owned-process',checks:workSessionChecks.map(id=>({id,status:'passed'})),inputTrace:['click','keydown','input'].map(type=>({type,trusted:true})),nativePickers:Array.from({length:5},()=>({status:'selected-real-native-dialog',processId:42,selectedPath:'C:/owned/a.json',title:'选择工作现场文件',method:'Windows-UIAutomation-ValuePattern-and-InvokePattern'})),positions:{count:40,first:340,last:457,afterReload:457},draftSha256:'e'.repeat(64),draftChecks:Array.from({length:2},()=>({dirty:true,exactModel:true,sha256:'e'.repeat(64)})),quickDenials:['read_work_session_bundle','export_work_session_bundle','preflight_work_session','locate_work_session_file'].map(command=>({command,rejected:true,error:'只能在主工作台管理工作现场'})),sourceFiles:Array.from({length:42},(_,n)=>({path:`C:/owned/${n}.txt`,before:'f'.repeat(64),after:'f'.repeat(64)})),beforeExplicitSave:Array.from({length:42},(_,n)=>({path:`C:/owned/${n}.txt`,sha256:'f'.repeat(64)})),explicitSave:{path:'C:/owned/0.txt',after:'f'.repeat(64),afterAllDraftChecks:true},runtimeErrors:[],errorOverlay:false}}
const manifestFor=report=>({appVersion:report.appVersion,sourceCommit:report.sourceCommit,artifacts:[{target:'nsis',sha256:report.installerSha256}]})
const originalScene=scene
function completedScene(){const r=originalScene();r.quickBridgeReady=true;r.processRestart={status:'passed',executableSha256:r.executableSha256,nativeVersion:r.appVersion,sceneFiles:41,first:340,last:457};return r}
test('installed scene verifier requires real picker/input, forty consumed positions, unchanged pre-save sources and exact draft identity',()=>{
 const good=completedScene();assert.doesNotThrow(()=>validateInstalledWorkSession(good,manifestFor(good)))
 const notNative=completedScene();notNative.quickDenials[0].error="TypeError: Cannot read properties of undefined (reading 'invoke')";assert.throws(()=>validateInstalledWorkSession(notNative,manifestFor(notNative)))
 const notReady=completedScene();notReady.quickBridgeReady=false;assert.throws(()=>validateInstalledWorkSession(notReady,manifestFor(notReady)))
 const native=completedScene();for(const item of native.nativePickers)Object.assign(item,{method:'Windows-Win32-filename-character-input-and-OK-notification',inputCharacters:item.selectedPath.length,dialogProcessId:42,fileNameAutomationId:'1001'});assert.doesNotThrow(()=>validateInstalledWorkSession(native,manifestFor(native)));native.nativePickers[0].inputCharacters=0;assert.throws(()=>validateInstalledWorkSession(native,manifestFor(native)))
 const mocked=completedScene();mocked.nativePickers[0].method='mock-dialog';assert.throws(()=>validateInstalledWorkSession(mocked,manifestFor(mocked)))
 for(const mutate of [r=>r.checks.pop(),r=>r.installerSha256='0'.repeat(64),r=>r.appVersion='1.1.8',r=>r.harnessSourceCommit='',r=>r.nativeBridgeMocked=true,r=>r.inputTrace[0].trusted=false,r=>r.nativePickers.pop(),r=>r.nativePickers[0].processId=0,r=>r.positions.last=0,r=>r.positions.count=24,r=>r.beforeExplicitSave[0].sha256='0'.repeat(64),r=>r.sourceFiles[1].after='0'.repeat(64),r=>r.explicitSave.afterAllDraftChecks=false,r=>r.draftChecks[0].exactModel=false,r=>r.quickDenials[0].rejected=false,r=>r.runtimeErrors.push('error'),r=>delete r.processRestart,r=>r.processRestart.executableSha256='0'.repeat(64)]){const bad=completedScene(),manifest=manifestFor(bad);mutate(bad);assert.throws(()=>validateInstalledWorkSession(bad,manifest))}
})
function inherited(){
 const manifest=json('docs/evidence/v1.1.8-release/artifact-manifest.json'),bytes=new Map(),records={};manifest.appVersion=manifest.sourceVersion='1.1.9'
 const nsis=manifest.artifacts.find(item=>item.target==='nsis').sha256
 for(const [name,item]of Object.entries(manifest.runtimeSmoke.reports)){
  const report=json(item.path);if(report.appVersion)report.appVersion='1.1.9';if(report.runtimeBaseVersion)report.runtimeBaseVersion='1.1.9'
  if(report.observations)for(const key of Object.keys(report.observations))if(typeof report.observations[key]==='string')report.observations[key]=report.observations[key].replaceAll('1.1.8','1.1.9')
  records[name]={file:item.path.split('/').pop(),report}
 }
 const report={...completedScene(),sourceCommit:manifest.sourceCommit,installerSha256:nsis,executableSha256:records.searchCompleteness.report.executableSha256,harnessSourceCommit:records.searchCompleteness.report.harnessSourceCommit}
 report.processRestart.executableSha256=report.executableSha256
 records.workSession={file:'installed-v119-workflow.json',report}
 const update=()=>manifest.runtimeSmoke.reports=Object.fromEntries(Object.entries(records).map(([name,{file,report}])=>{const path='docs/evidence/v1-1-9-candidate-lifecycle/'+file,buffer=Buffer.from(JSON.stringify(report));bytes.set(path,buffer);return [name,{path,sha256:hash(buffer)}]}))
 update();return {manifest,records,update,read:file=>bytes.get(file)}
}
test('v119 inherits all exact-installer historical reports and refuses any missing generation or mismatched hash',()=>{
 const good=inherited();assert.doesNotThrow(()=>assertInstalledReleaseRuntime(good.manifest,good.read))
 for(const name of ['workSession','workflow','experience','fileManagement','foundation','foundationExtended','foundationHardening','moveContinuity','saveHistory','searchCompleteness','searchBaseline','searchUser','searchOffice']){const f=inherited();delete f.records[name];f.update();assert.throws(()=>assertInstalledReleaseRuntime(f.manifest,f.read),name)}
 const f=inherited();f.records.workSession.report.sourceCommit='0'.repeat(40);f.update();assert.throws(()=>assertInstalledReleaseRuntime(f.manifest,f.read))
 const different=inherited();different.records.workSession.report.executableSha256='0'.repeat(64);different.records.workSession.report.processRestart.executableSha256='0'.repeat(64);different.update();assert.throws(()=>assertInstalledReleaseRuntime(different.manifest,different.read),/same installed executable/)
})
test('v119 orchestration keeps every old workflow, exact driver publication guard and disposable-only real native picker',()=>{
 const smoke=fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs','utf8');for(let n=0;n<=9;n++){assert.match(smoke,new RegExp('runInstalledV11'+n+'Workflow'));if(n<8)assert.ok(fs.readFileSync(`scripts/lib/installed-v1-1-${n}-workflow.mjs`,'utf8').includes("'1.1.9'"))}
 const current=JSON.parse(fs.readFileSync('package.json','utf8')).version,previous=(current === '1.3.0' ? '1.2.45' : current === '1.2.0' ? '1.1.37' : current.split('.').slice(0,2).join('.')+'.'+(Number(current.split('.')[2])-1))
 for(const file of ['v1-1-0-candidate-lifecycle.yml','v1-1-0-installer-review.yml']){const w=parse(fs.readFileSync('.github/workflows/'+file,'utf8'));assert.equal(w.on.workflow_dispatch.inputs.current_version.default,current);assert.equal(w.on.workflow_dispatch.inputs.previous_version.default,previous)}
 const publisher=fs.readFileSync('.github/workflows/community-release-publish.yml','utf8');assert.match(publisher,/validateInstalledWorkSession/);assert.ok(publisher.includes('$sceneReview.harnessSourceCommit -ne $review.head_sha'))
 const picker=fs.readFileSync('scripts/select-hosted-session-file.ps1','utf8');for(const token of ['github-hosted','LONGEDIT_R5I_DISPOSABLE','.v119-installed-owner','GetWindowThreadProcessId','OwnerPid','Where-Object Title -eq $Title','FromHandle','ValuePattern','InvokePattern','PostMessage'])assert.ok(picker.includes(token))
 assert.match(picker,/ReadControlText\(new IntPtr\(handle\),13/,'cross-process edit readback must use WM_GETTEXT, never GetWindowText captions')
 assert.ok(picker.includes('$actual -ne $resolvedFile'),'the full generated path still must roundtrip through the native control')
})

test('historical file operations explicitly leave preserved search through native input, retaining real tree and disk assertions',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-2-workflow.mjs','utf8')
 assert.ok(source.includes("await ui.fill(navigationInput, '')"))
 assert.ok(source.indexOf("await ui.fill(navigationInput, '')")<source.indexOf("'new file in native tree'"))
 assert.ok(source.includes("'context-duplicate-writes-real-copy-and-preserves-source'"))
 assert.ok(source.includes("await fs.readFile(duplicate, 'utf8') === content"))
 assert.ok(!source.includes('searchQuery.value ='))
})
test('v119 candidate and publication retain precise predecessor and independent updater observation',()=>{
 const development={runtimeBaseVersion:'1.1.9',publicVersion:'1.1.8',publicTag:'v1.1.8',publicTagCommit:'60476b3e0663fca4f933271dfe56446ec33ffec9',developmentTargetVersion:'1.1.9'},community={appVersion:'1.1.9',targetRelease:{tag:'v1.1.9'},gates:{githubReleasePublished:false},release:null,patchValidation:{previousPublicVersion:'1.1.8',managedUpdaterUpgradePath:'1.1.8-to-1.1.9-pending'}}
 assert.doesNotThrow(()=>assertV121DevelopmentBoundary(development,community));assert.throws(()=>assertV121DevelopmentBoundary({...development,publicTagCommit:'0'.repeat(40)},community))
 const released={...development,publicVersion:'1.1.9',publicTag:'v1.1.9',publicTagCommit:'a'.repeat(40),developmentTargetVersion:'1.1.10'};assert.doesNotThrow(()=>assertV121DevelopmentBoundary(released,{...community,gates:{githubReleasePublished:true},release:{taggedCommit:released.publicTagCommit}}))
 assert.doesNotThrow(()=>assertV121UpdaterStatus({status:'hosted-managed-update-passed'},community,{managedUpdaterObservation:'1.0.20-to-1.0.21-passed'}));assert.throws(()=>assertV121UpdaterStatus({status:'hosted-managed-update-passed'},{...community,patchValidation:{...community.patchValidation,previousPublicVersion:'1.1.7'}},{managedUpdaterObservation:'1.0.20-to-1.0.21-passed'}))
})
