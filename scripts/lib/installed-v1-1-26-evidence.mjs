import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {structuredHistoryFixtures,structuredHistoryBytes} from './structured-history-fixture.mjs'
export const structuredHistoryChecks=['file-more-and-nested-flyouts-pointer-reachable','folder-new-flyout-pointer-reachable','four-format-original-and-saved-history','partial-restore-retains-other-draft-and-one-undo','whole-restore-cancel-confirm-and-one-undo','history-copy-preserves-extension-bom-comments','explicit-save-reopen-exact-source','changed-disk-blocks-stale-restore','other-drafts-and-exact-output-bytes']
export function validateInstalledStructuredHistory(report,manifest){
 assert.ok(['1.1.26','1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32'].includes(manifest.appVersion));assert.equal(report.appVersion,manifest.appVersion);assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 for(const k of ['sourceCommit','harnessSourceCommit'])assert.match(report[k],/^[a-f0-9]{40}$/);assert.match(report.executableSha256,/^[a-f0-9]{64}$/)
 assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-structured-history-trusted-ui-and-output-bytes');for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[k],false)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),structuredHistoryChecks.map(id=>[id,'passed']));assert.deepEqual(report.runtimeErrors,[])
 for(const k of ['fileFlyoutExact','folderFlyoutExact','otherDraftsPreserved'])assert.equal(report[k],true,k)
 assert.deepEqual(report.modes.map(m=>m.mode),structuredHistoryFixtures.map(s=>s[0]));for(const mode of report.modes)for(const k of ['savedHistoryExact','partialExact','partialUndoExact','cancelExact','fullExact','fullUndoExact','copyExact','savedExact','reopenExact','staleBlocked'])assert.equal(mode[k],true,mode.mode+' '+k)
 for(const type of ['pointerdown','click','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted));assert.ok(report.inputTrace.every(e=>e.trusted));assert.equal(report.outputs.length,12)
 for(const o of report.outputs){assert.match(o.fileName,/^installed-v1126-(?:json|yaml|xml|toml)-(?:saved|copy|external)\.(?:jsonc|yaml|xml|toml)$/);assert.ok(o.sizeBytes>0);assert.match(o.sha256,/^[a-f0-9]{64}$/)}
}
export function assertStructuredHistoryOutputBytes(report,read){
 for(const o of report.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 for(const[mode,ext,source]of structuredHistoryFixtures){const current=source.replace('初稿','新稿').replace('保留"','后续输入"').replace('other: 保留','other: 后续输入').replace('<other>保留','<other>后续输入');for(const[suffix,expected]of [['copy',source],['saved',current],['external',current.replace('新稿','磁盘改动')]])assert.deepEqual(read(`installed-v1126-${mode}-${suffix}.${ext}`),structuredHistoryBytes(expected),mode+' '+suffix)}
}
