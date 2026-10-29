import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {positionDraft} from './structured-source-position-fixture.mjs'
export const selectiveReplacementChecks=['json-replacement-preview','yaml-replacement-preview','xml-replacement-preview','toml-replacement-preview','cross-page-selection-refresh-all-none-and-cancel','scoped-selected-captures-and-skipped-text','apply-focus-immediate-undo-redo-and-explicit-save','owner-switch-and-readonly-preview','wide-narrow-preview-and-other-drafts']
export const selectiveReplacementOutputFiles=['installed-v138-selection-observations.json',...['json','yaml','xml','toml'].map(mode=>'installed-v138-saved.'+mode)]
export const selectiveReplacementOutput=mode=>positionDraft(mode).replace(/我的草稿 ([35])(?!\d)/g,'确认 $1')
export function validateInstalledSelectiveReplacement(r,m){
 assert.equal(m.appVersion,'1.3.8');for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-selective-replacement-trusted-input-and-output-bytes');assert.equal(r.inputProtocol,'trusted-keyboard-and-pointer')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),selectiveReplacementChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>20&&r.inputTrace.every(e=>e.trusted)&&r.inputTrace.some(e=>e.type==='keydown'))
 for(const k of ['otherDraftsPreserved','disposableDraftsExplicitlySaved'])assert.equal(r[k],true,k)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.deepEqual(r.modes.map(e=>e.mode),['json','yaml','xml','toml'])
 for(const e of r.modes)for(const k of ['crossPageSelectionExact','allNoneProtected','refreshResetsSelection','applyFocusExact','pagedBeforeAfterExact','cancelDraftExact','scopedCapturesExact','applyUndoRedoExact','explicitSaveExact','ownerResetExact','readOnlyExact'])assert.equal(e[k],true,e.mode+' '+k)
}
export function assertSelectiveReplacementOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),selectiveReplacementOutputFiles)
 for(const o of r.outputs){const bytes=read(o.fileName);assert.equal(bytes.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),o.sha256)}
 const observations=JSON.parse(read(selectiveReplacementOutputFiles[0]).toString('utf8'));for(const id of selectiveReplacementChecks)assert.equal(observations[id],true)
 for(const[mode,index]of ['json','yaml','xml','toml'].map((mode,i)=>[mode,i+1]))assert.equal(read(selectiveReplacementOutputFiles[index]).toString('utf8'),'\uFEFF'+selectiveReplacementOutput(mode).replaceAll('\n','\r\n'))
}
