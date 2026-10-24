import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const yamlRenameChecks=['prefilled-field-rename-preview-undo-redo','flow-mapping-and-consecutive-paths','implicit-string-keys-quotes-and-sibling-ownership','local-error-retains-input-and-source-location','switch-form-preview-menu-preserves-draft','real-locked-save-retry-and-reopen','external-conflict-copy-keeps-source-and-draft','all-owned-fixtures-clean-and-no-runtime-error']
export const yamlRenameSource='# 配置 中文😀\nbase: &defaults {keep: 0xFF}\nreference: *defaults\nroot:\n  old: 9007199254740993123456789 # old 保留\n  items: [{label: 原稿}, {label: other}]\n'
export const yamlRenameDraft=yamlRenameSource.replace('原稿','我的草稿')
export const yamlRenameRenamed=yamlRenameDraft.replace('  old:', '  字段:')
export const yamlRenameAdded=yamlRenameRenamed.replace('label: other', '"true": other')
export const yamlRenameConflict=yamlRenameAdded.replace('  字段:', '  待保存:')
export const yamlRenameOutputFiles=['installed-v1219-yaml-observations.json','installed-v1219-yaml-saved.yaml','installed-v1219-yaml-copy.yaml','installed-v1219-yaml-external.yaml']
export function validateInstalledYamlRename(r,m){
 assert.ok(['1.2.19','1.2.20'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-yaml-key-rename-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),yamlRenameChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
}
export function assertYamlRenameOutputBytes(r,read){
 const names=yamlRenameOutputFiles
 assert.deepEqual(r.outputs.map(o=>o.fileName),names)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(names[0]).toString('utf8'));for(const id of yamlRenameChecks)assert.equal(obs[id],true,id)
 assert.equal(read(names[1]).toString('utf8'),'\uFEFF'+yamlRenameAdded.replaceAll('\n','\r\n'))
 assert.equal(read(names[2]).toString('utf8'),yamlRenameConflict)
 assert.equal(read(names[3]).toString('utf8'),'\uFEFF'+yamlRenameAdded.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
