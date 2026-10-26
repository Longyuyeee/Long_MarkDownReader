import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const tomlBlockArraysChecks=['block-copy-and-move-diff-draft-selection-and-history','opening-newline-hash-body-empty-literal-and-last-item-copy','boundaries-filtered-outline-and-fresh-repeated-moves','complex-and-ambiguous-local-source-fallback','source-switch-clears-diff-menu-and-preserves-drafts','real-locked-save-retry-and-bom-crlf-reopen','external-conflict-preserves-original-and-complete-block-arrays-copy','full-library-wide-narrow-context-menu-and-diff','owned-drafts-clean-and-no-runtime-error']
export const tomlBlockArraysSource="# 配置 中文😀\nlabel = '原稿'\nitems = [\n  '''第一行😀\n第二行''', # 第一段\n\n# independent\n\n  \"\"\"后一段\\n折叠\"\"\", # 第二段\n  0xFF # number\n]\nkept = [\n  \"\"\"\n# 正文\n\ntext\n\"\"\" # keep\n]\nempty = ['''''', 0xFF]\nblocked = ['''old''', [1]]\nambiguous = [\n# attached?\n  '''old''',\n  false\n]\nlast = 8_080\n"
export const tomlBlockArraysDraft="# 配置 中文😀\nlabel = '我的草稿'\nitems = [\n  '''第一行😀\n第二行''', # 第一段\n\n# independent\n\n  \"\"\"后一段\\n折叠\"\"\", # 第二段\n  0xFF # number\n]\nkept = [\n  \"\"\"\n# 正文\n\ntext\n\"\"\" # keep\n]\nempty = ['''''', 0xFF]\nblocked = ['''old''', [1]]\nambiguous = [\n# attached?\n  '''old''',\n  false\n]\nlast = 8_080\n"
export const tomlBlockArraysMoved="# 配置 中文😀\nlabel = '我的草稿'\nitems = [\n  \"\"\"后一段\\n折叠\"\"\", # 第二段\n\n# independent\n\n  '''第一行😀\n第二行''', # 第一段\n  0xFF # number\n]\nkept = [\n  \"\"\"\n# 正文\n\ntext\n\"\"\" # keep\n]\nempty = ['''''', 0xFF]\nblocked = ['''old''', [1]]\nambiguous = [\n# attached?\n  '''old''',\n  false\n]\nlast = 8_080\n"
export const tomlBlockArraysEdited="# 配置 中文😀\nlabel = '我的草稿'\nitems = [\n  \"\"\"后一段\\n折叠\"\"\", # 第二段\n  \"\"\"后一段\\n折叠\"\"\", # 第二段\n\n# independent\n\n  '''第一行😀\n第二行''', # 第一段\n  0xFF # number\n]\nkept = [\n  \"\"\"\n# 正文\n\ntext\n\"\"\" # keep\n]\nempty = ['''''', 0xFF]\nblocked = ['''old''', [1]]\nambiguous = [\n# attached?\n  '''old''',\n  false\n]\nlast = 8_080\n"
export const tomlBlockArraysConflict="# 配置 中文😀\nlabel = '我的草稿'\nitems = [\n  \"\"\"后一段\\n折叠\"\"\", # 第二段\n  \"\"\"后一段\\n折叠\"\"\", # 第二段\n\n# independent\n\n  0xFF, # number\n  '''第一行😀\n第二行''' # 第一段\n]\nkept = [\n  \"\"\"\n# 正文\n\ntext\n\"\"\" # keep\n]\nempty = ['''''', 0xFF]\nblocked = ['''old''', [1]]\nambiguous = [\n# attached?\n  '''old''',\n  false\n]\nlast = 8_080\n"
export const tomlBlockArraysOutputFiles=['installed-v1242-block-arrays-observations.json','installed-v1242-toml-saved.toml','installed-v1242-toml-copy.toml','installed-v1242-toml-external.toml']
export function validateInstalledTomlBlockArrays(r,m){
 assert.equal(m.appVersion,'1.2.42');for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-toml-block-array-operations-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const prefix of ['locked','external']){assert.match(r[prefix+'Before'],/^[a-f0-9]{64}$/);assert.equal(r[prefix+'Before'],r[prefix+'After'])}
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),tomlBlockArraysChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.equal(r.boundariesDisabled,true)
}
export function assertTomlBlockArraysOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),tomlBlockArraysOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(tomlBlockArraysOutputFiles[0]).toString('utf8'));for(const id of tomlBlockArraysChecks)assert.equal(obs[id],true,id)
 assert.equal(read(tomlBlockArraysOutputFiles[1]).toString('utf8'),'\uFEFF'+tomlBlockArraysEdited.replaceAll('\n','\r\n'))
 assert.equal(read(tomlBlockArraysOutputFiles[2]).toString('utf8'),tomlBlockArraysConflict)
 assert.equal(read(tomlBlockArraysOutputFiles[3]).toString('utf8'),'\uFEFF'+tomlBlockArraysEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
