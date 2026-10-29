import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const yamlFoldedChecks=['readable-folded-prefill-diff-draft-and-one-step-history','paragraph-breaks-clip-keep-explicit-indent-and-sequence-fields','invalid-text-local-error-retains-input-and-source-resume','existing-literal-and-tagged-source-fallback-keep-workspace-usable','source-switch-clears-form-diff-menu-and-preserves-drafts','real-locked-save-retry-and-bom-crlf-reopen','external-conflict-preserves-original-and-complete-folded-copy','full-library-wide-narrow-value-error-and-newline-diff','owned-drafts-clean-and-no-runtime-error']
export const yamlFoldedSource="# 配置 中文😀\nlabel: '原稿'\nstrip: >- # 保留\n  第一行😀\n  第二行\n\n# 独立注释\nclip: > # 保留\n  文本\nkeep: >+\n  留白\n\nnumber: 0xFF\nliteral: |-\n  原有多行\ntagged: !custom value\nnested:\n  text: >2-\n    嵌套\n  next: keep\nrows:\n  - text: >-\n      列表\n    next: keep\n"
export const yamlFoldedDraft=yamlFoldedSource.replace('原稿','我的草稿')
export const yamlFoldedEdited=yamlFoldedDraft.replace('  第一行😀\n  第二行\n','  第一行😀\n  \n  修改后的第二行\n')
export const yamlFoldedConflict=yamlFoldedEdited.replace('strip: >- # 保留\n  第一行😀\n  \n  修改后的第二行\n\n','strip: >+ # 保留\n  第一行😀\n  \n  修改后的第二行\n  \n')
export const yamlFoldedOutputFiles=['installed-v1236-folded-observations.json','installed-v1236-yaml-saved.yaml','installed-v1236-yaml-copy.yaml','installed-v1236-yaml-external.yaml']
export function validateInstalledYamlFolded(r,m){
 assert.ok(['1.2.36','1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9', '1.3.10', '1.3.11'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-yaml-folded-text-editing-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const prefix of ['locked','external']){assert.match(r[prefix+'Before'],/^[a-f0-9]{64}$/);assert.equal(r[prefix+'Before'],r[prefix+'After'])}
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),yamlFoldedChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.equal(r.exactPrefill,true)
}
export function assertYamlFoldedOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),yamlFoldedOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(yamlFoldedOutputFiles[0]).toString('utf8'));for(const id of yamlFoldedChecks)assert.equal(obs[id],true,id)
 assert.equal(read(yamlFoldedOutputFiles[1]).toString('utf8'),'\uFEFF'+yamlFoldedEdited.replaceAll('\n','\r\n'))
 assert.equal(read(yamlFoldedOutputFiles[2]).toString('utf8'),yamlFoldedConflict)
 assert.equal(read(yamlFoldedOutputFiles[3]).toString('utf8'),'\uFEFF'+yamlFoldedEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
