import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import vm from 'node:vm'
import {test} from 'node:test'
import ts from 'typescript'
import {attachmentChecks,validateInstalledAttachments,assertAttachmentOutputBytes} from './lib/installed-v1-1-23-evidence.mjs'
import {writingImageFixture} from './lib/writing-delivery-fixture.mjs'
const sha=b=>crypto.createHash('sha256').update(b).digest('hex')
test('attachment evidence requires all native tasks, draft protection, actual picker and original output bytes',()=>{
 const png=writingImageFixture(),bytes=new Map([['installed-v1123-saved.md',Buffer.from('需要保留的附件草稿\n![修复](images/new.png)\n![副本](.assets/a.png)\n')],['installed-v1123-shared.png',png],['installed-v1123-imported.png',png]])
 const manifest={appVersion:'1.1.23',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},picker={status:'selected-real-native-dialog',dialogClosed:true,desktopUserSession:'disposable-github-hosted'},report={appVersion:manifest.appVersion,sourceCommit:manifest.sourceCommit,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-attachments-native-picker-draft-and-output-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:attachmentChecks.map(id=>({id,status:'passed'})),queryReadOnly:true,draftPreserved:true,undoExact:true,cancelExact:true,missingRepaired:true,sourcePreserved:true,collisionPreserved:true,referenceOpened:true,renameRestoreExact:true,otherDraftsPreserved:true,runtimeErrors:[],inputTrace:['click','pointerdown','keydown','input'].map(type=>({type,trusted:true})),sourceImageSha256:sha(png),externalImageSha256:sha(png),cancelPicker:{...picker,status:'cancelled-real-native-dialog'},internalPicker:picker,externalPicker:picker,outputs:[...bytes].map(([fileName,b])=>({fileName,sizeBytes:b.length,sha256:sha(b)}))}
 validateInstalledAttachments(report,manifest);assertAttachmentOutputBytes(report,file=>bytes.get(file))
 for(const mutate of [r=>r.checks.pop(),r=>r.draftPreserved=false,r=>r.collisionPreserved=false,r=>r.nativeBridgeMocked=true,r=>r.sourceCommit='e'.repeat(40),r=>r.inputTrace[0].trusted=false,r=>r.cancelPicker.status='selected-real-native-dialog']){const changed=structuredClone(report);mutate(changed);assert.throws(()=>validateInstalledAttachments(changed,manifest))}
 assert.throws(()=>assertAttachmentOutputBytes(report,file=>file.endsWith('saved.md')?Buffer.from('stale draft'):bytes.get(file)))
})
test('attachment tasks are connected to real install, import, runtime and publication with valid browser expressions',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-23-workflow.mjs','utf8');for(const forbidden of ['dispatchEvent(','__TAURI_INTERNALS__=','force:true','force: true'])assert.ok(!source.includes(forbidden))
 const tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let expressions=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const value=node.arguments[0];if(value&&(ts.isStringLiteral(value)||ts.isNoSubstitutionTemplateLiteral(value))){assert.doesNotThrow(()=>new vm.Script(value.text),value.text);expressions++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(expressions>=10)
 for(const file of ['scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertAttachmentOutputBytes'),file)
 assert.ok(fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs','utf8').includes('runInstalledV1123Workflow'))
 assert.ok(fs.readFileSync('scripts/import-community-release-review.mjs','utf8').includes("[['attachments',reports.attachments.file]]"))
})
