import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const tomlValueChecks=['current-draft-accurate-value-name-and-isolated-history','invalid-value-retained-and-corrected-without-disk-write','quoted-dotted-and-array-table-keys-edit-exact-target','complex-value-source-fallback-keeps-workspace-usable','source-switch-clears-value-dialog-preview-and-menu','real-locked-save-retry-reopen-preserves-bom-crlf-literals','external-conflict-keeps-newly-edited-value-and-original','source-switch-restores-current-draft']
export const tomlValueSource="# 原稿\ntitle = '原稿' # 保留\nn = 9_223_372_036_854_775_807\nenabled = true\nitems = [1,2]\ndate = 1979-05-27\n\"a.b\" = 'literal'\n[a]\nport = 8_080\n[b]\nport = 8_080\n[[servers]]\nname = 'first'\n[[servers]]\nname = 'second'"
export const tomlValueDraft=tomlValueSource.replace('# 原稿','# 我的草稿')
export const tomlValueEdited=tomlValueDraft.replace('[b]\nport = 8_080','[b]\nport = 9_090')
export const tomlValueConflict=tomlValueEdited.replace('enabled = true','enabled = false')
export function validateInstalledTomlValue(r,m){
 assert.ok(['1.2.9','1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-toml-value-edit-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),tomlValueChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[]);assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'))
}
export function assertTomlValueOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),['installed-v129-toml-observations.json','installed-v129-toml-saved.toml','installed-v129-toml-copy.toml','installed-v129-toml-external.toml'])
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(r.outputs[0].fileName).toString('utf8'));for(const id of tomlValueChecks)assert.equal(obs[id],true,id)
 assert.equal(read('installed-v129-toml-saved.toml').toString('utf8'),'\uFEFF'+tomlValueEdited.replaceAll('\n','\r\n')+'\r\n')
 assert.equal(read('installed-v129-toml-copy.toml').toString('utf8'),tomlValueConflict+'\n')
 assert.equal(read('installed-v129-toml-external.toml').toString('utf8'),'\uFEFF'+tomlValueEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n')+'\r\n')
}
