// New product/input proof. Keep every prior run and historical manifest intact.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {nativeSearchProduct} from './lib/v118-native-search-fixture.mjs'
import {verifyNativeSearchEvidence} from './lib/v118-native-search-evidence.mjs'
import {verifyNativeUserEvidence} from './lib/v118-native-user-evidence.mjs'
import {verifyNativeOfficeEvidence} from './lib/v118-native-office-evidence.mjs'
const root='docs/evidence/v118-native-office'
const [receiptPath,directory]=process.argv.slice(2),target=root+(receiptPath?'/manifest.json':'/manifest-harness.json')
const parse=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''))
assert.match(fs.readFileSync(root+'/harness-final-paths.log','utf8'),/# pass 49\r?\n# fail 0/)
assert.match(fs.readFileSync(root+'/quality-gate-first.log','utf8'),/found 0 vulnerabilities/)
let native={status:'pending',plannedChecks:22,reason:'new frozen footer product and Office real input need a completed successful run'}
if(receiptPath){
  assert.match(fs.readFileSync(root+'/harness-mixed-results-final.log','utf8'),/# pass 49\r?\n# fail 0/)
  assert.match(fs.readFileSync(root+'/harness-route-repair.log','utf8'),/# pass 49\r?\n# fail 0/)
  assert.match(fs.readFileSync(root+'/harness-stability-repair.log','utf8'),/# pass 49\r?\n# fail 0/)
  assert.match(fs.readFileSync(root+'/quality-gate-stability-repair.log','utf8'),/found 0 vulnerabilities/)
  const helper=parse(root+'/helper-stability-final/report.json');assert.equal(helper.checks.length,3);assert.deepEqual(helper.errors,[])
  assert.match(fs.readFileSync(root+'/quality-gate-final.log','utf8'),/found 0 vulnerabilities/)
  const productCi=parse(root+'/footer-product-ci-completed.json')
  assert.equal(productCi.headSha,nativeSearchProduct);assert.equal(productCi.status,'completed');assert.equal(productCi.conclusion,'success')
  for(const file of [receiptPath,directory])assert.ok(path.resolve(file).startsWith(path.resolve(root)+path.sep))
  const run=parse(receiptPath)
  native={status:run.status==='completed'?'failed':'pending',runId:run.databaseId,url:run.url,conclusion:run.conclusion}
  if(run.status==='completed'&&run.conclusion==='success'){
    const baseline=parse(directory+'/native-baseline.json'),disk=parse(directory+'/native-disk.json'),user=parse(directory+'/native-user.json'),office=parse(directory+'/native-office.json'),program=parse(directory+'/program-build-receipt.json')
    const ipc=verifyNativeSearchEvidence(baseline,disk,run),input=verifyNativeUserEvidence(user,baseline,run),locations=verifyNativeOfficeEvidence(office,user,run)
    assert.equal(program.productCommit,nativeSearchProduct);assert.equal(program.sha256,input.executableSha256)
    assert.equal(program.runtimeBaseVersion,'1.1.7');assert.equal(program.isInstaller,false);assert.equal(program.releaseCandidate,false);assert.equal(program.sourceUserContentIncluded,false)
    assert.match(program.buildRunId,/^\d+$/);assert.match(program.harnessCommit,/^[a-f0-9]{40}$/);assert.ok(program.sizeBytes>0)
    if(program.buildRunId!==String(run.databaseId)){
      const original=parse(root+`/native-run-${program.buildRunId}.json`)
      assert.equal(original.status,'completed');assert.equal(original.headSha,program.harnessCommit)
      for(const name of ['Build actual Debug Tauri application with isolated E2E identity','Retain immutable Debug program separately from test outcome'])assert.equal(original.jobs.flatMap(job=>job.steps).find(step=>step.name===name)?.conclusion,'success')
    }else assert.equal(program.harnessCommit,run.headSha)
    native={status:'passed',runId:run.databaseId,url:run.url,ipc,input,locations,programBuildRun:program.buildRunId,sizeBytes:program.sizeBytes}
  }
}
const sources=['.gitattributes','.github/workflows/v118-search-native.yml','scripts/run-v118-native-search.ps1',
  'scripts/capture-v118-native-search.mjs','scripts/capture-v118-native-user.mjs','scripts/lib/v118-native-search-fixture.mjs',
  'scripts/lib/v118-native-search-evidence.mjs','scripts/lib/v118-native-user-input.mjs','scripts/lib/v118-native-user-evidence.mjs',
  'scripts/lib/v118-native-office-fixture.mjs','scripts/lib/v118-native-office-input.mjs','scripts/lib/v118-native-office-evidence.mjs',
  'scripts/test-v118-native-office.mjs','scripts/test-v118-native-user.mjs','scripts/test-v118-native-search-audit.mjs','scripts/test-v118-native-search-evidence.mjs',
  'scripts/test-v118-user-input-browser.mjs',
  'scripts/check-current-development-audit.mjs','scripts/collect-v118-native-office-evidence.mjs',
  'src/components/SearchPageStatus.vue','src/views/LibraryMode.vue','src/components/CommandPalette.vue','src/services/fileNavigation.ts',
  'src/views/DocxReaderView.vue','src/views/PptxReaderView.vue','src/views/WorkbookView.vue',
  'shared/development-version-policy.json','docs/V1_1_8_Native_Office_Audit_2026-10-17.md',
  'docs/V1_1_8_Search_Development_2026-10-17.md','docs/Development_Handoff.md']
for(const name of sources)assert.equal(execFileSync('git',['diff','--name-only','--',name],{encoding:'utf8'}).trim(),'','stage reviewed source first: '+name)
const digest=(name,bytes)=>({path:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})
function walk(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>{
  assert.ok(!entry.isSymbolicLink());const name=folder+'/'+entry.name
  if(name===target)return []
  if(entry.isDirectory())return walk(name)
  assert.match(name,/\.(json|log|png)$/,'no executable or user documents in evidence')
  return [digest(name,fs.readFileSync(name))]
}).sort((a,b)=>a.path.localeCompare(b.path))}
const manifest={schemaVersion:1,stage:'v1.1.8-E2e-native-office',productCommit:nativeSearchProduct,sourceHashBasis:'git-index-bytes',
  publicVersion:'1.1.7',runtimeBaseVersion:'1.1.7',releaseCandidate:false,releasePublished:false,sourceUserContentIncluded:false,
  checks:{harnessContracts:49,localQualityGate:'passed',productionVulnerabilities:0,native},
  limitations:['Debug native input is not installer/upgrade acceptance or OS desktop takeover.','Workbook search locations are sheets, not individual cells.',
    'Inherited installation scenarios, current release report and candidate lifecycle remain required.'],
  sourceFiles:sources.map(name=>digest(name,execFileSync('git',['show',':'+name],{maxBuffer:4*1024*1024}))),evidenceFiles:walk(root)}
fs.writeFileSync(target,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({native,sources:sources.length,evidence:manifest.evidenceFiles.length}))
