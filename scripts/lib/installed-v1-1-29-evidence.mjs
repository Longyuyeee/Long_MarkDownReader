import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {readingContinuityTail,readingContinuityConcurrent,readingContinuityAppend,readingContinuityInside} from './pdf-continuity-fixture.mjs'
export const pdfContinuityChecks=['native-note-generation-and-original-source','annotation-comment-filter-and-return-position','update-preview-cancel-preserves-draft','stale-annotation-preview-refused','targeted-update-keeps-user-text-and-selection-scope','delayed-single-undo-redo-and-explicit-save','edited-generated-content-explicit-append','other-drafts-trusted-input-and-no-runtime-errors']
export function validateInstalledPdfContinuity(report,manifest){
 assert.ok(['1.1.29','1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3'].includes(manifest.appVersion));assert.equal(report.appVersion,manifest.appVersion);assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-native-pdf-continuity-and-exact-draft-bytes');assert.match(report.harnessSourceCommit,/^[a-f0-9]{40}$/);assert.match(report.executableSha256,/^[a-f0-9]{64}$/)
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false)
 for(const key of ['generatedFromNative','annotationEditExact','readingReturnExact','cancelExact','staleRejected','draftOnly','undoExact','redoExact','explicitSaveExact','appendExact','otherDraftsPreserved','modeRestored'])assert.equal(report[key],true,key)
 assert.match(report.pdfBefore,/^[a-f0-9]{64}$/);assert.equal(report.pdfBefore,report.pdfAfter)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),pdfContinuityChecks.map(id=>[id,'passed']));assert.equal(report.outputs.length,8)
 assert.deepEqual(report.runtimeErrors,[]);assert.ok(report.inputTrace.every(e=>e.trusted));for(const type of ['pointerdown','click','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted))
}
// Inspect the actual portable metadata and surrounding original Markdown,
// independently of the product's update helper. No constructed report replaces
// output bytes captured from the installed application's live draft and disk.
export function assertPdfContinuityOutputBytes(report,read){
 const text=name=>read('installed-v1129-'+name).toString('utf8'),hash=b=>crypto.createHash('sha256').update(b).digest('hex')
 for(const item of report.outputs){const bytes=read(item.fileName);assert.equal(bytes.length,item.sizeBytes);assert.equal(hash(bytes),item.sha256)}
 const parse=body=>[...body.matchAll(/^<!-- longedit:pdf-reading:v1 ([A-Za-z0-9+/=]+) -->\r?\n/gm)].map(match=>{const metadata=JSON.parse(Buffer.from(match[1],'base64').toString('utf8')),end='<!-- longedit:pdf-reading:end '+metadata.id+' -->',finish=body.indexOf(end,match.index);assert.ok(finish>=0);return{metadata,start:match.index,end:finish+end.length,body:body.slice(match.index+match[0].length,finish)}})
 const before=text('draft-before.md'),after=text('draft-after.md'),disk=text('disk-before.md'),saved=text('saved.md'),appendBefore=text('append-before.md'),appendAfter=text('append-after.md'),a=parse(before),b=parse(after)
 assert.equal(a.length,1);assert.equal(b.length,1);assert.equal(a[0].metadata.id,b[0].metadata.id)
 assert.deepEqual(a[0].metadata.snapshot.items.map(i=>i.annotation.id),['continue-a','continue-b'])
 assert.deepEqual(new Set(b[0].metadata.snapshot.items.map(i=>i.annotation.id)),new Set(['continue-a','continue-b','continue-new']))
 assert.deepEqual(b[0].metadata.snapshot.missingIds,['continue-b']);assert.equal(b[0].metadata.snapshot.items.find(i=>i.annotation.id==='continue-a').annotation.comment,readingContinuityConcurrent)
 for(const body of [before,after,appendBefore,appendAfter])assert.ok(body.includes(readingContinuityTail))
 assert.equal(before.slice(0,a[0].start),after.slice(0,b[0].start));assert.equal(before.slice(a[0].end),after.slice(b[0].end));assert.ok(!b[0].body.includes('原来未选中'));assert.ok(b[0].body.includes('原批注已删除，保留原摘录'))
 assert.equal(saved,after.replace(/\r\n/g,'\n').replace(/\n+$/,'')+'\n');assert.notEqual(disk,saved);assert.ok(!disk.includes(readingContinuityTail));assert.equal(parse(disk).length,1)
 assert.ok(appendBefore.includes(readingContinuityInside));assert.ok(appendAfter.startsWith(appendBefore));const appended=parse(appendAfter);assert.equal(appended.length,2);assert.notEqual(appended[0].metadata.id,appended[1].metadata.id);assert.ok(appended[1].body.includes(readingContinuityAppend))
 const original=JSON.parse(text('annotations-before.json')),final=JSON.parse(text('annotations-after.json'))
 assert.equal(original.annotations.length,3);assert.deepEqual(final.annotations.find(a=>a.id==='unselected'),original.annotations.find(a=>a.id==='unselected'));assert.ok(!final.annotations.some(a=>a.id==='continue-b'));assert.equal(final.annotations.find(a=>a.id==='continue-a').comment,readingContinuityAppend)
 for(const entry of b[0].metadata.snapshot.items)assert.ok(entry.uri.includes('sha256='+report.pdfBefore))
}
