// Generated inventory of reviewed staged source and captured owned test output.
import fs from 'node:fs'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { nativeSearchProduct } from './lib/v118-native-search-fixture.mjs'
import { verifyNativeSearchEvidence } from './lib/v118-native-search-evidence.mjs'
const root='docs/evidence/v118-native-ipc',target=root+'/manifest.json'
const sources=['.gitattributes','.github/workflows/v118-search-native.yml','.github/workflows/quality-gate.yml','shared/development-version-policy.json',
  'scripts/capture-v118-native-search.mjs','scripts/run-v118-native-search.ps1','scripts/lib/v118-native-search-fixture.mjs','scripts/lib/v118-webview-test-policy.ps1',
  'scripts/lib/v118-native-search-evidence.mjs','scripts/test-v118-native-search-audit.mjs','scripts/test-v118-native-search-evidence.mjs',
  'scripts/lib/search-feedback-contract.mjs','scripts/test-search-feedback-contract.mjs','scripts/test-search-feedback-browser.mjs',
  'scripts/lib/installed-search-user-scenario.mjs','scripts/lib/installed-v1-1-5-workflow.mjs','scripts/check-current-development-audit.mjs',
  'scripts/collect-v118-native-ipc-evidence.mjs','docs/V1_1_8_Native_IPC_Audit_2026-10-17.md','docs/V1_1_8_Search_Development_2026-10-17.md','docs/Development_Handoff.md',
  'src-tauri/src/commands/index_search_pages.rs','src-tauri/src/commands/index_search_libraries.rs','src-tauri/src/commands/index_search_pages_tests.rs','docs/V1_1_8_Search_Watcher_Fix_2026-10-17.md']
const digest=(path,bytes)=>({path,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})
function walk(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  assert.ok(!entry.isSymbolicLink());const name=directory+'/'+entry.name
  if(name===target)return []
  if(entry.isDirectory())return walk(name)
  assert.ok(/\.(log|json|png)$/.test(name),'unexpected evidence extension: '+name)
  return [digest(name,fs.readFileSync(name))]
}).sort((a,b)=>a.path.localeCompare(b.path))}
const read=name=>fs.readFileSync(root+'/'+name,'utf8')
assert.match(read('harness-contracts-ready-surface-final.log'),/# pass 57\r?\n# fail 0/)
assert.match(read('quality-gate-watcher-final.log'),/found 0 vulnerabilities/)
assert.match(read('native-functional-watcher-final.log'),/971 passed; 0 failed; 5 ignored/)
const page=JSON.parse(read('feedback-browser-second/report.json'));assert.equal(page.checks.length,3);assert.deepEqual(page.errors,[])
const nativeReceiptPath=process.argv[2],nativeDirectory=process.argv[3]
let native={status:'pending',reason:'No completed native run receipt supplied; do not infer success from scripted checks.'}
if(nativeReceiptPath){
  assert.ok(nativeReceiptPath.startsWith(root+'/')&&nativeDirectory?.startsWith(root+'/'))
  const run=JSON.parse(fs.readFileSync(nativeReceiptPath,'utf8'))
  if(run.status==='completed'&&run.conclusion==='success')native={status:'passed',...verifyNativeSearchEvidence(JSON.parse(fs.readFileSync(nativeDirectory+'/native-baseline.json','utf8')),JSON.parse(fs.readFileSync(nativeDirectory+'/native-disk.json','utf8')),run),runId:run.databaseId,url:run.url}
  else native={status:run.status==='completed'?'failed':'pending',runId:run.databaseId,url:run.url,conclusion:run.conclusion}
}
for(const source of sources)assert.ok(!execFileSync('git',['diff','--name-only','--',source],{encoding:'utf8'}).trim(),'stage reviewed source first: '+source)
const manifest={schemaVersion:1,stage:'v1.1.8-E1',productCommit:nativeSearchProduct,runtimeBaseVersion:'1.1.7',publicVersion:'1.1.7',releaseCandidate:false,releasePublished:false,sourceUserContentIncluded:false,sourceHashBasis:'git-index-bytes',
  checks:{localHarnessContracts:57,localFunctionalRust:971,existingIgnoredRust:5,actualVueSimulatedIpcFlows:3,actualVuePageErrors:0,localQualityGate:'passed',productionVulnerabilities:0,native},
  limitations:['Debug real IPC is not installer or real-user-input acceptance.','No local desktop takeover or installation.','Native timings are a fixed generated fixture sample, not a comparative speed claim.','All earlier failed native runs retain their original product identity; they do not prove the watcher fix.'],
  sourceFiles:sources.map(name=>digest(name,execFileSync('git',['show',':'+name],{maxBuffer:4*1024*1024}))),evidenceFiles:walk(root)}
fs.writeFileSync(target,JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify({native,sources:manifest.sourceFiles.length,evidenceFiles:manifest.evidenceFiles.length}))
