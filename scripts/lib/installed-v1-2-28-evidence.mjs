import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const tomlOrderChecks=['flow-adjacent-moves-diff-draft-selection-and-history','block-inline-comments-and-separated-comment-slots','boundaries-filtered-outline-and-fresh-repeated-moves','complex-and-ambiguous-local-source-fallback','source-switch-clears-diff-menu-and-preserves-drafts','real-locked-save-retry-and-bom-crlf-reopen','external-conflict-preserves-original-and-complete-ordered-copy','full-library-wide-narrow-context-menu-and-diff','owned-drafts-clean-and-no-runtime-error']
export const tomlOrderSource="# 配置 中文😀\nlabel = '原稿'\nitems = [0xFF, '内容', true,]\nblock = [\n  '块', # first\n\n# independent\n\n  false # second\n]\nblocked = [[1], 2]\nambiguous = [1, # attached\n 2]\nother = 8_080\n"
export const tomlOrderDraft=tomlOrderSource.replace('原稿','我的草稿')
export const tomlOrderEdited=tomlOrderDraft.replace("[0xFF, '内容', true,]","['内容', 0xFF, true,]")
export const tomlOrderConflict=tomlOrderEdited.replace("['内容', 0xFF, true,]","['内容', true, 0xFF,]")
export const tomlOrderBlockEdited=tomlOrderEdited.replace("  '块', # first",'  false, # second').replace("  false # second\n]","  '块' # first\n]")
export const tomlOrderOutputFiles=['installed-v1228-order-observations.json','installed-v1228-toml-saved.toml','installed-v1228-toml-copy.toml','installed-v1228-toml-external.toml']
export function validateInstalledTomlOrder(r,m){
 assert.ok(['1.2.28','1.2.29', '1.2.30', '1.2.31', '1.2.32'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-toml-adjacent-order-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const prefix of ['locked','external']){assert.match(r[prefix+'Before'],/^[a-f0-9]{64}$/);assert.equal(r[prefix+'Before'],r[prefix+'After'])}
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),tomlOrderChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.equal(r.boundariesDisabled,true);assert.equal(r.arraysRemainExpanded,true)
}
export function assertTomlOrderOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),tomlOrderOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(tomlOrderOutputFiles[0]).toString('utf8'));for(const id of tomlOrderChecks)assert.equal(obs[id],true,id)
 assert.equal(read(tomlOrderOutputFiles[1]).toString('utf8'),'\uFEFF'+tomlOrderEdited.replaceAll('\n','\r\n'))
 assert.equal(read(tomlOrderOutputFiles[2]).toString('utf8'),tomlOrderConflict)
 assert.equal(read(tomlOrderOutputFiles[3]).toString('utf8'),'\uFEFF'+tomlOrderEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
