// Read-only publication/document verification against preserved real receipts.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {execFileSync} from 'node:child_process'
const read=file=>fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')
const json=file=>JSON.parse(read(file))
const readme=read('README.md'),previous=execFileSync('git',['show','b92c18a1705cf787a05c2b3a97e78feeb29d46fb:README.md'],{encoding:'utf8'}).replaceAll('\r\n','\n')
assert.equal(readme.replaceAll('\r\n','\n').split('## 下载')[0],previous.split('## 下载')[0],'keep opening icon and product introduction unchanged')
assert.ok(readme.indexOf('## 更新摘要')>readme.length*.8,'version history stays at the end')
for(const line of previous.split('\n').filter(line=>/^\| v1\.1\.[0-8] \|/.test(line)))assert.ok(readme.replaceAll('\r\n','\n').split('\n').includes(line),'preserve historical version row: '+line)
const root='docs/evidence/v1.1.9-release/',receipt=json(root+'release-receipt.json'),api=json(root+'publication/published-api.json')
assert.equal(receipt.status,'published-and-remote-assets-verified');assert.equal(api.tag_name,'v1.1.9');assert.equal(api.draft,false);assert.equal(api.prerelease,false)
// Windows Actions/gh preserve CRLF in the public body; compare prose with
// canonical line endings, without rewriting the preserved API or notes bytes.
assert.equal(api.body.replaceAll('\r\n','\n').trim(),read('docs/RELEASE_NOTES_v1.1.9.md').replaceAll('\r\n','\n').trim(),'published Release body matches the saved notes')
for(const asset of receipt.assets){
 assert.equal(asset.remoteDownloadVerified,true)
 assert.ok(readme.includes('https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v1.1.9/'+asset.name))
 if(asset.name!=='SHA256SUMS.txt')assert.ok(readme.includes(asset.sha256+'  '+asset.name),'README checksum matches actual public bytes')
}
for(const file of ['docs/RELEASE_NOTES_v1.1.9.md','docs/V1_1_9_Unsigned_Community_Release_Audit_2026-10-17.md','docs/V1_1_10_Tag_Collections_Preimplementation_Audit_2026-10-17.md'])assert.ok(fs.existsSync(file)&&readme.includes('('+file+')'))
assert.ok(readme.includes('下一版本：v1.1.10'));assert.ok(readme.includes('当前公开稳定版为 **v1.1.9**'))
const development=json('shared/development-version-policy.json')
assert.equal(development.publicVersion,'1.1.9');assert.equal(development.runtimeBaseVersion,'1.1.9');assert.equal(development.developmentTargetVersion,'1.1.10')
console.log('v1.1.9 README/public Release/receipts aligned; opening icon, historical rows and footer-only version history preserved.')
