import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const findReplaceChecks=['three-mode-exact-selected-duplicate','three-mode-single-undo-preserves-live-drafts','case-word-and-next-previous','all-preview-cancel-keeps-disk','literal-all-replace-and-single-undo','text-selected-replace-and-native-find','switch-closes-old-preview-and-keeps-drafts','explicit-save-close-and-reopen','external-conflict-copy-keeps-current-draft','exact-output-bytes-and-shared-image']
export function validateInstalledFindReplace(report,manifest){
 assert.ok(['1.1.25','1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32'].includes(manifest.appVersion));assert.equal(report.appVersion,manifest.appVersion);assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 for(const key of ['sourceCommit','harnessSourceCommit'])assert.match(report[key],/^[a-f0-9]{40}$/)
 assert.match(report.executableSha256,/^[a-f0-9]{64}$/);assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-document-find-replace-trusted-ui-and-output-bytes')
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false,key)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),findReplaceChecks.map(id=>[id,'passed']));assert.deepEqual(report.runtimeErrors,[])
 assert.deepEqual(report.modes.map(m=>m.mode),['wysiwyg','ir','sv']);for(const m of report.modes)for(const key of ['selectionExact','replaceExact','undoExact'])assert.equal(m[key],true,m.mode+' '+key)
 for(const key of ['caseWordExact','navigationExact','cancelExact','allReplaceExact','allUndoExact','diskUnchanged','textSelectionExact','textUndoExact','nativeFindRetained','switchExact','otherDraftsPreserved','savedExact','savedFindAvailable','reopenedExact','externalOriginalKept','conflictDraftKept','conflictCopyExact','imageUnchanged'])assert.equal(report[key],true,key)
 for(const type of ['click','pointerdown','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted),type)
 assert.ok(report.inputTrace.every(e=>e.trusted));assert.equal(report.outputs.length,5)
 for(const o of report.outputs){assert.match(o.fileName,/^installed-v1125-(?:saved\.md|saved\.txt|conflict-copy\.md|external-original\.md|shared\.png)$/);assert.ok(o.sizeBytes>0);assert.match(o.sha256,/^[a-f0-9]{64}$/)}
}
export function assertFindReplaceOutputBytes(report,read){
 for(const o of report.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const saved=read('installed-v1125-saved.md').toString('utf8'),copy=read('installed-v1125-conflict-copy.md').toString('utf8'),original=read('installed-v1125-external-original.md').toString('utf8')
 assert.deepEqual(report.saveConvention,{lineEnding:'lf',hasFinalNewline:true});assert.equal(saved,report.submittedDraft.replace(/\n+$/,'')+'\n');assert.equal(original,report.externalContent);assert.equal(copy,report.conflictDraft.replace(/\n+$/,'')+(report.conflictDraft.endsWith('\n')?'\n':''));assert.equal(read('installed-v1125-saved.txt').toString('utf8'),report.savedText)
 for(const mode of ['wysiwyg','ir','sv'])assert.ok(saved.includes('需要保留的查找草稿 '+mode))
 for(const marker of ['第二段 用户 之外 用户','images/shared.png','code stays','😀'])assert.ok(saved.includes(marker))
 assert.ok(copy.includes('冲突查找草稿'));assert.ok(original.includes('外部修改必须保留'));assert.equal(read('installed-v1125-shared.png').subarray(0,8).toString('hex'),'89504e470d0a1a0a')
}
