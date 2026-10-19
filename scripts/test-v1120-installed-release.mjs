import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import vm from 'node:vm'
import {test} from 'node:test'
import ts from 'typescript'
import {structuredChecks,validateInstalledStructured,assertStructuredOutputBytes} from './lib/installed-v1-1-20-evidence.mjs'
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
test('structured native evidence binds all tasks, source, installer, inputs and original output bytes',()=>{
 const bytes=Buffer.from('owned raw output'),files=['json-saved.jsonc','json-copy.jsonc','yaml-saved.yaml','yaml-copy.yaml','xml-saved.xml','xml-copy.xml','toml-saved.toml','toml-copy.toml','unselected.md'].map(name=>({fileName:'installed-v1120-'+name,sizeBytes:bytes.length,sha256:sha(bytes)}))
 const manifest={appVersion:'1.1.20',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={appVersion:'1.1.20',sourceCommit:manifest.sourceCommit,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-structured-editors-and-original-output-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:structuredChecks.map(id=>({id,status:'passed'})),inputTrace:['click','pointerdown','keydown','input'].map(type=>({type,trusted:true})),unselectedBefore:sha(bytes),unselectedAfter:sha(bytes),runtimeErrors:[],uiMessages:[],outputs:files,inspection:{status:'passed',reader:'stdlib-json-tomllib-defusedxml-and-exact-yaml-bytes',nativeBridgeMocked:false,outputs:files}}
 for(const name of ['saveExact','reopenExact','conflictOriginalExact','conflictDraftExact','copyExact'])report[name]=Object.fromEntries(['json','yaml','xml','toml'].map(mode=>[mode,true]))
 for(const name of ['formatCancelExact','formatApplyExact','formatUndoExact','pointerNavigationExact','navigationSourceExact','contextNavigationExact','reloadCancelExact','reloadFailureExact','shortcutExclusive'])report[name]=true
 assert.doesNotThrow(()=>validateInstalledStructured(report,manifest));assertStructuredOutputBytes(report,()=>bytes)
 for(const mutate of [r=>r.checks.pop(),r=>r.sourceCommit='0'.repeat(40),r=>r.nativeBridgeMocked=true,r=>r.copyExact.toml=false,r=>r.inputTrace[0].trusted=false,r=>r.runtimeErrors.push('error')]){const broken=structuredClone(report);mutate(broken);assert.throws(()=>validateInstalledStructured(broken,manifest))}
 assert.throws(()=>assertStructuredOutputBytes(report,()=>Buffer.from('different')))
})
test('installed structured workflow uses actual input and parses its literal browser expressions',()=>{
 const driver=fs.readFileSync('scripts/lib/installed-v1-1-20-workflow.mjs','utf8')
 for(const prohibited of ['dispatchEvent(','__TAURI_INTERNALS__=','force:true','force: true'])assert.ok(!driver.includes(prohibited))
 for(const file of ['scripts/lib/installed-release-runtime.mjs','scripts/import-community-release-review.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertStructuredOutputBytes'),file)
 const tree=ts.createSourceFile('driver.mjs',driver,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let expressions=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const value=node.arguments[0];if(value&&(ts.isStringLiteral(value)||ts.isNoSubstitutionTemplateLiteral(value))){assert.doesNotThrow(()=>new vm.Script(value.text),value.text);expressions++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(expressions>=10)
})
