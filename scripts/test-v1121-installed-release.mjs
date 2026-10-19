import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import vm from 'node:vm'
import {test} from 'node:test'
import ts from 'typescript'
import {crossCopyChecks,validateInstalledCrossCopy,assertCrossCopyOutputBytes} from './lib/installed-v1-1-21-evidence.mjs'
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
test('copy evidence rejects changed source, missing tasks, untrusted input and changed dependency bytes',()=>{
 const rows=[['original.md','source/saved.md','\uFEFF# 已保存的方案\r\n![图片](images/a.png)\r\n[关联](notes/linked.md)\r\n'],['copied.md','target/saved.md','\uFEFF# 已保存的方案\r\n![图片](saved.assets/a.png)\r\n[关联](saved.assets/linked.md)\r\n'],['image.png','target/saved.assets/a.png','image bytes'],['linked.md','target/saved.assets/linked.md','[返回](../saved.md)\r\n'],['retry.txt','target/retry/记录.txt','外部程序修改后的新版本\r\n'],['collision.md','target/collision.md','目标原有内容'],['unselected.txt','source/unselected.txt','不要改动的文件\r\n']]
 const bytes=new Map(rows.map(([name,,value])=>['installed-v1121-'+name,Buffer.from(value)])),manifest={appVersion:'1.1.21',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]}
 const report={appVersion:manifest.appVersion,sourceCommit:manifest.sourceCommit,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-cross-library-copy-native-input-and-output-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:crossCopyChecks.map(id=>({id,status:'passed'})),inputTrace:['click','pointerdown','keydown','input'].map(type=>({type,trusted:true})),unselectedBefore:sha('unselected'),unselectedAfter:sha('unselected'),runtimeErrors:[],copiedDocument:'target/saved.md',imageSha256:sha('image bytes'),outputs:rows.map(([name,relativePath])=>({fileName:'installed-v1121-'+name,relativePath,sizeBytes:bytes.get('installed-v1121-'+name).length,sha256:sha(bytes.get('installed-v1121-'+name))}))}
 for(const key of ['previewReadOnly','collisionExact','sourceDraftExact','sourceOriginalExact','dependenciesExact','folderExact','partialExact','retryExact','warningCancelExact','warningChoiceExact','receiptRepeatExact','explicitCleanupSave','predecessorDraftsPreserved'])report[key]=true
 validateInstalledCrossCopy(report,manifest);assertCrossCopyOutputBytes(report,file=>bytes.get(file))
 for(const mutate of [r=>r.checks.pop(),r=>r.sourceCommit='e'.repeat(40),r=>r.nativeBridgeMocked=true,r=>r.sourceDraftExact=false,r=>r.inputTrace[0].trusted=false,r=>r.runtimeErrors.push('error'),r=>r.outputs[0].relativePath='../outside']){const broken=structuredClone(report);mutate(broken);assert.throws(()=>validateInstalledCrossCopy(broken,manifest))}
 assert.throws(()=>assertCrossCopyOutputBytes(report,file=>file.includes('image')?Buffer.from('changed'):bytes.get(file)))
 const changed=structuredClone(report);const file='installed-v1121-linked.md',bad=Buffer.from('[返回](../wrong.md)');changed.outputs.find(o=>o.fileName===file).sizeBytes=bad.length;changed.outputs.find(o=>o.fileName===file).sha256=sha(bad);assert.throws(()=>assertCrossCopyOutputBytes(changed,name=>name===file?bad:bytes.get(name)))
})
test('copy native driver uses actual input, parses browser expressions and retains predecessor reports',()=>{
 const driver=fs.readFileSync('scripts/lib/installed-v1-1-21-workflow.mjs','utf8')
 for(const prohibited of ['dispatchEvent(','__TAURI_INTERNALS__=','force:true','force: true'])assert.ok(!driver.includes(prohibited))
 for(const file of ['scripts/lib/installed-release-runtime.mjs','scripts/import-community-release-review.mjs','.github/workflows/community-release-publish.yml']){const text=fs.readFileSync(file,'utf8');assert.ok(text.includes('assertCrossCopyOutputBytes'),file);assert.ok(text.includes('assertStructuredOutputBytes'),file)}
 const tree=ts.createSourceFile('driver.mjs',driver,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let expressions=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const value=node.arguments[0];if(value&&(ts.isStringLiteral(value)||ts.isNoSubstitutionTemplateLiteral(value))){assert.doesNotThrow(()=>new vm.Script(value.text),value.text);expressions++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(expressions>=10)
})
