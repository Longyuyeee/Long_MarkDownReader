import assert from 'node:assert/strict'
import {nativeSearchProduct} from './v118-native-search-fixture.mjs'
import {officeFixtureSpecs} from './v118-native-office-fixture.mjs'
import {nativeOfficeChecks} from './v118-native-office-input.mjs'
export function verifyNativeOfficeEvidence(office,user,run){
  assert.equal(run.status,'completed');assert.equal(run.conclusion,'success')
  assert.equal(office.status,'passed');assert.equal(office.phase,'office')
  assert.equal(office.evidenceLevel,'actual-wry-webview-input-events-generated-disk-not-installed')
  assert.equal(office.productCommit,nativeSearchProduct);assert.equal(office.productCommit,user.productCommit)
  assert.equal(office.harnessCommit,run.headSha);assert.equal(office.harnessCommit,user.harnessCommit)
  assert.equal(office.executableSha256,user.executableSha256);assert.match(office.executableSha256,/^[a-f0-9]{64}$/)
  assert.equal(user.status,'passed');assert.deepEqual(user.runtimeErrors,[])
  assert.deepEqual(user.footerRecovery,{label:'重新搜索',visibleWithoutRecoveryScroll:true,retainedFiles:80})
  assert.equal(office.runtimeBaseVersion,'1.1.7');assert.equal(office.sourceUserContentIncluded,false)
  assert.equal(office.nativeBridgeMocked,false);assert.equal(office.desktopInputUsed,false)
  assert.deepEqual(office.checks,nativeOfficeChecks);assert.deepEqual(office.runtimeErrors,[])
  assert.equal(office.uiObservation.errorOverlay,false)
  for(const type of ['click','keydown','input'])assert.ok(office.inputTrace.some(event=>event.type===type&&event.trusted))
  assert.equal(office.sourceFiles.length,3)
  for(const [index,spec] of officeFixtureSpecs.entries()){
    const file=office.sourceFiles[index];assert.equal(file.name,spec.name);assert.equal(file.source,spec.source)
    assert.equal(file.before,spec.sha256);assert.equal(file.after,spec.sha256)
  }
  const {docx,pptxObject,pptxNotes,workbook}=office.observations
  assert.match(docx.path,/[/\\]原文定位\.docx$/);assert.ok(docx.locator);assert.equal(docx.visible,true);assert.match(docx.targetText,/After explicit page break\./)
  assert.match(pptxObject.path,/[/\\]演示定位\.pptx$/);assert.equal(pptxObject.locatorKind,'pptx-object');assert.ok(pptxObject.objectId)
  assert.equal(pptxObject.locator,pptxObject.objectId);assert.equal(pptxObject.slide,'1');assert.match(pptxObject.text,/Search and notes evidence/)
  assert.equal(pptxNotes.path,pptxObject.path);assert.equal(pptxNotes.slide,'2');assert.equal(pptxNotes.activeSlide,2);assert.equal(pptxNotes.matchKind,'notes')
  assert.match(pptxNotes.notes,/LibreOffice image relationship evidence\./);assert.ok(pptxNotes.locatorToken);assert.notEqual(pptxNotes.locatorToken,pptxObject.locatorToken)
  assert.equal(workbook.length,2);assert.match(workbook[0].path,/[/\\]工作表定位\.xlsx$/);assert.equal(workbook[0].path,workbook[1].path)
  for(const [index,sheet] of ['Inventory','Details'].entries()){assert.equal(workbook[index].sheet,sheet);assert.equal(workbook[index].activeSheet,sheet);assert.ok(workbook[index].locatorToken)}
  assert.notEqual(workbook[0].locatorToken,workbook[1].locatorToken)
  assert.ok(user.draftChecks.length>=10,'Office opens must retain the original dirty draft')
  return {nativeOfficeChecks:4,sourceHashes:3,trustedEvents:office.inputTrace.filter(event=>event.trusted).length,footerVisibleWithoutRecoveryScroll:true}
}
