// Synthetic protocol checks; these are not native installation evidence.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {test} from 'node:test'
import {workbookEditingChecks,validateInstalledWorkbookEditing} from './lib/installed-v1-1-16-evidence.mjs'
import {assertInstalledReleaseRuntime} from './lib/installed-release-runtime.mjs'
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),nativeBytes=Buffer.from('synthetic-xlsx-not-a-real-installed-file'),producerBytes=Buffer.from('synthetic-producer-not-a-real-workbook')
function example(){
 const manifest={appVersion:'1.1.16',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]}
 const report={appVersion:'1.1.16',sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts[0].sha256,harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-workbook-real-clipboard-native-save-and-independent-producer',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:workbookEditingChecks.map(id=>({id,status:'passed'})),navigationOrder:['00007','00124','9007199254740993123','9007199254740993124'],unselectedBefore:'e'.repeat(64),unselectedAfter:'e'.repeat(64),runtimeErrors:[],inputTrace:['paste','click','pointerdown'].map(type=>({type,trusted:true})),workbookInspection:{status:'passed',nativeBridgeMocked:false,reader:'openpyxl-3.1.5-hash-pinned',sha256:sha(nativeBytes),cells:{A2:'会议\r\n备注',A3:'不要修改',C2:'00124',C3:'9007199254740993124',C4:'9007199254740993123',A5:'=保留文本',A6:'=保留文本',D4:'0.3',D6:'=D3+D4'},types:{C2:'s',C3:'s',C4:'s',A5:'s',A6:'s',D4:'n',D6:'f'},preservedParts:['xl/worksheets/sheet2.xml','docProps/core.xml','docProps/app.xml','xl/_rels/workbook.xml.rels','[Content_Types].xml'].map(part=>({part,sha256:'f'.repeat(64)})),producerReopen:{status:'passed',sha256:sha(producerBytes),formulaCalculated:false,officeVisualAcceptance:false}}}
 for(const key of ['pasteUndoExact','literalTextExact','formulaTranslationExact','decimalFillExact','filteredCopyExact','nativeReopenExact','producerAppReopenExact'])report[key]=true
 report.sourceBefore=sha(nativeBytes);report.workbookInspection.beforeSha256=report.sourceBefore
 report.cutFormulaExact=true
 return [report,manifest]
}
test('workbook evidence rejects partial checks, precision/type/reference loss, changed bytes and scripted input',()=>{
 assert.doesNotThrow(()=>validateInstalledWorkbookEditing(...example()))
 for(const change of [r=>r.checks.pop(),r=>r.nativeBridgeMocked=true,r=>r.literalTextExact=false,r=>r.nativeReopenExact=false,r=>r.navigationOrder.reverse(),r=>r.workbookInspection.cells.C2='124',r=>r.workbookInspection.types.A6='f',r=>r.workbookInspection.cells.D6='=D2+D3',r=>r.workbookInspection.cells.D4='0.30000000000000004',r=>r.workbookInspection.cells.A2='会议备注',r=>r.workbookInspection.preservedParts.pop(),r=>r.workbookInspection.producerReopen.status='pending',r=>r.workbookInspection.producerReopen.officeVisualAcceptance=true,r=>r.unselectedAfter='f'.repeat(64),r=>r.inputTrace[0].trusted=false,r=>r.runtimeErrors.push('error')]){const[r,m]=example();change(r);assert.throws(()=>validateInstalledWorkbookEditing(r,m))}
})
test('v1.1.16 retains all predecessor reports and requires same package, executable, driver and original workbook bytes',()=>{
 const manifest=JSON.parse(fs.readFileSync('docs/evidence/v1.1.15-release/artifact-manifest.json','utf8'));manifest.appVersion=manifest.sourceVersion='1.1.16'
 const bytes=new Map(),root='docs/evidence/v1-1-16-candidate-lifecycle/',reports={}
 for(const[key,item]of Object.entries(manifest.runtimeSmoke.reports)){const report=JSON.parse(fs.readFileSync(item.path,'utf8').replaceAll('1.1.15','1.1.16'));reports[key]=report}
 const workbook=example()[0];Object.assign(workbook,{sourceCommit:manifest.sourceCommit,installerSha256:manifest.artifacts.find(a=>a.target==='nsis').sha256,executableSha256:reports.searchCompleteness.executableSha256,harnessSourceCommit:reports.searchCompleteness.harnessSourceCommit});reports.workbookEditing=workbook
 const update=()=>{for(const[key,report]of Object.entries(reports)){const file=root+key+'.json',value=Buffer.from(JSON.stringify(report));bytes.set(file,value);manifest.runtimeSmoke.reports[key]={path:file,sha256:sha(value)}}}
 for(const file of ['installed-v1115-saved.csv','installed-v1115-export.xlsx'])bytes.set(root+file,fs.readFileSync('docs/evidence/v1-1-15-candidate-lifecycle/'+file))
 bytes.set(root+'installed-v1116-saved.xlsx',nativeBytes);bytes.set(root+'installed-v1116-before.xlsx',nativeBytes);bytes.set(root+'installed-v1116-producer.xlsx',producerBytes);update()
 assert.doesNotThrow(()=>assertInstalledReleaseRuntime(manifest,file=>bytes.get(file)))
 workbook.executableSha256='f'.repeat(64);update();assert.throws(()=>assertInstalledReleaseRuntime(manifest,file=>bytes.get(file)));workbook.executableSha256=reports.searchCompleteness.executableSha256;update()
 bytes.set(root+'installed-v1116-producer.xlsx',Buffer.from('changed'));assert.throws(()=>assertInstalledReleaseRuntime(manifest,file=>bytes.get(file)))
})
test('driver uses real input/native disk and a hash-pinned owned producer without bridge or handler replacement',()=>{
 const driver=fs.readFileSync('scripts/lib/installed-v1-1-16-workflow.mjs','utf8')
 for(const token of ['dispatchEvent(','__TAURI_INTERNALS__=','force:true','force: true'])assert.ok(!driver.includes(token),token)
 for(const token of ['nativeUserInput','set-hosted-writing-clipboard.ps1','inspect-hosted-workbook-delivery.py','validateInstalledWorkbookEditing','Input.dispatchMouseEvent','installed-v1116-saved.xlsx'])assert.ok(driver.includes(token),token)
 assert.ok(!driver.includes('[title='))
 for(const file of ['scripts/setup-hosted-xlsx-producer.ps1','scripts/inspect-hosted-workbook-delivery.py'])for(const token of ['GITHUB_ACTIONS','RUNNER_ENVIRONMENT','LONGEDIT_R5I_DISPOSABLE'])assert.ok(fs.readFileSync(file,'utf8').includes(token),file+token)
 for(const file of ['.github/workflows/v1-1-0-candidate-lifecycle.yml','.github/workflows/v1-1-0-installer-review.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('setup-hosted-xlsx-producer.ps1'))
})
