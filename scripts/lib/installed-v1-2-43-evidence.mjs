import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const tomlBlockFieldsChecks=['block-field-copy-and-move-diff-draft-selection-and-history','opening-newline-hash-body-empty-and-name-collision','boundaries-filtered-outline-and-fresh-repeated-moves','complex-and-ambiguous-local-source-fallback','source-switch-clears-diff-menu-and-preserves-drafts','real-locked-save-retry-and-bom-crlf-reopen','external-conflict-preserves-original-and-complete-block-fields-copy','full-library-wide-narrow-context-menu-and-diff','owned-drafts-clean-and-no-runtime-error']
export const tomlBlockFieldsSource="# 配置 中文😀\nlabel = '原稿'\n[items]\nfirst = '''第一行😀\n第二行''' # 第一段\n\n# independent\n\nsecond = \"\"\"后一段\n转义\\n折叠\"\"\" # 第二段\nthird = 0xFF # number\n[kept]\ntext = \"\"\"\n# 正文\ntext\n\"\"\" # keep\n\nother = true\n[empty]\ntext = \"\"\"\n\"\"\"\nother = false\n[blocked]\ntext = [1]\nother = false\n[ambiguous]\n# attached?\ntext = '''old\nbody'''\nother = false\n[unchanged]\nlast = 8_080\n"
export const tomlBlockFieldsDraft="# 配置 中文😀\nlabel = '我的草稿'\n[items]\nfirst = '''第一行😀\n第二行''' # 第一段\n\n# independent\n\nsecond = \"\"\"后一段\n转义\\n折叠\"\"\" # 第二段\nthird = 0xFF # number\n[kept]\ntext = \"\"\"\n# 正文\ntext\n\"\"\" # keep\n\nother = true\n[empty]\ntext = \"\"\"\n\"\"\"\nother = false\n[blocked]\ntext = [1]\nother = false\n[ambiguous]\n# attached?\ntext = '''old\nbody'''\nother = false\n[unchanged]\nlast = 8_080\n"
export const tomlBlockFieldsMoved="# 配置 中文😀\nlabel = '我的草稿'\n[items]\nsecond = \"\"\"后一段\n转义\\n折叠\"\"\" # 第二段\n\n# independent\n\nfirst = '''第一行😀\n第二行''' # 第一段\nthird = 0xFF # number\n[kept]\ntext = \"\"\"\n# 正文\ntext\n\"\"\" # keep\n\nother = true\n[empty]\ntext = \"\"\"\n\"\"\"\nother = false\n[blocked]\ntext = [1]\nother = false\n[ambiguous]\n# attached?\ntext = '''old\nbody'''\nother = false\n[unchanged]\nlast = 8_080\n"
export const tomlBlockFieldsEdited="# 配置 中文😀\nlabel = '我的草稿'\n[items]\nsecond = \"\"\"后一段\n转义\\n折叠\"\"\" # 第二段\nsecond_copy = \"\"\"后一段\n转义\\n折叠\"\"\" # 第二段\n\n# independent\n\nfirst = '''第一行😀\n第二行''' # 第一段\nthird = 0xFF # number\n[kept]\ntext = \"\"\"\n# 正文\ntext\n\"\"\" # keep\n\nother = true\n[empty]\ntext = \"\"\"\n\"\"\"\nother = false\n[blocked]\ntext = [1]\nother = false\n[ambiguous]\n# attached?\ntext = '''old\nbody'''\nother = false\n[unchanged]\nlast = 8_080\n"
export const tomlBlockFieldsConflict="# 配置 中文😀\nlabel = '我的草稿'\n[items]\nsecond = \"\"\"后一段\n转义\\n折叠\"\"\" # 第二段\nsecond_copy = \"\"\"后一段\n转义\\n折叠\"\"\" # 第二段\n\n# independent\n\nthird = 0xFF # number\nfirst = '''第一行😀\n第二行''' # 第一段\n[kept]\ntext = \"\"\"\n# 正文\ntext\n\"\"\" # keep\n\nother = true\n[empty]\ntext = \"\"\"\n\"\"\"\nother = false\n[blocked]\ntext = [1]\nother = false\n[ambiguous]\n# attached?\ntext = '''old\nbody'''\nother = false\n[unchanged]\nlast = 8_080\n"
export const tomlBlockFieldsOutputFiles=['installed-v1243-block-fields-observations.json','installed-v1243-toml-saved.toml','installed-v1243-toml-copy.toml','installed-v1243-toml-external.toml']
export function validateInstalledTomlBlockFields(r,m){
 assert.equal(m.appVersion,'1.2.43');for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-toml-block-field-operations-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const prefix of ['locked','external']){assert.match(r[prefix+'Before'],/^[a-f0-9]{64}$/);assert.equal(r[prefix+'Before'],r[prefix+'After'])}
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),tomlBlockFieldsChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.equal(r.boundariesDisabled,true)
}
export function assertTomlBlockFieldsOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),tomlBlockFieldsOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(tomlBlockFieldsOutputFiles[0]).toString('utf8'));for(const id of tomlBlockFieldsChecks)assert.equal(obs[id],true,id)
 assert.equal(read(tomlBlockFieldsOutputFiles[1]).toString('utf8'),'\uFEFF'+tomlBlockFieldsEdited.replaceAll('\n','\r\n'))
 assert.equal(read(tomlBlockFieldsOutputFiles[2]).toString('utf8'),tomlBlockFieldsConflict)
 assert.equal(read(tomlBlockFieldsOutputFiles[3]).toString('utf8'),'\uFEFF'+tomlBlockFieldsEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
