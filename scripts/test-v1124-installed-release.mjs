import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import vm from 'node:vm'
import {test} from 'node:test'
import ts from 'typescript'
import {chapterChecks,validateInstalledChapters,assertChapterOutputBytes} from './lib/installed-v1-1-24-evidence.mjs'
import {writingImageFixture} from './lib/writing-delivery-fixture.mjs'
const sha=b=>crypto.createHash('sha256').update(b).digest('hex')
test('chapter evidence binds three modes, drafts, clipboard and actual saved bytes',()=>{
 const saved='需要保留的章节草稿 wysiwyg\n需要保留的章节草稿 ir\n需要保留的章节草稿 sv\n第一节唯一 第二节唯一 代码里的假标题 images/shared.png 原值\n',copy=saved+'冲突后的章节草稿',original=saved+'外部修改必须保留'
 const bytes=new Map([['installed-v1124-saved.md',Buffer.from(saved)],['installed-v1124-conflict-copy.md',Buffer.from(copy)],['installed-v1124-external-original.md',Buffer.from(original)],['installed-v1124-shared.png',writingImageFixture()]])
 const manifest={appVersion:'1.1.24',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={appVersion:manifest.appVersion,sourceCommit:manifest.sourceCommit,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-markdown-chapters-trusted-ui-and-output-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:chapterChecks.map(id=>({id,status:'passed'})),modes:['wysiwyg','ir','sv'].map(mode=>({mode,outlineExact:true,cancelExact:true,moveExact:true,undoExact:true})),runtimeErrors:[],inputTrace:['click','pointerdown','keydown','input'].map(type=>({type,trusted:true})),fragment:'重复-1',clipboardLink:'[重复](<C:/test.md#重复-1>)',externalContent:original,conflictDraft:copy,savedSha256:sha(Buffer.from(saved)),outputs:[...bytes].map(([fileName,b])=>({fileName,sizeBytes:b.length,sha256:sha(b)}))}
 for(const flag of ['diskUnchanged','hierarchyExact','hierarchyUndoExact','clipboardExact','fragmentExact','readingRestored','otherDraftsPreserved','savedExact','reopenedExact','externalOriginalKept','conflictDraftKept','conflictCopyExact'])report[flag]=true
 validateInstalledChapters(report,manifest);assertChapterOutputBytes(report,file=>bytes.get(file))
 for(const mutate of [r=>r.checks.pop(),r=>r.diskUnchanged=false,r=>r.modes[1].undoExact=false,r=>r.nativeBridgeMocked=true,r=>r.sourceCommit='e'.repeat(40),r=>r.inputTrace[0].trusted=false,r=>r.fragment='重复']){const changed=structuredClone(report);mutate(changed);assert.throws(()=>validateInstalledChapters(changed,manifest))}
 assert.throws(()=>assertChapterOutputBytes(report,file=>file.endsWith('saved.md')?Buffer.from('stale draft'):bytes.get(file)))
})

test('chapter tasks are connected to real install, import, runtime and publication with valid browser expressions',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-24-workflow.mjs','utf8');for(const forbidden of ['dispatchEvent(','__TAURI_INTERNALS__=','force:true','force: true'])assert.ok(!source.includes(forbidden))
 const tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let expressions=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const value=node.arguments[0];if(value&&(ts.isStringLiteral(value)||ts.isNoSubstitutionTemplateLiteral(value))){assert.doesNotThrow(()=>new vm.Script(value.text),value.text);expressions++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(expressions>=10)
 for(const file of ['scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertChapterOutputBytes'),file)
 assert.ok(fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs','utf8').includes('runInstalledV1124Workflow'))
 assert.ok(fs.readFileSync('scripts/import-community-release-review.mjs','utf8').includes("[['chapters',reports.chapters.file]]"))
})
