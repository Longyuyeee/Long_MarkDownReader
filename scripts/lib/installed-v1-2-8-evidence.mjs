import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const jsonNodeChecks=['field-copy-name-selection-duplicate-correction-and-undo','adjacent-array-copy-and-mixed-move-history','independent-subtree-edit-and-tree-copy-focus','jsonc-internal-comments-and-ambiguous-gap-refusal','source-switch-clears-copy-preview-and-name-dialog','real-locked-save-retry-reopen-raw-literals','external-conflict-keeps-copy-draft-and-original','source-switch-keeps-draft-and-clears-copy-menu']
export const jsonNodeSource=String.raw`{"draft":"原稿","record":{"n":9007199254740993123456789,"text":"\u4e2d\\"},"record_copy":false,"rows":[{"id":"甲","nested":[1,{"x":2}]},{"id":"乙"}]}`
export const jsonNodeDraft=jsonNodeSource.replace('原稿','我的草稿')
export const jsonNodeField=jsonNodeDraft.replace(',"record_copy":',String.raw`,"record_reuse":{"n":9007199254740993123456789,"text":"\u4e2d\\"},"record_copy":`)
export const jsonNodeCopied=jsonNodeField.replace('{"id":"甲","nested":[1,{"x":2}]}','{"id":"甲","nested":[1,{"x":2}]},{"id":"甲","nested":[1,{"x":2}]}')
export const jsonNodeConflict=jsonNodeCopied.replace('{"id":"甲","nested":[1,{"x":2}]}','{"id":"甲","nested":[1,{"x":2}]},{"id":"甲","nested":[1,{"x":2}]}')
export function validateInstalledJsonNodeCopy(r,m){
 assert.ok(['1.2.8','1.2.9', '1.2.10', '1.2.11', '1.2.12'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-json-node-copy-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),jsonNodeChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[]);assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'))
}
export function assertJsonNodeCopyOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),['installed-v128-copy-observations.json','installed-v128-copy-saved.json','installed-v128-copy-copy.json','installed-v128-copy-external.json'])
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(r.outputs[0].fileName).toString('utf8'));for(const id of jsonNodeChecks)assert.equal(obs[id],true,id)
 assert.equal(read('installed-v128-copy-saved.json').toString('utf8'),'\uFEFF'+jsonNodeCopied+'\r\n')
 assert.equal(read('installed-v128-copy-copy.json').toString('utf8'),jsonNodeConflict+'\n')
 assert.equal(read('installed-v128-copy-external.json').toString('utf8'),'\uFEFF'+jsonNodeCopied.replace('我的草稿','外部保留')+'\r\n')
}
