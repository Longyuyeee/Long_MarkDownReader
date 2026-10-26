import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const xmlCreateChecks=['exact-prefixed-rename-preview-and-independent-undo','child-creation-escaped-text-selection-and-undo','root-empty-repeated-elements-and-consecutive-operations','local-errors-retain-input-and-source-location','switch-form-preview-menu-preserves-draft','real-locked-save-retry-and-reopen','external-conflict-copy-keeps-source-and-draft','all-owned-fixtures-clean-and-no-runtime-error']
export const xmlCreateSource="<catalog xmlns='urn:default' xmlns:doc='urn:doc'>\n  <doc:item id='1'><![CDATA[keep]]><!--inside--></doc:item>\n  <doc:item id='2'/>\n</catalog>\n"
export const xmlCreateDraft=xmlCreateSource.replace('keep','我的草稿')
export const xmlCreateRenamed=xmlCreateDraft.replace("<doc:item id='2'/>","<doc:条目 id='2'/>")
export const xmlCreateInput='<&> 中文😀\n第二行'
export const xmlCreateAdded=xmlCreateRenamed.replace("<doc:条目 id='2'/>","<doc:条目 id='2'>\n    <子项>&lt;&amp;&gt; 中文😀\n第二行</子项>\n  </doc:条目>")
export const xmlCreateConflict=xmlCreateAdded.replaceAll('doc:条目','doc:待保存')
export function validateInstalledXmlCreate(r,m){
 assert.ok(['1.2.18','1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-xml-create-rename-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),xmlCreateChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
}
export function assertXmlCreateOutputBytes(r,read){
 const names=['installed-v1218-xml-observations.json','installed-v1218-xml-saved.xml','installed-v1218-xml-copy.xml','installed-v1218-xml-external.xml']
 assert.deepEqual(r.outputs.map(o=>o.fileName),names)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(names[0]).toString('utf8'));for(const id of xmlCreateChecks)assert.equal(obs[id],true,id)
 assert.equal(read(names[1]).toString('utf8'),'\uFEFF'+xmlCreateAdded.replaceAll('\n','\r\n'))
 assert.equal(read(names[2]).toString('utf8'),xmlCreateConflict)
 assert.equal(read(names[3]).toString('utf8'),'\uFEFF'+xmlCreateAdded.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
