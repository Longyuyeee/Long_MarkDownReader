import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {test} from 'node:test'
import {chapterFixtureUri} from './lib/installed-v1-1-34-workflow.mjs'
import {portableChapterUri} from '../src/utils/portableChapterLinks.ts'
import {portableChapterChecks,validateInstalledPortableChapters} from './lib/installed-v1-1-34-evidence.mjs'
test('installed fixture uses Node builtins and the same chapter format as the production copy action',()=>{
 assert.equal(chapterFixtureUri('资料/目标 #%.md'),portableChapterUri('C:/库','C:/库/资料/目标 #%.md','重复','重复-1'))
 const source=fs.readFileSync('scripts/lib/installed-v1-1-34-workflow.mjs','utf8'),tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const value=node.arguments[0];if(value&&(ts.isStringLiteral(value)||ts.isNoSubstitutionTemplateLiteral(value)||ts.isTemplateExpression(value))){const expression=ts.isTemplateExpression(value)?value.head.text+value.templateSpans.map(s=>'__fixture__'+s.literal.text).join(''):value.text;assert.doesNotThrow(()=>new vm.Script(expression),expression);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=20)
 for(const forbidden of ["from 'typescript'",'dispatchEvent(','__TAURI_INTERNALS__=','force: true','Unidentified','transport was not provided'])assert.ok(!source.includes(forbidden),forbidden)
 assert.ok(source.includes("assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted')"));assert.ok(source.includes('刷新列表'));assert.ok(fs.readFileSync('scripts/lib/installed-v1-1-21-workflow.mjs','utf8').includes('runInstalledV1134Workflow'))
 for(const file of ['scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertPortableChapterOutputBytes'),file)
 assert.ok(fs.readFileSync('scripts/import-community-release-review.mjs','utf8').includes("[['portableChapters',reports.portableChapters.file]]"))
})
test('installed chapter evidence rejects partial tasks, changed identity, untrusted input or lost draft protection',()=>{
 const source='a'.repeat(40),installer='b'.repeat(64),manifest={appVersion:'1.1.34',sourceCommit:source,artifacts:[{target:'nsis',sha256:installer}]},report={appVersion:'1.1.34',sourceCommit:source,installerSha256:installer,harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-portable-chapters-trusted-ui-and-output-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:portableChapterChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],inputTrace:Array.from({length:12},(_,n)=>({type:['click','pointerdown','keydown','input'][n%4],trusted:true})),originalRelative:'资料/目标.md',clipboardLink:'[重复](<'+chapterFixtureUri('资料/目标.md')+'>)',localClipboardLink:'[重复](<C:/库/目标.md#%E9%87%8D%E5%A4%8D-1>)'}
 for(const k of ['clipboardExact','duplicateExact','draftsExact','renamedHeadingExact','missingExact','copyExact','renameExact','cancelExact','predecessorDraftsExact','savedSourceExact','savedTargetExact'])report[k]=true
 assert.doesNotThrow(()=>validateInstalledPortableChapters(report,manifest));for(const changed of [{...report,sourceCommit:'e'.repeat(40)},{...report,checks:report.checks.slice(1)},{...report,draftsExact:false},{...report,nativeBridgeMocked:true},{...report,inputTrace:[{type:'click',trusted:false}]}])assert.throws(()=>validateInstalledPortableChapters(changed,manifest))
})
