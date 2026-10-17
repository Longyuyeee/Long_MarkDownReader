import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {assertInstalledReleaseRuntime} from './lib/installed-release-runtime.mjs'
import {test} from 'node:test'
import {tagCollectionChecks,validateInstalledTagCollections} from './lib/installed-v1-1-10-evidence.mjs'
const manifest={appVersion:'1.1.10',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]}
const report=()=>({appVersion:'1.1.10',sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts[0].sha256,harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-webview-input-native-tag-ipc-and-disk',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,checks:tagCollectionChecks.map(id=>({id,status:'passed'})),collectionFiles:244,tagFiles:244,tagCount:244,uniqueFiles:244,refreshRetainedFiles:40,modifiedFirst:'标签笔记243.md',partialOutcomes:['notExecuted','completed','notExecuted'],externalChangedPreserved:true,originalHistoryPreserved:true,dirtyExcluded:true,dirtyPreserved:true,secondaryDirtyBlocked:true,secondaryContentReloaded:true,collectionTagUnchanged:true,explicitSaveAfterChecks:true,denials:['search_collection_page','get_tag_catalog_page','preview_tag_edit','apply_tag_edit','close_tag_edit'].map(command=>({command,rejected:true,error:'只能在主工作台操作'})),inputTrace:['click','keydown','input'].map(type=>({type,trusted:true})),secondaryInputTrace:['click','keydown','input'].map(type=>({type,trusted:true})),sourceFiles:Array.from({length:244},(_,i)=>({path:'C:/generated/'+i+'.md',before:'e'.repeat(64),after:(i===0?'f':i===2?'a':'e').repeat(64)})),dirtyDiskBefore:'e'.repeat(64),dirtyDiskBeforeFinalSave:'e'.repeat(64),explicitSavedSha256:'f'.repeat(64),originalHistory:{path:'C:/generated/1.md',before:'e'.repeat(64),snapshot:'e'.repeat(64)},externalChange:{path:'C:/generated/2.md',expected:'a'.repeat(64),after:'a'.repeat(64)},runtimeErrors:[],errorOverlay:false})
test('current installed evidence requires all 13 real scenarios, fixed bytes, dirty/external preservation and actual trusted input',()=>{
 assert.doesNotThrow(()=>validateInstalledTagCollections(report(),manifest))
 for(const mutate of [r=>r.checks.pop(),r=>r.sourceCommit='x',r=>r.installerSha256='x',r=>r.tagCount=200,r=>r.uniqueFiles=243,r=>r.partialOutcomes.reverse().pop(),r=>r.dirtyPreserved=false,r=>r.secondaryDirtyBlocked=false,r=>r.originalHistoryPreserved=false,r=>r.inputTrace[0].trusted=false,r=>r.runtimeErrors.push('boom'),r=>r.errorOverlay=true,r=>r.nativeBridgeMocked=true,r=>r.denials[1].command='search_collection_page',r=>r.sourceFiles[100].after='0'.repeat(64),r=>r.dirtyDiskBeforeFinalSave='0'.repeat(64),r=>r.originalHistory.snapshot='0'.repeat(64),r=>r.secondaryInputTrace=[]]){const r=report();mutate(r);assert.throws(()=>validateInstalledTagCollections(r,manifest))}
})
test('current installer driver retains actual user input, all historical tasks and no synthetic native bridge',()=>{
 const driver=fs.readFileSync('scripts/lib/installed-v1-1-10-workflow.mjs','utf8')
 for(const token of ['nativeUserInput','fs.rename(folder,offline)','fs.rename(offline,folder)','Input.insertText','list_history','open_external_file_window','preview_tag_edit','apply_tag_edit','explicitSaveAfterChecks'])assert.ok(driver.includes(token),token)
 assert.doesNotMatch(driver,/__TAURI_INTERNALS__\.invoke\s*=|\.dispatchEvent\(|\.setValue\(|isDirty\s*=\s*false/)
})
test('v1.1.10 requires current report plus every historical generation with the same installed bytes and driver',()=>{
 const previous=JSON.parse(fs.readFileSync('docs/evidence/v1.1.9-release/artifact-manifest.json','utf8'))
 const bytes=new Map(),reports={};previous.appVersion=previous.sourceVersion='1.1.10'
 const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex')
 for(const [key,item]of Object.entries(previous.runtimeSmoke.reports))reports[key]=JSON.parse(fs.readFileSync(item.path,'utf8').replaceAll('1.1.9','1.1.10'))
 reports.tagCollections={...report(),sourceCommit:previous.sourceCommit,installerSha256:previous.artifacts.find(item=>item.target==='nsis').sha256,executableSha256:reports.searchCompleteness.executableSha256,harnessSourceCommit:reports.searchCompleteness.harnessSourceCommit}
 const update=()=>{previous.runtimeSmoke.reports=Object.fromEntries(Object.entries(reports).map(([key,value])=>{const file='docs/evidence/v1-1-10-candidate-lifecycle/'+key+'.json',buffer=Buffer.from(JSON.stringify(value));bytes.set(file,buffer);return [key,{path:file,sha256:digest(buffer)}]}))}
 update();assert.doesNotThrow(()=>assertInstalledReleaseRuntime(previous,file=>bytes.get(file)))
 for(const key of ['tagCollections','workSession','searchCompleteness','searchBaseline','searchUser','searchOffice','workflow','experience','fileManagement','foundation','foundationExtended','foundationHardening','moveContinuity','saveHistory']){
  const item=reports[key];delete reports[key];update();assert.throws(()=>assertInstalledReleaseRuntime(previous,file=>bytes.get(file)),key);reports[key]=item
 }
 reports.tagCollections.executableSha256='0'.repeat(64);update();assert.throws(()=>assertInstalledReleaseRuntime(previous,file=>bytes.get(file)))
})
