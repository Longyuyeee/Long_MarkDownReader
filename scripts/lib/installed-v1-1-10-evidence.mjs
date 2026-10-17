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
 assert.equal(manifest.appVersion,'1.1.10');assert.equal(report.appVersion,manifest.appVersion)
 assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(item=>item.target==='nsis')?.sha256)
 for(const key of ['sourceCommit','harnessSourceCommit'])assert.match(report[key],/^[a-f0-9]{40}$/)
 assert.match(report.executableSha256,/^[a-f0-9]{64}$/);assert.equal(report.status,'passed')
 assert.equal(report.evidenceLevel,'installed-webview-input-native-tag-ipc-and-disk');assert.equal(report.nativeBridgeMocked,false);assert.equal(report.desktopInputUsed,false);assert.equal(report.sourceUserContentIncluded,false)
 assert.deepEqual(report.checks.map(check=>[check.id,check.status]),tagCollectionChecks.map(id=>[id,'passed']))
 assert.equal(report.collectionFiles,244);assert.equal(report.tagFiles,244);assert.equal(report.tagCount,244);assert.equal(report.uniqueFiles,244)
 assert.equal(report.refreshRetainedFiles,40);assert.equal(report.modifiedFirst,'标签笔记243.md')
 assert.deepEqual(report.partialOutcomes,['notExecuted','completed','notExecuted']);assert.equal(report.externalChangedPreserved,true);assert.equal(report.originalHistoryPreserved,true)
 assert.equal(report.dirtyExcluded,true);assert.equal(report.dirtyPreserved,true);assert.equal(report.secondaryDirtyBlocked,true);assert.equal(report.secondaryContentReloaded,true)
 assert.equal(report.collectionTagUnchanged,true);assert.equal(report.explicitSaveAfterChecks,true)
 assert.equal(report.denials.length,5);assert.ok(report.denials.every(item=>item.rejected&&/主工作台/.test(item.error)))
 for(const type of ['click','keydown','input'])assert.ok(report.inputTrace.some(event=>event.type===type&&event.trusted))
 assert.ok(report.inputTrace.every(event=>event.trusted));assert.deepEqual(report.runtimeErrors,[]);assert.equal(report.errorOverlay,false)
}
