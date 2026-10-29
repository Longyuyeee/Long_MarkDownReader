import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const tomlArraysChecks=['lazy-expand-locate-append-type-independent-undo-redo','insert-after-and-delete-items-keeps-expanded-state','empty-array-first-last-datetime-and-reserved-names','collection-fallback-retains-input-and-source-location','switch-form-preview-menu-preserves-draft','real-locked-save-retry-and-reopen','external-conflict-copy-keeps-source-and-draft','all-owned-fixtures-clean-and-no-runtime-error']
export const tomlArraysSource='# 配置 中文😀\nlabel = "原稿"\nitems = [0xFF, \'内容\',]\nempty = []\nblocked = [[1]]\n[other]\nitems = [8_080]\n'
export const tomlArraysDraft=tomlArraysSource.replace('原稿','我的草稿')
export const tomlArraysAdded=tomlArraysDraft.replace("'内容',]","'内容', true,]")
export const tomlArraysEdited=tomlArraysAdded.replace("'内容',",'')
export const tomlArraysConflict=tomlArraysEdited.replace('true,]','true, false,]')
export const tomlArraysOutputFiles=['installed-v1224-toml-observations.json','installed-v1224-toml-saved.toml','installed-v1224-toml-copy.toml','installed-v1224-toml-external.toml']
export function validateInstalledTomlArrays(r,m){
 assert.ok(['1.2.24','1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-toml-array-items-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64],['lockedBefore',64],['externalBefore',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 assert.equal(r.lockedBefore,r.lockedAfter);assert.equal(r.externalBefore,r.externalAfter)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),tomlArraysChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
}
export function assertTomlArraysOutputBytes(r,read){
 const names=tomlArraysOutputFiles
 assert.deepEqual(r.outputs.map(o=>o.fileName),names)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(names[0]).toString('utf8'));for(const id of tomlArraysChecks)assert.equal(obs[id],true,id)
 assert.equal(read(names[1]).toString('utf8'),'\uFEFF'+tomlArraysEdited.replaceAll('\n','\r\n'))
 assert.equal(read(names[2]).toString('utf8'),tomlArraysConflict)
 assert.equal(read(names[3]).toString('utf8'),'\uFEFF'+tomlArraysEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
