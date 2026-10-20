import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import vm from 'node:vm'
import {test} from 'node:test'
import ts from 'typescript'
import {fileHistoryChecks,validateInstalledFileHistory,assertFileHistoryOutputBytes} from './lib/installed-v1-1-22-evidence.mjs'
const sha=b=>crypto.createHash('sha256').update(b).digest('hex')
test('file history evidence binds actual restart, every task and protected output bytes',()=>{
 const bytes=new Map([['installed-v1122-draft.md',Buffer.from('需要保留的整理草稿\n')],['installed-v1122-later-edit.txt',Buffer.from('后来写入的内容\r\n')],['installed-v1122-restored.txt',Buffer.from('整理前的内容\r\n')]])
 const manifest={appVersion:'1.1.22',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={appVersion:manifest.appVersion,sourceCommit:manifest.sourceCommit,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-file-operation-history-native-input-and-process-restart',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:fileHistoryChecks.map(id=>({id,status:'passed'})),draftPreserved:true,laterEditPreserved:true,copyViewOnly:true,otherDraftsPreserved:true,queryReadOnly:true,restartExact:true,restoreExact:true,noRepeat:true,runtimeErrors:[],inputTrace:['click','pointerdown','keydown','input'].map(type=>({type,trusted:true})),processRestart:{executableSha256:'d'.repeat(64),nativeVersion:'1.1.22'},outputs:[...bytes].map(([fileName,b])=>({fileName,sizeBytes:b.length,sha256:sha(b)}))}
 validateInstalledFileHistory(report,manifest);assertFileHistoryOutputBytes(report,name=>bytes.get(name))
 for(const mutate of [r=>r.checks.pop(),r=>r.draftPreserved=false,r=>r.restartExact=false,r=>r.sourceCommit='e'.repeat(40),r=>r.inputTrace[0].trusted=false,r=>delete r.processRestart,r=>r.noRepeat=false]){const changed=structuredClone(report);mutate(changed);assert.throws(()=>validateInstalledFileHistory(changed,manifest))}
 assert.throws(()=>assertFileHistoryOutputBytes(report,name=>name.includes('later-edit')?Buffer.from('changed'):bytes.get(name)))
})
test('native history tasks use production input and literal browser expressions parse',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-22-workflow.mjs','utf8');for(const text of ['dispatchEvent(','__TAURI_INTERNALS__=','force:true','force: true'])assert.ok(!source.includes(text))
 const tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let expressions=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const value=node.arguments[0];if(value&&(ts.isStringLiteral(value)||ts.isNoSubstitutionTemplateLiteral(value))){assert.doesNotThrow(()=>new vm.Script(value.text),value.text);expressions++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(expressions>=10)
 for(const file of ['scripts/lib/installed-release-runtime.mjs','scripts/import-community-release-review.mjs','.github/workflows/community-release-publish.yml']){const text=fs.readFileSync(file,'utf8');assert.ok(text.includes('assertFileHistoryOutputBytes'));assert.ok(text.includes('assertCrossCopyOutputBytes'))}
 assert.ok(fs.readFileSync('scripts/run-r5i-isolated-install-lifecycle.ps1','utf8').includes('capture-v1122-installed-restart.mjs'))
})
