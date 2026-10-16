// Mechanical inventory of reviewed staged source and owned generated evidence.
// Never substitute the preceding fixed native program for this frontend.
import fs from 'node:fs'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
const root='docs/evidence/v118-search-refresh',target=root+'/manifest.json'
const sources=['.gitattributes','src/services/searchPages.ts','src/components/SearchPageStatus.vue',
  'src/components/CommandPalette.vue','src/views/LibraryMode.vue','src/composables/useSearchReturn.ts',
  'scripts/test-search-pages.mjs','scripts/test-search-result-layout.mjs','scripts/test-v118-search-refresh-browser.mjs',
  'scripts/test-v118-search-pages-browser.mjs','scripts/test-search-consistency-browser.mjs',
  'scripts/fixtures/v118-search-pages-browser.mjs','scripts/fixtures/v118-search-pages-browser.html',
  'scripts/fixtures/search-consistency-browser.mjs','scripts/fixtures/file-management-browser.mjs','scripts/fixtures/workflow-redesign-browser.mjs',
  'scripts/check-current-development-audit.mjs','scripts/collect-v118-search-refresh-evidence.mjs',
  'shared/development-version-policy.json','docs/V1_1_8_Search_Refresh_Audit_2026-10-17.md',
  'docs/V1_1_8_Search_Development_2026-10-17.md','docs/Development_Handoff.md']
const read=name=>fs.readFileSync(root+'/'+name,'utf8').replace(/^\uFEFF/,'')
assert.match(read('controller-before-depth.log'),/# pass 19\r?\n# fail 2/)
assert.match(read('search-contracts-final.log'),/# pass 114\r?\n# fail 0/)
assert.match(read('native-functional.log'),/976 passed; 0 failed; 5 ignored/)
assert.match(read('native-performance.log'),/test result: ok\. 1 passed; 0 failed/)
assert.match(read('quality-gate-first.log'),/found 0 vulnerabilities/)
assert.match(read('browser-before/failure.json'),/preparation must preserve every loaded file card/)
const flows=JSON.parse(read('browser-dirty-final/report.json')),
  paged=JSON.parse(read('existing-flows/report.json')),navigation=JSON.parse(read('navigation-correct-port/report.json'))
assert.equal(flows.checks.length,6);assert.deepEqual(flows.errors,[])
assert.equal(paged.checks.length,9);assert.equal(paged.layouts.length,12);assert.deepEqual(paged.errors,[])
assert.equal(navigation.checks.length,12);assert.equal(navigation.layouts.length,12);assert.deepEqual(navigation.errors,[])
const digest=(name,bytes)=>({path:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})
function walk(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>{
  assert.ok(!entry.isSymbolicLink(),'no linked user data');const name=folder+'/'+entry.name
  if(name===target)return []
  if(entry.isDirectory())return walk(name)
  assert.match(name,/\.(log|json|png)$/,'no program or user documents in evidence')
  return [digest(name,fs.readFileSync(name))]
}).sort((a,b)=>a.path.localeCompare(b.path))}
for(const source of sources)assert.ok(!execFileSync('git',['diff','--name-only','--',source],{encoding:'utf8'}).trim(),'stage reviewed source first: '+source)
const manifest={schemaVersion:1,stage:'v1.1.8-E2b-search-refresh',baselineCommit:'0086a9064659d3f1cc0f59458c2f9134958281ec',
  status:'actual-vue-refresh-validated-new-wry-and-installed-pending',runtimeBaseVersion:'1.1.7',publicVersion:'1.1.7',
  releaseCandidate:false,releasePublished:false,sourceUserContentIncluded:false,sourceHashBasis:'git-index-bytes',
  checks:{before:{passed:19,failed:2},searchContracts:{passed:114,failed:0},localRust:{passed:976,failed:0,existingIgnored:5,performanceFiltered:1},
    independentPerformance:{passed:1,totalMs:4963},actualVue:{refreshFlows:6,pagedFlows:9,navigationFlows:12,layouts:24,pageErrors:0},qualityGate:'passed',productionVulnerabilities:0},
  limitations:['All Vue captures use owned simulated IPC/disk, not native Wry or installer acceptance.',
    'The preceding native product 96e9fc46 is not evidence for this new frontend.',
    'Historical base fixture version badge 1.0.26 DEV is not a binary identity.',
    'Normal motion retained; no search speedup or arbitrary-scale DOM benchmark claimed.'],
  sourceFiles:sources.map(name=>digest(name,execFileSync('git',['show',':'+name],{maxBuffer:4*1024*1024}))),evidenceFiles:walk(root)}
fs.writeFileSync(target,JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify({sources:manifest.sourceFiles.length,evidenceFiles:manifest.evidenceFiles.length,bytes:manifest.evidenceFiles.reduce((sum,item)=>sum+item.bytes,0)}))
