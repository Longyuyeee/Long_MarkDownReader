import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const tomlBlockFieldDeleteChecks=["whole-block-field-delete-diff-draft-neighbor-selection-and-history", "last-unique-opening-newline-and-empty-field-delete", "repeated-deletion-keeps-standalone-comments-and-selects-parent-table", "complex-local-fallback-and-independent-comments-retained", "source-switch-clears-delete-diff-menu-and-preserves-drafts", "real-locked-save-retry-and-bom-crlf-reopen", "external-conflict-preserves-original-and-complete-deleted-field-draft-copy", "full-library-wide-narrow-context-menu-and-delete-diff", "owned-drafts-clean-and-no-runtime-error"]
export const tomlBlockFieldDeleteSource="# 配置 中文😀\nlabel = '原稿'\n[items]\nfirst = '''第一行😀\n第二行''' # 第一段\n\n# independent\n\nsecond = \"\"\"后一段\n转义\\n折叠\"\"\" # 第二段\nthird = 0xFF # number\n[kept]\ntext = \"\"\"\n# 正文\ntext\n\"\"\" # keep\n\nother = true\n[empty]\ntext = \"\"\"\n\"\"\"\nother = false\n[blocked]\ntext = [\n1,\n2\n]\nother = false\n[ambiguous]\n# attached?\ntext = '''old\nbody'''\nother = false\n[unique]\ntext = \"\"\"\n\"\"\" # unique\n[unchanged]\nlast = 8_080\n"
export const tomlBlockFieldDeleteDraft="# 配置 中文😀\nlabel = '我的草稿'\n[items]\nfirst = '''第一行😀\n第二行''' # 第一段\n\n# independent\n\nsecond = \"\"\"后一段\n转义\\n折叠\"\"\" # 第二段\nthird = 0xFF # number\n[kept]\ntext = \"\"\"\n# 正文\ntext\n\"\"\" # keep\n\nother = true\n[empty]\ntext = \"\"\"\n\"\"\"\nother = false\n[blocked]\ntext = [\n1,\n2\n]\nother = false\n[ambiguous]\n# attached?\ntext = '''old\nbody'''\nother = false\n[unique]\ntext = \"\"\"\n\"\"\" # unique\n[unchanged]\nlast = 8_080\n"
export const tomlBlockFieldDeleteEdited="# 配置 中文😀\nlabel = '我的草稿'\n[items]\n# 第一段\n\n# independent\n\nsecond = \"\"\"后一段\n转义\\n折叠\"\"\" # 第二段\nthird = 0xFF # number\n[kept]\ntext = \"\"\"\n# 正文\ntext\n\"\"\" # keep\n\nother = true\n[empty]\ntext = \"\"\"\n\"\"\"\nother = false\n[blocked]\ntext = [\n1,\n2\n]\nother = false\n[ambiguous]\n# attached?\ntext = '''old\nbody'''\nother = false\n[unique]\ntext = \"\"\"\n\"\"\" # unique\n[unchanged]\nlast = 8_080\n"
export const tomlBlockFieldDeleteConflict="# 配置 中文😀\nlabel = '我的草稿'\n[items]\n# 第一段\n\n# independent\n\n# 第二段\nthird = 0xFF # number\n[kept]\ntext = \"\"\"\n# 正文\ntext\n\"\"\" # keep\n\nother = true\n[empty]\ntext = \"\"\"\n\"\"\"\nother = false\n[blocked]\ntext = [\n1,\n2\n]\nother = false\n[ambiguous]\n# attached?\ntext = '''old\nbody'''\nother = false\n[unique]\ntext = \"\"\"\n\"\"\" # unique\n[unchanged]\nlast = 8_080\n"
export const tomlBlockFieldDeleteEmpty="# 配置 中文😀\nlabel = '我的草稿'\n[items]\n# 第一段\n\n# independent\n\n# 第二段\n# number\n[kept]\ntext = \"\"\"\n# 正文\ntext\n\"\"\" # keep\n\nother = true\n[empty]\ntext = \"\"\"\n\"\"\"\nother = false\n[blocked]\ntext = [\n1,\n2\n]\nother = false\n[ambiguous]\n# attached?\ntext = '''old\nbody'''\nother = false\n[unique]\ntext = \"\"\"\n\"\"\" # unique\n[unchanged]\nlast = 8_080\n"
export const tomlBlockFieldDeleteOutputFiles=['installed-v1245-block-field-delete-observations.json','installed-v1245-toml-saved.toml','installed-v1245-toml-copy.toml','installed-v1245-toml-external.toml']
export function validateInstalledTomlBlockFieldDelete(r,m){
 assert.ok(['1.2.45','1.3.0', '1.3.1'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-toml-block-field-deletion-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const prefix of ['locked','external']){assert.match(r[prefix+'Before'],/^[a-f0-9]{64}$/);assert.equal(r[prefix+'Before'],r[prefix+'After'])}
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),tomlBlockFieldDeleteChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.equal(r.deletionSelectionVerified,true)
}
export function assertTomlBlockFieldDeleteOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),tomlBlockFieldDeleteOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(tomlBlockFieldDeleteOutputFiles[0]).toString('utf8'));for(const id of tomlBlockFieldDeleteChecks)assert.equal(obs[id],true,id)
 assert.equal(read(tomlBlockFieldDeleteOutputFiles[1]).toString('utf8'),'\uFEFF'+tomlBlockFieldDeleteEdited.replaceAll('\n','\r\n'))
 assert.equal(read(tomlBlockFieldDeleteOutputFiles[2]).toString('utf8'),tomlBlockFieldDeleteConflict)
 assert.equal(read(tomlBlockFieldDeleteOutputFiles[3]).toString('utf8'),'\uFEFF'+tomlBlockFieldDeleteEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
