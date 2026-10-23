import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const portableChapterChecks=['real-portable-and-local-chapter-clipboard','duplicate-heading-navigation-preserves-both-drafts','renamed-heading-has-local-feedback','missing-document-keeps-the-working-page','cross-library-chapter-and-dependency-output-bytes','native-rename-repairs-only-the-chapter-destination','cancel-keeps-files-and-predecessor-drafts','trusted-input-without-runtime-overlay']
const sha=b=>crypto.createHash('sha256').update(b).digest('hex')
export const chapterOutputNames=['source.md','target.md','copy-source.md','copied.md','dependency.md','rename-before.md','rename-note.md','renamed.md','observations.json'].map(n=>'installed-v1134-'+n)
export function validateInstalledPortableChapters(report,manifest){
 assert.ok(['1.1.34','1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10'].includes(manifest.appVersion));for(const key of ['appVersion','sourceCommit'])assert.equal(report[key],manifest[key]);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-portable-chapters-trusted-ui-and-output-bytes')
 assert.ok(['wysiwyg','ir','sv'].includes(report.editorModeBefore));assert.equal(report.editorModeAfter,report.editorModeBefore)
 for(const[key,length]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(report[key],new RegExp('^[a-f0-9]{'+length+'}$'))
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false)
 for(const key of ['clipboardExact','duplicateExact','draftsExact','renamedHeadingExact','missingExact','copyExact','renameExact','cancelExact','predecessorDraftsExact','savedSourceExact','savedTargetExact'])assert.equal(report[key],true,key)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),portableChapterChecks.map(id=>[id,'passed']));assert.deepEqual(report.runtimeErrors,[])
 assert.ok(report.inputTrace.length>10&&report.inputTrace.every(e=>e.trusted));for(const type of ['click','pointerdown','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type))
 const portable=/\]\(<(longedit:\/\/chapter\?[^>]+)>\)$/.exec(report.clipboardLink);assert.ok(portable);const uri=new URL(portable[1]);assert.equal(uri.searchParams.get('path'),report.originalRelative);assert.equal(uri.searchParams.get('title'),'重复');assert.equal(decodeURIComponent(uri.hash),'#重复-1');assert.ok(!report.localClipboardLink.includes('longedit:'));assert.ok(decodeURIComponent(report.localClipboardLink).includes('#重复-1'))
}
export function assertPortableChapterOutputBytes(report,read){
 assert.deepEqual(report.outputs.map(o=>o.fileName).sort(),[...chapterOutputNames].sort());for(const o of report.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(sha(b),o.sha256)}
 const raw=n=>read('installed-v1134-'+n),text=n=>raw(n).toString('utf8'),observed=JSON.parse(raw('observations.json'))
 const saved=draft=>draft.replace(/\n+$/,'')+'\n';assert.equal(text('source.md'),saved(report.sourceDraft));assert.equal(text('target.md'),saved(report.targetDraft));assert.deepEqual(raw('target.md'),raw('dependency.md'))
 for(const[draft,marker]of [[report.sourceDraft,'来源保留草稿'],[report.targetDraft,'目标保留草稿']])assert.ok(draft.includes(marker))
 const before=text('copy-source.md'),after=text('copied.md'),find=s=>s.match(/longedit:\/\/chapter\?[^>\s]+/)[0],original=find(before),mapped=find(after),a=new URL(original),b=new URL(mapped)
 assert.equal(a.searchParams.get('path'),report.originalRelative);assert.equal(b.searchParams.get('path'),report.dependencyRelative);assert.equal(a.searchParams.get('title'),b.searchParams.get('title'));assert.equal(a.hash,b.hash);assert.equal(after,before.replace(original,mapped));assert.ok(after.startsWith('自己的补写\r\n')&&after.endsWith('\r\n末尾保留\r\n'))
 const oldNote=text('rename-before.md'),newNote=text('rename-note.md'),oldUri=find(oldNote),newUri=find(newNote);assert.equal(newNote,oldNote.replace(oldUri,newUri));assert.equal(new URL(newUri).searchParams.get('path'),report.renamedRelative);assert.equal(new URL(oldUri).hash,new URL(newUri).hash);assert.equal(text('renamed.md'),'# 重复\n\n## 重复\n\n改名原件正文。\n')
 assert.equal(observed.duplicateFragment,'重复-1');assert.equal(observed.duplicateTitle,'重复');assert.equal(observed.sourceDraftPreserved,true);assert.equal(observed.targetDraftPreserved,true);assert.ok(observed.renamedMessage.includes('未找到原章节'));assert.ok(observed.missingMessage.includes('找不到章节所在文件'));assert.equal(observed.sourceCopyUnchanged,true);assert.equal(observed.cancelDirectoryExists,false)
}
