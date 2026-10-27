import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {xmlElementSource} from './installed-v1-2-13-evidence.mjs'
export const xmlOrderChecks=['exact-sibling-move-current-draft-preview-selection-and-history','boundary-empty-self-closing-and-repeated-sibling-order','root-mixed-and-ambiguous-comment-fallback-stays-local','source-switch-clears-order-preview-and-menu-keeps-draft','real-locked-order-save-retry-reopen-preserves-bom-crlf','external-conflict-keeps-reordered-draft-and-original']
export const xmlOrderSource=xmlElementSource
export const xmlOrderDraft=xmlOrderSource.replace('<!-- 原稿 -->','<!-- 我的草稿 -->')
const first="<doc:item id='first'/>",fragment=xmlOrderDraft.split('\n')[4].trim()
export const xmlOrderEdited=xmlOrderDraft.replace(first+'\n  '+fragment,fragment+'\n  '+first)
export const xmlOrderConflict=xmlOrderDraft
export function validateInstalledXmlOrder(r,m){
 assert.ok(['1.2.14','1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-xml-sibling-order-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),xmlOrderChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'))
}
export function assertXmlOrderOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),['installed-v1214-xml-observations.json','installed-v1214-xml-saved.xml','installed-v1214-xml-copy.xml','installed-v1214-xml-external.xml'])
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(r.outputs[0].fileName).toString('utf8'));for(const id of xmlOrderChecks)assert.equal(obs[id],true,id)
 assert.equal(read('installed-v1214-xml-saved.xml').toString('utf8'),'\uFEFF'+xmlOrderEdited.replaceAll('\n','\r\n')+'\r\n')
 assert.equal(read('installed-v1214-xml-copy.xml').toString('utf8'),xmlOrderConflict+'\n')
 assert.equal(read('installed-v1214-xml-external.xml').toString('utf8'),'\uFEFF'+xmlOrderEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n')+'\r\n')
}
