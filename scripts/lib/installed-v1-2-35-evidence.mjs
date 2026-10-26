import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const tomlLiteralChecks=['readable-literal-prefill-diff-draft-and-one-step-history','opening-newline-trailing-quotes-and-nested-field-editing','invalid-text-local-error-retains-input-and-source-resume','existing-basic-string-and-date-editing-still-available','source-switch-clears-form-diff-menu-and-preserves-drafts','real-locked-save-retry-and-bom-crlf-reopen','external-conflict-preserves-original-and-complete-literal-copy','full-library-wide-narrow-value-error-and-diff','owned-drafts-clean-and-no-runtime-error']
export const tomlLiteralSource="# 配置 中文😀\nlabel = '原稿'\ntext = '''第一行😀\n第二行''' # 保留\nopened = '''\n  原有缩进\n'''\nquotes = '''末尾'''''\nnumber = 0xFF\ndate = 2026-10-26\nbasic = \"\"\"转义\\n文字\"\"\"\n[nested]\ntext = '''嵌套'''\nnext = '保留'\n"
export const tomlLiteralDraft=tomlLiteralSource.replace('原稿','我的草稿')
export const tomlLiteralEdited=tomlLiteralDraft.replace('第二行','修改后的第二行')
export const tomlLiteralConflict=tomlLiteralEdited.replace("修改后的第二行'''", "修改后的第二行\n\n'''")
export const tomlLiteralOutputFiles=['installed-v1235-literal-observations.json','installed-v1235-toml-saved.toml','installed-v1235-toml-copy.toml','installed-v1235-toml-external.toml']
export function validateInstalledTomlLiteral(r,m){
 assert.ok(['1.2.35','1.2.36', '1.2.37', '1.2.38', '1.2.39'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-toml-literal-text-editing-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const prefix of ['locked','external']){assert.match(r[prefix+'Before'],/^[a-f0-9]{64}$/);assert.equal(r[prefix+'Before'],r[prefix+'After'])}
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),tomlLiteralChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.equal(r.exactPrefill,true)
}
export function assertTomlLiteralOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),tomlLiteralOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(tomlLiteralOutputFiles[0]).toString('utf8'));for(const id of tomlLiteralChecks)assert.equal(obs[id],true,id)
 assert.equal(read(tomlLiteralOutputFiles[1]).toString('utf8'),'\uFEFF'+tomlLiteralEdited.replaceAll('\n','\r\n'))
 assert.equal(read(tomlLiteralOutputFiles[2]).toString('utf8'),tomlLiteralConflict)
 assert.equal(read(tomlLiteralOutputFiles[3]).toString('utf8'),'\uFEFF'+tomlLiteralEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
