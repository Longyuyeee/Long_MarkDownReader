import assert from 'node:assert/strict'
import fs from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import {spawnSync} from 'node:child_process'
import {parse as parseYaml} from 'yaml'
import {xmlCreateChecks,validateInstalledXmlCreate} from './lib/installed-v1-2-18-evidence.mjs'
import {runInstalledV1218XmlCreateWorkflow} from './lib/installed-v1-2-18-workflow.mjs'
test('publisher PowerShell blocks parse and reject the missing XML verification closure',{skip:process.platform!=='win32'},()=>{
 const workflow=parseYaml(fs.readFileSync('.github/workflows/community-release-publish.yml','utf8'))
 const scripts=Object.values(workflow.jobs).flatMap(job=>job.steps.filter(step=>step.shell==='pwsh'&&typeof step.run==='string').map(step=>step.run))
 assert.ok(scripts.length>=2)
 const parser=`[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);$tokens=$null;$errors=$null;$ast=[System.Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(),[ref]$tokens,[ref]$errors);if($errors.Count){[Console]::WriteLine(($errors|ForEach-Object ErrorId|ConvertTo-Json -Compress));exit 1}`
 const check=script=>spawnSync('pwsh',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(parser,'utf16le').toString('base64')],{input:script,encoding:'utf8',windowsHide:true})
 for(const script of scripts){const result=check(script);assert.equal(result.status,0,result.stdout+result.stderr)}
 const verification=scripts.find(s=>s.includes('assertXmlCreateOutputBytes'))
 const broken=verification.replace(/\s*if \(\$LASTEXITCODE -ne 0\) \{ throw 'Installed XML creation and rename tasks or original bytes failed' \}\r?\n\s*\}/,'')
 assert.notEqual(broken,verification);const result=check(broken);assert.equal(result.status,1);assert.match(result.stdout,/MissingEndCurlyBrace/)
})
test('installed XML creation driver uses real input with parseable observation expressions',()=>{
 assert.equal(typeof runInstalledV1218XmlCreateWorkflow,'function')
 const source=fs.readFileSync('scripts/lib/installed-v1-2-18-workflow.mjs','utf8');assert.ok(source.includes('nativeUserInput'));assert.ok(source.includes('FileShare]::Read'));assert.ok(!/dispatchEvent|__TAURI|\.force\(/.test(source))
 const tree=ts.createSourceFile('driver.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let count=0
 const visit=node=>{if(ts.isCallExpression(node)&&/^(?:evaluate|ready)$/.test(node.expression.getText(tree))){const a=node.arguments[0];if(a&&(ts.isStringLiteral(a)||ts.isNoSubstitutionTemplateLiteral(a)||ts.isTemplateExpression(a))){const expr=ts.isTemplateExpression(a)?a.head.text+a.templateSpans.map(s=>'__fixture__'+s.literal.text).join(''):a.text;assert.doesNotThrow(()=>new vm.Script(expr),expr);count++}}ts.forEachChild(node,visit)};visit(tree);assert.ok(count>=10)
 for(const file of ['scripts/capture-r5j-installed-artifact-smoke.mjs','scripts/import-community-release-review.mjs','scripts/lib/installed-release-runtime.mjs','.github/workflows/community-release-publish.yml'])assert.ok(fs.readFileSync(file,'utf8').includes('installed-v1-2-18-'),file)
})
test('installed creation proof rejects partial results, source mutations and synthetic input',()=>{
 const manifest={appVersion:'1.2.18',sourceCommit:'a'.repeat(40),artifacts:[{target:'nsis',sha256:'b'.repeat(64)}]},report={...manifest,installerSha256:'b'.repeat(64),harnessSourceCommit:'c'.repeat(40),executableSha256:'d'.repeat(64),lockedBefore:'e'.repeat(64),lockedAfter:'e'.repeat(64),externalBefore:'f'.repeat(64),externalAfter:'f'.repeat(64),status:'passed',evidenceLevel:'installed-xml-create-rename-trusted-input-and-file-bytes',nativeBridgeMocked:false,desktopInputUsed:false,sourceUserContentIncluded:false,errorOverlay:false,checks:xmlCreateChecks.map(id=>({id,status:'passed'})),runtimeErrors:[],inputTrace:Array.from({length:11},()=>({type:'input',trusted:true})),disposableDraftsExplicitlyDiscarded:true}
 assert.doesNotThrow(()=>validateInstalledXmlCreate(report,manifest));for(const change of [{checks:report.checks.slice(1)},{lockedAfter:'f'.repeat(64)},{externalAfter:'a'.repeat(64)},{inputTrace:[{type:'input',trusted:false}]},{nativeBridgeMocked:true},{runtimeErrors:['lost draft']},{disposableDraftsExplicitlyDiscarded:false}])assert.throws(()=>validateInstalledXmlCreate({...report,...change},manifest))
})
