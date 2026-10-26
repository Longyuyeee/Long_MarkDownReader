import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const tomlFieldsChecks=['add-to-parent-preview-independent-undo-redo','delete-whole-value-and-consecutive-empty-table','dotted-name-is-one-key-and-empty-table-roundtrip','duplicate-error-retains-name-value-and-source-location','switch-form-preview-menu-preserves-draft','real-locked-save-retry-and-reopen','external-conflict-copy-keeps-source-and-draft','all-owned-fixtures-clean-and-no-runtime-error']
export const tomlFieldsSource='# 配置 中文😀\nproject = "original"\n[root]\nold = 8_080 # 保留\nlabel = "原稿"\nremove = {first = 1, second = 2}\n# 后续说明\n[other]\nold = 0xFF\n'
export const tomlFieldsDraft=tomlFieldsSource.replace('原稿','我的草稿')
export const tomlFieldsAdded=tomlFieldsDraft.replace('# 后续说明','added = true\n# 后续说明')
export const tomlFieldsEdited=tomlFieldsAdded.replace('remove = {first = 1, second = 2}\n','')
export const tomlFieldsConflict=tomlFieldsEdited.replace('# 后续说明','pending = false\n# 后续说明')
export const tomlFieldsOutputFiles=['installed-v1222-toml-observations.json','installed-v1222-toml-saved.toml','installed-v1222-toml-copy.toml','installed-v1222-toml-external.toml']
export function validateInstalledTomlFields(r,m){
 assert.ok(['1.2.22','1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-toml-field-management-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),tomlFieldsChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
}
export function assertTomlFieldsOutputBytes(r,read){
 const names=tomlFieldsOutputFiles
 assert.deepEqual(r.outputs.map(o=>o.fileName),names)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(names[0]).toString('utf8'));for(const id of tomlFieldsChecks)assert.equal(obs[id],true,id)
 assert.equal(read(names[1]).toString('utf8'),'\uFEFF'+tomlFieldsEdited.replaceAll('\n','\r\n'))
 assert.equal(read(names[2]).toString('utf8'),tomlFieldsConflict)
 assert.equal(read(names[3]).toString('utf8'),'\uFEFF'+tomlFieldsEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
