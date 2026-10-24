import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const xmlTextChecks=['decoded-text-prefill-exact-draft-and-isolated-history','cdata-delimiter-splits-and-remains-editable','empty-and-annotated-text-retain-whitespace-and-markup','invalid-text-retained-and-corrected-without-disk-write','mixed-split-and-self-closing-source-fallback','source-switch-clears-text-dialog-preview-and-menu','real-locked-text-save-retry-reopen-preserves-bom-crlf','external-conflict-keeps-text-draft-and-original']
export const xmlTextSource=`<?xml version="1.0"?>
<!-- 原稿 -->
<catalog xmlns:doc="urn:docs">
  <doc:item id='first'>first</doc:item>
  <doc:item id="9007199254740993123456789">原稿 &amp; 摘要 😀</doc:item>
  <literal><![CDATA[原始 <文字> & 😀]]></literal>
  <empty></empty>
  <annotated><!-- 保留 -->一段文字<?keep value?></annotated>
  <mixed>before<child/>after</mixed>
  <split>前<!-- c -->后</split>
  <selfClosing/>
</catalog>`
export const xmlTextInput='更新 < > & 😀\n第二行'
export const xmlTextEscaped='更新 &lt; &gt; &amp; 😀\n第二行'
export const xmlTextDraft=xmlTextSource.replace('<!-- 原稿 -->','<!-- 我的草稿 -->')
export const xmlTextEdited=xmlTextDraft.replace('原稿 &amp; 摘要 😀',xmlTextEscaped)
export const xmlTextConflict=xmlTextEdited.replace(xmlTextEscaped,'冲突草稿')
export function validateInstalledXmlText(r,m){
 assert.ok(['1.2.12','1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-xml-text-edit-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),xmlTextChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'))
}
export function assertXmlTextOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),['installed-v1212-xml-observations.json','installed-v1212-xml-saved.xml','installed-v1212-xml-copy.xml','installed-v1212-xml-external.xml'])
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(r.outputs[0].fileName).toString('utf8'));for(const id of xmlTextChecks)assert.equal(obs[id],true,id)
 assert.equal(read('installed-v1212-xml-saved.xml').toString('utf8'),'\uFEFF'+xmlTextEdited.replaceAll('\n','\r\n')+'\r\n')
 assert.equal(read('installed-v1212-xml-copy.xml').toString('utf8'),xmlTextConflict+'\n')
 assert.equal(read('installed-v1212-xml-external.xml').toString('utf8'),'\uFEFF'+xmlTextEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n')+'\r\n')
}
