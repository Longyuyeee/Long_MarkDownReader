import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const tableColumnChecks=['move-current-draft-whole-column-and-one-undo','boundary-sort-filter-and-frozen-prefix-follow-field','add-edit-move-and-row-history-stay-on-stable-fields','saved-views-widths-rules-and-field-references-match','real-locked-save-keeps-column-draft-retries-reopens','csv-tsv-column-order-preserves-original-text-and-encoding','column-rule-entry-and-source-switch-clear-old-menu','external-conflict-keeps-file-and-reordered-draft']
export function validateInstalledTableColumns(r,m){
 assert.ok(['1.2.6','1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9', '1.3.10', '1.3.11'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-table-column-order-trusted-input-and-file-bytes')
 for(const[key,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(r[key],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),tableColumnChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[]);assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'))
}
export function assertTableColumnOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),['installed-v126-columns-observations.json','installed-v126-columns-final-table.json','installed-v126-columns-csv.csv','installed-v126-columns-tsv.tsv'])
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read('installed-v126-columns-observations.json').toString('utf8'));for(const id of tableColumnChecks)assert.equal(obs[id],true,id)
 const doc=JSON.parse(read('installed-v126-columns-final-table.json').toString('utf8'));assert.deepEqual(doc.data.columns.map(c=>c.id),['task','code','state',obs.newColumnId,'scope']);assert.equal(doc.data.rows.length,5)
 const rows=Object.fromEntries(doc.data.rows.map(row=>[row.id,row.values]));assert.equal(rows['r-a'].code,'00077');assert.equal(rows['r-a'].task,'复用\r\n记录');assert.equal(rows['r-hidden'].task,'外部保留');assert.equal(rows['r-hidden'].code,'9007199254740993123');assert.equal(rows['r-d'].code,'=SUM(A1:A2)');assert.equal(rows['r-c'][obs.newColumnId],'额外原文');assert.equal(rows[obs.copyId][obs.newColumnId],'额外原文');assert.deepEqual(obs.conflictDraftOrder,['code','task','state',obs.newColumnId,'scope'])
 assert.deepEqual(doc.data.columns.find(c=>c.id==='state').validation,{kind:'options',required:true,options:['待处理','已完成']})
 for(const view of doc.views){assert.equal(view.config.groupBy,'state');assert.equal(view.config.titleColumn,'task');assert.equal(view.config.valueColumn,'code');assert.equal(view.config.columnWidths.code,obs.widths[view.id].code);assert.equal(view.config.columnWidths.state,obs.widths[view.id].state)}
 for(const name of ['installed-v126-columns-csv.csv','installed-v126-columns-tsv.tsv']){const text=read(name).toString('utf8'),sep=name.endsWith('.csv')?',':'\t';assert.ok(text.startsWith('\uFEFF编号'+sep+'任务\r\n'));for(const value of ['00123','9007199254740993123','=SUM(A1:A2)','\r\n'])assert.ok(text.includes(value))}
}
