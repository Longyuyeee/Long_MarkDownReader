import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {linkSourceDraft,linkTargetDraft,linkPlainDraft} from './link-source-fixture.mjs'
export const linkSourceReturnChecks=['markdown-link-roundtrip','both-drafts-and-undo-redo','structured-and-text-targets','wiki-links-return','source-renamed-return','missing-source-local-recovery','source-closed-and-reload-invalidated','readonly-return','wide-narrow-menu']
export const linkSourceReturnOutputFiles=['installed-v1314-links-observations.json','installed-v1314-saved-A.md','installed-v1314-saved-B.md','installed-v1314-saved-D.txt']
export const linkSourceReturnFlags=['positionExact','bothDraftsPreserved','undoRedoExact','linksToStructuredAndText','wikiExact','renamedExact','missingSourceRetryExact','closedAndReloadInvalidated','readOnlyExact','viewportExact']
export function assertLinkSourceInput(trace){
 const native=trace.filter(e=>e.trusted)
 assert.ok(native.length>20&&native.some(e=>e.type==='keydown')&&native.some(e=>e.type==='pointerdown'))
 for(const[index,event]of trace.entries())if(!event.trusted){
  assert.equal(event.type,'click');assert.ok(['undo','redo'].includes(event.editorCommand))
  assert.ok(Number.isInteger(event.keyboardEventIndex)&&event.keyboardEventIndex>=0&&event.keyboardEventIndex<index&&index-event.keyboardEventIndex<5)
  const key=trace[event.keyboardEventIndex]
  assert.equal(key.type,'keydown');assert.equal(key.trusted,true);assert.ok(key.ctrlKey||key.metaKey);assert.ok(['z','y'].includes(key.key?.toLowerCase()))
  assert.equal(event.editorCommand,key.key.toLowerCase()==='y'||key.shiftKey?'redo':'undo')
 }
}
export function validateInstalledLinkSourceReturn(r,m){
 assert.equal(m.appVersion,'1.3.14');for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-link-source-return-trusted-input-and-output-bytes');assert.equal(r.inputProtocol,'trusted-keyboard-and-pointer')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),linkSourceReturnChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assertLinkSourceInput(r.inputTrace)
 for(const k of [...linkSourceReturnFlags,'otherDraftsPreserved','disposableDraftsExplicitlySaved'])assert.equal(r[k],true,k)
 assert.deepEqual(r.viewportWidths,[1280,800])
}
export function assertLinkSourceReturnOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),linkSourceReturnOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const observations=JSON.parse(read(linkSourceReturnOutputFiles[0]).toString('utf8'));for(const id of linkSourceReturnChecks)assert.equal(observations[id],true)
 for(const[text,index]of [[linkSourceDraft,1],[linkTargetDraft,2]])assert.equal(read(linkSourceReturnOutputFiles[index]).toString('utf8'),'\uFEFF'+text.replaceAll('\n','\r\n'))
 assert.equal(read(linkSourceReturnOutputFiles[3]).toString('utf8'),linkPlainDraft)
}
