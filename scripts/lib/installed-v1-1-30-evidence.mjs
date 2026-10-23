import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {validationTableFixture,validationCsv} from './table-validation-fixture.mjs'
export const tableValidationChecks=['column-rules-are-reversible-drafts','filtered-correction-preview-cancel','stable-row-bulk-correction-single-undo-redo','explicit-save-reopen-retains-rules-and-values','invalid-correction-refused-locally','csv-temporary-rules-and-protected-conversion','workbook-single-and-paste-list-consistency','other-drafts-trusted-input-and-no-runtime-errors']
export function validateInstalledTableValidation(report,manifest){
 assert.ok(['1.1.30','1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9'].includes(manifest.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(report[k],manifest[k]);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-native-table-rules-correction-and-workbook-input');assert.match(report.harnessSourceCommit,/^[a-f0-9]{40}$/);assert.match(report.executableSha256,/^[a-f0-9]{64}$/)
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false)
 for(const key of ['ruleDraftExact','ruleUndoExact','cancelExact','correctionExact','undoExact','redoExact','saveReopenExact','invalidRefused','csvTemporary','csvUnchanged','conversionExact','workbookConsistent','otherDraftsPreserved'])assert.equal(report[key],true,key)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),tableValidationChecks.map(id=>[id,'passed']));assert.equal(report.outputs.length,8);assert.deepEqual(report.runtimeErrors,[])
 assert.ok(report.inputTrace.every(e=>e.trusted));for(const type of ['pointerdown','click','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted))
 for(const text of ['规则外三零','已完成'])assert.ok(report.inputTrace.some(e=>e.type==='paste'&&e.text===text&&e.trusted),'Real clipboard event: '+text)
}
export function assertTableValidationOutputBytes(report,read){
 const names=['table-before.json','table-saved.json','draft-before.json','draft-after.json','csv-before.csv','converted.table.json','workbook-before.xlsx','workbook-after.xlsx'].map(n=>'installed-v1130-'+n)
 assert.deepEqual([...report.outputs.map(o=>o.fileName)].sort(),[...names].sort())
 for(const o of report.outputs){const bytes=read(o.fileName);assert.equal(bytes.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),o.sha256)}
 const parse=n=>JSON.parse(read('installed-v1130-'+n).toString('utf8')),before=parse('table-before.json'),saved=parse('table-saved.json');assert.deepEqual(before,validationTableFixture());assert.equal(saved.schemaVersion,2)
 assert.deepEqual(saved.data.columns.map(c=>[c.id,c.name]),before.data.columns.map(c=>[c.id,c.name]));assert.deepEqual(saved.data.columns[1].validation,{kind:'options',required:true,options:['已完成']})
 const rows=new Map(saved.data.rows.map(r=>[r.id,r.values]));assert.deepEqual(rows.get('r-hidden'),before.data.rows[1].values);assert.deepEqual(rows.get('r-a'),{task:'会议',state:'已完成',code:'00077'});assert.deepEqual(rows.get('r-b'),{task:'文档',state:'已完成',code:'00002'})
 const draftBefore=parse('draft-before.json'),draftAfter=parse('draft-after.json');assert.equal(draftBefore.length,3);assert.equal(draftAfter.length,3);for(const r of draftBefore){const after=draftAfter.find(a=>a.id===r.id);assert.ok(after);const expected=[...r.values];if(r.id!=='r-hidden')expected[1]='已完成';assert.deepEqual(after.values,expected)}
 assert.equal(read('installed-v1130-csv-before.csv').toString('utf8'),validationCsv);const converted=parse('converted.table.json');assert.equal(converted.schemaVersion,2);assert.deepEqual(converted.data.columns[1].validation,{kind:'options',required:true,options:['待处理']});assert.equal(converted.data.rows[0].values[converted.data.columns[2].id],'00123');assert.equal(converted.data.rows[1].values[converted.data.columns[2].id],'9007199254740993123')
 assert.deepEqual(read('installed-v1130-workbook-before.xlsx'),read('installed-v1130-workbook-after.xlsx'));assert.equal(read('installed-v1130-workbook-before.xlsx').subarray(0,2).toString(),'PK')
}
