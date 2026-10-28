import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const tomlBlockArrayDeleteChecks=["whole-block-delete-diff-draft-neighbor-selection-and-history", "last-unique-opening-newline-and-empty-literal-delete", "repeated-deletion-retains-standalone-comments-and-reaches-empty-array", "complex-and-shared-line-comment-local-source-fallback", "source-switch-clears-delete-diff-menu-and-preserves-drafts", "real-locked-save-retry-and-bom-crlf-reopen", "external-conflict-preserves-original-and-complete-deleted-draft-copy", "full-library-wide-narrow-context-menu-and-delete-diff", "owned-drafts-clean-and-no-runtime-error"]
export const tomlBlockArrayDeleteSource="# 配置 中文😀\nlabel = '原稿'\nitems = [\n  '''第一行😀\n第二行''', # 第一段\n\n# independent\n\n  \"\"\"后一段\n转义\\n折叠\"\"\", # 第二段\n  0xFF # number\n]\nkept = [\n  \"\"\"\n# 正文\n\ntext\n\"\"\" # keep\n]\nempty = ['''''', 0xFF]\nblocked = ['''old''', [1]]\nambiguous = ['''old''', # inline\n  false\n]\nunique = [\n  \"\"\"\n\"\"\", # keep unique\n]\nsimple = ['''a\nb''', 0xFF, true]\nlast = 8_080\n"
export const tomlBlockArrayDeleteDraft="# 配置 中文😀\nlabel = '我的草稿'\nitems = [\n  '''第一行😀\n第二行''', # 第一段\n\n# independent\n\n  \"\"\"后一段\n转义\\n折叠\"\"\", # 第二段\n  0xFF # number\n]\nkept = [\n  \"\"\"\n# 正文\n\ntext\n\"\"\" # keep\n]\nempty = ['''''', 0xFF]\nblocked = ['''old''', [1]]\nambiguous = ['''old''', # inline\n  false\n]\nunique = [\n  \"\"\"\n\"\"\", # keep unique\n]\nsimple = ['''a\nb''', 0xFF, true]\nlast = 8_080\n"
export const tomlBlockArrayDeleteEdited="# 配置 中文😀\nlabel = '我的草稿'\nitems = [\n   # 第一段\n\n# independent\n\n  \"\"\"后一段\n转义\\n折叠\"\"\", # 第二段\n  0xFF # number\n]\nkept = [\n  \"\"\"\n# 正文\n\ntext\n\"\"\" # keep\n]\nempty = ['''''', 0xFF]\nblocked = ['''old''', [1]]\nambiguous = ['''old''', # inline\n  false\n]\nunique = [\n  \"\"\"\n\"\"\", # keep unique\n]\nsimple = ['''a\nb''', 0xFF, true]\nlast = 8_080\n"
export const tomlBlockArrayDeleteConflict="# 配置 中文😀\nlabel = '我的草稿'\nitems = [\n   # 第一段\n\n# independent\n\n  \"\"\"后一段\n转义\\n折叠\"\"\" # 第二段\n   # number\n]\nkept = [\n  \"\"\"\n# 正文\n\ntext\n\"\"\" # keep\n]\nempty = ['''''', 0xFF]\nblocked = ['''old''', [1]]\nambiguous = ['''old''', # inline\n  false\n]\nunique = [\n  \"\"\"\n\"\"\", # keep unique\n]\nsimple = ['''a\nb''', 0xFF, true]\nlast = 8_080\n"
export const tomlBlockArrayDeleteEmpty="# 配置 中文😀\nlabel = '我的草稿'\nitems = [\n   # 第一段\n\n# independent\n\n   # 第二段\n   # number\n]\nkept = [\n  \"\"\"\n# 正文\n\ntext\n\"\"\" # keep\n]\nempty = ['''''', 0xFF]\nblocked = ['''old''', [1]]\nambiguous = ['''old''', # inline\n  false\n]\nunique = [\n  \"\"\"\n\"\"\", # keep unique\n]\nsimple = ['''a\nb''', 0xFF, true]\nlast = 8_080\n"
export const tomlBlockArrayDeleteOutputFiles=['installed-v1244-block-array-delete-observations.json','installed-v1244-toml-saved.toml','installed-v1244-toml-copy.toml','installed-v1244-toml-external.toml']
export function validateInstalledTomlBlockArrayDelete(r,m){
 assert.ok(['1.2.44','1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-toml-block-array-deletion-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const prefix of ['locked','external']){assert.match(r[prefix+'Before'],/^[a-f0-9]{64}$/);assert.equal(r[prefix+'Before'],r[prefix+'After'])}
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),tomlBlockArrayDeleteChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.equal(r.deletionSelectionVerified,true)
}
export function assertTomlBlockArrayDeleteOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),tomlBlockArrayDeleteOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(tomlBlockArrayDeleteOutputFiles[0]).toString('utf8'));for(const id of tomlBlockArrayDeleteChecks)assert.equal(obs[id],true,id)
 assert.equal(read(tomlBlockArrayDeleteOutputFiles[1]).toString('utf8'),'\uFEFF'+tomlBlockArrayDeleteEdited.replaceAll('\n','\r\n'))
 assert.equal(read(tomlBlockArrayDeleteOutputFiles[2]).toString('utf8'),tomlBlockArrayDeleteConflict)
 assert.equal(read(tomlBlockArrayDeleteOutputFiles[3]).toString('utf8'),'\uFEFF'+tomlBlockArrayDeleteEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
