import assert from 'node:assert/strict'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { parse } from 'yaml'
import { runInstalledSearchScenario } from './lib/installed-search-user-scenario.mjs'

const source = fs.readFileSync('.github/workflows/v122-installed-search.yml', 'utf8')
const workflow = parse(source)
test('scenario targets accessible names retained by the actual tooltip adoption policy', () => {
  const policy = fs.readFileSync('src/services/appTooltipPolicy.ts', 'utf8').split('const adoptTitlesInside')[0]
  const ctx = vm.createContext({})
  vm.runInContext(ts.transpileModule(policy + '\nglobalThis.adopt = adoptNativeTitle', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx)
  for (const title of ['刷新列表', '搜索与关联选项']) {
    const attributes = new Map([['title', title]])
    const element = { matches: selector => selector.startsWith('button,'), getAttribute: name => attributes.get(name) ?? null, hasAttribute: name => attributes.has(name), removeAttribute: name => attributes.delete(name), setAttribute: (name, value) => attributes.set(name, value) }
    ctx.adopt(element)
    assert.equal(attributes.has('title'), false)
    assert.equal(attributes.get('aria-label'), title)
  }
  const scenario = fs.readFileSync('scripts/lib/installed-search-user-scenario.mjs', 'utf8')
  assert.ok(scenario.includes('button[aria-label="刷新列表"]'))
  assert.ok(scenario.includes('button[aria-label="搜索与关联选项"]'))
  assert.ok(scenario.includes('.knowledge-result-open[aria-label='))
  assert.ok(!scenario.includes('[title='))
})
test('installed search reuses verified artifact and cannot publish', () => {
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' })
  assert.ok(source.includes('verify-v122-installer-receipt.mjs candidate'))
  assert.ok(source.includes('gh run download 34679919233'))
  assert.ok(!source.includes('tauri -- build'))
  assert.ok(source.includes('-TestTheme dark'))
  assert.ok(source.includes('if: always()'))
})
test('search scenario refuses arbitrary user library before performing any IO', async () => {
  await assert.rejects(runInstalledSearchScenario({ library: 'C:\\UserLibrary' }), /disposable R5I library/)
})
test('workflow PowerShell parses without installing', { skip: process.platform !== 'win32' }, () => {
  for (const step of workflow.jobs['installed-search'].steps.filter(s => s.shell === 'powershell')) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', '$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(),[ref]$tokens,[ref]$errors)>$null; if($errors.Count){$errors | Out-String | Write-Error; exit 1}'], { input: step.run, encoding: 'utf8' })
    assert.equal(result.status, 0, `${step.name}: ${result.stderr}`)
  }
})
