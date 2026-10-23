import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {xmlElementSource} from './installed-v1-2-13-evidence.mjs'
export const xmlDeleteChecks=['exact-subtree-delete-current-draft-preview-selection-and-history','first-last-only-empty-and-repeated-sibling-delete','root-mixed-and-ambiguous-comment-fallback-stays-local','source-switch-clears-delete-preview-and-menu-keeps-draft','real-locked-delete-save-retry-reopen-preserves-bom-crlf','external-conflict-keeps-deleted-draft-and-original']
export const xmlDeleteSource=xmlElementSource
export const xmlDeleteDraft=xmlDeleteSource.replace('<!-- 原稿 -->','<!-- 我的草稿 -->')
export const xmlDeleteEdited=xmlDeleteDraft.replace('\n  '+xmlDeleteDraft.split('\n')[4].trim(),'')
export const xmlDeleteConflict=xmlDeleteEdited.replace("\n  <doc:item id='first'/>",'')
export function validateInstalledXmlDelete(r,m){
 assert.ok(['1.2.15','1.2.16', '1.2.17'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-xml-element-delete-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),xmlDeleteChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'))
}
export function assertXmlDeleteOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),['installed-v1215-xml-observations.json','installed-v1215-xml-saved.xml','installed-v1215-xml-copy.xml','installed-v1215-xml-external.xml'])
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(r.outputs[0].fileName).toString('utf8'));for(const id of xmlDeleteChecks)assert.equal(obs[id],true,id)
 assert.equal(read('installed-v1215-xml-saved.xml').toString('utf8'),'\uFEFF'+xmlDeleteEdited.replaceAll('\n','\r\n')+'\r\n')
 assert.equal(read('installed-v1215-xml-copy.xml').toString('utf8'),xmlDeleteConflict+'\n')
 assert.equal(read('installed-v1215-xml-external.xml').toString('utf8'),'\uFEFF'+xmlDeleteEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n')+'\r\n')
}
