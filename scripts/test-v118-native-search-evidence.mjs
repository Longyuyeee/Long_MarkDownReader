import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeBaselineChecks,nativeDiskChecks,verifyNativeSearchEvidence } from './lib/v118-native-search-evidence.mjs'
import { nativeSearchProduct } from './lib/v118-native-search-fixture.mjs'
// Synthetic validator inputs only: these are never saved as runtime evidence.
function fixture(){
  const run={status:'completed',conclusion:'success',headSha:'a'.repeat(40)}
  const base={status:'passed',evidenceLevel:'debug-tauri-wry-real-ipc-and-generated-disk-not-installed',productCommit:nativeSearchProduct,harnessCommit:run.headSha,runtimeBaseVersion:'1.1.7',sourceUserContentIncluded:false,desktopInputUsed:false,executableSha256:'b'.repeat(64),generatedFixture:{unregisteredEntries:21050},uiObservation:{errorOverlay:false},calls:[{window:'main',command:'search_knowledge_page',ok:true,elapsedMs:1}],samples:[{workCalls:2,indexed:false,initialExaminedSources:0},{workCalls:2,indexed:true}]}
  const baseline={...structuredClone(base),phase:'baseline',checks:[...nativeBaselineChecks],expectedGroups:Array.from({length:244},(_,n)=>({path:`C:/owned/${n===0?'多批注.pdf':n+'.md'}`,matches:n===0?Array.from({length:5},(_,m)=>({matchKind:'annotation',page:1,annotationId:'a-'+m})):[]}))}
  baseline.calls.push({window:'quick-note',command:'search_knowledge_page',ok:true,elapsedMs:2},{window:'quick-note',command:'search_knowledge_page',ok:false,code:'expired',elapsedMs:1})
  const disk={...structuredClone(base),phase:'disk',checks:[...nativeDiskChecks],samples:[{indexed:true,workCalls:2}]}
  return {run,baseline,disk}
}
test('validator accepts the complete separated native evidence schema, not an installed assertion',()=>{
  const f=fixture(),result=verifyNativeSearchEvidence(f.baseline,f.disk,f.run)
  assert.equal(result.nativeChecks,12);assert.equal(result.files,244);assert.match(result.evidenceLevel,/not-installed$/)
})
test('unfinished or failed remote runs cannot be closed as passing evidence',()=>{
  for(const change of [f=>f.run.status='in_progress',f=>f.run.conclusion='failure',f=>f.baseline.status='running',f=>f.disk.status='failed']){const f=fixture();change(f);assert.throws(()=>verifyNativeSearchEvidence(f.baseline,f.disk,f.run))}
})
test('source, harness, executable and evidence-level substitutions are rejected',()=>{
  for(const change of [f=>f.baseline.productCommit='c'.repeat(40),f=>f.disk.harnessCommit='c'.repeat(40),f=>f.disk.executableSha256='d'.repeat(64),f=>f.baseline.evidenceLevel='installed',f=>f.disk.sourceUserContentIncluded=true]){const f=fixture();change(f);assert.throws(()=>verifyNativeSearchEvidence(f.baseline,f.disk,f.run))}
})
test('missing tasks, duplicate groups and lost PDF annotation identity are rejected',()=>{
  for(const change of [f=>f.baseline.checks.pop(),f=>f.disk.checks.pop(),f=>f.baseline.expectedGroups[1]=f.baseline.expectedGroups[0],f=>f.baseline.expectedGroups[0].matches[0].annotationId=null]){const f=fixture();change(f);assert.throws(()=>verifyNativeSearchEvidence(f.baseline,f.disk,f.run))}
})
test('fake cold completion, missing cache use and missing native window proof are rejected',()=>{
  for(const change of [f=>f.baseline.samples[0].workCalls=1,f=>f.baseline.samples[0].indexed=true,f=>f.disk.samples[0].indexed=false,f=>f.baseline.calls.pop(),f=>f.baseline.generatedFixture.unregisteredEntries=1400,f=>f.baseline.samples[0].initialExaminedSources=256]){const f=fixture();change(f);assert.throws(()=>verifyNativeSearchEvidence(f.baseline,f.disk,f.run))}
})
