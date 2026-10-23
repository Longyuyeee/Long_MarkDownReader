import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const xmlAttributeChecks=['decoded-prefill-exact-current-draft-and-isolated-history','attribute-picker-prefixed-name-and-siblings-stay-distinct','empty-and-multiline-values-escape-without-extra-steps','invalid-input-retained-and-corrected-without-disk-write','namespace-source-fallback-keeps-workspace-usable','source-switch-clears-dialog-preview-and-menu','real-locked-save-retry-reopen-preserves-bom-crlf-originals','external-conflict-keeps-edited-draft-and-original','yaml-numeric-outline-keeps-exact-source-digits']
export const xmlAttributeSource=`<?xml version="1.0"?>
<!-- 原稿 -->
<catalog xmlns:doc="urn:docs">
  <doc:item title='first' doc:code="same" />
  <doc:item title='原稿 &amp; 摘要' doc:code="same" count="9007199254740993123456789" />
  <empty value="" />
</catalog>`
export const xmlAttributeInput=`更新 < > " ' & 😀`
export const xmlAttributeDraft=xmlAttributeSource.replace('<!-- 原稿 -->','<!-- 我的草稿 -->')
export const xmlAttributeEdited=xmlAttributeDraft.replace("title='原稿 &amp; 摘要'",`title='更新 &lt; &gt; " &apos; &amp; 😀'`)
export const xmlAttributeConflict=xmlAttributeEdited.replace('doc:code="same" count=', 'doc:code="changed" count=')
export const yamlNumericSource='n: 9007199254740993123456789\nnegative: -9007199254740993123456789\nprecise: 1.234567890123456789e100\n'
export function validateInstalledXmlAttribute(r,m){
 assert.equal(m.appVersion,'1.2.11');for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-xml-attribute-edit-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64],['yamlBefore',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter);assert.equal(r.yamlBefore,r.yamlAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),xmlAttributeChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'))
}
export function assertXmlAttributeOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),['installed-v1211-xml-observations.json','installed-v1211-xml-saved.xml','installed-v1211-xml-copy.xml','installed-v1211-xml-external.xml','installed-v1211-yaml-preview.yaml'])
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(r.outputs[0].fileName).toString('utf8'));for(const id of xmlAttributeChecks)assert.equal(obs[id],true,id)
 assert.equal(read('installed-v1211-xml-saved.xml').toString('utf8'),'\uFEFF'+xmlAttributeEdited.replaceAll('\n','\r\n')+'\r\n')
 assert.equal(read('installed-v1211-xml-copy.xml').toString('utf8'),xmlAttributeConflict+'\n')
 assert.equal(read('installed-v1211-xml-external.xml').toString('utf8'),'\uFEFF'+xmlAttributeEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n')+'\r\n')
 assert.equal(read('installed-v1211-yaml-preview.yaml').toString('utf8'),yamlNumericSource)
}
