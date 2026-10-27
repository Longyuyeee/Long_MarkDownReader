import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const yamlValueChecks=['current-draft-accurate-value-name-and-isolated-history','invalid-value-retained-and-corrected-without-disk-write','quoted-dotted-and-sequence-keys-edit-exact-target','multiline-value-source-fallback-keeps-workspace-usable','source-switch-clears-value-dialog-preview-and-menu','real-locked-save-retry-reopen-preserves-bom-crlf-literals','external-conflict-keeps-newly-edited-value-and-original','source-switch-restores-current-draft']
export const yamlValueSource="# 原稿\ntitle: '原稿' # 保留\nn: 9007199254740993123456789\nenabled: true\nitems: [one, two]\nblock: |\n  multiline\n'a.b': 'literal'\na:\n  port: 8080\nb:\n  port: 8080\nrows:\n  - name: 'first'\n  - name: 'second'"
export const yamlValueDraft=yamlValueSource.replace('# 原稿','# 我的草稿')
export const yamlValueEdited=yamlValueDraft.replace('b:\n  port: 8080','b:\n  port: 9090')
export const yamlValueConflict=yamlValueEdited.replace('enabled: true','enabled: false')
export function validateInstalledYamlValue(r,m){
 assert.ok(['1.2.10','1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-yaml-value-edit-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),yamlValueChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[]);assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'))
}
export function assertYamlValueOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),['installed-v1210-yaml-observations.json','installed-v1210-yaml-saved.yaml','installed-v1210-yaml-copy.yaml','installed-v1210-yaml-external.yaml'])
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(r.outputs[0].fileName).toString('utf8'));for(const id of yamlValueChecks)assert.equal(obs[id],true,id)
 assert.equal(read('installed-v1210-yaml-saved.yaml').toString('utf8'),'\uFEFF'+yamlValueEdited.replaceAll('\n','\r\n')+'\r\n')
 assert.equal(read('installed-v1210-yaml-copy.yaml').toString('utf8'),yamlValueConflict+'\n')
 assert.equal(read('installed-v1210-yaml-external.yaml').toString('utf8'),'\uFEFF'+yamlValueEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n')+'\r\n')
}
