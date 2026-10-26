import assert from 'node:assert/strict'
export const workSessionChecks=[
 'installed-runtime-and-real-native-bridge',
 'native-picker-import-previews-partial-record-without-opening',
 'same-source-reimport-is-idempotent',
 'actual-dirty-editor-preserved-by-partial-restore',
 'native-relocation-repairs-record-not-document',
 'native-picker-export-default-excludes-private-context',
 'existing-export-and-invalid-import-preserve-bytes',
 'forty-reading-positions-first-and-last-consumed-by-real-editor',
 'reload-retains-named-record-and-unopened-reading-metadata',
 'secondary-window-rejects-all-four-session-commands',
 'all-source-bytes-unchanged-until-explicit-save',
 'trusted-input-and-normal-dialog-layout-without-global-errors',
]
export function validateInstalledWorkSession(report,manifest,{beforeProcessRestart=false}={}){
 assert.ok(['1.1.9','1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36'].includes(manifest.appVersion));assert.equal(report.appVersion,manifest.appVersion);assert.equal(report.sourceCommit,manifest.sourceCommit)
 assert.equal(report.installerSha256,manifest.artifacts.find(item=>item.target==='nsis')?.sha256)
 for(const key of ['sourceCommit','harnessSourceCommit'])assert.match(report[key],/^[a-f0-9]{40}$/)
 assert.match(report.executableSha256,/^[a-f0-9]{64}$/);assert.equal(report.status,'passed')
 assert.equal(report.evidenceLevel,'installed-webview-input-native-picker-and-disk');assert.equal(report.sourceUserContentIncluded,false);assert.equal(report.nativeBridgeMocked,false)
 assert.equal(report.desktopInputUsed,false);assert.equal(report.nativePickerScope,'disposable-github-hosted-owned-process')
 assert.deepEqual(report.checks.map(check=>[check.id,check.status]),workSessionChecks.map(id=>[id,'passed']))
 assert.ok(report.inputTrace.length>0&&report.inputTrace.every(event=>event.trusted===true))
 for(const type of ['click','keydown','input'])assert.ok(report.inputTrace.some(event=>event.type===type))
 assert.ok(report.nativePickers.length>=5&&report.nativePickers.every(item=>item.status==='selected-real-native-dialog'&&item.processId>0&&item.selectedPath&&item.title&&['Windows-UIAutomation-ValuePattern-and-InvokePattern','Windows-Win32-filename-character-input-and-OK-notification'].includes(item.method)))
 for(const picker of report.nativePickers)if(picker.method==='Windows-Win32-filename-character-input-and-OK-notification'){assert.equal(picker.inputCharacters,picker.selectedPath.length);assert.ok(picker.dialogProcessId>0&&['1001','1148','1152'].includes(picker.fileNameAutomationId))}
 assert.equal(report.positions.count,40);assert.ok(Math.abs(report.positions.first-340)<3&&Math.abs(report.positions.last-457)<3);assert.equal(report.positions.afterReload,457)
 assert.ok(report.draftChecks.length>=2&&report.draftChecks.every(item=>item.dirty&&item.exactModel&&item.sha256===report.draftSha256))
 assert.equal(report.quickBridgeReady,true);assert.deepEqual(report.quickDenials.map(item=>item.command),['read_work_session_bundle','export_work_session_bundle','preflight_work_session','locate_work_session_file']);assert.ok(report.quickDenials.every(item=>item.rejected&&/主工作台/.test(item.error)))
 assert.ok(report.sourceFiles.length>=42);assert.equal(report.beforeExplicitSave.length,report.sourceFiles.length)
 assert.equal(report.explicitSave.afterAllDraftChecks,true);assert.match(report.explicitSave.after,/^[a-f0-9]{64}$/)
 for(const file of report.sourceFiles){assert.match(file.before,/^[a-f0-9]{64}$/);assert.equal(report.beforeExplicitSave.find(item=>item.path===file.path)?.sha256,file.before);assert.equal(file.after,file.path===report.explicitSave.path?report.explicitSave.after:file.before)}
 assert.deepEqual(report.runtimeErrors,[]);assert.equal(report.errorOverlay,false)
 if(!beforeProcessRestart){assert.equal(report.processRestart?.status,'passed');assert.equal(report.processRestart.executableSha256,report.executableSha256);assert.equal(report.processRestart.nativeVersion,report.appVersion);assert.equal(report.processRestart.sceneFiles,41);assert.ok(Math.abs(report.processRestart.first-340)<3&&Math.abs(report.processRestart.last-457)<3)}
}
