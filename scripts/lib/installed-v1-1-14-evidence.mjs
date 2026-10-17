import assert from 'node:assert/strict'
export const writingDeliveryChecks=['installed-identity-and-owned-fixtures','native-template-title-fields-and-target','unsaved-draft-preview-not-disk','native-bitmap-picker-relative-reference','native-html-picker-and-embedded-resources','standalone-html-reopens-without-original-folder','native-cancel-remains-cancel-not-failure','native-markdown-body-only-output','native-print-creates-real-pdf','printed-pdf-reopens-with-text-pages-and-ink','draft-source-shared-and-unselected-bytes-preserved','real-input-no-errors-and-original-mode-restored']
export function validateInstalledWritingDelivery(report,manifest){
 assert.equal(manifest.appVersion,'1.1.14');assert.equal(report.appVersion,manifest.appVersion);assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 for(const key of ['sourceCommit','harnessSourceCommit'])assert.match(report[key],/^[a-f0-9]{40}$/)
 assert.match(report.executableSha256,/^[a-f0-9]{64}$/);assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-writing-native-pickers-print-and-disk')
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false,key)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),writingDeliveryChecks.map(id=>[id,'passed']))
 for(const key of ['templateCreatedWithParameters','previewIncludesUnsavedDraft','relativeImageInserted','htmlCarriesLocalImages','markdownMatchesDraft','draftStillDirty','nativePdfHasOnlyArticle','pdfLastSectionVisible','originalModeRestored'])assert.equal(report[key],true,key)
 for(const key of ['source','shared','unselected'])assert.equal(report[key+'Before'],report[key+'After'])
 assert.equal(report.htmlSha256,report.movedHtmlSha256);assert.equal(report.previewSha256,report.htmlSha256)
 assert.equal(report.templateBody,'# 用户填写的文章\n作者：小林 {{time}}\n未知：{{keep}}\n')
 assert.equal(report.standalone.nativeBridgeMocked,false);assert.equal(report.standalone.scripts,0);assert.equal(report.standalone.temporarySources,0);assert.ok(report.standalone.text.includes('这篇交付方案仍未保存'))
 assert.ok(report.standalone.images.length>=2);assert.ok(report.standalone.images.every(i=>i.embedded&&i.width===240&&i.height===100))
 for(const field of ['imagePicker','htmlPicker','markdownPicker']){assert.equal(report[field].status,'selected-real-native-dialog');assert.equal(report[field].dialogClosed,true);assert.equal(report[field].desktopUserSession,'disposable-github-hosted');assert.ok(report[field].processId>0)}
 assert.equal(report.cancelPicker.status,'cancelled-real-native-dialog');assert.equal(report.cancelPicker.dialogClosed,true);assert.equal(report.cancelCreatedFile,false)
 assert.equal(report.nativePrint.status,'saved-real-native-print-pdf');assert.equal(report.nativePrint.desktopUserSession,'disposable-github-hosted');assert.match(report.nativePrint.sha256,/^[a-f0-9]{64}$/);assert.ok(report.nativePrint.sizeBytes>1000)
 assert.ok(report.pdfPages>=2);assert.ok(report.pdfText.includes('这篇交付方案仍未保存'));assert.ok(!report.pdfText.includes('快速笔记'));assert.ok(report.pdfInk>0)
 assert.equal(report.inputTrace.every(e=>e.trusted),true);for(const type of ['click','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted))
 assert.deepEqual(report.runtimeErrors,[])
}
