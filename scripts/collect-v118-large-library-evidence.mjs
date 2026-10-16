// Owned output only. Preserve E1's immutable manifest and collect E2a separately.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {nativeSearchProduct} from './lib/v118-native-search-fixture.mjs'
import {verifyNativeSearchEvidence} from './lib/v118-native-search-evidence.mjs'
const root='docs/evidence/v118-large-library',target=root+'/manifest.json'
const sources=['.gitattributes','src-tauri/src/commands/index_search_pages.rs','src-tauri/src/commands/index_search_pages_tests.rs',
  'src-tauri/src/commands/index_search_libraries.rs','src-tauri/src/commands/index_search_libraries_tests.rs','src-tauri/src/services/knowledge_index.rs',
  '.github/workflows/v118-search-native.yml','scripts/run-v118-native-search.ps1','scripts/lib/v118-webview-test-policy.ps1',
  'scripts/capture-v118-native-search.mjs','scripts/lib/v118-native-search-fixture.mjs','scripts/lib/v118-native-search-evidence.mjs',
  'scripts/test-v118-native-search-audit.mjs','scripts/test-v118-native-search-evidence.mjs','scripts/check-current-development-audit.mjs',
  'scripts/collect-v118-large-library-evidence.mjs','shared/development-version-policy.json',
  'docs/V1_1_8_Large_Library_Audit_2026-10-17.md','docs/V1_1_8_Search_Development_2026-10-17.md','docs/Development_Handoff.md']
const read=name=>fs.readFileSync(root+'/'+name,'utf8').replace(/^\uFEFF/,'')
assert.match(read('native-before.log'),/0 passed; 2 failed/)
assert.match(read('native-functional-audited.log'),/976 passed; 0 failed; 5 ignored/)
assert.match(read('native-performance-final.log'),/test result: ok\. 1 passed; 0 failed/)
assert.match(read('harness-contracts-pinned.log'),/# pass 58\r?\n# fail 0/)
assert.match(read('quality-gate-final.log'),/found 0 vulnerabilities/)
const [receiptPath,directory]=process.argv.slice(2)
let native={status:'pending',reason:'New fixed product requires its own completed real Wry run; E1 evidence is not substituted.'}
if(receiptPath){
  for(const file of [receiptPath,directory])assert.ok(path.resolve(file).startsWith(path.resolve(root)+path.sep),'owned evidence path required')
  const run=JSON.parse(fs.readFileSync(receiptPath,'utf8').replace(/^\uFEFF/,''))
  native={status:run.status==='completed'?'failed':'pending',runId:run.databaseId,url:run.url,conclusion:run.conclusion}
  if(run.status==='completed'&&run.conclusion==='success'){
    const parse=name=>JSON.parse(fs.readFileSync(directory+'/'+name,'utf8').replace(/^\uFEFF/,''))
    const verified=verifyNativeSearchEvidence(parse('native-baseline.json'),parse('native-disk.json'),run)
    const program=parse('program-build-receipt.json')
    assert.equal(program.productCommit,nativeSearchProduct);assert.equal(program.sha256,verified.executableSha256)
    assert.equal(program.isInstaller,false);assert.equal(program.releaseCandidate,false);assert.equal(program.sourceUserContentIncluded,false)
    assert.equal(program.runtimeBaseVersion,'1.1.7');assert.match(program.harnessCommit,/^[a-f0-9]{40}$/)
    assert.match(program.buildRunId,/^\d+$/);assert.ok(program.sizeBytes>0)
    native={status:'passed',...verified,runId:run.databaseId,url:run.url,programBuildRun:program.buildRunId,sizeBytes:program.sizeBytes}
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
const manifest={schemaVersion:1,stage:'v1.1.8-E2a-large-library',productCommit:nativeSearchProduct,
  runtimeBaseVersion:'1.1.7',publicVersion:'1.1.7',releaseCandidate:false,releasePublished:false,sourceUserContentIncluded:false,
  sourceHashBasis:'git-index-bytes',checks:{behaviorBefore:{passed:0,failed:2},localFunctionalRust:976,existingIgnoredRust:5,
    independentPerformance:1,harnessContracts:58,localQualityGate:'passed',productionVulnerabilities:0,native},
  limitations:['Preparation and matching verification is cooperative; already issued file pages retain stricter synchronous proof.',
    'Debug IPC is not installer or trusted user-input acceptance.','No local desktop takeover or installation.',
    'A fixed 21050-entry fixture is not an arbitrary-scale or speedup claim.'],
  sourceFiles:sources.map(name=>digest(name,execFileSync('git',['show',':'+name],{maxBuffer:4*1024*1024}))),evidenceFiles:walk(root)}
fs.writeFileSync(target,JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify({native,sources:manifest.sourceFiles.length,evidenceFiles:manifest.evidenceFiles.length}))
