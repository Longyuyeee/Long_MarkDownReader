import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const pdfReadingChecks=['installed-identity-and-source-fixtures','long-pdf-filtered-paginated-annotations','selected-notes-preview-only','draft-only-append-keeps-unsaved-input-and-disk','explicit-save-persists-source-links','source-link-returns-exact-page-annotation','deleted-annotation-honest-page-fallback','legacy-link-remains-explicitly-unverified','real-native-new-note-picker-and-selected-output','existing-note-never-overwritten','same-size-same-time-replacement-rejected','moved-source-user-relinks-verified-draft','relative-restored-copy-keeps-source-identity','original-pdf-sidecar-unselected-bytes-and-no-errors']
export function validateInstalledPdfReading(report,manifest){
 assert.ok(['1.1.13','1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17'].includes(manifest.appVersion));assert.equal(report.appVersion,manifest.appVersion);assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
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
 assert.match(report.appendedDraftSha256,/^[a-f0-9]{64}$/)
 const s=report.saveExpectation;assert.equal(s.observedFrom,'rendered-vditor-source-before-explicit-save');assert.deepEqual([s.mode,s.encoding.toLowerCase(),s.bom,s.lineEnding,s.hasFinalNewline],['sv','utf-8','none','lf',true])
 assert.ok(s.markdown.startsWith('# 我正在写方案\n\n这段还没有保存，整理 PDF 时不能代存或丢失。\n\n'))
 for(const item of report.snapshot.items)assert.ok(s.markdown.includes(item.uri))
 for(const text of ['用户阅读评论 11','Reading source page 15','用户阅读评论 14'])assert.ok(s.markdown.includes(text))
 const expected=Buffer.from(s.markdown.replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/\n+$/,'')+'\n');assert.equal(crypto.createHash('sha256').update(expected).digest('hex'),report.draftBeforeSaveSha256)
 assert.ok(typeof report.targetSignatureBefore==='string'&&report.targetSignatureBefore.length>0)
 for(const field of ['sourceRender','movedRender','restoredRender']){const p=report[field];assert.equal(p.observedFrom,'rendered-pdf-controls-text-and-canvas');assert.equal(p.page,12);assert.equal(p.annotationId,'reading-11');assert.equal(p.placeholderAbsent,true);assert.ok(p.text.includes('Reading source page 12'));for(const k of ['width','height','opaquePixels','inkPixels'])assert.ok(Number.isFinite(p[k])&&p[k]>0)}
 for(const [field,text]of [['deletedNotice','批注不存在或已被删除'],['legacySourceNotice','旧引用没有内容摘要']]){const n=report[field];assert.equal(n.observedFrom,'rendered-reference-notice-in-panel-viewport');assert.equal(n.visible,true);assert.ok(n.text.includes(text));assert.ok(n.top>=n.parentTop&&n.bottom<=n.parentBottom)}
 assert.equal(report.nativePicker.status,'selected-real-native-dialog');assert.equal(report.nativePicker.dialogClosed,true);assert.equal(report.nativePicker.desktopUserSession,'disposable-github-hosted');assert.ok(report.nativePicker.processId>0)
 assert.ok(report.inputTrace.every(e=>e.trusted));for(const type of ['click','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted))
 assert.deepEqual(report.runtimeErrors,[]);assert.equal(report.editorModes.before,report.editorModes.after)
}
