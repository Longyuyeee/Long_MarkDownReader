import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const listCopyChecks=['yaml-flow-copy-direct-diff-draft-and-history','yaml-block-comments-raw-types-and-repeated-copies','toml-raw-values-dates-and-reserved-name-copies','complex-items-local-source-fallback-keeps-drafts','source-switch-clears-preview-menu-and-resumes-drafts','real-locked-saves-retry-and-bom-crlf-reopen-both-formats','external-conflicts-preserve-originals-and-complete-copies','library-context-menu-and-unobscured-outline-wide-narrow','all-owned-fixtures-clean-and-no-runtime-error']
export const listCopySources={yaml:"# 配置 中文😀\nlabel: 原稿\nitems: [0xFF, '内容', true,]\nblock:\n  - '块' # attached\n  # independent\n  - false\nnullable: [null]\nblocked: [[1]]\nother: 8_080\n",toml:"# 配置 中文😀\nlabel = \"原稿\"\nitems = [0xFF, '内容', true,]\nempty = []\nblocked = [[1]]\n[other]\nitems = [8_080]\n"}
export const listCopyDrafts=Object.fromEntries(Object.entries(listCopySources).map(([k,v])=>[k,v.replace('原稿','我的草稿')]))
export const listCopyEdited=Object.fromEntries(Object.entries(listCopyDrafts).map(([k,v])=>[k,v.replace("'内容'","'内容', '内容'")]))
export const listCopyConflicts=Object.fromEntries(Object.entries(listCopyEdited).map(([k,v])=>[k,v.replace("'内容'","'内容', '内容'")]))
export const listCopyOutputFiles=['installed-v1226-copy-observations.json',...['yaml','toml'].flatMap(f=>['saved','copy','external'].map(k=>`installed-v1226-${f}-${k}.${f}`))]
export function validateInstalledListCopy(r,m){
 assert.ok(['1.2.26','1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-yaml-toml-item-copy-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const fmt of ['yaml','toml'])for(const prefix of ['locked','external']){assert.match(r[prefix+'Before'][fmt],/^[a-f0-9]{64}$/);assert.equal(r[prefix+'Before'][fmt],r[prefix+'After'][fmt])}
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),listCopyChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
 assert.deepEqual(r.contextViewportWidths,[1280,800]);assert.equal(r.floatingTriggerPresent,false)
}
export function assertListCopyOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),listCopyOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(listCopyOutputFiles[0]).toString('utf8'));for(const id of listCopyChecks)assert.equal(obs[id],true,id)
 for(const fmt of ['yaml','toml']){
  assert.equal(read(`installed-v1226-${fmt}-saved.${fmt}`).toString('utf8'),'\uFEFF'+listCopyEdited[fmt].replaceAll('\n','\r\n'))
  assert.equal(read(`installed-v1226-${fmt}-copy.${fmt}`).toString('utf8'),listCopyConflicts[fmt])
  assert.equal(read(`installed-v1226-${fmt}-external.${fmt}`).toString('utf8'),'\uFEFF'+listCopyEdited[fmt].replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
 }
}
