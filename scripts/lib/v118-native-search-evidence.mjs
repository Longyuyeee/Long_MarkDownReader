import assert from 'node:assert/strict'
import { nativeSearchProduct } from './v118-native-search-fixture.mjs'
export const nativeBaselineChecks=[
  'actual-product-identity-and-generated-config',
  'real-cold-work-and-seven-file-pages-pass-200-with-locators-and-private-exclusion',
  'same-cursor-is-idempotent-and-sort-binding-rejects-mixed-pages',
  'camel-case-request-validation-and-unconfigured-scope-are-enforced-by-real-ipc',
  'exact-case-tag-pages-and-native-modification-order',
  'native-window-label-and-channel-isolation-prevent-cross-window-close-or-page',
  '487-healthy-files-survive-one-offline-library-and-all-failure-is-not-complete-empty',
  'source-change-expires-a-real-issued-page-before-stale-data-is-returned',
  'real-rebuild-memory-cache-matches-cold-groups-and-persists-for-restart',
]
export const nativeDiskChecks=['actual-product-identity-and-generated-config','same-executable-restart-disk-index-has-identical-244-groups-and-locators']
export function verifyNativeSearchEvidence(baseline,disk,run){
  assert.equal(run.status,'completed');assert.equal(run.conclusion,'success')
  assert.match(run.headSha,/^[a-f0-9]{40}$/)
  for(const [report,phase,checks] of [[baseline,'baseline',nativeBaselineChecks],[disk,'disk',nativeDiskChecks]]){
    assert.equal(report.phase,phase);assert.equal(report.status,'passed')
    assert.equal(report.evidenceLevel,'debug-tauri-wry-real-ipc-and-generated-disk-not-installed')
    assert.equal(report.productCommit,nativeSearchProduct);assert.equal(report.harnessCommit,run.headSha)
    assert.equal(report.runtimeBaseVersion,'1.1.7');assert.equal(report.sourceUserContentIncluded,false);assert.equal(report.desktopInputUsed,false)
    assert.match(report.executableSha256,/^[a-f0-9]{64}$/);assert.deepEqual(report.checks,checks)
    assert.equal(report.uiObservation.errorOverlay,false)
    assert.ok(report.calls.length>0&&report.calls.every(call=>Number.isFinite(call.elapsedMs)&&call.elapsedMs>=0))
  }
  assert.equal(baseline.executableSha256,disk.executableSha256)
  assert.equal(baseline.expectedGroups.length,244)
  assert.equal(new Set(baseline.expectedGroups.map(group=>group.path)).size,244)
  const pdf=baseline.expectedGroups.find(group=>group.path.endsWith('/多批注.pdf'))
  assert.equal(pdf.matches.filter(match=>match.matchKind==='annotation'&&match.page===1&&match.annotationId).length,5)
  assert.ok(baseline.samples[0].workCalls>1&&!baseline.samples[0].indexed,'cold proof must actually resume source work')
  assert.equal(baseline.samples.at(-1).indexed,true,'memory cache phase missing')
  assert.equal(disk.samples[0].indexed,true,'fresh-process disk cache phase missing')
  assert.ok(baseline.calls.some(call=>call.window==='quick-note'&&call.command==='search_knowledge_page'&&call.ok))
  assert.ok(baseline.calls.some(call=>call.window==='quick-note'&&call.command==='search_knowledge_page'&&call.code==='expired'))
  return {nativeChecks:baseline.checks.length+disk.checks.length,files:244,federatedHealthyFiles:487,productCommit:nativeSearchProduct,harnessCommit:run.headSha,executableSha256:baseline.executableSha256,evidenceLevel:baseline.evidenceLevel}
}
