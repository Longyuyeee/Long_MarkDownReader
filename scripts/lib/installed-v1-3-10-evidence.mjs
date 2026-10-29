import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {positionDraft} from './structured-source-position-fixture.mjs'
export const sourceMatchesChecks=['json-match-locations','yaml-match-locations','xml-match-locations','toml-match-locations','paged-keyboard-and-pointer-navigation','selection-scope-and-cancel','navigation-preserves-undo-and-explicit-save','owner-switch-and-readonly-matches','wide-narrow-matches-and-other-drafts']
export const sourceMatchesOutputFiles=['installed-v1310-matches-observations.json',...['json','yaml','xml','toml'].map(mode=>'installed-v1310-saved.'+mode)]
export function validateInstalledSourceMatches(r,m){
 assert.ok(['1.3.10','1.3.11', '1.3.12', '1.3.13', '1.3.14'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-search-matches-trusted-input-and-output-bytes');assert.equal(r.inputProtocol,'trusted-keyboard-and-pointer')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),sourceMatchesChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>20&&r.inputTrace.every(e=>e.trusted)&&r.inputTrace.some(e=>e.type==='keydown'))
 for(const k of ['otherDraftsPreserved','disposableDraftsExplicitlySaved'])assert.equal(r[k],true,k)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.deepEqual(r.modes.map(e=>e.mode),['json','yaml','xml','toml'])
 for(const e of r.modes)for(const k of ['pagedExact','navigationExact','undoRedoExact','cancelExact','scopeExact','explicitSaveExact','ownerResetExact','readOnlyExact'])assert.equal(e[k],true,e.mode+' '+k)
}
export function assertSourceMatchesOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),sourceMatchesOutputFiles)
 for(const o of r.outputs){const bytes=read(o.fileName);assert.equal(bytes.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),o.sha256)}
 const observations=JSON.parse(read(sourceMatchesOutputFiles[0]).toString('utf8'));for(const id of sourceMatchesChecks)assert.equal(observations[id],true)
 for(const[mode,index]of ['json','yaml','xml','toml'].map((mode,i)=>[mode,i+1]))assert.equal(read(sourceMatchesOutputFiles[index]).toString('utf8'),'\uFEFF'+positionDraft(mode).replaceAll('\n','\r\n'))
}
