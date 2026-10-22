import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const annotationBatchChecks=['unselected-card-menu-keeps-single-scope','batch-recolor-one-undo-redo-and-disk-state','hidden-selection-delete-cancel-and-restore','real-batch-save-failure-retains-and-retries','batch-external-conflict-keeps-both-versions']
export function validateInstalledAnnotationBatch(report,manifest){
 assert.ok(['1.2.3','1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8'].includes(manifest.appVersion));for(const key of ['appVersion','sourceCommit'])assert.equal(report[key],manifest[key]);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-pdf-annotation-batch-trusted-input-and-sidecar-bytes')
 for(const [key,n]of [['harnessSourceCommit',40],['executableSha256',64],['pdfBefore',64]])assert.match(report[key],new RegExp('^[a-f0-9]{'+n+'}$'));assert.equal(report.pdfBefore,report.pdfAfter)
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),annotationBatchChecks.map(id=>[id,'passed']));assert.deepEqual(report.runtimeErrors,[]);assert.ok(report.inputTrace.length>10&&report.inputTrace.every(e=>e.trusted));assert.ok(report.inputTrace.some(e=>e.type==='input'))
}
export function assertAnnotationBatchOutputBytes(report,read){
 assert.deepEqual(report.outputs.map(o=>o.fileName),['installed-v123-batch-observations.json','installed-v123-batch-final-sidecar.json'])
 for(const o of report.outputs){const bytes=read(o.fileName);assert.equal(bytes.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),o.sha256)}
 const o=JSON.parse(read('installed-v123-batch-observations.json').toString('utf8'));for(const id of annotationBatchChecks)assert.equal(o[id],true,id)
 const sidecar=JSON.parse(read('installed-v123-batch-final-sidecar.json').toString('utf8'));assert.equal(sidecar.annotations.length,3);assert.equal(sidecar.annotations[0].comment,'批量外部评论');assert.equal(sidecar.annotations[1].comment,'批量评论 B');assert.equal(sidecar.annotations[2].comment,'批量评论 C');assert.deepEqual(sidecar.annotations.slice(0,2).map(a=>a.color),['pink','pink'])
}
