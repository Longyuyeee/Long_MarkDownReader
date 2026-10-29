import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {positionDraft} from './structured-source-position-fixture.mjs'
export const replacementPreviewChecks=['json-replacement-preview','yaml-replacement-preview','xml-replacement-preview','toml-replacement-preview','paged-before-after-and-cancel-preserves-draft','scoped-regex-captures-and-native-replacement','apply-one-undo-redo-and-explicit-save','owner-switch-and-readonly-preview','wide-narrow-preview-and-other-drafts']
export const replacementPreviewOutputFiles=['installed-v137-preview-observations.json',...['json','yaml','xml','toml'].map(mode=>'installed-v137-saved.'+mode)]
export const replacementPreviewOutput=mode=>positionDraft(mode).replace(/我的草稿 ([345])(?!\d)/g,'确认 $1')
export function validateInstalledReplacementPreview(r,m){
 assert.ok(['1.3.7','1.3.8', '1.3.9', '1.3.10', '1.3.11', '1.3.12', '1.3.13'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-replacement-preview-trusted-input-and-output-bytes');assert.equal(r.inputProtocol,'trusted-keyboard-and-pointer')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),replacementPreviewChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>20&&r.inputTrace.every(e=>e.trusted)&&r.inputTrace.some(e=>e.type==='keydown'))
 for(const k of ['otherDraftsPreserved','disposableDraftsExplicitlySaved'])assert.equal(r[k],true,k)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.deepEqual(r.modes.map(e=>e.mode),['json','yaml','xml','toml'])
 for(const e of r.modes)for(const k of ['pagedBeforeAfterExact','cancelDraftExact','scopedCapturesExact','applyUndoRedoExact','explicitSaveExact','ownerResetExact','readOnlyExact'])assert.equal(e[k],true,e.mode+' '+k)
}
export function assertReplacementPreviewOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),replacementPreviewOutputFiles)
 for(const o of r.outputs){const bytes=read(o.fileName);assert.equal(bytes.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),o.sha256)}
 const observations=JSON.parse(read(replacementPreviewOutputFiles[0]).toString('utf8'));for(const id of replacementPreviewChecks)assert.equal(observations[id],true)
 for(const[mode,index]of ['json','yaml','xml','toml'].map((mode,i)=>[mode,i+1]))assert.equal(read(replacementPreviewOutputFiles[index]).toString('utf8'),'\uFEFF'+replacementPreviewOutput(mode).replaceAll('\n','\r\n'))
}
