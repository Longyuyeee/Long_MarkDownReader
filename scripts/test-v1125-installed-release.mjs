import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import vm from 'node:vm'
import {test} from 'node:test'
import ts from 'typescript'
import {findFixture,textFindFixture} from './lib/document-find-fixture.mjs'
import {writingImageFixture} from './lib/writing-delivery-fixture.mjs'
import {findReplaceChecks,validateInstalledFindReplace,assertFindReplaceOutputBytes} from './lib/installed-v1-1-25-evidence.mjs'
const sha=b=>crypto.createHash('sha256').update(b).digest('hex')
test('find/replace evidence binds exact modes, draft ownership, undo and saved output bytes',()=>{
 const saved=findFixture+['wysiwyg','ir','sv'].map(m=>'需要保留的查找草稿 '+m+'\n').join(''),copy=saved+'冲突查找草稿',original=saved+'外部修改必须保留'
 const bytes=new Map([['installed-v1125-saved.md',Buffer.from(saved)],['installed-v1125-saved.txt',Buffer.from(textFindFixture)],['installed-v1125-conflict-copy.md',Buffer.from(copy)],['installed-v1125-external-original.md',Buffer.from(original)],['installed-v1125-shared.png',writingImageFixture()]])
 const manifest={appVersion:'1.1.25',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={appVersion:manifest.appVersion,sourceCommit:manifest.sourceCommit,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-document-find-replace-trusted-ui-and-output-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:findReplaceChecks.map(id=>({id,status:'passed'})),modes:['wysiwyg','ir','sv'].map(mode=>({mode,selectionExact:true,replaceExact:true,undoExact:true})),runtimeErrors:[],inputTrace:['click','pointerdown','keydown','input'].map(type=>({type,trusted:true})),saveConvention:{lineEnding:'lf',hasFinalNewline:true},submittedDraft:saved+'\n',savedText:textFindFixture,externalContent:original,conflictDraft:copy,outputs:[...bytes].map(([fileName,b])=>({fileName,sizeBytes:b.length,sha256:sha(b)}))}
 for(const key of ['caseWordExact','navigationExact','cancelExact','allReplaceExact','allUndoExact','diskUnchanged','textSelectionExact','textUndoExact','nativeFindRetained','switchExact','otherDraftsPreserved','savedExact','savedFindAvailable','reopenedExact','externalOriginalKept','conflictDraftKept','conflictCopyExact','imageUnchanged'])report[key]=true
 validateInstalledFindReplace(report,manifest);assertFindReplaceOutputBytes(report,file=>bytes.get(file))
 for(const mutate of [r=>r.checks.pop(),r=>r.diskUnchanged=false,r=>r.modes[1].undoExact=false,r=>r.nativeBridgeMocked=true,r=>r.sourceCommit='e'.repeat(40),r=>r.inputTrace[0].trusted=false]){const changed=structuredClone(report);mutate(changed);assert.throws(()=>validateInstalledFindReplace(changed,manifest))}
 assert.throws(()=>assertFindReplaceOutputBytes(report,file=>file.endsWith('saved.md')?Buffer.from('stale draft'):bytes.get(file)));const changed=structuredClone(report);changed.submittedDraft=changed.submittedDraft.replace('用户','访客');assert.throws(()=>assertFindReplaceOutputBytes(changed,file=>bytes.get(file)))
})
test('find/replace tasks connect real install, strict import, runtime and publication with valid expressions',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-25-workflow.mjs','utf8');for(const forbidden of ['dispatchEvent(','__TAURI_INTERNALS__=','force:true','force: true'])assert.ok(!source.includes(forbidden))
 const tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let expressions=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const value=node.arguments[0];if(value&&(ts.isStringLiteral(value)||ts.isNoSubstitutionTemplateLiteral(value)||ts.isTemplateExpression(value))){const script=ts.isTemplateExpression(value)?value.head.text+value.templateSpans.map(span=>'__fixture__'+span.literal.text).join(''):value.text;assert.doesNotThrow(()=>new vm.Script(script),script);expressions++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(expressions>=10)
 for(const file of ['scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertFindReplaceOutputBytes'),file)
 assert.ok(fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs','utf8').includes('runInstalledV1125Workflow'));assert.ok(fs.readFileSync('scripts/import-community-release-review.mjs','utf8').includes("[['findReplace',reports.findReplace.file]]"))
})
