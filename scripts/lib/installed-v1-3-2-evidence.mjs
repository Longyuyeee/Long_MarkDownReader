import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {outlineNavigationDraft} from './structured-outline-navigation-fixture.mjs'
export const outlineNavigationChecks=['json-path-keyboard-and-current-source-range','yaml-outline-keyboard-and-current-source-range','xml-outline-keyboard-and-current-source-range','toml-outline-keyboard-and-current-source-range','filter-empty-list-and-input-shortcut-scope','file-switch-clears-old-selection-and-preserves-unsaved-drafts','wide-narrow-library-outline-and-context-menu','explicit-save-exact-bytes-prior-drafts-and-no-runtime-error']
export const outlineNavigationOutputFiles=['installed-v132-outline-observations.json',...['json','yaml','xml','toml'].map(mode=>'installed-v132-saved.'+mode)]
export function validateInstalledOutlineNavigation(r,m){
 assert.ok(['1.3.2','1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9', '1.3.10', '1.3.11', '1.3.12'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-outline-navigation-trusted-input-and-output-bytes')
 assert.equal(r.inputProtocol,'leading-empty-lines-use-trusted-enter')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),outlineNavigationChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>20&&r.inputTrace.every(e=>e.trusted)&&r.inputTrace.some(e=>e.type==='keydown'))
 assert.equal(r.otherDraftsPreserved,true);assert.equal(r.disposableDraftsExplicitlySaved,true);assert.deepEqual(r.viewportWidths,[1280,800])
 assert.deepEqual(r.modes.map(entry=>entry.mode),['json','yaml','xml','toml'])
 for(const entry of r.modes)for(const k of ['keyboardExact','currentRangeExact','filterExact','editorInputScoped','switchDraftExact','savedExact'])assert.equal(entry[k],true,entry.mode+' '+k)
}
export function assertOutlineNavigationOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),outlineNavigationOutputFiles)
 for(const o of r.outputs){const bytes=read(o.fileName);assert.equal(bytes.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(outlineNavigationOutputFiles[0]).toString('utf8'));for(const check of outlineNavigationChecks)assert.equal(obs[check],true)
 for(const[mode,index]of ['json','yaml','xml','toml'].map((mode,i)=>[mode,i+1]))assert.equal(read(outlineNavigationOutputFiles[index]).toString('utf8'),'\uFEFF'+outlineNavigationDraft(mode).replaceAll('\n','\r\n'))
}
