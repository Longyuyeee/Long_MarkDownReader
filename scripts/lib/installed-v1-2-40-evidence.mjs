import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const yamlBlockOperationsChecks=['block-copy-and-move-diff-draft-selection-and-history','keep-chomp-hash-body-and-empty-block-copy','boundaries-filtered-outline-and-fresh-repeated-moves','complex-and-ambiguous-local-source-fallback','source-switch-clears-diff-menu-and-preserves-drafts','real-locked-save-retry-and-bom-crlf-reopen','external-conflict-preserves-original-and-complete-block-operations-copy','full-library-wide-narrow-context-menu-and-diff','owned-drafts-clean-and-no-runtime-error']
export const yamlBlockOperationsSource="# 配置 中文😀\nlabel: 原稿\nitems:\n  - |- # 第一段\n    第一行😀\n    第二行\n\n  # independent\n\n  - >- # 第二段\n    后一段\n    折叠\n  - 0xFF # number\nkept:\n  - |+ # keep\n    # 正文\n    text\n\n  - true\nempty:\n  - >-\n  - false\nblocked:\n  - |-\n    old\n  - [1]\nambiguous:\n  - |-\n    old\n  # next?\n  - false\nother: 8_080\n"
export const yamlBlockOperationsDraft="# 配置 中文😀\nlabel: 我的草稿\nitems:\n  - |- # 第一段\n    第一行😀\n    第二行\n\n  # independent\n\n  - >- # 第二段\n    后一段\n    折叠\n  - 0xFF # number\nkept:\n  - |+ # keep\n    # 正文\n    text\n\n  - true\nempty:\n  - >-\n  - false\nblocked:\n  - |-\n    old\n  - [1]\nambiguous:\n  - |-\n    old\n  # next?\n  - false\nother: 8_080\n"
export const yamlBlockOperationsMoved="# 配置 中文😀\nlabel: 我的草稿\nitems:\n  - >- # 第二段\n    后一段\n    折叠\n\n  # independent\n\n  - |- # 第一段\n    第一行😀\n    第二行\n  - 0xFF # number\nkept:\n  - |+ # keep\n    # 正文\n    text\n\n  - true\nempty:\n  - >-\n  - false\nblocked:\n  - |-\n    old\n  - [1]\nambiguous:\n  - |-\n    old\n  # next?\n  - false\nother: 8_080\n"
export const yamlBlockOperationsEdited="# 配置 中文😀\nlabel: 我的草稿\nitems:\n  - >- # 第二段\n    后一段\n    折叠\n  - >- # 第二段\n    后一段\n    折叠\n\n  # independent\n\n  - |- # 第一段\n    第一行😀\n    第二行\n  - 0xFF # number\nkept:\n  - |+ # keep\n    # 正文\n    text\n\n  - true\nempty:\n  - >-\n  - false\nblocked:\n  - |-\n    old\n  - [1]\nambiguous:\n  - |-\n    old\n  # next?\n  - false\nother: 8_080\n"
export const yamlBlockOperationsConflict="# 配置 中文😀\nlabel: 我的草稿\nitems:\n  - >- # 第二段\n    后一段\n    折叠\n  - >- # 第二段\n    后一段\n    折叠\n\n  # independent\n\n  - 0xFF # number\n  - |- # 第一段\n    第一行😀\n    第二行\nkept:\n  - |+ # keep\n    # 正文\n    text\n\n  - true\nempty:\n  - >-\n  - false\nblocked:\n  - |-\n    old\n  - [1]\nambiguous:\n  - |-\n    old\n  # next?\n  - false\nother: 8_080\n"
export const yamlBlockOperationsOutputFiles=['installed-v1240-block-operations-observations.json','installed-v1240-yaml-saved.yaml','installed-v1240-yaml-copy.yaml','installed-v1240-yaml-external.yaml']
export function validateInstalledYamlBlockOperations(r,m){
 assert.ok(['1.2.40','1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9', '1.3.10', '1.3.11'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-yaml-block-item-operations-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const prefix of ['locked','external']){assert.match(r[prefix+'Before'],/^[a-f0-9]{64}$/);assert.equal(r[prefix+'Before'],r[prefix+'After'])}
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),yamlBlockOperationsChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.equal(r.boundariesDisabled,true)
}
export function assertYamlBlockOperationsOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),yamlBlockOperationsOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(yamlBlockOperationsOutputFiles[0]).toString('utf8'));for(const id of yamlBlockOperationsChecks)assert.equal(obs[id],true,id)
 assert.equal(read(yamlBlockOperationsOutputFiles[1]).toString('utf8'),'\uFEFF'+yamlBlockOperationsEdited.replaceAll('\n','\r\n'))
 assert.equal(read(yamlBlockOperationsOutputFiles[2]).toString('utf8'),yamlBlockOperationsConflict)
 assert.equal(read(yamlBlockOperationsOutputFiles[3]).toString('utf8'),'\uFEFF'+yamlBlockOperationsEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
