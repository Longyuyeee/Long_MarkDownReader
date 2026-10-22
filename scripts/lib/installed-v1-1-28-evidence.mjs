import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {referenceRepairFixture,repairTail,repairText} from './reference-repair-fixture.mjs'
export const referenceRepairChecks=['native-source-and-locator-status','relationship-preview-cancel','stale-relationship-retains-new-note','repair-only-selected-endpoint','pinned-reference-recovers-through-menu','inline-source-draft-undo-redo','trusted-input-and-no-runtime-errors']
export function validateInstalledReferenceRepair(report,manifest){
 assert.ok(['1.1.28','1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7'].includes(manifest.appVersion));assert.equal(report.appVersion,manifest.appVersion);assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-trusted-input-native-reference-and-relationship-repair')
 assert.match(report.harnessSourceCommit,/^[a-f0-9]{40}$/);assert.match(report.executableSha256,/^[a-f0-9]{64}$/);assert.match(report.fixtureDirectory,/^000-v1128-reference-[a-f0-9-]{36}$/)
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false)
 for(const key of ['locatorChecksExact','cancelExact','staleRejected','relationExact','pinnedExact','otherDraftsPreserved','draftOnly','undoExact','redoExact','modeRestored'])assert.equal(report[key],true,key)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),referenceRepairChecks.map(id=>[id,'passed']));assert.equal(report.outputs.length,6)
 for(const type of ['pointerdown','click','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted));assert.ok(report.inputTrace.every(e=>e.trusted));assert.deepEqual(report.runtimeErrors,[])
}
export function assertReferenceRepairOutputBytes(report,read){
 for(const item of report.outputs){const bytes=read(item.fileName);assert.equal(bytes.length,item.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256)}
 const fixture=referenceRepairFixture(report.fixtureDirectory),before=read('installed-v1128-draft-before.md').toString('utf8'),after=read('installed-v1128-draft-after.md').toString('utf8')
 assert.deepEqual(read('installed-v1128-note.md'),Buffer.from(fixture.note));assert.deepEqual(read('installed-v1128-source.txt'),Buffer.from(repairText));assert.ok(before.includes(repairTail));assert.ok(before.includes('[示例]('+fixture.uri+')'));assert.equal(after,before.replace(fixture.uri,fixture.nextUri))
 const previous=JSON.parse(read('installed-v1128-relations-before.json').toString('utf8')),next=JSON.parse(read('installed-v1128-relations-after.json').toString('utf8'));assert.equal(previous.version,1);assert.equal(next.version,1)
 const a=previous.relations.find(e=>e.id===report.relationId),b=next.relations.find(e=>e.id===report.relationId);assert.ok(a&&b);assert.equal(a.note,'另一个窗口的说明');assert.equal(a.relation_type||a.relationType,'cites')
 assert.equal(a.targetPath,report.fixtureDirectory+'/旧目录/资料.txt');assert.equal(b.targetPath,report.fixtureDirectory+'/新目录/资料.txt');assert.deepEqual({...b,targetPath:a.targetPath},a);assert.deepEqual(next.relations.filter(e=>e.id!==report.relationId),previous.relations.filter(e=>e.id!==report.relationId))
}
