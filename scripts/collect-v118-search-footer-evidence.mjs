// E2d is a new frontend proof, not a rewrite of the fixed E2c Wry program.
import fs from 'node:fs'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
const root='docs/evidence/v118-search-footer',target=root+'/manifest.json'
const read=name=>fs.readFileSync(root+'/'+name,'utf8').replace(/^\uFEFF/,'')
const json=name=>JSON.parse(read(name))
assert.match(read('status-before.log'),/# pass 6\r?\n# fail 2/)
assert.match(read('browser-before.log'),/0 !== 1/)
const unwired=json('browser-after-diagnostics/failure.json')
assert.equal(unwired.observation.calls.length,2);assert.deepEqual(unwired.observation.counts,[40])
assert.match(read('search-contracts-final.log'),/# pass 116\r?\n# fail 0/)
const quality=read('quality-gate.log')
assert.match(quality,/found 0 vulnerabilities/)
const footer=json('browser-final/report.json')
assert.equal(footer.checks.length,4);assert.equal(footer.layouts.length,24);assert.deepEqual(footer.errors,[])
assert.match(footer.scope,/simulated IPC, not Wry\/installer acceptance/)
assert.deepEqual(footer.observations.map(item=>item.channel),['library','palette'])
for(const item of footer.observations){
  assert.equal(item.loadedAfterRetry,80);assert.equal(item.loadedAfterRestart,80)
  assert.equal(item.retryVisibleWithoutRecoveryScroll,true);assert.equal(item.restartVisibleWithoutRecoveryScroll,true)
  assert.equal(item.restartCalls.length,2);assert.equal(item.restartCalls[0].request.cursor,null)
  assert.notEqual(item.restartCalls[1].request.cursor,item.failedCursor)
}
for(const [directory,checks,layouts] of [['refresh-regression',6,0],['paged-regression',9,12],['navigation-regression',12,12]]){
  const report=json(directory+'/report.json')
  assert.equal(report.checks.length,checks);assert.equal(report.layouts?.length||0,layouts);assert.deepEqual(report.errors,[])
}
const previous=json('prior-041-ci-final.json')
assert.equal(previous.databaseId,38977312511);assert.equal(previous.headSha,'041eea4fa4b37c81c9d9da35e6a14d1500d12e06')
assert.equal(previous.status,'completed');assert.equal(previous.conclusion,'success')
const sources=['.gitattributes','src/components/SearchPageStatus.vue','src/views/LibraryMode.vue','src/components/CommandPalette.vue',
  'src/services/searchPages.ts','scripts/test-search-result-layout.mjs','scripts/test-search-footer-recovery-browser.mjs',
  'scripts/test-v118-search-refresh-browser.mjs','scripts/test-v118-search-pages-browser.mjs','scripts/test-search-consistency-browser.mjs',
  'scripts/fixtures/v118-search-pages-browser.mjs','scripts/fixtures/search-consistency-browser.mjs',
  'scripts/collect-v118-search-footer-evidence.mjs','shared/development-version-policy.json',
  'docs/V1_1_8_Search_Footer_Audit_2026-10-17.md','docs/V1_1_8_Search_Development_2026-10-17.md','docs/Development_Handoff.md']
for(const name of sources)assert.equal(execFileSync('git',['diff','--name-only','--',name],{encoding:'utf8'}).trim(),'','stage reviewed source first: '+name)
const digest=(name,bytes)=>({path:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})
function walk(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>{
  assert.ok(!entry.isSymbolicLink());const name=folder+'/'+entry.name
  if(name===target)return []
  if(entry.isDirectory())return walk(name)
  assert.match(name,/\.(json|log|png)$/,'generated diagnostic evidence only')
  return [digest(name,fs.readFileSync(name))]
}).sort((a,b)=>a.path.localeCompare(b.path))}
const manifest={schemaVersion:1,stage:'v1.1.8-E2d-search-footer',baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  sourceHashBasis:'git-index-bytes',runtimeBaseVersion:'1.1.7',publicVersion:'1.1.7',developmentTargetVersion:'1.1.8',
  releaseCandidate:false,releasePublished:false,sourceUserContentIncluded:false,
  checks:{relatedContracts:116,footerFlows:4,footerLayouts:24,refreshFlows:6,pagedFlows:9,pagedLayouts:12,navigationFlows:12,navigationLayouts:12,
    browserPageErrors:0,localQualityGate:'passed',productionVulnerabilities:0},
  nativeCoverage:{runId:38977308342,productCommit:'13e77754efc4fe3d7b4cef73e96e8165cdb45cae',checks:18,doesNotCoverCurrentFooter:true},
  limitations:['Current footer input flows use actual Vue with isolated simulated IPC, not Wry or installation.',
    'A newly fixed Wry program must cover the footer and Office before installer inheritance and candidate closure.',
    'Previous CI 38977312511 proves 041eea4f only, not this source index.'],
  sourceFiles:sources.map(name=>digest(name,execFileSync('git',['show',':'+name],{maxBuffer:4*1024*1024}))),evidenceFiles:walk(root)}
fs.writeFileSync(target,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({sources:manifest.sourceFiles.length,evidence:manifest.evidenceFiles.length,checks:manifest.checks}))
