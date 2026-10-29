import assert from 'node:assert/strict'
import {test} from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import crypto from 'node:crypto'
import ts from 'typescript'
import YAML from 'yaml'
import {structuredHistoryFixtures,structuredHistoryBytes} from './lib/structured-history-fixture.mjs'
import {structuredHistoryChecks,validateInstalledStructuredHistory,assertStructuredHistoryOutputBytes} from './lib/installed-v1-1-26-evidence.mjs'
import {checkStaleHistory} from './lib/installed-history-stale-check.mjs'
test('stale history requires unchanged draft and disk on every busy response and a final signature rejection',async()=>{
 const busy='恢复未完成：历史记录正在读取、保存或整理，请稍后重试'
 const run=async(errors,{changed=false}={})=>{let clicks=0,checks=0,pauses=0;await checkStaleHistory({click:async()=>{clicks++},readError:async()=>errors[Math.min(clicks-1,errors.length-1)],assertUnchanged:async()=>{checks++;assert.equal(changed,false)},pause:async ms=>{assert.equal(ms,250);pauses++}});return{clicks,checks,pauses}}
 assert.deepEqual(await run(['恢复未完成：磁盘文件已变化，请重新比较']),{clicks:1,checks:1,pauses:0})
 assert.deepEqual(await run([busy,busy,'恢复未完成：磁盘文件已变化，请重新比较']),{clicks:3,checks:3,pauses:2})
 await assert.rejects(run([busy]),/remained busy/)
 await assert.rejects(run(['恢复未完成：路径不可用']),/unexpected history/)
 await assert.rejects(run([busy],{changed:true}))
})
test('installed structured history rejects missing tasks, stale identity, fake input and altered source bytes',()=>{
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),bytes=new Map()
 for(const[mode,ext,source]of structuredHistoryFixtures){const current=source.replace('初稿','新稿').replace('保留"','后续输入"').replace('other: 保留','other: 后续输入').replace('<other>保留','<other>后续输入');for(const[suffix,text]of [['copy',source],['saved',current],['external',current.replace('新稿','磁盘改动')]])bytes.set(`installed-v1126-${mode}-${suffix}.${ext}`,structuredHistoryBytes(text))}
 const manifest={appVersion:'1.1.26',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={appVersion:'1.1.26',sourceCommit:manifest.sourceCommit,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),status:'passed',evidenceLevel:'installed-structured-history-trusted-ui-and-output-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:structuredHistoryChecks.map(id=>({id,status:'passed'})),fileFlyoutExact:true,folderFlyoutExact:true,otherDraftsPreserved:true,runtimeErrors:[],modes:structuredHistoryFixtures.map(([mode])=>Object.fromEntries([['mode',mode],...['savedHistoryExact','partialExact','partialUndoExact','cancelExact','fullExact','fullUndoExact','copyExact','savedExact','reopenExact','staleBlocked'].map(k=>[k,true])])),inputTrace:['click','pointerdown','keydown','input'].map(type=>({type,trusted:true})),outputs:[...bytes].map(([fileName,b])=>({fileName,sizeBytes:b.length,sha256:sha(b)}))}
 validateInstalledStructuredHistory(report,manifest);assertStructuredHistoryOutputBytes(report,p=>bytes.get(p))
 for(const change of [r=>r.checks.pop(),r=>r.modes[0].partialExact=false,r=>r.fileFlyoutExact=false,r=>r.nativeBridgeMocked=true,r=>r.inputTrace[0].trusted=false,r=>r.sourceCommit='e'.repeat(40)]){const c=structuredClone(report);change(c);assert.throws(()=>validateInstalledStructuredHistory(c,manifest))}
 assert.throws(()=>assertStructuredHistoryOutputBytes(report,p=>p.includes('-copy.')?Buffer.from('lost original'):bytes.get(p)))
})
test('native workflow uses valid UI expressions and remains required in import, runtime and publication',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-26-workflow.mjs','utf8');for(const forbidden of ['dispatchEvent(','__TAURI_INTERNALS__=','force: true','force:true'])assert.ok(!source.includes(forbidden))
 const tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const value=node.arguments[0];if(value&&(ts.isStringLiteral(value)||ts.isNoSubstitutionTemplateLiteral(value)||ts.isTemplateExpression(value))){const script=ts.isTemplateExpression(value)?value.head.text+value.templateSpans.map(span=>'__fixture__'+span.literal.text).join(''):value.text;assert.doesNotThrow(()=>new vm.Script(script),script);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=10)
 for(const file of ['scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertStructuredHistoryOutputBytes'),file)
 assert.ok(fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs','utf8').includes('runInstalledV1126Workflow'))
 const workflow=YAML.parse(fs.readFileSync('.github/workflows/v1-1-0-candidate-lifecycle.yml','utf8'))
 assert.equal(workflow.on.workflow_dispatch.inputs.build_only.type,'boolean')
 for(const name of ['Run frozen candidate release quality gate','Resolve backend regression baseline','Build frozen candidate MSI and NSIS','Capture immutable installer receipt']){const step=workflow.jobs['candidate-lifecycle'].steps.find(s=>s.name===name);assert.ok(step);assert.equal(step.if,undefined,'build-only must never skip '+name)}
 const rust=workflow.jobs['candidate-lifecycle'].steps.find(s=>s.name==='Run complete Rust regression suite')
 assert.equal(rust.if,"${{ env.REUSE_RUST_BASELINE != '1' }}",'Only a verified unchanged backend may reuse the published functional baseline')
 assert.ok(fs.readFileSync('.github/workflows/community-release-publish.yml','utf8').includes("$review.conclusion -ne 'success'"),'A successful same-package review remains mandatory')

})
