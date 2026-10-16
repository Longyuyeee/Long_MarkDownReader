import assert from 'node:assert/strict'
import {nativeSearchProduct} from './v118-native-search-fixture.mjs'
export const nativeUserChecks=[
  'trusted-ui-library-80-files-and-main-editor',
  'trusted-ui-dirty-draft-explicit-reference-no-disk-write',
  'real-source-change-ui-expiry-refresh-restores-80',
  'trusted-keyboard-native-modification-sort',
  'trusted-palette-cross-library-draft-rejection',
  'trusted-pdf-annotation-identity-and-draft-preservation',
]
export function verifyNativeUserEvidence(user,baseline,run){
  assert.equal(run.status,'completed');assert.equal(run.conclusion,'success')
  assert.equal(user.status,'passed');assert.equal(user.phase,'user')
  assert.equal(user.evidenceLevel,'actual-wry-webview-input-events-generated-disk-not-installed')
  assert.equal(user.productCommit,nativeSearchProduct);assert.equal(user.productCommit,baseline.productCommit)
  assert.equal(user.harnessCommit,run.headSha);assert.equal(user.harnessCommit,baseline.harnessCommit)
  assert.match(user.executableSha256,/^[a-f0-9]{64}$/);assert.equal(user.executableSha256,baseline.executableSha256)
  assert.equal(user.runtimeBaseVersion,'1.1.7');assert.equal(user.sourceUserContentIncluded,false)
  assert.equal(user.nativeBridgeMocked,false);assert.equal(user.desktopInputUsed,false)
  assert.deepEqual(user.checks,nativeUserChecks);assert.deepEqual(user.runtimeErrors,[])
  assert.equal(user.uiObservation.errorOverlay,false)
  for(const type of ['click','keydown','input'])assert.ok(user.inputTrace.some(event=>event.type===type&&event.trusted),'trusted '+type+' required')
  assert.equal(user.initialFiles,80);assert.equal(user.refreshFiles,80)
  assert.match(user.expiryText,/搜索现场已变化或过期/)
  assert.deepEqual(user.pdf,{annotationId:'批注-3',page:1,comment:'预算位置3'})
  assert.equal(user.sourceFiles.length,5);assert.equal(new Set(user.sourceFiles.map(file=>file.name)).size,5)
  assert.deepEqual(user.sourceFiles.map(file=>file.name).sort(),['zz-项目预算.md','a-0001-记录.md','a-0000-记录.md','多批注.pdf','多批注.pdf.annotations.json'].sort())
  for(const file of user.sourceFiles){assert.match(file.before,/^[a-f0-9]{64}$/);assert.equal(file.before,file.after)}
  assert.match(user.draftContentSha256,/^[a-f0-9]{64}$/);assert.ok(user.draftChecks.length>=5)
  for(const check of user.draftChecks){assert.equal(check.name,'zz-项目预算.md');assert.equal(check.dirty,true);assert.equal(check.contentSha256,user.draftContentSha256)}
  return {userChecks:user.checks.length,trustedEvents:user.inputTrace.filter(event=>event.trusted).length,sourceHashes:5,
    productCommit:user.productCommit,harnessCommit:user.harnessCommit,executableSha256:user.executableSha256,evidenceLevel:user.evidenceLevel}
}
