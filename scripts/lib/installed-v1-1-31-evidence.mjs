import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const workbookEntryChecks=['integer-direct-refusal-with-draft-retained','mixed-paste-atomic-rejection','valid-paste-single-undo-redo-formula-bar','correction-preview-cancel','filtered-scope-hidden-rows-and-unknown-rules','unicode-correction-stable-coordinate-undo','date-entry-explicit-save-and-independent-reopen','other-drafts-trusted-input-no-runtime-errors']
export function validateInstalledWorkbookEntry(report,manifest){
 assert.ok(['1.1.31','1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42'].includes(manifest.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(report[k],manifest[k]);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-native-workbook-entry-check-and-correction');assert.match(report.harnessSourceCommit,/^[a-f0-9]{40}$/);assert.match(report.executableSha256,/^[a-f0-9]{64}$/)
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false)
 for(const key of ['directRefused','atomicRefused','undoRedoExact','cancelExact','filteredExact','correctionExact','saveReopenExact','otherDraftsPreserved'])assert.equal(report[key],true,key)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),workbookEntryChecks.map(id=>[id,'passed']));assert.deepEqual(report.runtimeErrors,[])
 assert.ok(report.inputTrace.every(e=>e.trusted));for(const type of ['pointerdown','click','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted))
 for(const text of ['3\t9','3\t0.3'])assert.ok(report.inputTrace.some(e=>e.type==='paste'&&e.text===text&&e.trusted),'Real clipboard event: '+text)
}
export function assertWorkbookEntryOutputBytes(report,read){
 const names=['before.xlsx','saved.xlsx','scope.json','inspection.json'].map(n=>'installed-v1131-'+n);assert.deepEqual([...report.outputs.map(o=>o.fileName)].sort(),[...names].sort())
 for(const o of report.outputs){const bytes=read(o.fileName);assert.equal(bytes.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),o.sha256)}
 const a=read(names[0]),b=read(names[1]);for(const bytes of [a,b])assert.equal(bytes.subarray(0,2).toString(),'PK');assert.notDeepEqual(a,b)
 const inspection=JSON.parse(read(names[3]).toString('utf8'));assert.deepEqual(inspection,report.inspection);assert.equal(inspection.status,'passed');assert.equal(inspection.beforeSha256,crypto.createHash('sha256').update(a).digest('hex'));assert.equal(inspection.sha256,crypto.createHash('sha256').update(b).digest('hex'))
 assert.deepEqual(inspection.sheetNames,['录入','保留','Options']);assert.deepEqual(inspection.values,{A2:1.5,B2:0.1,C2:'😀字',D2:'2026-10-23 00:00:00',A5:'未保存保护三一',E4:'=A4'})
 assert.equal(JSON.parse(read(names[2]).toString('utf8')).text,report.scopeText);assert.ok(report.scopeText.includes('录入!A2')&&report.scopeText.includes('录入!C2'));assert.ok(!report.scopeText.includes('录入!A3'))
}
