import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const readingMoveChecks=['live-pdf-follows-folder-move-with-original-signature','named-scene-and-staged-descendants-follow-success','partial-batch-only-successful-paths-continue','retry-continues-remaining-record-once','copy-keeps-source-reading-record','destination-record-is-not-overwritten','dirty-markdown-follows-without-implicit-save','file-bytes-preserved-and-interface-usable']
export const readingMoveOutputNames=['installed-v121-observations.json']
export function validateInstalledReadingMove(report,manifest){
 assert.ok(['1.2.1','1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9', '1.3.10', '1.3.11', '1.3.12', '1.3.13', '1.3.14', '1.3.15'].includes(manifest.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(report[k],manifest[k]);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
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
