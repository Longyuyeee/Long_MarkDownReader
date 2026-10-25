import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const yamlFieldsChecks=['add-to-parent-preview-independent-undo-redo','delete-flow-field-and-consecutive-empty-mapping','quoted-string-key-type-and-empty-map-roundtrip','duplicate-error-retains-name-value-and-source-location','switch-form-preview-menu-preserves-draft','real-locked-save-retry-and-reopen','external-conflict-copy-keeps-source-and-draft','all-owned-fixtures-clean-and-no-runtime-error']
export const yamlFieldsSource='# 配置 中文😀\nbase: &defaults {keep: 0xFF}\nref: *defaults\nroot:\n  old: 8_080 # 保留\n  label: 原稿\n  flow: {first: 1, remove: 2, keep: 3}\nother: 2\n'
export const yamlFieldsDraft=yamlFieldsSource.replace('原稿','我的草稿')
export const yamlFieldsAdded=yamlFieldsDraft.replace('other: 2','  added: true\nother: 2')
export const yamlFieldsEdited=yamlFieldsAdded.replace('remove: 2,','')
export const yamlFieldsConflict=yamlFieldsEdited.replace('other: 2','  pending: false\nother: 2')
export const yamlFieldsOutputFiles=['installed-v1221-yaml-observations.json','installed-v1221-yaml-saved.yaml','installed-v1221-yaml-copy.yaml','installed-v1221-yaml-external.yaml']
export function validateInstalledYamlFields(r,m){
 assert.ok(['1.2.21','1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-yaml-field-management-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),yamlFieldsChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
}
export function assertYamlFieldsOutputBytes(r,read){
 const names=yamlFieldsOutputFiles
 assert.deepEqual(r.outputs.map(o=>o.fileName),names)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(names[0]).toString('utf8'));for(const id of yamlFieldsChecks)assert.equal(obs[id],true,id)
 assert.equal(read(names[1]).toString('utf8'),'\uFEFF'+yamlFieldsEdited.replaceAll('\n','\r\n'))
 assert.equal(read(names[2]).toString('utf8'),yamlFieldsConflict)
 assert.equal(read(names[3]).toString('utf8'),'\uFEFF'+yamlFieldsEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
