import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const docxEditingChecks = ['owned-three-producer-fixtures','explicit-cancel-never-writes','automatic-source-save','automatic-copy-source-unchanged','multi-target-undo-redo','copy-collision-preserves-draft','reload-cancel-preserves-draft','ctrl-s-explicit-confirmation','three-producer-native-reopen','independent-zip-xml-untouched-parts','external-read-only','trusted-input-and-unselected-preserved']
export function validateInstalledDocxEditing(report, manifest) {
  assert.equal(manifest.appVersion,'1.1.17'); assert.equal(report.appVersion,manifest.appVersion)
  assert.equal(report.sourceCommit,manifest.sourceCommit); assert.equal(report.installerSha256,manifest.artifacts.find(item=>item.target==='nsis')?.sha256)
  for(const key of ['sourceCommit','harnessSourceCommit'])assert.match(report[key],/^[a-f0-9]{40}$/)
  assert.match(report.executableSha256,/^[a-f0-9]{64}$/); assert.equal(report.status,'passed'); assert.equal(report.evidenceLevel,'installed-docx-native-save-and-independent-zip-xml')
  for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false,key)
  assert.deepEqual(report.checks.map(check=>[check.id,check.status]),docxEditingChecks.map(id=>[id,'passed']))
  for(const key of ['cancelExact','sourceSavedExact','copySourceUnchanged','undoRedoExact','collisionExact','reloadCancelExact','shortcutConfirmed','externalReadOnly','unauthorizedExternalRejected','samePathExternalDraftProtected'])assert.equal(report[key],true,key)
  assert.equal(report.unselectedBefore,report.unselectedAfter); assert.match(report.unselectedBefore,/^[a-f0-9]{64}$/); assert.deepEqual(report.runtimeErrors,[])
  for(const type of ['click','pointerdown','keydown','input'])assert.ok(report.inputTrace.some(event=>event.type===type&&event.trusted),type)
  assert.ok(report.inputTrace.every(event=>event.trusted))
  const inspection=report.inspection;assert.equal(inspection.status,'passed');assert.equal(inspection.nativeBridgeMocked,false);assert.equal(inspection.officeVisualAcceptance,false);assert.equal(inspection.reader,'defusedxml-0.7.1-and-stdlib-zipfile')
  assert.deepEqual(inspection.cases.map(item=>item.producerId),['microsoft-word-16','wps-writer','libreoffice-writer'])
  for(const item of inspection.cases){assert.match(item.beforeSha256,/^[a-f0-9]{64}$/);for(const key of ['source','copy']){assert.equal(item[key].expectedTextVerified,true);assert.match(item[key].sha256,/^[a-f0-9]{64}$/);assert.notEqual(item[key].sha256,item.beforeSha256);assert.ok(item[key].preservedParts.length>=3);for(const part of item[key].preservedParts)assert.match(part.sha256,/^[a-f0-9]{64}$/)}}
  assert.equal(report.outputs.length,9)
  for(const file of report.outputs){assert.match(file.fileName,/^installed-v1117-(?:microsoft-word-16|wps-writer|libreoffice-writer)-(?:before|source|copy)\.docx$/);assert.match(file.sha256,/^[a-f0-9]{64}$/);assert.ok(file.sizeBytes>0)}
  for(const item of inspection.cases)for(const key of ['before','source','copy'])assert.equal(report.outputs.find(file=>file.fileName===`installed-v1117-${item.producerId}-${key}.docx`)?.sha256,key==='before'?item.beforeSha256:item[key].sha256)
}
export function assertDocxOutputBytes(report, read) {
  for(const item of report.outputs){const bytes=read(item.fileName);assert.equal(bytes.length,item.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256,'Original DOCX bytes changed')}
}
