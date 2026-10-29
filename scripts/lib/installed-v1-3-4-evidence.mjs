import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {positionDraft} from './structured-source-position-fixture.mjs'
export const sourcePositionChecks=['json-source-selection-scroll-and-draft', 'yaml-source-selection-scroll-and-draft', 'xml-source-selection-scroll-and-draft', 'toml-source-selection-scroll-and-draft', 'outline-and-json-tree-scroll-return', 'explicit-navigation-and-filter-focus-win', 'changed-content-close-and-real-rename-ownership', 'wide-narrow-library-return-and-existing-context-menu', 'explicit-save-exact-bytes-prior-drafts-and-no-runtime-error']
export const sourcePositionOutputFiles=['installed-v134-continuity-observations.json',...['json','yaml','xml','toml'].map(mode=>'installed-v134-saved.'+mode)]
export function validateInstalledSourcePosition(r,m){
 assert.ok(['1.3.4','1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9', '1.3.10', '1.3.11', '1.3.12'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-source-position-trusted-input-and-output-bytes');assert.equal(r.inputProtocol,'trusted-keyboard-and-wheel')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),sourcePositionChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>20&&r.inputTrace.every(e=>e.trusted)&&r.inputTrace.some(e=>e.type==='keydown'))
 for(const k of ['otherDraftsPreserved','disposableDraftsExplicitlySaved','jsonTreeRestored','outlineScrollRestored','explicitNavigationWins','changedContentFallsBack','filterFocusPreserved'])assert.equal(r[k],true,k)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.deepEqual(r.modes.map(e=>e.mode),['json','yaml','xml','toml'])
 for(const e of r.modes)for(const k of ['selectionExact','scrollExact','reverseSelection','outlineScrollExact','draftExact','closeResetExact','renameExact','savedExact'])assert.equal(e[k],true,e.mode+' '+k)
}
export function assertSourcePositionOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),sourcePositionOutputFiles)
 for(const o of r.outputs){const bytes=read(o.fileName);assert.equal(bytes.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),o.sha256)}
 const observations=JSON.parse(read(sourcePositionOutputFiles[0]).toString('utf8'));for(const id of sourcePositionChecks)assert.equal(observations[id],true)
 for(const[mode,index]of ['json','yaml','xml','toml'].map((mode,i)=>[mode,i+1]))assert.equal(read(sourcePositionOutputFiles[index]).toString('utf8'),'\uFEFF'+positionDraft(mode).replaceAll('\n','\r\n'))
}
