import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export const tomlDatetimeChecks=['offset-raw-prefill-diff-draft-and-one-step-history','all-four-date-time-kinds-and-exact-precision','invalid-date-local-error-retains-input-and-source-resume','primitive-type-change-and-complex-source-fallback','source-switch-clears-form-diff-menu-and-preserves-drafts','real-locked-save-retry-and-bom-crlf-reopen','external-conflict-preserves-original-and-complete-datetime-copy','full-library-wide-narrow-value-error-and-diff','owned-drafts-clean-and-no-runtime-error']
export const tomlDatetimeSource="# 配置 中文😀\nlabel = '原稿'\ndate = 2024-02-29 # 日期\ntime = 07:32:00.123456789 # 时间\nlocal = 1979-05-27T07:32:00.000001 # 本地\noffset = 1979-05-27t07:32:00.123456789-07:00 # 时区\nnumber = 0xFF\nflag = true\ninline = {x=1}\n[section]\ndate = 2024-02-29\n"
export const tomlDatetimeDraft=tomlDatetimeSource.replace('原稿','我的草稿')
export const tomlDatetimeEdited=tomlDatetimeDraft.replace('1979-05-27t07:32:00.123456789-07:00','2026-10-25 15:04:05.000000001+08:00')
export const tomlDatetimeConflict=tomlDatetimeEdited.replace('date = 2024-02-29 # 日期','date = 2026-10-25 # 日期')
export const tomlDatetimeOutputFiles=['installed-v1233-datetime-observations.json','installed-v1233-toml-saved.toml','installed-v1233-toml-copy.toml','installed-v1233-toml-external.toml']
export function validateInstalledTomlDatetime(r,m){
 assert.ok(['1.2.33','1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9', '1.3.10', '1.3.11', '1.3.12', '1.3.13'].includes(m.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(r[k],m[k]);assert.equal(r.installerSha256,m.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(r.status,'passed');assert.equal(r.evidenceLevel,'installed-toml-datetime-editing-trusted-input-and-file-bytes')
 for(const[k,n]of [['harnessSourceCommit',40],['executableSha256',64]])assert.match(r[k],new RegExp('^[a-f0-9]{'+n+'}$'))
 for(const prefix of ['locked','external']){assert.match(r[prefix+'Before'],/^[a-f0-9]{64}$/);assert.equal(r[prefix+'Before'],r[prefix+'After'])}
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(r[k],false)
 assert.deepEqual(r.checks.map(c=>[c.id,c.status]),tomlDatetimeChecks.map(id=>[id,'passed']));assert.deepEqual(r.runtimeErrors,[])
 assert.ok(r.inputTrace.length>10&&r.inputTrace.every(e=>e.trusted));assert.ok(r.inputTrace.some(e=>e.type==='input'));assert.equal(r.disposableDraftsExplicitlyDiscarded,true)
 assert.deepEqual(r.viewportWidths,[1280,800]);assert.equal(r.exactPrefill,true)
}
export function assertTomlDatetimeOutputBytes(r,read){
 assert.deepEqual(r.outputs.map(o=>o.fileName),tomlDatetimeOutputFiles)
 for(const o of r.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.sha256)}
 const obs=JSON.parse(read(tomlDatetimeOutputFiles[0]).toString('utf8'));for(const id of tomlDatetimeChecks)assert.equal(obs[id],true,id)
 assert.equal(read(tomlDatetimeOutputFiles[1]).toString('utf8'),'\uFEFF'+tomlDatetimeEdited.replaceAll('\n','\r\n'))
 assert.equal(read(tomlDatetimeOutputFiles[2]).toString('utf8'),tomlDatetimeConflict)
 assert.equal(read(tomlDatetimeOutputFiles[3]).toString('utf8'),'\uFEFF'+tomlDatetimeEdited.replace('我的草稿','外部保留').replaceAll('\n','\r\n'))
}
