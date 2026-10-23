import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const readingMoveChecks=['live-pdf-follows-folder-move-with-original-signature','named-scene-and-staged-descendants-follow-success','partial-batch-only-successful-paths-continue','retry-continues-remaining-record-once','copy-keeps-source-reading-record','destination-record-is-not-overwritten','dirty-markdown-follows-without-implicit-save','file-bytes-preserved-and-interface-usable']
export const readingMoveOutputNames=['installed-v121-observations.json']
export function validateInstalledReadingMove(report,manifest){
 assert.ok(['1.2.1','1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8'].includes(manifest.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(report[k],manifest[k]);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-reading-continuity-native-receipts-and-trusted-input')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['pdfBefore',64]])assert.match(report[k],new RegExp('^[a-f0-9]{'+n+'}$'));assert.equal(report.pdfAfter,report.pdfBefore)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[k],false)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),readingMoveChecks.map(id=>[id,'passed']));assert.deepEqual(report.runtimeErrors,[]);assert.ok(report.inputTrace.length>5&&report.inputTrace.every(e=>e.trusted));assert.ok(report.inputTrace.some(e=>e.type==='input'))
}
export function assertReadingMoveOutputBytes(report,read){
 assert.deepEqual(report.outputs.map(o=>o.fileName),readingMoveOutputNames)
 for(const o of report.outputs){const bytes=read(o.fileName);assert.equal(bytes.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),o.sha256)}
 const o=JSON.parse(read(readingMoveOutputNames[0]).toString('utf8'))
 assert.equal(o.pdfBefore.section,'2');assert.equal(o.pdfAfter.section,'2');assert.equal(o.pdfBefore.pdfAnnotations.signature,o.pdfAfter.pdfAnnotations.signature)
 for(const k of ['sceneFollowed','partial','retry','copyRetained','collisionRetained','draftRetained','diskUnchanged'])assert.equal(o[k],true,k)
 assert.equal(o.stagedScroll,520)
}
