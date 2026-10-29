import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const yamlBlockFieldDeleteChecks=["whole-block-field-delete-diff-draft-neighbor-selection-and-history", "last-unique-opening-newline-and-empty-field-delete", "repeated-deletion-keeps-standalone-comments-and-selects-parent-mapping", "complex-local-fallback-and-independent-comments-retained", "source-switch-clears-delete-diff-menu-and-preserves-drafts", "real-locked-save-retry-and-bom-crlf-reopen", "external-conflict-preserves-original-and-complete-deleted-field-draft-copy", "full-library-wide-narrow-context-menu-and-delete-diff", "owned-drafts-clean-and-no-runtime-error"]
export const yamlBlockFieldDeleteSource="# 配置 中文😀\nlabel: 原稿\nitems:\n  first: |- # 第一段\n    第一行😀\n    第二行\n\n  # independent\n\n  second: >2- # 第二段\n    后一段\n    折叠\n  third: |+ # 第三段\n    # 正文\n    text\n\nkept:\n  text: |+ # keep\n    # 正文\n    text\n\n  other: true\nempty:\n  text: >-\n  other: false\nblocked:\n  text: [1,2]\n  other: false\nambiguous:\n  # attached?\n  text: |-\n    old\n    body\n  other: false\nunique:\n  text: >- # unique\nunchanged:\n  last: 8_080\n"
export const yamlBlockFieldDeleteDraft="# 配置 中文😀\nlabel: 我的草稿\nitems:\n  first: |- # 第一段\n    第一行😀\n    第二行\n\n  # independent\n\n  second: >2- # 第二段\n    后一段\n    折叠\n  third: |+ # 第三段\n    # 正文\n    text\n\nkept:\n  text: |+ # keep\n    # 正文\n    text\n\n  other: true\nempty:\n  text: >-\n  other: false\nblocked:\n  text: [1,2]\n  other: false\nambiguous:\n  # attached?\n  text: |-\n    old\n    body\n  other: false\nunique:\n  text: >- # unique\nunchanged:\n  last: 8_080\n"
export const yamlBlockFieldDeleteEdited="# 配置 中文😀\nlabel: 我的草稿\nitems:\n  # 第一段\n\n  # independent\n\n  second: >2- # 第二段\n    后一段\n    折叠\n  third: |+ # 第三段\n    # 正文\n    text\n\nkept:\n  text: |+ # keep\n    # 正文\n    text\n\n  other: true\nempty:\n  text: >-\n  other: false\nblocked:\n  text: [1,2]\n  other: false\nambiguous:\n  # attached?\n  text: |-\n    old\n    body\n  other: false\nunique:\n  text: >- # unique\nunchanged:\n  last: 8_080\n"
export const yamlBlockFieldDeleteConflict="# 配置 中文😀\nlabel: 我的草稿\nitems:\n  # 第一段\n\n  # independent\n\n  # 第二段\n  third: |+ # 第三段\n    # 正文\n    text\n\nkept:\n  text: |+ # keep\n    # 正文\n    text\n\n  other: true\nempty:\n  text: >-\n  other: false\nblocked:\n  text: [1,2]\n  other: false\nambiguous:\n  # attached?\n  text: |-\n    old\n    body\n  other: false\nunique:\n  text: >- # unique\nunchanged:\n  last: 8_080\n"
export const yamlBlockFieldDeleteEmpty="# 配置 中文😀\nlabel: 我的草稿\nitems:\n  # 第一段\n\n  # independent\n\n  # 第二段\n  {} # 第三段\nkept:\n  text: |+ # keep\n    # 正文\n    text\n\n  other: true\nempty:\n  text: >-\n  other: false\nblocked:\n  text: [1,2]\n  other: false\nambiguous:\n  # attached?\n  text: |-\n    old\n    body\n  other: false\nunique:\n  text: >- # unique\nunchanged:\n  last: 8_080\n"
export const yamlBlockFieldDeleteOutputFiles=['installed-v131-block-field-delete-observations.json','installed-v131-yaml-saved.yaml','installed-v131-yaml-copy.yaml','installed-v131-yaml-external.yaml']
export function validateInstalledYamlBlockFieldDelete(r,m){
 assert.ok(['1.3.1','1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-yaml-block-field-deletion-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const prefix of ['locked','external']){assert.match(r[prefix+'Before'],/^[a-f0-9]{64}$/);assert.equal(r[prefix+'Before'],r[prefix+'After'])}
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),yamlBlockFieldDeleteChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.equal(r.deletionSelectionVerified,true);assert.equal(r.uniqueSelectionVerified,true)
}
export function assertYamlBlockFieldDeleteOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),yamlBlockFieldDeleteOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(yamlBlockFieldDeleteOutputFiles[0]).toString('utf8'));for(const id of yamlBlockFieldDeleteChecks)assert.equal(obs[id],true,id)
 assert.equal(read(yamlBlockFieldDeleteOutputFiles[1]).toString('utf8'),'\uFEFF'+yamlBlockFieldDeleteEdited.replaceAll('\n','\r\n'))
 assert.equal(read(yamlBlockFieldDeleteOutputFiles[2]).toString('utf8'),yamlBlockFieldDeleteConflict)
 assert.equal(read(yamlBlockFieldDeleteOutputFiles[3]).toString('utf8'),'\uFEFF'+yamlBlockFieldDeleteEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
