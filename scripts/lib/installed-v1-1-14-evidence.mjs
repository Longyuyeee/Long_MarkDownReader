import assert from 'node:assert/strict'
export const writingDeliveryChecks=['installed-identity-and-owned-fixtures','native-template-title-fields-and-target','unsaved-draft-preview-not-disk','native-bitmap-picker-relative-reference','native-html-picker-and-embedded-resources','standalone-html-reopens-without-original-folder','native-cancel-remains-cancel-not-failure','native-markdown-body-only-output','native-print-creates-real-pdf','printed-pdf-reopens-with-text-pages-and-ink','draft-source-shared-and-unselected-bytes-preserved','real-input-no-errors-and-original-mode-restored']
export function validateInstalledWritingDelivery(report,manifest){
 assert.ok(['1.1.14','1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15'].includes(manifest.appVersion));assert.equal(report.appVersion,manifest.appVersion);assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 for(const key of ['sourceCommit','harnessSourceCommit'])assert.match(report[key],/^[a-f0-9]{40}$/)
 assert.match(report.executableSha256,/^[a-f0-9]{64}$/);assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-writing-native-pickers-print-and-disk')
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false,key)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),writingDeliveryChecks.map(id=>[id,'passed']))
 for(const key of ['templateCreatedWithParameters','previewIncludesUnsavedDraft','relativeImageInserted','htmlCarriesLocalImages','markdownMatchesDraft','draftStillDirty','resourceErrorRetainedAfterMarkdown','nativePdfHasOnlyArticle','pdfLastSectionVisible','originalModeRestored'])assert.equal(report[key],true,key)
 assert.equal(report.resourceCancelPicker.status,'cancelled-real-native-dialog');assert.equal(report.resourceCancelPicker.dialogClosed,true)
 for(const key of ['source','shared','unselected'])assert.equal(report[key+'Before'],report[key+'After'])
 assert.equal(report.htmlSha256,report.movedHtmlSha256);assert.equal(report.previewSha256,report.htmlSha256)
 assert.deepEqual(report.previewStructure,{headings:70,tables:70})
 assert.equal(report.templateBody,'# 用户填写的文章\n作者：小林 {{time}}\n未知：{{keep}}\n')
 assert.ok(report.templateMainText.includes('用户填写的文章')&&report.templateMainText.includes('小林 {{time}}'),'a file alone cannot prove the newly created note opens in the main editor')
 assert.equal(report.standalone.nativeBridgeMocked,false);assert.equal(report.standalone.scripts,0);assert.equal(report.standalone.temporarySources,0);assert.ok(report.standalone.text.includes('这篇交付方案仍未保存'))
 assert.ok(report.standalone.images.length>=2);assert.ok(report.standalone.images.every(i=>i.embedded&&i.width===240&&i.height===100))
 for(const field of ['imagePicker','htmlPicker','markdownPicker']){assert.equal(report[field].status,'selected-real-native-dialog');assert.equal(report[field].dialogClosed,true);assert.equal(report[field].desktopUserSession,'disposable-github-hosted');assert.ok(report[field].processId>0)}
 assert.equal(report.cancelPicker.status,'cancelled-real-native-dialog');assert.equal(report.cancelPicker.dialogClosed,true);assert.equal(report.cancelCreatedFile,false)
 assert.equal(report.nativePrint.status,'saved-real-native-print-pdf');assert.equal(report.nativePrint.desktopUserSession,'disposable-github-hosted');assert.match(report.nativePrint.sha256,/^[a-f0-9]{64}$/);assert.ok(report.nativePrint.sizeBytes>1000)
 assert.equal(report.nativePrint.printUiObserved,true);assert.equal(report.nativePrint.selectedDestination,'Save as PDF');assert.equal(report.nativePrint.companionsRestored,true)
 const selection=report.browserPrintSelection;assert.equal(selection.status,'passed');assert.equal(selection.evidenceLevel,'real-WebView2-print-UI-trusted-pointer');assert.equal(selection.sourceCommit,report.sourceCommit);assert.equal(selection.harnessSourceCommit,report.harnessSourceCommit);assert.equal(selection.targetUrl,'edge://print/');assert.equal(selection.selectedLabel,'Save as PDF');assert.equal(selection.nativeBridgeMocked,false);assert.equal(selection.sourceUserContentIncluded,false)
 const direct=selection.inputTrace.filter(e=>['mousedown','click','keydown'].includes(e.type));assert.ok(direct.every(e=>e.trusted));if(selection.initialLabel!=='Save as PDF'){assert.ok(direct.filter(e=>e.type==='mousedown').length>=2);assert.ok(direct.some(e=>e.type==='click'))}
 assert.ok(report.nativePrint.actions.some(action=>action.startsWith('queued-owned-native-print-ui-')||action==='confirmed-owned-native-system-print-dialog-with-PDF-default'))
 if(report.nativePrint.actions.some(action=>action.startsWith('queued-owned-native-print-ui-'))){assert.equal(report.nativePrint.buttonInvocation.started,true);assert.equal(report.nativePrint.buttonInvocation.completed,true);assert.equal(report.nativePrint.buttonInvocation.error,null)}
 assert.equal(report.nativePrint.mainWindow.visibleBeforePrint,true);assert.ok(report.nativePrint.mainWindow.pid>0)
 assert.equal(report.nativePrint.mainWindow.title,'Long编辑·md助手');assert.equal(report.nativePrint.mainWindow.configuredMainTitle,report.nativePrint.mainWindow.title);assert.equal(report.nativePrint.mainWindow.className,'Tauri Window')
 assert.equal(report.nativePrint.mainWindow.foregroundBeforePrint,true)
 assert.deepEqual(report.printViewport,{width:report.nativePrint.mainWindow.clientWidth,height:report.nativePrint.mainWindow.clientHeight});assert.ok(report.printViewport.width>=200&&report.printViewport.height>=200)
 assert.ok(report.pdfPages>=2);assert.ok(report.pdfText.includes('这篇交付方案仍未保存'));assert.ok(!report.pdfText.includes('快速笔记'));assert.ok(report.pdfInk>0);assert.ok(report.pdfColorPixels>100,'actual native PDF must retain the colored image')
 assert.equal(report.inputTrace.every(e=>e.trusted),true);for(const type of ['click','keydown','input','paste'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted))
 assert.deepEqual(report.runtimeErrors,[])
}
