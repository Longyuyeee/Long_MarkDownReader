// Separate immutable E2c inventory; never overwrite E2a/E2b manifests.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {nativeSearchProduct} from './lib/v118-native-search-fixture.mjs'
import {verifyNativeSearchEvidence} from './lib/v118-native-search-evidence.mjs'
import {verifyNativeUserEvidence} from './lib/v118-native-user-evidence.mjs'
const root='docs/evidence/v118-native-user',target=root+'/manifest.json'
const sources=['.gitattributes','.github/workflows/v118-search-native.yml','scripts/run-v118-native-search.ps1',
  'scripts/capture-v118-native-search.mjs','scripts/capture-v118-native-user.mjs','scripts/lib/v118-native-search-fixture.mjs',
  'scripts/lib/v118-native-search-evidence.mjs','scripts/lib/v118-native-user-input.mjs','scripts/lib/v118-native-user-evidence.mjs',
  'scripts/test-v118-native-user.mjs','scripts/test-v118-native-search-audit.mjs','scripts/test-v118-native-search-evidence.mjs',
  'scripts/check-current-development-audit.mjs','scripts/collect-v118-native-user-evidence.mjs',
  'src/services/searchPages.ts','src/components/SearchPageStatus.vue','src/components/SearchFileCard.vue',
  'src/views/LibraryMode.vue','src/components/CommandPalette.vue','src/views/PdfView.vue',
  'shared/development-version-policy.json','docs/V1_1_8_Native_User_Audit_2026-10-17.md',
  'docs/V1_1_8_Search_Development_2026-10-17.md','docs/Development_Handoff.md']
const read=name=>fs.readFileSync(root+'/'+name,'utf8').replace(/^\uFEFF/,'')
assert.match(read('harness-contracts-audited.log'),/# pass 63\r?\n# fail 0/)
assert.match(read('quality-gate-first.log'),/found 0 vulnerabilities/)
const [receiptPath,directory]=process.argv.slice(2)
let native={status:'pending',reason:'newly fixed frontend needs its own completed real input run, not old EXE evidence'}
if(receiptPath){
  for(const file of [receiptPath,directory])assert.ok(path.resolve(file).startsWith(path.resolve(root)+path.sep),'owned evidence paths required')
  const run=JSON.parse(fs.readFileSync(receiptPath,'utf8').replace(/^\uFEFF/,''))
  native={status:run.status==='completed'?'failed':'pending',runId:run.databaseId,url:run.url,conclusion:run.conclusion}
  if(run.status==='completed'&&run.conclusion==='success'){
    const parse=name=>JSON.parse(fs.readFileSync(directory+'/'+name,'utf8').replace(/^\uFEFF/,''))
    const baseline=parse('native-baseline.json'),disk=parse('native-disk.json'),user=parse('native-user.json'),program=parse('program-build-receipt.json')
    const ipc=verifyNativeSearchEvidence(baseline,disk,run),input=verifyNativeUserEvidence(user,baseline,run)
    assert.equal(program.productCommit,nativeSearchProduct);assert.equal(program.sha256,input.executableSha256)
    assert.equal(program.runtimeBaseVersion,'1.1.7');assert.equal(program.isInstaller,false);assert.equal(program.releaseCandidate,false);assert.equal(program.sourceUserContentIncluded,false)
    assert.match(program.buildRunId,/^\d+$/);assert.match(program.harnessCommit,/^[a-f0-9]{40}$/);assert.ok(program.sizeBytes>0)
    native={status:'passed',runId:run.databaseId,url:run.url,ipc,input,programBuildRun:program.buildRunId,sizeBytes:program.sizeBytes}
  }
}
const digest=(name,bytes)=>({path:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})
function walk(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>{
  assert.ok(!entry.isSymbolicLink());const name=folder+'/'+entry.name
  if(name===target)return []
  if(entry.isDirectory())return walk(name)
  assert.match(name,/\.(log|json|png)$/,'no program or user documents in evidence')
  return [digest(name,fs.readFileSync(name))]
}).sort((a,b)=>a.path.localeCompare(b.path))}
for(const name of sources)assert.ok(!execFileSync('git',['diff','--name-only','--',name],{encoding:'utf8'}).trim(),'stage reviewed source first: '+name)
const manifest={schemaVersion:1,stage:'v1.1.8-E2c-native-user',productCommit:nativeSearchProduct,runtimeBaseVersion:'1.1.7',publicVersion:'1.1.7',
  releaseCandidate:false,releasePublished:false,sourceUserContentIncluded:false,sourceHashBasis:'git-index-bytes',
  checks:{harnessContracts:63,localQualityGate:'passed',productionVulnerabilities:0,native},
  limitations:['Debug Wry input is not installed acceptance or OS desktop takeover.','Office location, inherited installation scenarios and candidate lifecycle remain required.',
    'No arbitrary-scale or search-speedup claim.'],
  sourceFiles:sources.map(name=>digest(name,execFileSync('git',['show',':'+name],{maxBuffer:4*1024*1024}))),evidenceFiles:walk(root)}
fs.writeFileSync(target,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({native,sources:sources.length,evidenceFiles:manifest.evidenceFiles.length}))
