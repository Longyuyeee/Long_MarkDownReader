import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import crypto from 'node:crypto'
import ts from 'typescript'
import {test} from 'node:test'
import {chapterFixtureUri} from './lib/installed-v1-1-34-workflow.mjs'
import {portableChapterUri} from '../src/utils/portableChapterLinks.ts'
import {portableChapterChecks,validateInstalledPortableChapters,assertPortableChapterOutputBytes} from './lib/installed-v1-1-34-evidence.mjs'
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
 const source='a'.repeat(40),installer='b'.repeat(64),manifest={appVersion:'1.1.34',sourceCommit:source,artifacts:[{target:'nsis',sha256:installer}]},report={appVersion:'1.1.34',sourceCommit:source,installerSha256:installer,harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-portable-chapters-trusted-ui-and-output-bytes',editorModeBefore:'ir',editorModeAfter:'ir',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:portableChapterChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],inputTrace:Array.from({length:12},(_,n)=>({type:['click','pointerdown','keydown','input'][n%4],trusted:true})),originalRelative:'资料/目标.md',clipboardLink:'[重复](<'+chapterFixtureUri('资料/目标.md')+'>)',localClipboardLink:'[重复](<C:/库/目标.md#%E9%87%8D%E5%A4%8D-1>)'}
 for(const k of ['clipboardExact','duplicateExact','draftsExact','renamedHeadingExact','missingExact','copyExact','renameExact','cancelExact','predecessorDraftsExact','savedSourceExact','savedTargetExact'])report[k]=true
 assert.doesNotThrow(()=>validateInstalledPortableChapters(report,manifest));for(const changed of [{...report,sourceCommit:'e'.repeat(40)},{...report,checks:report.checks.slice(1)},{...report,draftsExact:false},{...report,editorModeAfter:'wysiwyg'},{...report,nativeBridgeMocked:true},{...report,inputTrace:[{type:'click',trusted:false}]}])assert.throws(()=>validateInstalledPortableChapters(changed,manifest))
})
test('output verifier retains exact prose and draft bytes while requiring actual mapped dependencies',()=>{
 const before=chapterFixtureUri('来源/目标.md'),after=chapterFixtureUri('接收/目标.md'),renameBefore=chapterFixtureUri('来源/旧名.md'),renameAfter=chapterFixtureUri('来源/新名.md'),target='# 重复\n\n## 重复\n\n目标保留草稿\n',source='来源保留草稿\n',copySource='自己的补写\r\n[重复](<'+before+'>)\r\n末尾保留\r\n',renameNote='补写\r\n[重复](<'+renameBefore+'>)\r\n最后\r\n',observed={duplicateFragment:'重复-1',duplicateTitle:'重复',sourceDraftPreserved:true,targetDraftPreserved:true,renamedMessage:'未找到原章节',missingMessage:'找不到章节所在文件',sourceCopyUnchanged:true,cancelDirectoryExists:false},report={sourceDraft:source,targetDraft:target,originalRelative:'来源/目标.md',dependencyRelative:'接收/目标.md',renamedRelative:'来源/新名.md'}
 const data=new Map(Object.entries({'source.md':source,'target.md':target,'copy-source.md':copySource,'copied.md':copySource.replace(before,after),'dependency.md':target,'rename-before.md':renameNote,'rename-note.md':renameNote.replace(renameBefore,renameAfter),'renamed.md':'# 重复\n\n## 重复\n\n改名原件正文。\n','observations.json':JSON.stringify(observed)}).map(([k,v])=>['installed-v1134-'+k,Buffer.from(v)]))
 const outputs=()=>report.outputs=[...data].map(([fileName,b])=>({fileName,sizeBytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')}));outputs();assert.doesNotThrow(()=>assertPortableChapterOutputBytes(report,n=>data.get(n)))
 for(const[file,value]of [['dependency.md','错误文档\n'],['copied.md',copySource.replace(before,after)+'额外改写\n'],['rename-note.md',renameNote.replace(renameBefore,renameAfter).replace('补写','遗失')]]){const name='installed-v1134-'+file,original=data.get(name);data.set(name,Buffer.from(value));outputs();assert.throws(()=>assertPortableChapterOutputBytes(report,n=>data.get(n)));data.set(name,original)}
})
