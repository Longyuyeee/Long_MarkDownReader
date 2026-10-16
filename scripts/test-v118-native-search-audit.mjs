import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { parse } from 'yaml'
import { assertHostedSearchAudit,createNativeSearchFixture,fixturePaths,nativeSearchProduct } from './lib/v118-native-search-fixture.mjs'
const workflowSource=await fs.readFile('.github/workflows/v118-search-native.yml','utf8'),workflow=parse(workflowSource)
const runner=await fs.readFile('scripts/run-v118-native-search.ps1','utf8'),driver=await fs.readFile('scripts/capture-v118-native-search.mjs','utf8')
const policy=await fs.readFile('scripts/lib/v118-webview-test-policy.ps1','utf8')
const qualitySource=await fs.readFile('.github/workflows/quality-gate.yml','utf8')
test('real runtime audit refuses local and self-hosted machines before any fixture IO',()=>{
  for(const env of [{},{GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'self-hosted',RUNNER_OS:'Windows'},{GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux'}])assert.throws(()=>assertHostedSearchAudit(env))
  assert.doesNotThrow(()=>assertHostedSearchAudit({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Windows'}))
  assert.ok(driver.indexOf('assertHostedSearchAudit()')<driver.indexOf('await fs.access'))
})
test('fixture paths reject broad or arbitrary user roots',()=>{
  for(const root of ['C:/','C:/Users/Administrator','C:/Project','E:/ProjectSave/GeminiProject/MarkDownReader'])assert.throws(()=>fixturePaths(root))
})
test('generated real files include late strong hit, same names, exact tags and owned PDF sidecar, never overwrite',async()=>{
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'longedit-v118-fixture-test-')),root=path.join(parent,'longedit-v118-native-test')
  try{
    const f=await createNativeSearchFixture(root,process.cwd()),entries=await fs.readdir(f.library)
    assert.equal(entries.filter(name=>name.endsWith('.md')).length,243)
    assert.equal((await fs.readdir(path.join(f.library,'普通资料'))).length,1400)
    assert.equal((await fs.readdir(f.second)).filter(name=>name.endsWith('.md')).length,241)
    assert.match(await fs.readFile(path.join(f.library,'目录 A','同名.md'),'utf8'),/#Budget/)
    assert.match(await fs.readFile(path.join(f.library,'前缀.md'),'utf8'),/#BudgetExtra #budget/)
    const pdf=JSON.parse(await fs.readFile(path.join(f.library,'多批注.pdf.annotations.json'),'utf8'))
    assert.equal(pdf.annotations.length,8);assert.equal(new Set(pdf.annotations.map(item=>item.id)).size,8)
    const config=JSON.parse(await fs.readFile(path.join(f.config,'config.json'),'utf8'));assert.equal(config.libraries.length,3);assert.equal(config.textAutoSaveEnabled,false)
    await assert.rejects(()=>createNativeSearchFixture(root,process.cwd()),{code:'EEXIST'})
    assert.match(await fs.readFile(path.join(f.library,'zz-项目预算.md'),'utf8'),/保留最相关文件原文/)
  }finally{
    assert.ok(path.resolve(parent).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(parent).startsWith('longedit-v118-fixture-test-'))
    await fs.rm(parent,{recursive:true})
  }
})
test('workflow pins the product separately from its harness and cannot publish or install',()=>{
  assert.deepEqual(workflow.permissions,{contents:'read',actions:'read'})
  assert.equal(workflow.jobs['native-search']['runs-on'],'windows-latest')
  assert.ok(workflowSource.includes(`ref: ${nativeSearchProduct}`)&&runner.includes(nativeSearchProduct))
  assert.ok(!workflowSource.includes('community-release-publish')&&!workflowSource.includes('tauri -- build'))
  assert.ok(workflowSource.includes('if: always()')&&workflowSource.includes('retention-days: 14'))
  assert.ok(workflowSource.indexOf('Retain immutable Debug program')<workflowSource.indexOf('- name: Real native page IPC'))
  assert.ok(workflowSource.includes('isInstaller=$false')&&workflowSource.includes('releaseCandidate=$false'))
  for(const key of ['NATIVE_PROGRAM_RUN_ID','NATIVE_PROGRAM_SHA256','NATIVE_PROGRAM_HARNESS_COMMIT'])assert.equal(workflow.jobs['native-search'].env[key],'','changed product requires a fresh build, not the previous program')
  assert.ok(workflowSource.includes('Original program reuse requires exact digest and harness identity'))
  assert.ok(workflowSource.includes('Verify original build provenance and program bytes before reuse'))
  assert.ok(workflowSource.includes('$receipt.sizeBytes -ne $program.Length'))
  assert.ok(runner.includes("'--minimized'")&&runner.includes('-WindowStyle Hidden'))
  assert.ok(!runner.includes('Remove-Item')&&!runner.includes('OwningProcess'))
  const quality=parse(qualitySource)
  assert.ok(quality.jobs.check.steps.some(step=>step.uses==='Swatinem/rust-cache@v2'&&step.with.workspaces==='src-tauri -> target'))
  for(const command of ['npm ci','npm run ci:patch-release','npm run test:rust:functional'])assert.ok(quality.jobs.check.steps.some(step=>step.run===command&&!step.if),'cache must not skip '+command)
})
test('native driver never substitutes IPC or simulates a desktop click',()=>{
  assert.ok(driver.includes('window.__TAURI_INTERNALS__.invoke('))
  assert.doesNotMatch(driver,/__TAURI_INTERNALS__\.invoke\s*=|Input\.dispatch|Input\.insertText|\.click\(/)
  for(const command of ['search_knowledge_page','search_knowledge_libraries_page','close_knowledge_search','rebuild_knowledge_index'])assert.ok(driver.includes(command))
  assert.ok(driver.includes('fresh process must use the persisted index'))
  assert.ok(driver.includes('restart must use the same executable bytes'))
  assert.ok(driver.includes('native-window-label-and-channel-isolation'))
})
test('native driver waits for the actual page and rejects current runtime and route failure surfaces',()=>{
  assert.ok(driver.indexOf('assert.equal(await main.evaluate(surfaceReady),true')<driver.indexOf("const cold=await allSingle(request())"))
  assert.ok(driver.includes("document.querySelector('.settings-view')")&&driver.includes('store?.configReady===true'))
  const expression=driver.match(/report\.uiObservation=await main\.evaluate\('([^']+)'\)/)?.[1]
  assert.ok(expression)
  const observe=present=>vm.runInNewContext(expression,{document:{title:'test',querySelector:selectors=>selectors.split(',').includes(present)?{}:null},location:{hash:'#/settings'}})
  assert.equal(observe('none').errorOverlay,false)
  for(const selector of ['#crash-screen','#runtime-error-notice','.route-error-notice','.global-error-overlay','.startup-fatal-screen'])assert.equal(observe(selector).errorOverlay,true,selector)
})
test('debugger policy is app-scoped, refuses user machines and restores only its own unchanged values',()=>{
  assert.doesNotMatch(policy,/HKCU:|['"]\*['"]|DeveloperToolsAvailability|SmartScreenEnabled/)
  const keys=[...policy.matchAll(/key='([^']+)'/g)].map(match=>match[1])
  assert.deepEqual(keys,['HKLM:\\Software\\Policies\\Microsoft\\Edge\\WebView2\\AdditionalBrowserArguments','HKLM:\\Software\\Policies\\Microsoft\\Edge\\WebView2\\UserDataFolder'])
  assert.ok(policy.includes("@('com.longedit.app.e2e','tauri-app.exe','tauri-app')"))
  assert.ok(runner.includes('Dedicated debugger configuration was not retained')&&runner.includes('debugger-configuration.json'))
  assert.match(policy,/RUNNER_ENVIRONMENT -ne 'github-hosted'/)
  assert.ok(policy.indexOf('foreach($entry in $plan){if(')<policy.indexOf('New-ItemProperty'))
  assert.match(policy,/GetValue\(\$entry.name\) -ceq \$entry.value/)
  assert.doesNotMatch(policy,/Remove-Item\s|Remove-ItemProperty[^\n]+-Recurse/)
  assert.match(runner,/finally \{[\s\S]+Disable-V118WebViewTestPolicy/)
})
test('in-memory registry provider preserves all six debugger entries and unrelated values',{skip:process.platform!=='win32'},()=>{
  // Real Registry drives are unmounted only in this child runspace. Every
  // provider command below is an in-memory stub: no local registry writes.
  const script=String.raw`
$ErrorActionPreference='Stop'
Remove-PSDrive -Name HKCU,HKLM -Force -ErrorAction SilentlyContinue
$env:GITHUB_ACTIONS='true';$env:RUNNER_ENVIRONMENT='github-hosted';$env:RUNNER_OS='Windows'
. ./scripts/lib/v118-webview-test-policy.ps1
$plan=@(Get-V118WebViewPolicyPlan 'C:\generated-only\webview')
$global:regMap=@{}
$global:regMap[$plan[0].key]=@{foreign='preserve'}
$global:regMap[$plan[1].key]=@{foreign='preserve'}
function Test-Path {param($LiteralPath) return $global:regMap.ContainsKey($LiteralPath)}
function Get-Item {param($LiteralPath)
  $node=[pscustomobject]@{store=$global:regMap[$LiteralPath]}
  $node|Add-Member ScriptMethod GetValueNames {return @($this.store.Keys)}
  $node|Add-Member ScriptMethod GetValue {param($name) return $this.store[$name]}
  return $node
}
function New-Item {param($Path,[switch]$Force)
  # Microsoft documents that -Force replaces an existing registry key, unlike
  # a filesystem directory; model that behavior explicitly.
  if($global:regMap.ContainsKey($Path)-and -not $Force){throw 'existing key'}
  $global:regMap[$Path]=@{}
}
function New-ItemProperty {param($LiteralPath,$Name,$PropertyType,$Value)
  if($global:regMap[$LiteralPath].ContainsKey($Name)){throw 'existing value'}
  $global:regMap[$LiteralPath][$Name]=$Value
}
function Remove-ItemProperty {param($LiteralPath,$Name) $global:regMap[$LiteralPath].Remove($Name)}
Enable-V118WebViewTestPolicy 'C:\generated-only\webview'
foreach($entry in $plan){if($global:regMap[$entry.key][$entry.name] -cne $entry.value){throw 'debugger entry was erased by later key creation'}}
foreach($entry in $plan){if($global:regMap[$entry.key]['foreign'] -cne 'preserve'){throw 'foreign value erased'}}
Disable-V118WebViewTestPolicy
foreach($entry in $plan){if($global:regMap[$entry.key].ContainsKey($entry.name)){throw 'owned value not restored'}}
foreach($entry in $plan){if($global:regMap[$entry.key]['foreign'] -cne 'preserve'){throw 'cleanup erased foreign value'}}
$global:regMap[$plan[0].key][$plan[0].name]='preexisting'
$blocked=$false
try{Enable-V118WebViewTestPolicy 'C:\generated-only\webview'}catch{$blocked=$true}
if(-not $blocked -or $global:regMap[$plan[0].key][$plan[0].name] -cne 'preexisting'){throw 'preexisting debugger configuration was not preserved'}
Write-Output 'six entries and unrelated/preexisting values preserved; no real registry IO'
`
  // Process-only policy for our unsigned test function file, never Set-ExecutionPolicy.
  const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command','& ([ScriptBlock]::Create([Console]::In.ReadToEnd()))'],{input:script,encoding:'utf8'})
  assert.equal(result.status,0,result.stderr)
})
test('new runner and workflow PowerShell parse without launching anything',{skip:process.platform!=='win32'},()=>{
  for(const text of [runner,policy,...workflow.jobs['native-search'].steps.filter(step=>step.shell==='powershell').map(step=>step.run)]){
    const result=spawnSync('powershell.exe',['-NoProfile','-Command','$t=$null;$e=$null;[System.Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(),[ref]$t,[ref]$e)>$null;if($e.Count){$e|Out-String|Write-Error;exit 1}'],{input:text,encoding:'utf8'})
    assert.equal(result.status,0,result.stderr)
  }
})
