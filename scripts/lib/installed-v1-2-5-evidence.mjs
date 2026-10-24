import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const tableRowChecks=['stable-row-insert-one-undo-preserves-other-draft','duplicate-multiline-current-draft-independent-history','sorted-menu-refuses-position-and-copies-exact-row','filtered-insert-reveals-new-row-keeps-hidden-records','row-delete-confirm-cancel-and-undo','real-locked-save-retains-rows-retries-and-reopens','csv-tsv-row-copy-preserves-original-text-and-encoding','external-conflict-keeps-file-and-new-row-draft']
export function validateInstalledTableRows(r,m){
 assert.ok(['1.2.5','1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-table-row-actions-trusted-input-and-file-bytes')
 for(const[key,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(r[key],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[key],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),tableRowChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[]);assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'))
}
export function assertTableRowOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),['installed-v125-rows-observations.json','installed-v125-rows-final-table.json','installed-v125-rows-csv.csv','installed-v125-rows-tsv.tsv'])
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read('installed-v125-rows-observations.json').toString('utf8'));for(const id of tableRowChecks)assert.equal(obs[id],true,id)
 const t=JSON.parse(read('installed-v125-rows-final-table.json').toString('utf8')),rows=Object.fromEntries(t.data.rows.map(x=>[x.id,x.values]));assert.equal(t.data.rows.length,5);assert.equal(new Set(t.data.rows.map(x=>x.id)).size,5);assert.equal(rows['r-a'].task,'复用\r\n记录');assert.equal(rows['r-a'].code,'00077');assert.equal(rows[obs.copyId].task,'复用\r\n记录');assert.equal(rows[obs.copyId].code,'00999');assert.equal(rows['r-hidden'].task,'外部保留');assert.equal(rows['r-hidden'].code,'9007199254740993123');assert.equal(rows['r-d'].code,'=SUM(A1:A2)');assert.equal(obs.conflictDraftRows,6)
 for(const name of ['installed-v125-rows-csv.csv','installed-v125-rows-tsv.tsv']){const text=read(name).toString('utf8');assert.ok(text.startsWith('\uFEFF'));assert.equal(text.split('00123').length-1,2);for(const x of ['首条','9007199254740993123','=SUM(A1:A2)','\r\n'])assert.ok(text.includes(x),name+x)}
}
