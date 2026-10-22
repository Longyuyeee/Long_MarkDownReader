import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const chapterChecks=['three-mode-outline-duplicate-navigation','live-drafts-remain-unsaved','three-mode-move-preview-cancel','three-mode-move-and-single-undo','hierarchy-and-descendant-undo','real-clipboard-second-heading-link','copied-fragment-precise-navigation','switch-reading-and-other-drafts-preserved','explicit-save-close-and-reopen','external-conflict-copy-and-exact-output-bytes']
export function validateInstalledChapters(report,manifest){
 assert.ok(['1.1.24','1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4'].includes(manifest.appVersion));assert.equal(report.appVersion,manifest.appVersion);assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 for(const key of ['sourceCommit','harnessSourceCommit'])assert.match(report[key],/^[a-f0-9]{40}$/)
 assert.match(report.executableSha256,/^[a-f0-9]{64}$/);assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-markdown-chapters-trusted-ui-and-output-bytes')
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false,key)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),chapterChecks.map(id=>[id,'passed']));assert.deepEqual(report.runtimeErrors,[])
 assert.deepEqual(report.modes.map(m=>m.mode),['wysiwyg','ir','sv']);for(const mode of report.modes)for(const key of ['outlineExact','cancelExact','moveExact','undoExact'])assert.equal(mode[key],true,mode.mode+' '+key)
 for(const key of ['diskUnchanged','hierarchyExact','hierarchyUndoExact','clipboardExact','fragmentExact','readingRestored','otherDraftsPreserved','savedExact','reopenedExact','externalOriginalKept','conflictDraftKept','conflictCopyExact'])assert.equal(report[key],true,key)
 assert.equal(report.fragment,'重复-1');assert.ok(decodeURIComponent(report.clipboardLink).includes('#重复-1'))
 for(const type of ['click','pointerdown','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted),type)
 assert.ok(report.inputTrace.every(e=>e.trusted));assert.equal(report.outputs.length,4)
 for(const output of report.outputs){assert.match(output.fileName,/^installed-v1124-(?:saved\.md|conflict-copy\.md|external-original\.md|shared\.png)$/);assert.ok(output.sizeBytes>0);assert.match(output.sha256,/^[a-f0-9]{64}$/)}
}
export function assertChapterOutputBytes(report,read){
 for(const output of report.outputs){const bytes=read(output.fileName);assert.equal(bytes.length,output.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),output.sha256)}
 const saved=read('installed-v1124-saved.md').toString('utf8'),copy=read('installed-v1124-conflict-copy.md').toString('utf8'),original=read('installed-v1124-external-original.md').toString('utf8')
 assert.equal(crypto.createHash('sha256').update(saved).digest('hex'),report.savedSha256);assert.equal(original,report.externalContent);assert.deepEqual(report.saveConvention,{lineEnding:'lf',hasFinalNewline:true});assert.equal(saved,report.submittedDraft.replace(/\n+$/,'')+'\n');assert.equal(copy,report.conflictDraft.replace(/\n+$/,'')+(report.conflictDraft.endsWith('\n')?'\n':''))
 for(const text of [saved,copy]){for(const mode of ['wysiwyg','ir','sv'])assert.ok(text.includes('需要保留的章节草稿 '+mode));for(const marker of ['第一节唯一','第二节唯一','代码里的假标题','images/shared.png','原值'])assert.ok(text.includes(marker))}
 assert.ok(copy.includes('冲突后的章节草稿'));assert.ok(original.includes('外部修改必须保留'));assert.equal(read('installed-v1124-shared.png').subarray(0,8).toString('hex'),'89504e470d0a1a0a')
}
