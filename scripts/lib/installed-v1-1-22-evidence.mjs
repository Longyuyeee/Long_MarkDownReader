import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const fileHistoryChecks=['right-click-history-and-search','per-item-restore-keeps-live-draft','single-rename-record','later-edit-refused-without-overwrite','copy-record-is-view-only','other-items-and-drafts-preserved','query-does-not-change-files','same-installed-process-restart-records','restore-after-restart-and-no-repeat','trusted-input-and-exact-output-bytes']
export function validateInstalledFileHistory(report,manifest){
 assert.ok(['1.1.22','1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0'].includes(manifest.appVersion));assert.equal(report.appVersion,manifest.appVersion);assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 for(const key of ['sourceCommit','harnessSourceCommit'])assert.match(report[key],/^[a-f0-9]{40}$/)
 assert.match(report.executableSha256,/^[a-f0-9]{64}$/);assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-file-operation-history-native-input-and-process-restart')
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false,key)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),fileHistoryChecks.map(id=>[id,'passed']))
 for(const key of ['draftPreserved','laterEditPreserved','copyViewOnly','otherDraftsPreserved','queryReadOnly','restartExact','restoreExact','noRepeat'])assert.equal(report[key],true,key)
 assert.deepEqual(report.runtimeErrors,[]);assert.equal(report.processRestart.executableSha256,report.executableSha256);assert.equal(report.processRestart.nativeVersion,report.appVersion)
 for(const type of ['click','pointerdown','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted),type)
 assert.ok(report.inputTrace.every(e=>e.trusted));assert.equal(report.outputs.length,3)
 for(const file of report.outputs){assert.match(file.fileName,/^installed-v1122-(?:draft\.md|later-edit\.txt|restored\.txt)$/);assert.match(file.sha256,/^[a-f0-9]{64}$/);assert.ok(file.sizeBytes>0)}
}
export function assertFileHistoryOutputBytes(report,read){
 const files=new Map();for(const item of report.outputs){const bytes=read(item.fileName);assert.equal(bytes.length,item.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256);files.set(item.fileName,bytes.toString())}
 assert.ok(files.get('installed-v1122-draft.md').includes('需要保留的整理草稿'));assert.equal(files.get('installed-v1122-later-edit.txt'),'后来写入的内容\r\n');assert.equal(files.get('installed-v1122-restored.txt'),'整理前的内容\r\n')
}
