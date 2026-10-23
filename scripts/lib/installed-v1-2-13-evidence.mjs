import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const xmlElementChecks=['exact-subtree-copy-current-draft-preview-and-isolated-history','empty-self-closing-and-repeated-sibling-copy','root-mixed-and-ambiguous-comment-fallback-stays-local','source-switch-clears-copy-preview-and-menu-keeps-draft','real-locked-element-save-retry-reopen-preserves-bom-crlf','external-conflict-keeps-copied-element-draft-and-original']
export const xmlElementFragment=`<doc:item id="9007199254740993123456789"><title>中文 &amp; 😀</title><!-- 内部 --><?keep value?><literal><![CDATA[< > &]]></literal></doc:item>`
export const xmlElementSource=`<?xml version="1.0"?>
<!-- 原稿 -->
<catalog xmlns:doc="urn:docs">
  <doc:item id='first'/>
  ${xmlElementFragment}
  <empty></empty>
  <selfClosing/>
  <mixed>before<child/>after</mixed>
  <annotated><!-- belongs? --><child/></annotated>
</catalog>`
export const xmlElementDraft=xmlElementSource.replace('<!-- 原稿 -->','<!-- 我的草稿 -->')
export const xmlElementEdited=xmlElementDraft.replace(xmlElementFragment,xmlElementFragment+'\n  '+xmlElementFragment)
export const xmlElementConflict=xmlElementEdited.replace(xmlElementFragment,xmlElementFragment+'\n  '+xmlElementFragment)
export function validateInstalledXmlElement(r,m){
 assert.equal(m.appVersion,'1.2.13');for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-xml-element-copy-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),xmlElementChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'))
}
export function assertXmlElementOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),['installed-v1213-xml-observations.json','installed-v1213-xml-saved.xml','installed-v1213-xml-copy.xml','installed-v1213-xml-external.xml'])
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(r.outputs[0].fileName).toString('utf8'));for(const id of xmlElementChecks)assert.equal(obs[id],true,id)
 assert.equal(read('installed-v1213-xml-saved.xml').toString('utf8'),'\uFEFF'+xmlElementEdited.replaceAll('\n','\r\n')+'\r\n')
 assert.equal(read('installed-v1213-xml-copy.xml').toString('utf8'),xmlElementConflict+'\n')
 assert.equal(read('installed-v1213-xml-external.xml').toString('utf8'),'\uFEFF'+xmlElementEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n')+'\r\n')
}
