import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const yamlBlockFieldsChecks=['block-field-copy-and-move-diff-draft-selection-and-history','keep-chomp-hash-body-empty-and-name-collision','boundaries-filtered-outline-and-fresh-repeated-moves','complex-and-ambiguous-local-source-fallback','source-switch-clears-diff-menu-and-preserves-drafts','real-locked-save-retry-and-bom-crlf-reopen','external-conflict-preserves-original-and-complete-block-fields-copy','full-library-wide-narrow-context-menu-and-diff','owned-drafts-clean-and-no-runtime-error']
export const yamlBlockFieldsSource="# 配置 中文😀\nlabel: 原稿\nitems:\n  first: |- # 第一段\n    第一行😀\n    第二行\n\n  # independent\n\n  second: >- # 第二段\n    后一段\n    折叠\n  third: 0xFF # number\nkept:\n  text: |+ # keep\n    # 正文\n    text\n\n  other: true\nempty:\n  text: >-\n  other: false\nblocked:\n  text: |-\n    old\n  other: [1]\nambiguous:\n  # attached?\n  text: |-\n    old\n  other: false\nlast: 8_080\n"
export const yamlBlockFieldsDraft="# 配置 中文😀\nlabel: 我的草稿\nitems:\n  first: |- # 第一段\n    第一行😀\n    第二行\n\n  # independent\n\n  second: >- # 第二段\n    后一段\n    折叠\n  third: 0xFF # number\nkept:\n  text: |+ # keep\n    # 正文\n    text\n\n  other: true\nempty:\n  text: >-\n  other: false\nblocked:\n  text: |-\n    old\n  other: [1]\nambiguous:\n  # attached?\n  text: |-\n    old\n  other: false\nlast: 8_080\n"
export const yamlBlockFieldsMoved="# 配置 中文😀\nlabel: 我的草稿\nitems:\n  second: >- # 第二段\n    后一段\n    折叠\n\n  # independent\n\n  first: |- # 第一段\n    第一行😀\n    第二行\n  third: 0xFF # number\nkept:\n  text: |+ # keep\n    # 正文\n    text\n\n  other: true\nempty:\n  text: >-\n  other: false\nblocked:\n  text: |-\n    old\n  other: [1]\nambiguous:\n  # attached?\n  text: |-\n    old\n  other: false\nlast: 8_080\n"
export const yamlBlockFieldsEdited="# 配置 中文😀\nlabel: 我的草稿\nitems:\n  second: >- # 第二段\n    后一段\n    折叠\n  second_copy: >- # 第二段\n    后一段\n    折叠\n\n  # independent\n\n  first: |- # 第一段\n    第一行😀\n    第二行\n  third: 0xFF # number\nkept:\n  text: |+ # keep\n    # 正文\n    text\n\n  other: true\nempty:\n  text: >-\n  other: false\nblocked:\n  text: |-\n    old\n  other: [1]\nambiguous:\n  # attached?\n  text: |-\n    old\n  other: false\nlast: 8_080\n"
export const yamlBlockFieldsConflict="# 配置 中文😀\nlabel: 我的草稿\nitems:\n  second: >- # 第二段\n    后一段\n    折叠\n  second_copy: >- # 第二段\n    后一段\n    折叠\n\n  # independent\n\n  third: 0xFF # number\n  first: |- # 第一段\n    第一行😀\n    第二行\nkept:\n  text: |+ # keep\n    # 正文\n    text\n\n  other: true\nempty:\n  text: >-\n  other: false\nblocked:\n  text: |-\n    old\n  other: [1]\nambiguous:\n  # attached?\n  text: |-\n    old\n  other: false\nlast: 8_080\n"
export const yamlBlockFieldsOutputFiles=['installed-v1241-block-fields-observations.json','installed-v1241-yaml-saved.yaml','installed-v1241-yaml-copy.yaml','installed-v1241-yaml-external.yaml']
export function validateInstalledYamlBlockFields(r,m){
 assert.ok(['1.2.41','1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-yaml-block-field-operations-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const prefix of ['locked','external']){assert.match(r[prefix+'Before'],/^[a-f0-9]{64}$/);assert.equal(r[prefix+'Before'],r[prefix+'After'])}
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),yamlBlockFieldsChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.equal(r.boundariesDisabled,true)
}
export function assertYamlBlockFieldsOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),yamlBlockFieldsOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(yamlBlockFieldsOutputFiles[0]).toString('utf8'));for(const id of yamlBlockFieldsChecks)assert.equal(obs[id],true,id)
 assert.equal(read(yamlBlockFieldsOutputFiles[1]).toString('utf8'),'\uFEFF'+yamlBlockFieldsEdited.replaceAll('\n','\r\n'))
 assert.equal(read(yamlBlockFieldsOutputFiles[2]).toString('utf8'),yamlBlockFieldsConflict)
 assert.equal(read(yamlBlockFieldsOutputFiles[3]).toString('utf8'),'\uFEFF'+yamlBlockFieldsEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
