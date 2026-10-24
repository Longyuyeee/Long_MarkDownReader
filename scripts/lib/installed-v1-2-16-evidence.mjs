import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const xmlManageChecks=['add-remove-current-draft-preview-and-independent-history','attribute-free-root-self-closing-paired-and-consecutive-operations','invalid-duplicate-and-namespace-feedback-keeps-input-and-draft','source-switch-clears-attribute-dialog-preview-and-menu-keeps-draft','real-locked-attribute-save-retry-reopen-preserves-bom-crlf','external-conflict-keeps-managed-attribute-draft-and-original']
export const xmlManageSource=`<?xml version="1.0"?>
<!-- 原稿 -->
<catalog xmlns:doc="urn:docs">
  <doc:item id='first'/>
  <doc:item
    id = '9007199254740993123456789'
    doc:label="原值"
    keep = '&amp;'
  >正文<![CDATA[< > &]]></doc:item>
  <empty></empty>
  <selfClosing/>
</catalog>`
export const xmlManageInput=`'" & < >\n中文😀`
export const xmlManageLiteral=`标题='&apos;" &amp; &lt; &gt;&#xA;中文😀'`
export const xmlManageDraft=xmlManageSource.replace('<!-- 原稿 -->','<!-- 我的草稿 -->')
export const xmlManageAdded=xmlManageDraft.replace("keep = '&amp;'","keep = '&amp;'\n    "+xmlManageLiteral)
export const xmlManageEdited=xmlManageAdded.replace("\n    id = '9007199254740993123456789'",'')
export const xmlManageConflict=xmlManageEdited.replace("\n    keep = '&amp;'",'')
export function validateInstalledXmlManage(r,m){
 assert.ok(['1.2.16','1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-xml-attribute-management-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),xmlManageChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'))
}
export function assertXmlManageOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),['installed-v1216-xml-observations.json','installed-v1216-xml-saved.xml','installed-v1216-xml-copy.xml','installed-v1216-xml-external.xml'])
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(r.outputs[0].fileName).toString('utf8'));for(const id of xmlManageChecks)assert.equal(obs[id],true,id)
 assert.equal(read('installed-v1216-xml-saved.xml').toString('utf8'),'\uFEFF'+xmlManageEdited.replaceAll('\n','\r\n')+'\r\n')
 assert.equal(read('installed-v1216-xml-copy.xml').toString('utf8'),xmlManageConflict+'\n')
 assert.equal(read('installed-v1216-xml-external.xml').toString('utf8'),'\uFEFF'+xmlManageEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n')+'\r\n')
}
