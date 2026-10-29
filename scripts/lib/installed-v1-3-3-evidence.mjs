import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {outlineContinuityDraft} from './structured-outline-continuity-fixture.mjs'
export const outlineContinuityChecks=['json-file-owned-filter-selection-and-draft','yaml-file-owned-filter-selection-and-draft','xml-file-owned-filter-selection-and-draft','toml-file-owned-filter-selection-and-draft','json-tree-mode-and-semantic-collapse-restored','toml-expanded-array-restored-from-current-analysis','clean-close-resets-and-real-rename-retains-reading-state','wide-narrow-library-return-and-existing-context-menu','explicit-save-exact-bytes-prior-drafts-and-no-runtime-error']
export const outlineContinuityOutputFiles=['installed-v133-continuity-observations.json',...['json','yaml','xml','toml'].map(mode=>'installed-v133-saved.'+mode)]
export function validateInstalledOutlineContinuity(r,m){
 assert.ok(['1.3.3','1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-outline-continuity-trusted-input-and-output-bytes');assert.equal(r.inputProtocol,'leading-empty-lines-use-trusted-enter')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),outlineContinuityChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>20&&r.inputTrace.every(e=>e.trusted)&&r.inputTrace.some(e=>e.type==='keydown'))
 for(const k of ['otherDraftsPreserved','disposableDraftsExplicitlySaved','jsonTreeRestored','tomlArraysRestored'])assert.equal(r[k],true,k)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.deepEqual(r.modes.map(e=>e.mode),['json','yaml','xml','toml'])
 for(const e of r.modes)for(const k of ['perFileFilterExact','selectionExact','draftExact','closeResetExact','renameExact','currentRangeExact','savedExact'])assert.equal(e[k],true,e.mode+' '+k)
}
export function assertOutlineContinuityOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),outlineContinuityOutputFiles)
 for(const o of r.outputs){const bytes=read(o.fileName);assert.equal(bytes.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),o.sha256)}
 const observations=JSON.parse(read(outlineContinuityOutputFiles[0]).toString('utf8'));for(const id of outlineContinuityChecks)assert.equal(observations[id],true)
 for(const[mode,index]of ['json','yaml','xml','toml'].map((mode,i)=>[mode,i+1]))assert.equal(read(outlineContinuityOutputFiles[index]).toString('utf8'),'\uFEFF'+outlineContinuityDraft(mode).replaceAll('\n','\r\n'))
}
