import assert from 'node:assert/strict'
import fs from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {spawnSync} from 'node:child_process'

import {yamlFieldsChecks,validateInstalledYamlFields} from './lib/installed-v1-2-21-evidence.mjs'
import {runInstalledV1221YamlFieldsWorkflow} from './lib/installed-v1-2-21-workflow.mjs'
test('installed YAML creation driver uses real input with parseable observation expressions',()=>{
 assert.equal(typeof runInstalledV1221YamlFieldsWorkflow,'function')
 const source=fs.readFileSync('scripts/lib/installed-v1-2-21-workflow.mjs','utf8');assert.ok(source.includes('nativeUserInput'));assert.ok(source.includes('FileShare]::Read'));assert.ok(!/dispatchEvent|__TAURI|\.force\(/.test(source))
 const tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ready)$/.test(node.expression.getText(tree))){const a=node.arguments[0];if(a&&(ts.isStringLiteral(a)||ts.isNoSubstitutionTemplateLiteral(a)||ts.isTemplateExpression(a))){const expr=ts.isTemplateExpression(a)?a.head.text+a.templateSpans.map(s=>'__fixture__'+s.literal.text).join(''):a.text;assert.doesNotThrow(()=>new vm.Script(expr),expr);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=10)
 for(const file of ['scripts/capture-r5j-installed-artifact-smoke.mjs','scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('installed-v1-2-21-'),file)
})
test('installed creation proof rejects partial results, source mutations and synthetic input',()=>{
 const manifest={appVersion:'1.2.21',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={...manifest,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),lockedBefore:'e'.repeat(64),lockedAfter:'e'.repeat(64),externalBefore:'f'.repeat(64),externalAfter:'f'.repeat(64),status:'passed',evidenceLevel:'installed-yaml-field-management-trusted-input-and-file-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:yamlFieldsChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],inputTrace:Array.from({length:11},()=>({type:'input',trusted:true})),disposableDraftsExplicitlyDiscarded:true}
 assert.doesNotThrow(()=>validateInstalledYamlFields(report,manifest));for(const change of [{checks:report.checks.slice(1)},{lockedAfter:'f'.repeat(64)},{externalAfter:'a'.repeat(64)},{inputTrace:[{type:'input',trusted:false}]},{nativeBridgeMocked:true},{runtimeErrors:['lost draft']},{disposableDraftsExplicitlyDiscarded:false}])assert.throws(()=>validateInstalledYamlFields({...report,...change},manifest))
})
