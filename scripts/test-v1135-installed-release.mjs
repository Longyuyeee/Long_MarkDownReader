import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {test} from 'node:test'
import {attachmentDraftChecks,validateInstalledAttachmentDrafts} from './lib/installed-v1-1-35-evidence.mjs'
test('installed draft workflow uses trusted input, restores preferences and registers mandatory output verification',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-35-workflow.mjs','utf8'),tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const value=node.arguments[0];if(value&&(ts.isStringLiteral(value)||ts.isNoSubstitutionTemplateLiteral(value)||ts.isTemplateExpression(value))){const expression=ts.isTemplateExpression(value)?value.head.text+value.templateSpans.map(s=>'__fixture__'+s.literal.text).join(''):value.text;assert.doesNotThrow(()=>new vm.Script(expression),expression);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=15)
 for(const forbidden of ['dispatchEvent(','__TAURI_INTERNALS__=','force: true','Unidentified'])assert.ok(!source.includes(forbidden),forbidden)
 assert.ok(source.includes('report.editorModeBefore'));assert.ok(source.includes('report.editorModeAfter'))
 for(const file of ['scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertAttachmentDraftOutputBytes'),file)
})
test('installed draft evidence rejects partial checks, changed identity, untrusted input and mode loss',()=>{
 const source='a'.repeat(40),installer='b'.repeat(64),manifest={appVersion:'1.1.35',sourceCommit:source,artifacts:[{target:'nsis',sha256:installer}]},report={appVersion:'1.1.35',sourceCommit:source,installerSha256:installer,harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-attachment-drafts-trusted-ui-and-output-bytes',editorModeBefore:'sv',editorModeAfter:'sv',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:attachmentDraftChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],inputTrace:Array.from({length:12},(_,n)=>({type:['click','keydown','input'][n%3],trusted:true}))}
 assert.doesNotThrow(()=>validateInstalledAttachmentDrafts(report,manifest));for(const change of [{sourceCommit:'e'.repeat(40)},{checks:report.checks.slice(1)},{editorModeAfter:'ir'},{nativeBridgeMocked:true},{inputTrace:[{type:'click',trusted:false}]}])assert.throws(()=>validateInstalledAttachmentDrafts({...report,...change},manifest))
})
