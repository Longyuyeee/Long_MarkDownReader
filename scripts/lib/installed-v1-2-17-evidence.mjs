import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const savepointModes=['json','yaml','toml','xml','svg']
export const savepointChecks=[...savepointModes.map(m=>m+'-read-undo-redo-and-tab-baseline'),...savepointModes.map(m=>m+'-save-receipt-undo-redo-and-exact-source'), 'xml-structural-inverse-restores-clean-baseline','real-locked-save-retry-keeps-draft-and-source','external-conflict-copy-keeps-original-and-unsaved-draft','large-json-readonly-range-and-next-page-remain-clean']
export const savepointSources={json:'{ "n": 9007199254740993123456789, "value": "原稿 中文😀" }\n',yaml:'# 保留排版\nvalue: "原稿 中文😀"\nn: 9007199254740993123456789\n',toml:'# 保留排版\nvalue = "原稿 中文😀"\nn = 42\n',xml:'<root keep=\'&amp;\'><value>原稿 中文😀</value></root>\n',svg:'<svg xmlns="http://www.w3.org/2000/svg"><text>原稿 中文😀</text></svg>\n'}
export const savepointSaved=m=>savepointSources[m].replace('原稿','已保存')
export function validateInstalledSavepoint(r,m){
 assert.ok(['1.2.17','1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-structured-savepoint-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64],['rangeBefore',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 assert.equal(r.rangeBefore,r.rangeAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),savepointChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
}
export function assertSavepointOutputBytes(r,read){
 const names=['installed-v1217-savepoint-observations.json',...savepointModes.map(m=>'installed-v1217-saved.'+m),'installed-v1217-copy.xml','installed-v1217-external.xml']
 assert.deepEqual(r.outputs.map(o=>o.fileName),names)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(names[0]).toString('utf8'));for(const id of savepointChecks)assert.equal(obs[id],true,id)
 for(const m of savepointModes)assert.equal(read('installed-v1217-saved.'+m).toString('utf8'),'\uFEFF'+savepointSaved(m).replaceAll('\n','\r\n'))
 assert.equal(read('installed-v1217-copy.xml').toString('utf8'),savepointSaved('xml').replace('已保存','冲突草稿'))
 assert.equal(read('installed-v1217-external.xml').toString('utf8'),'\uFEFF'+savepointSaved('xml').replace('已保存','外部保留').replaceAll('\n','\r\n'))
}
