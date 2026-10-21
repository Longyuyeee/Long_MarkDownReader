import assert from 'node:assert/strict'
export const tagCollectionChecks = [
 'installed-identity-and-configured-scope', 'native-collection-pages-cover-244-files',
 'full-query-modified-order', 'real-missing-directory-refresh-keeps-old-cards',
 'unsubmitted-conditions-survive-sidebar-switch', 'native-tag-count-and-files-agree',
 'actual-dirty-editor-excluded-from-preview', 'partial-apply-preserves-external-change-and-original-history',
 'collection-meaning-and-file-identity-not-rewritten', 'secondary-window-denies-five-main-only-commands',
 'real-secondary-draft-blocks-write-until-explicit-save', 'clean-secondary-editor-reloads-content-only-notice',
 'explicit-final-save-and-no-global-errors',
]
export function validateInstalledTagCollections(report, manifest) {
 assert.ok(['1.1.10','1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35'].includes(manifest.appVersion));assert.equal(report.appVersion,manifest.appVersion)
 assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(item=>item.target==='nsis')?.sha256)
 for(const key of ['sourceCommit','harnessSourceCommit'])assert.match(report[key],/^[a-f0-9]{40}$/)
 assert.match(report.executableSha256,/^[a-f0-9]{64}$/);assert.equal(report.status,'passed')
 assert.equal(report.evidenceLevel,'installed-webview-input-native-tag-ipc-and-disk');assert.equal(report.nativeBridgeMocked,false);assert.equal(report.desktopInputUsed,false);assert.equal(report.sourceUserContentIncluded,false)
 assert.deepEqual(report.checks.map(check=>[check.id,check.status]),tagCollectionChecks.map(id=>[id,'passed']))
 assert.equal(report.collectionFiles,244);assert.equal(report.tagFiles,244);assert.equal(report.tagCount,244);assert.equal(report.uniqueFiles,244)
 assert.equal(report.refreshRetainedFiles,40);assert.equal(report.modifiedFirst,'标签笔记243.md')
 assert.deepEqual(report.partialOutcomes,['notExecuted','completed','notExecuted']);assert.equal(report.externalChangedPreserved,true);assert.equal(report.originalHistoryPreserved,true)
 assert.equal(report.dirtyExcluded,true);assert.equal(report.dirtyPreserved,true);assert.equal(report.secondaryDirtyBlocked,true);assert.equal(report.secondaryContentReloaded,true)
 assert.equal(report.secondaryBlock.path,report.sourceFiles[3].path);assert.equal(report.secondaryBlock.before,report.sourceFiles[3].before);assert.equal(report.secondaryBlock.before,report.secondaryBlock.after);assert.match(report.secondaryBlock.error,/未保存/);assert.ok(report.secondaryBlock.error.includes(report.secondaryBlock.path.split(/[\\/]/).pop()));assert.equal(report.secondaryBlock.nativeError,report.secondaryBlock.error)
 assert.equal(report.collectionTagUnchanged,true);assert.equal(report.explicitSaveAfterChecks,true)
 assert.deepEqual(report.denials.map(item=>item.command),['search_collection_page','get_tag_catalog_page','preview_tag_edit','apply_tag_edit','close_tag_edit']);assert.ok(report.denials.every(item=>item.rejected&&/主工作台/.test(item.error)))
 for(const [index,item] of report.denials.entries()){if(index<2){assert.equal(item.nativeError.code,'forbidden');assert.equal(item.nativeError.message,item.error)}else assert.equal(item.nativeError,item.error)}
 for(const type of ['click','keydown','input'])assert.ok(report.inputTrace.some(event=>event.type===type&&event.trusted))
 assert.ok(report.inputTrace.every(event=>event.trusted));assert.deepEqual(report.runtimeErrors,[]);assert.equal(report.errorOverlay,false)
 for(const type of ['click','keydown','input'])assert.ok(report.secondaryInputTrace.some(event=>event.type===type&&event.trusted))
 assert.ok(report.secondaryInputTrace.every(event=>event.trusted))
 assert.equal(report.sourceFiles.length,244);assert.equal(new Set(report.sourceFiles.map(file=>file.path)).size,244)
 for(const [index,file]of report.sourceFiles.entries()){assert.match(file.before,/^[a-f0-9]{64}$/);assert.match(file.after,/^[a-f0-9]{64}$/);if(index>=4)assert.equal(file.after,file.before,'unselected file changed')}
 assert.equal(report.sourceFiles[0].before,report.dirtyDiskBefore);assert.equal(report.dirtyDiskBefore,report.dirtyDiskBeforeFinalSave);assert.equal(report.sourceFiles[0].after,report.explicitSavedSha256);assert.notEqual(report.explicitSavedSha256,report.dirtyDiskBefore)
 assert.equal(report.originalHistory.path,report.sourceFiles[1].path);assert.equal(report.originalHistory.before,report.sourceFiles[1].before);assert.equal(report.originalHistory.snapshot,report.originalHistory.before)
 assert.equal(report.externalChange.path,report.sourceFiles[2].path);assert.equal(report.externalChange.expected,report.externalChange.after);assert.equal(report.externalChange.after,report.sourceFiles[2].after)
}
