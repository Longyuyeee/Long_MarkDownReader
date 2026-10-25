import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const yamlFieldCopyChecks=['name-only-default-draft-diff-selection-and-history','block-attached-comments-and-flow-raw-values','same-parent-name-collision-and-repeated-copy-edit','complex-local-source-fallback-preserves-name','source-switch-clears-dialog-menu-diff-and-keeps-drafts','real-locked-save-retry-and-bom-crlf-reopen','external-conflict-preserves-original-and-complete-copy','full-library-wide-narrow-name-dialog-and-diff','owned-drafts-clean-and-no-runtime-error']
export const yamlFieldCopySource="# 配置 中文😀\nlabel: 原稿\ntitle: '内容😀' # field note\n\n# independent\ntitle_copy: reserved\nflow: {first: 0xFF, other: true,}\nblocked: [1, 2]\nmultiline: |\n  保留原文\nother: 8_080\n"
export const yamlFieldCopyDraft=yamlFieldCopySource.replace('原稿','我的草稿')
export const yamlFieldCopyEdited=yamlFieldCopyDraft.replace("title: '内容😀' # field note\n","title: '内容😀' # field note\ntitle_copy2: '内容😀' # field note\n")
export const yamlFieldCopyConflict=yamlFieldCopyEdited.replace("title_copy2: '内容😀' # field note\n","title_copy2: '内容😀' # field note\ntitle_copy3: '内容😀' # field note\n")
export const yamlFieldCopyOutputFiles=['installed-v1229-field-copy-observations.json','installed-v1229-yaml-saved.yaml','installed-v1229-yaml-copy.yaml','installed-v1229-yaml-external.yaml']
export function validateInstalledYamlFieldCopy(r,m){
 assert.ok(['1.2.29','1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-yaml-field-copy-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const prefix of ['locked','external']){assert.match(r[prefix+'Before'],/^[a-f0-9]{64}$/);assert.equal(r[prefix+'Before'],r[prefix+'After'])}
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),yamlFieldCopyChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.equal(r.defaultNameSelected,true);assert.equal(r.nameOnlyDialog,true)
}
export function assertYamlFieldCopyOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),yamlFieldCopyOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(yamlFieldCopyOutputFiles[0]).toString('utf8'));for(const id of yamlFieldCopyChecks)assert.equal(obs[id],true,id)
 assert.equal(read(yamlFieldCopyOutputFiles[1]).toString('utf8'),'\uFEFF'+yamlFieldCopyEdited.replaceAll('\n','\r\n'))
 assert.equal(read(yamlFieldCopyOutputFiles[2]).toString('utf8'),yamlFieldCopyConflict)
 assert.equal(read(yamlFieldCopyOutputFiles[3]).toString('utf8'),'\uFEFF'+yamlFieldCopyEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
