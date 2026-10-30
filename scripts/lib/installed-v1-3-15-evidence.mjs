import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {inlineRepairChecks} from './inline-link-repair-actions.mjs'
import {linkSourceText,replacedSource} from './inline-link-fixture.mjs'
import {assertLinkSourceInput} from './installed-v1-3-14-evidence.mjs'
export const inlineLinkRepairChecks=inlineRepairChecks
export const inlineLinkRepairOutputFiles=['installed-v1315-links-observations.json','installed-v1315-saved-A.md','installed-v1315-saved-B.md']
export function validateInstalledInlineLinkRepair(r,m){
 assert.equal(m.appVersion,'1.3.15');for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-inline-link-repair-trusted-input-and-output-bytes');assert.equal(r.inputProtocol,'trusted-keyboard-and-pointer')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),inlineLinkRepairChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[]);assertLinkSourceInput(r.inputTrace)
 assert.equal(r.otherDraftsPreserved,true);assert.equal(r.disposableDraftsExplicitlySaved,true);assert.deepEqual(r.viewportWidths,[1280,800])
}
export function assertInlineLinkRepairOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),inlineLinkRepairOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const observations=JSON.parse(read(inlineLinkRepairOutputFiles[0]).toString('utf8'));for(const id of inlineLinkRepairChecks)assert.equal(observations[id],true)
 assert.equal(read(inlineLinkRepairOutputFiles[1]).toString('utf8'),'\uFEFF'+replacedSource(linkSourceText.trimEnd()+'草稿保留。\n').replaceAll('\n','\r\n'))
 assert.equal(read(inlineLinkRepairOutputFiles[2]).toString('utf8'),'\uFEFF# 本周任务\r\n\r\n目标草稿保留。\r\n')
}
