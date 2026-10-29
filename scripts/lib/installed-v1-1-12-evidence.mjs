import assert from 'node:assert/strict'
export const contentBackupChecks=[
 'installed-identity-and-preserved-settings-entries','scoped-native-preflight-and-exclusions',
 'source-change-rejected-without-zip','real-save-picker-and-independent-zip-digests',
 'existing-zip-never-overwritten','malformed-package-rejected-before-target',
 'existing-restore-directory-blocked','restored-file-bytes-and-pdf-time-preserved',
 'restored-pdf-annotations-rebound','restored-history-content-pins-and-notes',
 'explicit-add-keeps-current-library-and-draft','seven-secondary-window-command-denials',
 'native-cancellation-cleans-owned-stage','draft-model-and-disk-unchanged-before-explicit-save',
 'restored-markdown-image-and-pdf-actually-open','original-files-and-no-runtime-errors',
]
export const contentBackupCommands=['preview_content_backup','export_content_backup','preflight_content_restore','check_content_restore_target','restore_content_backup','cancel_content_backup','discard_content_backup_plan']
export function validateInstalledContentBackup(report,manifest){
 assert.ok(['1.1.12','1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(manifest.appVersion));assert.equal(report.appVersion,manifest.appVersion)
 assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 for(const key of ['sourceCommit','harnessSourceCommit'])assert.match(report[key],/^[a-f0-9]{40}$/)
 assert.match(report.executableSha256,/^[a-f0-9]{64}$/);assert.equal(report.status,'passed')
 assert.equal(report.evidenceLevel,'installed-webview-input-native-content-backup-picker-and-disk')
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),contentBackupChecks.map(id=>[id,'passed']))
 assert.equal(report.preflight.observedFrom,'rendered-native-preflight');assert.equal(report.preflight.entryCount,7);assert.deepEqual(report.preflight.counts,{documents:3,attachments:1,annotations:1,history:2})
 assert.ok(report.preflight.excludedCount>=1);assert.equal(report.zip.status,'passed');assert.equal(report.zip.reader,'dotnet-system-io-compression-independent-no-extraction')
 assert.equal(report.zip.manifest.kind,'longedit-library-content');assert.equal(report.zip.manifest.appVersion,manifest.appVersion)
 assert.equal(report.zip.entries.length,7);assert.equal(new Set(report.zip.entries.map(e=>e.path)).size,7)
 for(const e of report.zip.entries){assert.match(e.sha256,/^[a-f0-9]{64}$/);assert.equal(e.sha256,report.zip.manifest.entries.find(m=>m.path===e.path)?.sha256)}
 for(const item of [report.exportReceipt,report.restoreReceipt]){assert.equal(item.observedFrom,'rendered-native-completion');assert.equal(item.entryCount,7)}
 assert.match(report.zip.sha256,/^[a-f0-9]{64}$/);assert.equal(report.exportReceipt.sha256,report.zip.sha256)
 assert.equal(report.restoreReceipt.sha256,report.zip.sha256);assert.equal(report.restoreReceipt.status,'completed');assert.equal(report.restoreReceipt.sourceUnchanged,true)
 assert.equal(report.sourceFiles.length,5);assert.equal(new Set(report.sourceFiles.map(f=>f.path)).size,5)
 for(const f of report.sourceFiles){assert.match(f.before,/^[a-f0-9]{64}$/);assert.equal(f.before,f.after);assert.equal(f.before,f.restored)}
 assert.equal(report.pdfTime.before,report.pdfTime.restored);assert.deepEqual(report.pdfAnnotations.before,report.pdfAnnotations.restored)
 assert.equal(report.pdfAnnotations.before.schemaVersion,1);assert.equal(report.pdfAnnotations.before.annotations.length,1);assert.equal(report.pdfAnnotations.before.annotations[0].comment,'恢复后应保留的页评论')
 assert.deepEqual(report.history.before,report.history.restored);assert.deepEqual(report.history.metadataBefore,report.history.metadataRestored);assert.equal(report.history.pinned,true)
 assert.equal(report.history.before.length,1);const savedMetadata=report.history.metadataBefore[report.history.before[0][0]];assert.equal(savedMetadata.pinned,true);assert.equal(savedMetadata.note,'跨位置恢复也要保留')
 for(const key of ['sourceChangeRejected','existingZipPreserved','badPackageRejected','targetConflictBlocked','explicitAddOnly','activeLibraryUnchanged','explicitSaveAfterChecks','markdownBodyVisible','markdownImageLoaded','pdfPageVisible'])assert.equal(report[key],true,key)
 assert.ok(report.draftChecks.length>=3);for(const c of report.draftChecks){assert.equal(c.dirty,true);assert.equal(c.exactModel,true);assert.equal(c.contentSha256,report.draftSha256);assert.equal(c.diskSha256,report.draftDiskBefore)}
 assert.equal(report.cancel.stageObserved,true);assert.equal(report.cancel.accepted,true);assert.equal(report.cancel.published,false);assert.equal(report.cancel.remainingStages,0);assert.match(report.cancel.error,/取消/)
 assert.deepEqual(report.denials.map(d=>d.command),contentBackupCommands);for(const d of report.denials){assert.equal(d.rejected,true);assert.match(d.error,/主工作台/)}
 assert.ok(report.nativePickers.length>=4);for(const p of report.nativePickers){assert.equal(p.status,'selected-real-native-dialog');assert.equal(p.dialogClosed,true);assert.equal(p.desktopUserSession,'disposable-github-hosted');assert.ok(p.processId>0);assert.ok(p.selectedPath)}
 for(const type of ['click','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted));assert.ok(report.inputTrace.every(e=>e.trusted));assert.deepEqual(report.runtimeErrors,[])
 assert.ok(['sv','ir','wysiwyg'].includes(report.editorModes.before));assert.equal(report.editorModes.before,report.editorModes.after)
 assert.equal(report.pdfRender.placeholderAbsent,true);for(const key of ['width','height','opaquePixels','inkPixels'])assert.ok(Number.isFinite(report.pdfRender[key])&&report.pdfRender[key]>0)
}
