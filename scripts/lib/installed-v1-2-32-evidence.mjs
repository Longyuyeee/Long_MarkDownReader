import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const tomlFieldOrderChecks=['field-adjacent-moves-diff-draft-selection-and-history','raw-assignments-table-ownership-and-separated-comment-slots','boundaries-filtered-outline-and-fresh-repeated-moves','complex-and-ambiguous-local-source-fallback','source-switch-clears-diff-menu-and-preserves-drafts','real-locked-save-retry-and-bom-crlf-reopen','external-conflict-preserves-original-and-complete-ordered-copy','full-library-wide-narrow-context-menu-and-diff','owned-drafts-clean-and-no-runtime-error']
export const tomlFieldOrderSource="# 配置 中文😀\nlabel = '原稿'\nfirst = 0xFF # first\nsecond = '内容😀' # second\nthird = true\n\n# independent\n\nother = 8_080\n[section]\none = 0xFF\ntwo = '流'\nthree = 1979-05-27T07:32:00Z\n[blocked]\na = [1]\nb = 2\n[ambiguous]\na = 1\n# attached\nb = 2\n[dotted]\none.x = 1\none.y = 2\n"
export const tomlFieldOrderDraft=tomlFieldOrderSource.replace('原稿','我的草稿')
export const tomlFieldOrderEdited=tomlFieldOrderDraft.replace("first = 0xFF # first\nsecond = '内容😀' # second\n","second = '内容😀' # second\nfirst = 0xFF # first\n")
export const tomlFieldOrderConflict=tomlFieldOrderEdited.replace("first = 0xFF # first\nthird = true\n","third = true\nfirst = 0xFF # first\n")
export const tomlFieldOrderOutputFiles=['installed-v1232-order-observations.json','installed-v1232-toml-saved.toml','installed-v1232-toml-copy.toml','installed-v1232-toml-external.toml']
export function validateInstalledTomlFieldOrder(r,m){
 assert.ok(['1.2.32','1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9', '1.3.10', '1.3.11', '1.3.12', '1.3.13', '1.3.14', '1.3.15'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-toml-field-adjacent-order-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const prefix of ['locked','external']){assert.match(r[prefix+'Before'],/^[a-f0-9]{64}$/);assert.equal(r[prefix+'Before'],r[prefix+'After'])}
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),tomlFieldOrderChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.equal(r.boundariesDisabled,true)
}
export function assertTomlFieldOrderOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),tomlFieldOrderOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(tomlFieldOrderOutputFiles[0]).toString('utf8'));for(const id of tomlFieldOrderChecks)assert.equal(obs[id],true,id)
 assert.equal(read(tomlFieldOrderOutputFiles[1]).toString('utf8'),'\uFEFF'+tomlFieldOrderEdited.replaceAll('\n','\r\n'))
 assert.equal(read(tomlFieldOrderOutputFiles[2]).toString('utf8'),tomlFieldOrderConflict)
 assert.equal(read(tomlFieldOrderOutputFiles[3]).toString('utf8'),'\uFEFF'+tomlFieldOrderEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
