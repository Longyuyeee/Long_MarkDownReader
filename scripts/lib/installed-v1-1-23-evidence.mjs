import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const attachmentChecks=['attachment-folders-visible-with-private-metadata-hidden','menu-inspects-live-draft-without-saving','missing-file-search-and-local-status','native-picker-cancellation-keeps-original','replace-and-undo-preserve-current-draft','repair-missing-reference-in-draft','external-copy-keeps-shared-source-and-collision','incoming-reference-opens-real-note','attachment-folder-rename-and-history-restore','exact-output-bytes-and-other-drafts-preserved']
export function validateInstalledAttachments(report,manifest){
 assert.ok(['1.1.23','1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23'].includes(manifest.appVersion));assert.equal(report.appVersion,manifest.appVersion);assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 for(const field of ['sourceCommit','harnessSourceCommit'])assert.match(report[field],/^[a-f0-9]{40}$/)
 assert.match(report.executableSha256,/^[a-f0-9]{64}$/);assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-attachments-native-picker-draft-and-output-bytes')
 for(const field of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[field],false,field)
 for(const field of ['queryReadOnly','draftPreserved','undoExact','cancelExact','missingRepaired','sourcePreserved','collisionPreserved','referenceOpened','renameRestoreExact','otherDraftsPreserved'])assert.equal(report[field],true,field)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),attachmentChecks.map(id=>[id,'passed']));assert.deepEqual(report.runtimeErrors,[])
 for(const type of ['click','pointerdown','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted),type)
 assert.ok(report.inputTrace.every(e=>e.trusted));assert.equal(report.outputs.length,3);assert.match(report.sourceImageSha256,/^[a-f0-9]{64}$/);assert.match(report.externalImageSha256,/^[a-f0-9]{64}$/)
 for(const output of report.outputs){assert.match(output.fileName,/^installed-v1123-(?:saved\.md|shared\.png|imported\.png)$/);assert.match(output.sha256,/^[a-f0-9]{64}$/);assert.ok(output.sizeBytes>0)}
 assert.equal(report.cancelPicker.status,'cancelled-real-native-dialog');assert.equal(report.internalPicker.status,'selected-real-native-dialog');assert.equal(report.externalPicker.status,'selected-real-native-dialog')
 for(const picker of [report.cancelPicker,report.internalPicker,report.externalPicker]){assert.equal(picker.dialogClosed,true);assert.equal(picker.desktopUserSession,'disposable-github-hosted')}
}
export function assertAttachmentOutputBytes(report,read){
 const bytes=new Map();for(const output of report.outputs){const value=read(output.fileName);assert.equal(value.length,output.sizeBytes);assert.equal(crypto.createHash('sha256').update(value).digest('hex'),output.sha256);bytes.set(output.fileName,value)}
 const saved=bytes.get('installed-v1123-saved.md').toString('utf8');assert.ok(saved.includes('需要保留的附件草稿'));assert.ok(saved.includes('images/new.png'));assert.ok(!saved.includes('images/missing.png'));assert.ok(saved.includes('.assets/'))
 for(const [file,hash]of [['installed-v1123-shared.png',report.sourceImageSha256],['installed-v1123-imported.png',report.externalImageSha256]]){const value=bytes.get(file);assert.equal(crypto.createHash('sha256').update(value).digest('hex'),hash);assert.equal(value.subarray(0,8).toString('hex'),'89504e470d0a1a0a')}
}
