import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const tomlItemValuesChecks=['exact-prefill-type-preview-draft-and-independent-undo-redo','type-changes-quoted-values-and-reserved-names','invalid-input-retained-with-source-location-and-resume','complex-item-source-fallback-keeps-draft','source-switch-clears-form-preview-menu-and-retains-draft','real-locked-save-retry-and-bom-crlf-reopen','external-conflict-copy-keeps-source-and-draft','all-owned-fixtures-clean-and-no-runtime-error']
export const tomlItemValuesSource='# 配置 中文😀\nlabel = "原稿"\nitems = [0xFF, \'内容\', true,]\nempty = []\nblocked = [[1]]\n[other]\nitems = [8_080]\n'
export const tomlItemValuesDraft=tomlItemValuesSource.replace('原稿','我的草稿')
export const tomlItemValuesEdited=tomlItemValuesDraft.replace("'内容'",'false')
export const tomlItemValuesConflict=tomlItemValuesEdited.replace('false,',"'新草稿',")
export const tomlItemValuesOutputFiles=['installed-v1225-toml-observations.json','installed-v1225-toml-saved.toml','installed-v1225-toml-copy.toml','installed-v1225-toml-external.toml']
export function validateInstalledTomlItemValues(r,m){
 assert.ok(['1.2.25','1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9', '1.3.10', '1.3.11', '1.3.12', '1.3.13'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-toml-array-item-values-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),tomlItemValuesChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
}
export function assertTomlItemValuesOutputBytes(r,read){
 const names=tomlItemValuesOutputFiles
 assert.deepEqual(r.outputs.map(o=>o.fileName),names)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(names[0]).toString('utf8'));for(const id of tomlItemValuesChecks)assert.equal(obs[id],true,id)
 assert.equal(read(names[1]).toString('utf8'),'\uFEFF'+tomlItemValuesEdited.replaceAll('\n','\r\n'))
 assert.equal(read(names[2]).toString('utf8'),tomlItemValuesConflict)
 assert.equal(read(names[3]).toString('utf8'),'\uFEFF'+tomlItemValuesEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
