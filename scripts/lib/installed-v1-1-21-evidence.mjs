import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
export const crossCopyChecks=['automatic-preview-is-read-only','new-directory-and-no-overwrite-collision','saved-source-copy-keeps-live-draft','markdown-image-and-cycle-dependencies','folder-copy-excludes-internal-metadata','changed-source-partial-result','retry-only-unfinished-items','warning-preview-cancel-and-explicit-choice','same-native-plan-receipt-is-idempotent','trusted-input-source-and-unselected-preserved']
export function validateInstalledCrossCopy(report,manifest){
 assert.ok(['1.1.21','1.1.22', '1.1.23', '1.1.24'].includes(manifest.appVersion));assert.equal(report.appVersion,manifest.appVersion);assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 for(const key of ['sourceCommit','harnessSourceCommit'])assert.match(report[key],/^[a-f0-9]{40}$/)
 assert.match(report.executableSha256,/^[a-f0-9]{64}$/);assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-cross-library-copy-native-input-and-output-bytes')
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[key],false,key)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),crossCopyChecks.map(id=>[id,'passed']))
 for(const key of ['previewReadOnly','collisionExact','sourceDraftExact','sourceOriginalExact','dependenciesExact','folderExact','partialExact','retryExact','warningCancelExact','warningChoiceExact','receiptRepeatExact','explicitCleanupSave','predecessorDraftsPreserved'])assert.equal(report[key],true,key)
 assert.equal(report.unselectedBefore,report.unselectedAfter);assert.match(report.unselectedBefore,/^[a-f0-9]{64}$/);assert.deepEqual(report.runtimeErrors,[])
 for(const type of ['click','pointerdown','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted),type)
 assert.ok(report.inputTrace.every(e=>e.trusted));assert.ok(report.outputs.length>=7);assert.equal(new Set(report.outputs.map(f=>f.fileName)).size,report.outputs.length)
 for(const item of report.outputs){assert.match(item.fileName,/^installed-v1121-[a-z0-9-]+\.(?:md|txt|png|bin)$/);assert.match(item.sha256,/^[a-f0-9]{64}$/);assert.ok(item.sizeBytes>=0);assert.ok(item.relativePath&&!path.posix.isAbsolute(item.relativePath)&&!item.relativePath.split('/').includes('..'))}
}
export function assertCrossCopyOutputBytes(report,read){
 const files=new Map();for(const item of report.outputs){const bytes=read(item.fileName);assert.equal(bytes.length,item.sizeBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256);files.set(item.relativePath,bytes)}
 const original=files.get('source/saved.md'),copy=files.get(report.copiedDocument);assert.ok(original&&copy);assert.equal(original.toString(),'\uFEFF# 已保存的方案\r\n![图片](images/a.png)\r\n[关联](notes/linked.md)\r\n');assert.ok(copy.toString().startsWith('\uFEFF# 已保存的方案\r\n'));assert.equal(copy.toString().includes('必须保留的未保存草稿'),false)
 const links=[...copy.toString().matchAll(/\]\(([^)]+)\)/g)].map(m=>path.posix.normalize(path.posix.join(path.posix.dirname(report.copiedDocument),decodeURIComponent(m[1]))));assert.equal(links.length,2)
 for(const link of links)assert.ok(files.has(link),'copied relative dependency missing: '+link)
 assert.equal(crypto.createHash('sha256').update(files.get(links.find(l=>l.endsWith('.png')))).digest('hex'),report.imageSha256)
 const note=links.find(l=>l.endsWith('.md')),back=files.get(note).toString().match(/\]\(([^)]+)\)/);assert.ok(back);assert.equal(path.posix.normalize(path.posix.join(path.posix.dirname(note),decodeURIComponent(back[1]))),report.copiedDocument)
 assert.equal(files.get('target/retry/记录.txt').toString(),'外部程序修改后的新版本\r\n');assert.equal(files.get('target/collision.md').toString(),'目标原有内容');assert.equal(files.get('source/unselected.txt').toString(),'不要改动的文件\r\n')
}
