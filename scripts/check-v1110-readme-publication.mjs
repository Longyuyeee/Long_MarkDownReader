// Read-only: run only after importing the real v1.1.10 public receipts.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {execFileSync} from 'node:child_process'
const read=file=>fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')
const json=file=>JSON.parse(read(file))
const canonical=text=>text.replaceAll('\r\n','\n')
const product='599374bf4f11454889e11a6f0f9a7ac6e2cabb0e'
const readme=canonical(read('README.md'))
const previous=canonical(execFileSync('git',['show',product+':README.md'],{encoding:'utf8'}))
assert.equal(readme.split('## 下载')[0],previous.split('## 下载')[0],'keep opening icon and introduction unchanged')
assert.ok(readme.indexOf('## 更新摘要')>readme.length*.8,'version history belongs at the end')
for(const row of previous.split('\n').filter(line=>/^\| v1\.1\.\d+ \|/.test(line)))assert.ok(readme.split('\n').includes(row),'preserve historical row: '+row)
const root='docs/evidence/v1.1.10-release/',receipt=json(root+'release-receipt.json'),api=json(root+'publication/published-api.json')
assert.equal(receipt.status,'published-and-remote-assets-verified');assert.equal(receipt.release.taggedCommit,product)
assert.equal(execFileSync('git',['rev-parse','v1.1.10^{}'],{encoding:'utf8'}).trim(),product)
assert.equal(api.tag_name,'v1.1.10');assert.equal(api.draft,false);assert.equal(api.prerelease,false)
assert.equal(canonical(api.body).trim(),canonical(read('docs/RELEASE_NOTES_v1.1.10.md')).trim(),'public Release body matches saved notes')
assert.equal(receipt.assets.length,3)
for(const asset of receipt.assets){
 assert.equal(asset.remoteDownloadVerified,true)
 assert.ok(readme.includes('https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v1.1.10/'+asset.name))
 if(asset.name!=='SHA256SUMS.txt')assert.ok(readme.includes(asset.sha256+'  '+asset.name),'checksum matches public bytes')
}
for(const file of ['docs/RELEASE_NOTES_v1.1.10.md','docs/V1_1_10_Unsigned_Community_Release_Audit_2026-10-17.md','docs/V1_1_11_Graph_Preimplementation_Audit_2026-10-17.md'])assert.ok(fs.existsSync(file)&&readme.includes('('+file+')'))
assert.ok(readme.includes('下一版本：v1.1.11'));assert.ok(readme.includes('当前公开稳定版为 **v1.1.10**'))
const development=json('shared/development-version-policy.json')
assert.equal(development.publicVersion,'1.1.10');assert.equal(development.runtimeBaseVersion,'1.1.10');assert.equal(development.developmentTargetVersion,'1.1.11')
console.log('v1.1.10 public bytes, README, Release, opening icon, historical rows and next graph target align.')
