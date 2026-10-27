import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const contextCommandChecks=['chinese-attachment-command-opens-original-dialog','attachment-path-has-no-device-prefix','history-command-preserves-unsaved-note','table-command-opens-entry-check','workbook-command-opens-selected-check','structured-command-opens-source-history','pdf-commands-filter-unsupported-actions','drafts-disk-and-preferences-preserved']
export const contextCommandOutputNames=['before.md','draft.md','observations.json'].map(n=>'installed-v1136-'+n)
export function validateInstalledContextCommands(report,manifest){
 assert.ok(['1.1.36','1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0'].includes(manifest.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(report[k],manifest[k]);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-context-command-trusted-ui-and-output-bytes')
 for(const [k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(report[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[k],false)
 assert.equal(report.editorModeAfter,report.editorModeBefore);assert.deepEqual(report.checks.map(c=>[c.id,c.status]),contextCommandChecks.map(id=>[id,'passed']));assert.deepEqual(report.runtimeErrors,[])
 assert.ok(report.inputTrace.length>10&&report.inputTrace.every(e=>e.trusted));for(const type of ['click','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type))
}
export function assertContextCommandOutputBytes(report,read){
 assert.deepEqual(report.outputs.map(o=>o.fileName).sort(),[...contextCommandOutputNames].sort())
 for(const o of report.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const text=n=>read('installed-v1136-'+n).toString('utf8'),observed=JSON.parse(text('observations.json'))
 assert.equal(text('before.md'),'# 操作入口\n\n磁盘原文。\n\n[附件](attachment.txt)\n')
 assert.ok(text('draft.md').includes('命令前的未保存正文'))
 for(const k of ['attachmentOpened','pathClean','historyDraftExact','tableChecked','workbookChecked','structuredHistory','pdfFiltered','otherDraftsExact','diskUnchanged'])assert.equal(observed[k],true,k)
}
