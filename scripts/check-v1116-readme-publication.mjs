// Read-only publication audit: never a substitute for installed or public download receipts.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {execFileSync} from 'node:child_process'
import {assertInstalledReleaseRuntime} from './lib/installed-release-runtime.mjs'
const read=file=>fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n'),json=file=>JSON.parse(read(file))
const root='docs/evidence/v1.1.16-release/',manifest=json(root+'artifact-manifest.json'),receipt=json(root+'release-receipt.json'),api=json(root+'publication/published-api.json')
assert.equal(manifest.appVersion,'1.1.16');assert.equal(manifest.releasePublished,true);assertInstalledReleaseRuntime(manifest)
assert.equal(receipt.status,'published-and-remote-assets-verified');assert.equal(receipt.release.taggedCommit,manifest.sourceCommit)
assert.equal(execFileSync('git',['rev-parse','v1.1.16^{}'],{encoding:'utf8'}).trim(),manifest.sourceCommit)
assert.equal(api.tag_name,'v1.1.16');assert.equal(api.draft,false);assert.equal(api.prerelease,false)
assert.equal(api.body.replaceAll('\r\n','\n').trim(),read('docs/RELEASE_NOTES_v1.1.16.md').trim(),'Release body matches saved notes')
const readme=read('README.md'),previous=execFileSync('git',['show',manifest.sourceCommit+':README.md'],{encoding:'utf8'}).replaceAll('\r\n','\n')
assert.equal(readme.split('## 下载')[0],previous.split('## 下载')[0],'opening icon and introduction unchanged')
assert.ok(readme.indexOf('## 更新摘要')>readme.length*.8,'history belongs at the end')
for(const row of previous.split('\n').filter(line=>/^\| v1\.1\.\d+ \|/.test(line)))assert.ok(readme.split('\n').includes(row),'historical row preserved: '+row)
assert.equal(receipt.assets.length,3)
for(const asset of receipt.assets){
 assert.equal(asset.remoteDownloadVerified,true)
 const observed=api.assets.find(item=>item.name===asset.name);assert.ok(observed);assert.equal(observed.digest,'sha256:'+asset.sha256);assert.equal(observed.size,asset.sizeBytes)
 assert.ok(readme.includes('https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v1.1.16/'+asset.name))
 if(asset.name!=='SHA256SUMS.txt')assert.ok(readme.includes(asset.sha256+'  '+asset.name))
}
for(const file of ['docs/RELEASE_NOTES_v1.1.16.md','docs/V1_1_16_Unsigned_Community_Release_Audit_2026-10-18.md','docs/V1_1_17_DOCX_Preimplementation_Audit_2026-10-18.md'])assert.ok(fs.existsSync(file)&&readme.includes('('+file+')'))
assert.ok(readme.includes('当前公开稳定版为 **v1.1.16**'));assert.ok(readme.includes('下一版本：v1.1.17'))
const development=json('shared/development-version-policy.json')
assert.equal(development.publicVersion,'1.1.16');assert.equal(development.runtimeBaseVersion,'1.1.16');assert.equal(development.developmentTargetVersion,'1.1.17')
assert.equal(development.publicTagCommit,manifest.sourceCommit);assert.equal(development.releaseCandidate,false)
assert.equal(manifest.hostedInstalledLifecycle.graphExplorationChecksPassed,12)
assert.equal(manifest.hostedInstalledLifecycle.contentBackupChecksPassed,16)
assert.equal(manifest.hostedInstalledLifecycle.pdfReadingChecksPassed,14)
assert.equal(manifest.hostedInstalledLifecycle.writingDeliveryChecksPassed,12)
assert.equal(manifest.hostedInstalledLifecycle.tableEditingChecksPassed,10)
assert.equal(manifest.hostedInstalledLifecycle.workbookEditingChecksPassed,13)
console.log('v1.1.16 installed bytes, public redownload, README, Release and next DOCX target align.')
