import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {positionSource} from './structured-source-position-fixture.mjs'
export const sourceSearchChecks=['json-search-and-replace-inputs','yaml-search-and-replace-inputs','xml-search-and-replace-inputs','toml-search-and-replace-inputs','closed-panel-and-selected-text-priority','inline-query-feedback-and-current-body-matches','replace-undo-redo-explicit-save-and-prior-drafts','real-rename-close-and-readonly-ownership','wide-narrow-current-search-controls-and-no-runtime-error']
export const sourceSearchOutputFiles=['installed-v135-search-observations.json',...['json','yaml','xml','toml'].map(mode=>'installed-v135-saved.'+mode)]
export function validateInstalledSourceSearch(r,m){
 assert.ok(['1.3.5','1.3.6', '1.3.7', '1.3.8'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-source-search-trusted-input-and-output-bytes');assert.equal(r.inputProtocol,'trusted-keyboard-and-pointer')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),sourceSearchChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>20&&r.inputTrace.every(e=>e.trusted)&&r.inputTrace.some(e=>e.type==='keydown'))
 for(const k of ['otherDraftsPreserved','disposableDraftsExplicitlySaved'])assert.equal(r[k],true,k)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.deepEqual(r.modes.map(e=>e.mode),['json','yaml','xml','toml'])
 for(const e of r.modes)for(const k of ['inputsExact','closedPanelExact','selectedTextPriority','inlineFeedback','changedBodyRecomputed','replaceUndoRedoExact','explicitSaveExact','renameExact','closeResetExact','readOnlyExact','filterFocusPreserved'])assert.equal(e[k],true,e.mode+' '+k)
}
export function assertSourceSearchOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),sourceSearchOutputFiles)
 for(const o of r.outputs){const bytes=read(o.fileName);assert.equal(bytes.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),o.sha256)}
 const observations=JSON.parse(read(sourceSearchOutputFiles[0]).toString('utf8'));for(const id of sourceSearchChecks)assert.equal(observations[id],true)
 for(const[mode,index]of ['json','yaml','xml','toml'].map((mode,i)=>[mode,i+1]))assert.equal(read(sourceSearchOutputFiles[index]).toString('utf8'),'\uFEFF'+positionSource(mode,'新的草稿').replaceAll('\n','\r\n'))
}
