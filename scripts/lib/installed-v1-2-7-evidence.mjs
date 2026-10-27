import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const jsonArrayChecks=['move-current-draft-and-isolated-undo-redo','array-boundaries-disabled','nested-item-and-moved-record-focus','jsonc-internal-comments-and-ambiguous-gap-refusal','stale-preview-and-source-menu-never-change-newer-draft','real-locked-save-retry-and-reopen-preserve-literals','external-conflict-protects-reordered-draft-copy','source-switch-clears-menu-and-keeps-draft']
export const jsonArraySource=String.raw`{"draft":"原稿","rows":[{"id":"甲","n":9007199254740993123456789,"text":"\u4e2d\\"},{"id":"乙","nested":[1,{"x":2}]},{"id":"丙"}]}`
export const jsonArrayDraft=jsonArraySource.replace('原稿','我的草稿')
export const jsonArrayMoved=jsonArrayDraft.replace(String.raw`{"id":"甲","n":9007199254740993123456789,"text":"\u4e2d\\"},{"id":"乙","nested":[1,{"x":2}]}`,String.raw`{"id":"乙","nested":[1,{"x":2}]},{"id":"甲","n":9007199254740993123456789,"text":"\u4e2d\\"}`)
export function validateInstalledJsonArray(r,m){
 assert.ok(['1.2.7','1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-json-array-order-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),jsonArrayChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[]);assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'))
}
export function assertJsonArrayOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),['installed-v127-array-observations.json','installed-v127-array-saved.json','installed-v127-array-copy.json','installed-v127-array-external.json'])
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(r.outputs[0].fileName).toString('utf8'));for(const id of jsonArrayChecks)assert.equal(obs[id],true,id)
 assert.equal(read('installed-v127-array-saved.json').toString('utf8'),'\uFEFF'+jsonArrayMoved+'\r\n')
 assert.equal(read('installed-v127-array-copy.json').toString('utf8'),jsonArrayDraft+'\n')
 assert.equal(read('installed-v127-array-external.json').toString('utf8'),'\uFEFF'+jsonArrayMoved.replace('我的草稿','外部保留')+'\r\n')
}
