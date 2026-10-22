import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const structuredChecks=['json-source-save-reopen','json-conflict-copy-keeps-original-and-draft','yaml-source-save-reopen','yaml-conflict-copy-keeps-original-and-draft','xml-source-save-reopen','xml-conflict-copy-keeps-original-and-draft','toml-source-save-reopen','toml-conflict-copy-keeps-original-and-draft','json-format-preview-cancel-apply-undo','json-pointer-context-source-navigation','reload-cancel-and-native-failure-keeps-draft','independent-structured-output-inspection','trusted-input-unselected-and-shortcut-preserved']
export function validateInstalledStructured(report,manifest){
 assert.ok(['1.1.20','1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2'].includes(manifest.appVersion));assert.equal(report.appVersion,manifest.appVersion);assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 for(const key of ['sourceCommit','harnessSourceCommit'])assert.match(report[key],/^[a-f0-9]{40}$/)
 assert.match(report.executableSha256,/^[a-f0-9]{64}$/);assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-structured-editors-and-original-output-bytes')
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false,key)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),structuredChecks.map(id=>[id,'passed']))
 for(const key of ['saveExact','reopenExact','conflictOriginalExact','conflictDraftExact','copyExact'])for(const mode of ['json','yaml','xml','toml'])assert.equal(report[key]?.[mode],true,key+' '+mode)
 for(const key of ['formatCancelExact','formatApplyExact','formatUndoExact','pointerNavigationExact','navigationSourceExact','contextNavigationExact','reloadCancelExact','reloadFailureExact','shortcutExclusive'])assert.equal(report[key],true,key)
 assert.equal(report.unselectedBefore,report.unselectedAfter);assert.match(report.unselectedBefore,/^[a-f0-9]{64}$/);assert.deepEqual(report.runtimeErrors,[])
 for(const type of ['click','pointerdown','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted),type)
 assert.ok(report.inputTrace.every(e=>e.trusted));assert.ok(!report.uiMessages.some(t=>t.includes('当前文件没有文本写入适配器')))
 assert.equal(report.inspection.status,'passed');assert.equal(report.inspection.reader,'stdlib-json-tomllib-defusedxml-and-exact-yaml-bytes');assert.equal(report.inspection.nativeBridgeMocked,false)
 assert.equal(report.outputs.length,9);assert.equal(new Set(report.outputs.map(f=>f.fileName)).size,9)
 for(const output of report.outputs){assert.match(output.fileName,/^installed-v1120-(?:(?:json|yaml|xml|toml)-(?:saved|copy)\.(?:jsonc|yaml|xml|toml)|unselected\.md)$/);assert.match(output.sha256,/^[a-f0-9]{64}$/);assert.ok(output.sizeBytes>0);const checked=report.inspection.outputs.find(o=>o.fileName===output.fileName);assert.equal(checked?.sha256,output.sha256);assert.equal(checked?.sizeBytes,output.sizeBytes)}
}
export function assertStructuredOutputBytes(report,read){for(const item of report.outputs){const bytes=read(item.fileName);assert.equal(bytes.length,item.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256)}}
