// Synthetic protocol rejection tests. These do not count as installer acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {test} from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {organizingChecks,validateInstalledOrganizing,assertOrganizingOutputBytes} from './lib/installed-v1-1-19-evidence.mjs'
import {assertInstalledReleaseRuntime} from './lib/installed-release-runtime.mjs'
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),bytes=Buffer.from('synthetic-organizing-output-not-native')
const flags=['canvasUnknownExact','canvasLocatorExact','canvasCancelExact','canvasConflictExact','groupUndoExact','sourceRelinkExact','moveReferenceExact','opmlReopenExact','opmlLocatorExact','opmlCancelExact','opmlConflictExact','lossOriginalBlocked','compatibleCopyExact','copyCollisionExact','shortcutExclusive']
function example(){
 const manifest={appVersion:'1.1.19',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={appVersion:manifest.appVersion,sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts[0].sha256,harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-canvas-opml-and-independent-json-xml',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:organizingChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],uiMessages:[],inputTrace:['click','pointerdown','keydown','input'].map(type=>({type,trusted:true})),unselectedBefore:'e'.repeat(64),unselectedAfter:'e'.repeat(64),outputs:[],inspection:{status:'passed',reader:'stdlib-json-and-defusedxml-0.7.1',nativeBridgeMocked:false,outputs:[]}}
 for(const key of flags)report[key]=true
 const files=new Map();for(const name of ['canvas-saved.canvas','opml-saved.opml','opml-original.opml','opml-copy.opml','unselected.md']){const fileName='installed-v1119-'+name,item={fileName,sizeBytes:bytes.length,sha256:sha(bytes)};files.set(fileName,bytes);report.outputs.push(item);report.inspection.outputs.push({...item})}
 return {manifest,report,files}
}
test('organizing intake requires every task, original preservation and exact raw output identities',()=>{
 const {manifest,report,files}=example();validateInstalledOrganizing(report,manifest);assertOrganizingOutputBytes(report,file=>files.get(file))
 for(const flag of flags){const bad=structuredClone(report);bad[flag]=false;assert.throws(()=>validateInstalledOrganizing(bad,manifest),flag)}
 for(const mutate of [r=>r.checks.pop(),r=>r.checks.reverse(),r=>r.outputs.pop(),r=>r.outputs[0].sha256='0'.repeat(64),r=>r.outputs[1].fileName=r.outputs[0].fileName,r=>r.nativeBridgeMocked=true,r=>r.desktopInputUsed=true,r=>r.sourceUserContentIncluded=true,r=>r.errorOverlay=true,r=>r.runtimeErrors.push('error'),r=>r.inputTrace[0].trusted=false,r=>r.inspection.reader='self-reported',r=>r.inspection.outputs.pop(),r=>r.inspection.nativeBridgeMocked=true,r=>r.installerSha256='0'.repeat(64),r=>r.uiMessages.push('当前文件没有文本写入适配器')]){const bad=structuredClone(report);mutate(bad);assert.throws(()=>validateInstalledOrganizing(bad,manifest))}
 files.set(report.outputs[0].fileName,Buffer.from('substitute'));assert.throws(()=>assertOrganizingOutputBytes(report,file=>files.get(file)))
})
test('all predecessor receipts and organizing bind to the same executable, driver and original bytes',()=>{
 const manifest=JSON.parse(fs.readFileSync('docs/evidence/v1.1.18-release/artifact-manifest.json')),root='docs/evidence/v1-1-19-candidate-lifecycle/',files=new Map(),reports={};manifest.appVersion=manifest.sourceVersion='1.1.19'
 for(const[key,item]of Object.entries(manifest.runtimeSmoke.reports))reports[key]=JSON.parse(fs.readFileSync(item.path,'utf8').replaceAll('1.1.18','1.1.19'))
 for(const name of fs.readdirSync('docs/evidence/v1-1-18-candidate-lifecycle'))if(!name.endsWith('.json'))files.set(root+name,fs.readFileSync('docs/evidence/v1-1-18-candidate-lifecycle/'+name))
 const {report,files:raw}=example();Object.assign(report,{sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts.find(a=>a.target==='nsis').sha256,harnessSourceCommit:reports.searchCompleteness.harnessSourceCommit,executableSha256:reports.searchCompleteness.executableSha256});reports.organizing=report;for(const[name,content]of raw)files.set(root+name,content)
 const update=()=>{for(const[key,value]of Object.entries(reports)){const name=root+key+'.json',raw=Buffer.from(JSON.stringify(value));files.set(name,raw);manifest.runtimeSmoke.reports[key]={path:name,sha256:sha(raw)}}};update();assert.doesNotThrow(()=>assertInstalledReleaseRuntime(manifest,name=>files.get(name)))
 report.harnessSourceCommit='0'.repeat(40);update();assert.throws(()=>assertInstalledReleaseRuntime(manifest,name=>files.get(name)));report.harnessSourceCommit=reports.searchCompleteness.harnessSourceCommit;update();files.set(root+report.outputs[0].fileName,Buffer.from('changed'));assert.throws(()=>assertInstalledReleaseRuntime(manifest,name=>files.get(name)))
})
test('actual native acceptance and independent output readers remain mandatory at all release gates',()=>{
 const driver=fs.readFileSync('scripts/lib/installed-v1-1-19-workflow.mjs','utf8')
 for(const token of ['dispatchEvent(','__TAURI_INTERNALS__=','force:true','force: true'])assert.ok(!driver.includes(token),token)
 for(const token of ['nativeUserInput','inspect-hosted-organizing.py','validateInstalledOrganizing','rename_item','originalExtendedSha256','flag:\'wx\''])assert.ok(driver.includes(token),token)
 for(const file of ['scripts/lib/installed-release-runtime.mjs','scripts/import-community-release-review.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertOrganizingOutputBytes'),file)
 const tree=ts.createSourceFile('driver.mjs',driver,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const walk=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const arg=node.arguments[0];if(arg&&(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg))){assert.doesNotThrow(()=>new vm.Script(arg.text),arg.text);count++}}ts.forEachChild(node,walk)};walk(tree);assert.ok(count>=15)
})
