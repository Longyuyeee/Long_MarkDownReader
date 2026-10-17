import assert from 'node:assert/strict'
export const pdfReadingChecks=['installed-identity-and-source-fixtures','long-pdf-filtered-paginated-annotations','selected-notes-preview-only','draft-only-append-keeps-unsaved-input-and-disk','explicit-save-persists-source-links','source-link-returns-exact-page-annotation','deleted-annotation-honest-page-fallback','legacy-link-remains-explicitly-unverified','real-native-new-note-picker-and-selected-output','existing-note-never-overwritten','same-size-same-time-replacement-rejected','moved-source-user-relinks-verified-draft','relative-restored-copy-keeps-source-identity','original-pdf-sidecar-unselected-bytes-and-no-errors']
export function validateInstalledPdfReading(report,manifest){
 assert.equal(manifest.appVersion,'1.1.13');assert.equal(report.appVersion,manifest.appVersion);assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 for(const key of ['sourceCommit','harnessSourceCommit'])assert.match(report[key],/^[a-f0-9]{40}$/)
 assert.match(report.executableSha256,/^[a-f0-9]{64}$/);assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-webview-input-native-pdf-notes-picker-and-disk')
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),pdfReadingChecks.map(id=>[id,'passed']))
 assert.equal(report.pdfPages,86);assert.equal(report.annotationCount,240);assert.equal(report.filteredCount,6);assert.equal(report.previewCount,2)
 assert.deepEqual(report.selectedIds,['reading-11','reading-14']);assert.ok(report.snapshot.items.every(i=>report.selectedIds.includes(i.annotation.id)));assert.equal(report.snapshot.items.length,2)
 for(const item of report.snapshot.items){assert.ok(item.uri.includes('&sha256='+report.sourceBefore));assert.ok(item.uri.includes('&page='+item.annotation.page))}
 assert.equal(report.sourceBefore,report.sourceAfter);assert.equal(report.sidecarBefore,report.sidecarAfter);assert.equal(report.unselectedBefore,report.unselectedAfter)
 for(const key of ['dirtyBeforeInsert','dirtyAfterInsert','exactDraftPrefix','draftDiskUnchangedBeforeSave','explicitSave','returnedExactAnnotation','deletedAnnotationNotice','legacyNotice','newNoteSelectedOnly','existingTargetPreserved','replacementRejected','replacementTimestampPreserved','movedRelinkDirtyOnly','movedRelinkReturnedExact','restoredReferenceVerified','restoredPageVisible'])assert.equal(report[key],true,key)
 assert.equal(report.targetSignatureBefore,report.targetSignatureAfterInsert);assert.equal(report.draftBeforeSaveSha256,report.explicitSavedSha256)
 assert.equal(report.nativePicker.status,'selected-real-native-dialog');assert.equal(report.nativePicker.dialogClosed,true);assert.equal(report.nativePicker.desktopUserSession,'disposable-github-hosted');assert.ok(report.nativePicker.processId>0)
 assert.ok(report.inputTrace.every(e=>e.trusted));for(const type of ['click','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted))
 assert.deepEqual(report.runtimeErrors,[]);assert.equal(report.editorModes.before,report.editorModes.after)
}
