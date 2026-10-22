import assert from 'node:assert/strict'
export const workbookEditingChecks=['owned-independent-producer-fixture','quoted-paste-and-whole-undo-redo','literal-text-copy-retains-type','formula-copy-translates-relative-reference','numeric-pointer-fill-and-undo','precise-long-id-sort','filtered-results-only-no-grid-mutation','explicit-native-save-and-reopen','independent-disk-types-and-untouched-parts','independent-producer-reopen-and-app-reopen','formula-cut-preserves-references-and-undo','editing-controls-own-delete-copy-paste-and-return-to-grid','trusted-input-no-overlay-unselected-preserved']
export function validateInstalledWorkbookEditing(report,manifest){
 assert.ok(['1.1.16','1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0'].includes(manifest.appVersion));assert.equal(report.appVersion,manifest.appVersion);assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 for(const key of ['sourceCommit','harnessSourceCommit'])assert.match(report[key],/^[a-f0-9]{40}$/);assert.match(report.executableSha256,/^[a-f0-9]{64}$/)
 assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-workbook-real-clipboard-native-save-and-independent-producer')
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false,key)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),workbookEditingChecks.map(id=>[id,'passed']))
 for(const key of ['pasteUndoExact','literalTextExact','formulaTranslationExact','decimalFillExact','filteredCopyExact','nativeReopenExact','producerAppReopenExact'])assert.equal(report[key],true,key)
 assert.deepEqual(report.navigationOrder,['00007','00124','9007199254740993123','9007199254740993124'])
 assert.equal(report.unselectedBefore,report.unselectedAfter);assert.match(report.unselectedBefore,/^[a-f0-9]{64}$/)
 const disk=report.workbookInspection;assert.equal(disk.status,'passed');assert.equal(disk.nativeBridgeMocked,false);assert.equal(disk.reader,'openpyxl-3.1.5-hash-pinned');assert.match(disk.sha256,/^[a-f0-9]{64}$/)
 assert.equal(disk.beforeSha256,report.sourceBefore);assert.match(report.sourceBefore,/^[a-f0-9]{64}$/)
 assert.equal(report.cutFormulaExact,true)
 assert.equal(report.editControlsProtected,true)
 assert.ok(Array.isArray(report.foregroundBeforePaste)&&report.foregroundBeforePaste.length>0&&report.foregroundBeforePaste.every(value=>value===true),'Real window focus is a precondition, not an emulated clipboard permission')
 for(const [address,value]of Object.entries({C2:'00124',C3:'9007199254740993124',C4:'9007199254740993123',A5:'=保留文本',A6:'=保留文本',D4:'0.3',D6:'=D3+D4'}))assert.equal(disk.cells[address],value)
 for(const address of ['C2','C3','C4','A5','A6'])assert.equal(disk.types[address],'s');assert.equal(disk.types.D4,'n');assert.equal(disk.types.D6,'f');assert.equal(disk.cells.A2.replace(/\r\n/g,'\n'),'会议\n备注');assert.equal(disk.cells.A3,'不要修改')
 assert.deepEqual(disk.preservedParts.map(p=>p.part),['xl/worksheets/sheet2.xml','docProps/core.xml','docProps/app.xml','xl/_rels/workbook.xml.rels','[Content_Types].xml']);for(const p of disk.preservedParts)assert.match(p.sha256,/^[a-f0-9]{64}$/)
 assert.equal(disk.producerReopen.status,'passed');assert.match(disk.producerReopen.sha256,/^[a-f0-9]{64}$/);assert.equal(disk.producerReopen.formulaCalculated,false);assert.equal(disk.producerReopen.officeVisualAcceptance,false)
 assert.deepEqual(report.runtimeErrors,[]);for(const type of ['paste','click','pointerdown'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted),type);assert.ok(report.inputTrace.every(e=>e.trusted))
}
