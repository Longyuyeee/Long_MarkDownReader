import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {positionDraft} from './structured-source-position-fixture.mjs'
export const recentSearchChecks=['json-replacement-preview','yaml-replacement-preview','xml-replacement-preview','toml-replacement-preview','used-only-history-and-clear','cross-file-condition-reuse-with-current-scope','apply-focus-immediate-undo-redo-and-explicit-save','owner-switch-and-readonly-preview','wide-narrow-recent-conditions-and-other-drafts']
export const recentSearchOutputFiles=['installed-v139-recent-observations.json',...['json','yaml','xml','toml'].map(mode=>'installed-v139-saved.'+mode)]
export const recentSearchOutput=mode=>positionDraft(mode).replace(/我的草稿 ([35])(?!\d)/g,'确认 $1')
export function validateInstalledRecentSearch(r,m){
 assert.ok(['1.3.9','1.3.10', '1.3.11', '1.3.12', '1.3.13'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-recent-search-trusted-input-and-output-bytes');assert.equal(r.inputProtocol,'trusted-keyboard-and-pointer')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),recentSearchChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>20&&r.inputTrace.every(e=>e.trusted)&&r.inputTrace.some(e=>e.type==='keydown'))
 for(const k of ['otherDraftsPreserved','disposableDraftsExplicitlySaved'])assert.equal(r[k],true,k)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.deepEqual(r.modes.map(e=>e.mode),['json','yaml','xml','toml'])
 for(const e of r.modes)for(const k of ['onlyUsedExact','crossFileRecentExact','noAutoApplyOrFocusExact','clearPreservesDraftExact','checkboxQueryExact','crossPageSelectionExact','allNoneProtected','refreshResetsSelection','applyFocusExact','pagedBeforeAfterExact','cancelDraftExact','scopedCapturesExact','applyUndoRedoExact','explicitSaveExact','ownerResetExact','readOnlyExact'])assert.equal(e[k],true,e.mode+' '+k)
}
export function assertRecentSearchOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),recentSearchOutputFiles)
 for(const o of r.outputs){const bytes=read(o.fileName);assert.equal(bytes.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),o.sha256)}
 const observations=JSON.parse(read(recentSearchOutputFiles[0]).toString('utf8'));for(const id of recentSearchChecks)assert.equal(observations[id],true)
 for(const[mode,index]of ['json','yaml','xml','toml'].map((mode,i)=>[mode,i+1]))assert.equal(read(recentSearchOutputFiles[index]).toString('utf8'),'\uFEFF'+recentSearchOutput(mode).replaceAll('\n','\r\n'))
}
