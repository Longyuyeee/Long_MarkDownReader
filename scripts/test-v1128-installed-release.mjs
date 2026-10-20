// Synthetic examples verify the receipt contract, never installed acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {test} from 'node:test'
import {referenceRepairFixture,repairTail,repairText} from './lib/reference-repair-fixture.mjs'
import {referenceRepairChecks,validateInstalledReferenceRepair,assertReferenceRepairOutputBytes} from './lib/installed-v1-1-28-evidence.mjs'
import crypto from 'node:crypto'
test('installed repair requires full tasks, exact original/draft bytes and all relationship metadata',()=>{
 const fixtureDirectory='000-v1128-reference-12345678-abcd-abcd-abcd-123456789012',f=referenceRepairFixture(fixtureDirectory),before=f.note+'\n'+repairTail,entry={id:'d'.repeat(32),sourcePath:fixtureDirectory+'/引用修复二八.md',targetPath:f.oldPath,relationType:'cites',note:'另一个窗口的说明'},hash=b=>crypto.createHash('sha256').update(b).digest('hex'),bytes=new Map([['installed-v1128-note.md',Buffer.from(f.note)],['installed-v1128-source.txt',Buffer.from(repairText)],['installed-v1128-draft-before.md',Buffer.from(before)],['installed-v1128-draft-after.md',Buffer.from(before.replace(f.uri,f.nextUri))],['installed-v1128-relations-before.json',Buffer.from(JSON.stringify({version:1,relations:[entry]}))],['installed-v1128-relations-after.json',Buffer.from(JSON.stringify({version:1,relations:[{...entry,targetPath:f.newPath}]}))]])
 const manifest={appVersion:'1.1.28',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={appVersion:'1.1.28',sourceCommit:manifest.sourceCommit,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'e'.repeat(64),fixtureDirectory,relationId:entry.id,status:'passed',evidenceLevel:'installed-trusted-input-native-reference-and-relationship-repair',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:referenceRepairChecks.map(id=>({id,status:'passed'})),outputs:[...bytes].map(([fileName,b])=>({fileName,sizeBytes:b.length,sha256:hash(b)})),inputTrace:['pointerdown','click','keydown','input'].map(type=>({type,trusted:true})),runtimeErrors:[]}
 for(const key of ['locatorChecksExact','cancelExact','staleRejected','relationExact','pinnedExact','otherDraftsPreserved','draftOnly','undoExact','redoExact','modeRestored'])report[key]=true
 validateInstalledReferenceRepair(report,manifest);assertReferenceRepairOutputBytes(report,name=>bytes.get(name))
 for(const mutate of [r=>r.checks.pop(),r=>r.draftOnly=false,r=>r.undoExact=false,r=>r.nativeBridgeMocked=true,r=>r.inputTrace[0].trusted=false]){const copy=structuredClone(report);mutate(copy);assert.throws(()=>validateInstalledReferenceRepair(copy,manifest))}
 assert.throws(()=>assertReferenceRepairOutputBytes(report,name=>name==='installed-v1128-note.md'?Buffer.from('lost user body'):bytes.get(name)))
})
test('native reference driver expressions parse and publication requires its actual outputs',()=>{
 const source=fs.readFileSync('scripts/lib/installed-v1-1-28-workflow.mjs','utf8'),tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ui\.waitFor)$/.test(node.expression.getText(tree))){const value=node.arguments[0];if(value&&(ts.isStringLiteral(value)||ts.isNoSubstitutionTemplateLiteral(value)||ts.isTemplateExpression(value))){const script=ts.isTemplateExpression(value)?value.head.text+value.templateSpans.map(span=>'__fixture__'+span.literal.text).join(''):value.text;assert.doesNotThrow(()=>new vm.Script(script),script);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=20)
 for(const forbidden of ['dispatchEvent(','__TAURI_INTERNALS__=','force: true'])assert.ok(!source.includes(forbidden))
 for(const file of ['scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('assertReferenceRepairOutputBytes'),file)
 assert.ok(fs.readFileSync('scripts/capture-r5j-installed-artifact-smoke.mjs','utf8').includes('runInstalledV1128Workflow'))
})
