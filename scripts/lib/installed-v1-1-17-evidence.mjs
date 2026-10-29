import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const docxEditingChecks = ['owned-three-producer-fixtures','explicit-cancel-never-writes','automatic-source-save','automatic-copy-source-unchanged','multi-target-undo-redo','copy-collision-preserves-draft','reload-cancel-preserves-draft','ctrl-s-explicit-confirmation','three-producer-native-reopen','independent-zip-xml-untouched-parts','external-read-only','trusted-input-and-unselected-preserved']
export function validateInstalledDocxEditing(report, manifest) {
  assert.ok(['1.1.17','1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9', '1.3.10', '1.3.11', '1.3.12'].includes(manifest.appVersion)); assert.equal(report.appVersion,manifest.appVersion)
  assert.equal(report.sourceCommit,manifest.sourceCommit); assert.equal(report.installerSha256,manifest.artifacts.find(item=>item.target==='nsis')?.sha256)
  for(const key of ['sourceCommit','harnessSourceCommit'])assert.match(report[key],/^[a-f0-9]{40}$/)
  assert.match(report.executableSha256,/^[a-f0-9]{64}$/); assert.equal(report.status,'passed'); assert.equal(report.evidenceLevel,'installed-docx-native-save-and-independent-zip-xml')
  for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false,key)
  assert.deepEqual(report.checks.map(check=>[check.id,check.status]),docxEditingChecks.map(id=>[id,'passed']))
  for(const key of ['cancelExact','sourceSavedExact','copySourceUnchanged','undoRedoExact','collisionExact','reloadCancelExact','shortcutConfirmed','shortcutExclusive','externalReadOnly','unauthorizedExternalRejected','samePathExternalDraftProtected'])assert.equal(report[key],true,key)
  assert.ok(Array.isArray(report.uiMessages));assert.ok(!report.uiMessages.some(text=>text.includes('当前文件没有文本写入适配器')))
  assert.equal(report.unselectedBefore,report.unselectedAfter); assert.match(report.unselectedBefore,/^[a-f0-9]{64}$/); assert.deepEqual(report.runtimeErrors,[])
  for(const type of ['click','pointerdown','keydown','input'])assert.ok(report.inputTrace.some(event=>event.type===type&&event.trusted),type)
  assert.ok(report.inputTrace.every(event=>event.trusted))
  const inspection=report.inspection;assert.equal(inspection.status,'passed');assert.equal(inspection.nativeBridgeMocked,false);assert.equal(inspection.officeVisualAcceptance,false);assert.equal(inspection.reader,'defusedxml-0.7.1-and-stdlib-zipfile')
  assert.deepEqual(inspection.cases.map(item=>item.producerId),['microsoft-word-16','wps-writer','libreoffice-writer'])
  assert.equal(report.sourceConflictPreserved,true);assert.equal(report.conflictBeforeSha256,inspection.cases[0].beforeSha256);assert.equal(report.externalConflictSha256,inspection.cases[1].beforeSha256);assert.equal(report.conflictAfterSha256,report.externalConflictSha256);assert.notEqual(report.conflictBeforeSha256,report.conflictAfterSha256)
  for(const item of inspection.cases){assert.match(item.beforeSha256,/^[a-f0-9]{64}$/);for(const key of ['source','copy']){assert.equal(item[key].expectedTextVerified,true);assert.match(item[key].sha256,/^[a-f0-9]{64}$/);assert.notEqual(item[key].sha256,item.beforeSha256);assert.ok(item[key].preservedParts.length>=3);for(const part of item[key].preservedParts)assert.match(part.sha256,/^[a-f0-9]{64}$/)}}
  assert.equal(report.outputs.length,9)
  for(const file of report.outputs){assert.match(file.fileName,/^installed-v1117-(?:microsoft-word-16|wps-writer|libreoffice-writer)-(?:before|source|copy)\.docx$/);assert.match(file.sha256,/^[a-f0-9]{64}$/);assert.ok(file.sizeBytes>0)}
  for(const item of inspection.cases)for(const key of ['before','source','copy'])assert.equal(report.outputs.find(file=>file.fileName===`installed-v1117-${item.producerId}-${key}.docx`)?.sha256,key==='before'?item.beforeSha256:item[key].sha256)
}
export function assertDocxOutputBytes(report, read) {
  for(const item of report.outputs){const bytes=read(item.fileName);assert.equal(bytes.length,item.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256,'Original DOCX bytes changed')}
}
