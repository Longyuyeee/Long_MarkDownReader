import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const tableFillChecks=['range-context-cancel-and-single-cell-scope','empty-fill-stable-identities-one-undo-redo','replace-validation-atomic-and-input-retained','same-file-locator-keeps-unsaved-table-and-history','real-locked-save-retains-draft-retries-and-reopens','csv-tsv-fill-preserves-original-text-and-encoding','external-conflict-keeps-file-and-current-fill']
export function validateInstalledTableFill(report,manifest){
 assert.ok(['1.2.4','1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30'].includes(manifest.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(report[k],manifest[k]);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-table-range-fill-trusted-input-and-file-bytes')
 for(const [key,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(report[key],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(report.lockedBefore,report.lockedAfter);assert.equal(report.externalBefore,report.externalAfter)
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),tableFillChecks.map(id=>[id,'passed']));assert.deepEqual(report.runtimeErrors,[]);assert.ok(report.inputTrace.length>10&&report.inputTrace.every(e=>e.trusted));assert.ok(report.inputTrace.some(e=>e.type==='input'))
}
export function assertTableFillOutputBytes(report,read){
 assert.deepEqual(report.outputs.map(o=>o.fileName),['installed-v124-fill-observations.json','installed-v124-fill-final-table.json','installed-v124-fill-csv.csv','installed-v124-fill-tsv.tsv'])
 for(const o of report.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const observations=JSON.parse(read('installed-v124-fill-observations.json').toString('utf8'));for(const id of tableFillChecks)assert.equal(observations[id],true,id)
 const table=JSON.parse(read('installed-v124-fill-final-table.json').toString('utf8')),rows=Object.fromEntries(table.data.rows.map(r=>[r.id,r.values]));assert.equal(rows['r-a'].task,'已完成');assert.equal(rows['r-a'].state,'已完成');assert.equal(rows['r-a'].code,'00077');assert.equal(rows['r-hidden'].task,'外部保留');assert.equal(rows['r-hidden'].code,'9007199254740993123');assert.equal(rows['r-c'].task,'已完成');assert.equal(rows['r-c'].state,'已完成');assert.equal(rows['r-d'].code,'=SUM(A1:A2)');assert.equal(table.data.columns.find(c=>c.id==='state').validation.kind,'options')
 for(const name of ['installed-v124-fill-csv.csv','installed-v124-fill-tsv.tsv']){const text=read(name).toString('utf8');assert.ok(text.startsWith('\uFEFF'));for(const value of ['批量填充','00123','9007199254740993123','=SUM(A1:A2)','\r\n'])assert.ok(text.includes(value),name+value)}
}
