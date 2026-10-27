import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const tomlFieldCopyChecks=['name-only-default-draft-diff-selection-and-history','attached-comments-table-ownership-and-raw-values','same-parent-name-collision-and-repeated-copy-edit','complex-local-source-fallback-preserves-name','source-switch-clears-dialog-menu-diff-and-keeps-drafts','real-locked-save-retry-and-bom-crlf-reopen','external-conflict-preserves-original-and-complete-copy','full-library-wide-narrow-name-dialog-and-diff','owned-drafts-clean-and-no-runtime-error']
export const tomlFieldCopySource="# 配置 中文😀\nlabel = '原稿'\ntitle = '内容😀' # field note\n\n# independent\ntitle_copy = 'reserved'\nblocked = [1, 2]\nmultiline = '''\n保留原文\n'''\nother = 8_080\n[flow]\nfirst = 0xFF # hex\nother = true\n"
export const tomlFieldCopyDraft=tomlFieldCopySource.replace('原稿','我的草稿')
export const tomlFieldCopyEdited=tomlFieldCopyDraft.replace("title = '内容😀' # field note\n","title = '内容😀' # field note\ntitle_copy2 = '内容😀' # field note\n")
export const tomlFieldCopyConflict=tomlFieldCopyEdited.replace("title_copy2 = '内容😀' # field note\n","title_copy2 = '内容😀' # field note\ntitle_copy3 = '内容😀' # field note\n")
export const tomlFieldCopyOutputFiles=['installed-v1230-field-copy-observations.json','installed-v1230-toml-saved.toml','installed-v1230-toml-copy.toml','installed-v1230-toml-external.toml']
export function validateInstalledTomlFieldCopy(r,m){
 assert.ok(['1.2.30','1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-toml-field-copy-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const prefix of ['locked','external']){assert.match(r[prefix+'Before'],/^[a-f0-9]{64}$/);assert.equal(r[prefix+'Before'],r[prefix+'After'])}
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),tomlFieldCopyChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.equal(r.defaultNameSelected,true);assert.equal(r.nameOnlyDialog,true)
}
export function assertTomlFieldCopyOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),tomlFieldCopyOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(tomlFieldCopyOutputFiles[0]).toString('utf8'));for(const id of tomlFieldCopyChecks)assert.equal(obs[id],true,id)
 assert.equal(read(tomlFieldCopyOutputFiles[1]).toString('utf8'),'\uFEFF'+tomlFieldCopyEdited.replaceAll('\n','\r\n'))
 assert.equal(read(tomlFieldCopyOutputFiles[2]).toString('utf8'),tomlFieldCopyConflict)
 assert.equal(read(tomlFieldCopyOutputFiles[3]).toString('utf8'),'\uFEFF'+tomlFieldCopyEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
