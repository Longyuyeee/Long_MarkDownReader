// Mechanical evidence inventory. Run only after the reviewed sources are staged
// and all captures have stopped writing; never collects user libraries or secrets.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
const root='docs/evidence/v118-search-ui', target=root+'/manifest.json'
const sources=[
  '.gitattributes','shared/development-version-policy.json',
  'src/services/searchPages.ts','src/components/SearchFileCard.vue','src/components/SearchPageStatus.vue',
  'src/components/CommandPalette.vue','src/views/LibraryMode.vue','src/composables/useSearchReturn.ts','src/utils/workSessions.ts',
  'src-tauri/src/commands/index_search_pages.rs','src-tauri/src/commands/index_search_pages_tests.rs','src-tauri/src/commands/index_search_libraries.rs',
  'scripts/check-current-development-audit.mjs','scripts/check-format-contract.mjs',
  'scripts/test-search-pages.mjs','scripts/test-v118-search-pages-browser.mjs','scripts/test-search-consistency-browser.mjs',
  'scripts/fixtures/v118-search-pages-browser.html','scripts/fixtures/v118-search-pages-browser.mjs','scripts/fixtures/search-consistency-browser.mjs',
  'scripts/test-search-recovery.mjs','scripts/test-search-return.mjs','scripts/test-search-result-groups.mjs','scripts/test-search-result-layout.mjs','scripts/test-search-document-preview.mjs',
  'scripts/collect-v118-search-ui-evidence.mjs',
  'docs/V1_1_8_Search_UI_Audit_2026-10-17.md','docs/V1_1_8_Search_UI_Proposal_2026-10-17.md',
  'docs/V1_1_8_Search_Development_2026-10-17.md','docs/Development_Handoff.md','docs/Foundation_Deepening_Roadmap_1_1_8_to_1_1_20_2026-10-17.md',
]
const digest=(name,bytes)=>({path:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})
function inventory(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  assert.ok(!entry.isSymbolicLink(),'no linked external evidence')
  const name=directory+'/'+entry.name
  if(name===target)return []
  if(entry.isDirectory())return inventory(name)
  assert.ok(/\.(?:log|json|png)$/.test(name),'unexpected evidence extension: '+name)
  return [digest(name,fs.readFileSync(name))]
}).sort((a,b)=>a.path.localeCompare(b.path))}
const log=name=>fs.readFileSync(root+'/'+name,'utf8')
assert.match(log('native-functional-final.log'),/968 passed; 0 failed; 5 ignored/)
assert.match(log('native-performance.log'),/1 passed; 0 failed/)
assert.match(log('search-contracts-complete.log'),/# pass 102\r?\n# fail 0/)
assert.match(log('quality-gate-final.log'),/found 0 vulnerabilities/)
const browser=JSON.parse(log('browser-selection-final/report.json')),navigation=JSON.parse(log('navigation-first/report.json'))
assert.equal(browser.checks.length,9);assert.equal(browser.layouts.length,12);assert.deepEqual(browser.errors,[])
assert.equal(navigation.checks.length,12);assert.equal(navigation.layouts.length,12);assert.deepEqual(navigation.errors,[])
for(const source of sources)assert.ok(!execFileSync('git',['diff','--name-only','--',source],{encoding:'utf8'}).trim(),'stage source first: '+source)
const manifest={schemaVersion:1,stage:'v1.1.8-D',status:'paged-search-ui-validated-native-ipc-and-installed-closure-pending',
  baselineCommit:'20d447d06e8b3968082ccb2f6285b5f2379cd555',branch:'codex/v118-search-completeness',runtimeBaseVersion:'1.1.7',publicVersion:'1.1.7',releaseCandidate:false,releasePublished:false,
  sourceHashBasis:'git-index-bytes',sourceUserContentIncluded:false,
  evidenceLevel:'rust-native-real-owned-files-and-separate-actual-vue-pages-with-simulated-ipc-not-installed',
  checks:{nativeFunctional:{passed:968,failed:0,existingIgnored:5,performanceFiltered:1},nativePerformance:{passed:1,totalMs:4609},searchContracts:{passed:102,failed:0},actualVue:{newFlows:9,newLayouts:12,navigationFlows:12,navigationLayouts:12,pageErrors:0},qualityGate:'passed',productionVulnerabilities:0},
  limitations:['No real Tauri IPC or installer acceptance this batch.','Browser base fixture has a historical simulated 1.0.26 DEV badge, not binary identity.','No end-to-end search latency or ten-thousand-file DOM benchmark.','Normal motion preserved; screenshots before opacity correction and all failures retained.','Previous CI receipt is only for the baseline commit.'],
  sourceFiles:sources.map(name=>digest(name,execFileSync('git',['show',':'+name],{maxBuffer:4*1024*1024}))),
  evidenceFiles:inventory(root)}
// This generated inventory can be recreated from the staged source and raw files.
fs.writeFileSync(target,JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify({sources:manifest.sourceFiles.length,evidenceFiles:manifest.evidenceFiles.length,evidenceBytes:manifest.evidenceFiles.reduce((sum,file)=>sum+file.bytes,0),manifest:path.resolve(target)}))
