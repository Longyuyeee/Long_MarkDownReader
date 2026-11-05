import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const tomlArrayMultilineChecks=['readable-basic-prefill-diff-draft-and-one-step-history','opening-newline-trailing-quotes-and-nested-field-editing','literal-error-stays-local-and-retains-input','decoded-escapes-delimiters-backslashes-and-existing-date-editing','source-switch-clears-form-diff-menu-and-preserves-drafts','real-locked-save-retry-and-bom-crlf-reopen','external-conflict-preserves-original-and-complete-basic-copy','full-library-wide-narrow-value-error-and-diff','owned-drafts-clean-and-no-runtime-error']
export const tomlArrayMultilineSource="# 配置 中文😀\nlabel = '原稿'\ntext = [\"\"\"第一行😀\n第二行\"\"\", 0xFF] # 保留\nopened = [\"\"\"\n  原有缩进\n\"\"\", 0xFF]\nquotes = [\"\"\"末尾\"\"\"\"\", 0xFF]\nnumber = 0xFF\ndate = 2026-10-26\nliteral = ['''原有多行''', 0xFF]\nescaped = [\"\"\"转义\\n\\u4E2D\\U0001F600\\\\目录\"\"\", 0xFF]\n[nested]\ntext = [\"\"\"嵌套\"\"\", 0xFF]\nnext = '保留'\n"
export const tomlArrayMultilineDraft=tomlArrayMultilineSource.replace('原稿','我的草稿')
export const tomlArrayMultilineEdited=tomlArrayMultilineDraft.replace('第二行','修改后的第二行')
export const tomlArrayMultilineConflict=tomlArrayMultilineEdited.replace('修改后的第二行"""','修改后的第二行\n\n"""')
export const tomlArrayMultilineOutputFiles=['installed-v1239-array-multiline-observations.json','installed-v1239-toml-saved.toml','installed-v1239-toml-copy.toml','installed-v1239-toml-external.toml']
export function validateInstalledTomlArrayMultiline(r,m){
 assert.ok(['1.2.39','1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9', '1.3.10', '1.3.11', '1.3.12', '1.3.13', '1.3.14', '1.3.15'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-toml-array-multiline-text-editing-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const prefix of ['locked','external']){assert.match(r[prefix+'Before'],/^[a-f0-9]{64}$/);assert.equal(r[prefix+'Before'],r[prefix+'After'])}
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),tomlArrayMultilineChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.equal(r.exactPrefill,true)
}
export function assertTomlArrayMultilineOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),tomlArrayMultilineOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(tomlArrayMultilineOutputFiles[0]).toString('utf8'));for(const id of tomlArrayMultilineChecks)assert.equal(obs[id],true,id)
 assert.equal(read(tomlArrayMultilineOutputFiles[1]).toString('utf8'),'\uFEFF'+tomlArrayMultilineEdited.replaceAll('\n','\r\n'))
 assert.equal(read(tomlArrayMultilineOutputFiles[2]).toString('utf8'),tomlArrayMultilineConflict)
 assert.equal(read(tomlArrayMultilineOutputFiles[3]).toString('utf8'),'\uFEFF'+tomlArrayMultilineEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
