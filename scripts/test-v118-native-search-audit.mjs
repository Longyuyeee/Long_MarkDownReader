import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { parse } from 'yaml'
import { assertHostedSearchAudit,createNativeSearchFixture,fixturePaths,nativeSearchProduct } from './lib/v118-native-search-fixture.mjs'
const workflowSource=await fs.readFile('.github/workflows/v118-search-native.yml','utf8'),workflow=parse(workflowSource)
const runner=await fs.readFile('scripts/run-v118-native-search.ps1','utf8'),driver=await fs.readFile('scripts/capture-v118-native-search.mjs','utf8')
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
  assert.deepEqual(workflow.permissions,{contents:'read'})
  assert.equal(workflow.jobs['native-search']['runs-on'],'windows-latest')
  assert.ok(workflowSource.includes(`ref: ${nativeSearchProduct}`)&&runner.includes(nativeSearchProduct))
  assert.ok(!workflowSource.includes('community-release-publish')&&!workflowSource.includes('tauri -- build'))
  assert.ok(workflowSource.includes('if: always()')&&workflowSource.includes('retention-days: 14'))
  assert.ok(runner.includes("'--minimized'")&&runner.includes('-WindowStyle Hidden'))
  assert.ok(!runner.includes('Remove-Item')&&!runner.includes('OwningProcess'))
})
test('native driver never substitutes IPC or simulates a desktop click',()=>{
  assert.ok(driver.includes('window.__TAURI_INTERNALS__.invoke('))
  assert.doesNotMatch(driver,/__TAURI_INTERNALS__\.invoke\s*=|Input\.dispatch|Input\.insertText|\.click\(/)
  for(const command of ['search_knowledge_page','search_knowledge_libraries_page','close_knowledge_search','rebuild_knowledge_index'])assert.ok(driver.includes(command))
  assert.ok(driver.includes('fresh process must use the persisted index'))
  assert.ok(driver.includes('restart must use the same executable bytes'))
  assert.ok(driver.includes('native-window-label-and-channel-isolation'))
})
test('new runner and workflow PowerShell parse without launching anything',{skip:process.platform!=='win32'},()=>{
  for(const text of [runner,...workflow.jobs['native-search'].steps.filter(step=>step.shell==='powershell').map(step=>step.run)]){
    const result=spawnSync('powershell.exe',['-NoProfile','-Command','$t=$null;$e=$null;[System.Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(),[ref]$t,[ref]$e)>$null;if($e.Count){$e|Out-String|Write-Error;exit 1}'],{input:text,encoding:'utf8'})
    assert.equal(result.status,0,result.stderr)
  }
})
