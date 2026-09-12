import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { parse } from 'yaml'

const source = fs.readFileSync('.github/workflows/v122-candidate-lifecycle.yml', 'utf8')
const workflow = parse(source)
const policy = JSON.parse(fs.readFileSync('shared/v122-candidate-lifecycle-policy.json', 'utf8'))
const job = workflow.jobs['candidate-lifecycle']
test('workflow uses fixed candidate identity, disposable Windows and no publication rights', () => {
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.equal(job['runs-on'], 'windows-latest')
  assert.equal(job.env.LONGEDIT_R5I_DISPOSABLE, '1')
  assert.match(policy.candidateCommit, /^[0-9a-f]{40}$/)
  assert.ok(source.includes('$env:CANDIDATE_COMMIT -cne $policy.candidateCommit'))
  assert.ok(source.includes('$previous -ne $policy.previousTagCommit'))
  for (const step of job.steps) assert.ok(!(step.run ?? '').includes('${{ inputs.'), 'dispatch input must not be executable interpolation')
  const pkg = JSON.parse(execFileSync('git', ['show', `${policy.candidateCommit}:package.json`], { encoding: 'utf8' }))
  assert.equal(pkg.version, policy.appVersion)
})
test('upgrade baseline is the hash-checked official previous installer, never a rebuild', () => {
  const receipt = JSON.parse(fs.readFileSync(policy.previousReleaseReceipt, 'utf8'))
  assert.equal(receipt.release.taggedCommit, policy.previousTagCommit)
  assert.equal(receipt.release.tag, `v${policy.previousVersion}`)
  const step = job.steps.find(s => s.name === 'Download and verify previous official NSIS')
  assert.ok(step.run.includes('gh release download v1.0.21'))
  for (const token of ['$LASTEXITCODE', '$installer.Length -ne $asset[0].sizeBytes', '-Algorithm SHA256', '-ne $asset[0].sha256']) assert.ok(step.run.includes(token))
  assert.equal(job.steps.filter(s => (s.run ?? '').includes('tauri -- build')).length, 1)
  const receiptStep = job.steps.find(s => s.name === 'Capture immutable installer receipt')
  assert.ok(receiptStep.run.includes("'previous-official'"))
  assert.ok(receiptStep.run.includes('previousInstallerSha256'))
})
test('quality gate precedes build and independent search/update acceptance remain pending', () => {
  assert.ok(job.steps.findIndex(s => s.run === 'npm run ci:patch-release') < job.steps.findIndex(s => (s.run ?? '').includes('tauri -- build')))
  assert.equal(policy.releaseCandidate, false)
  assert.equal(policy.sourceUserContentIncluded, false)
  assert.equal(policy.searchInstalledAcceptance, 'pending-separate-validation')
  assert.equal(policy.officialManagedUpdateObservation, 'pending-after-publication')
  assert.ok(source.includes('-ConfirmDisposableMachine'))
  assert.ok(source.includes('-ExpectedSourceCommit $env:PRODUCT_SOURCE_COMMIT'))
  const upload = job.steps.find(s => (s.uses ?? '').startsWith('actions/upload-artifact@'))
  assert.equal(upload.if, 'always()')
  assert.equal(upload.with['if-no-files-found'], 'error')
})
test('all embedded PowerShell steps parse without executing installers', { skip: process.platform !== 'win32' }, () => {
  for (const step of job.steps.filter(s => s.shell === 'powershell')) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', '$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(),[ref]$tokens,[ref]$errors) > $null; if ($errors.Count) { $errors | Out-String | Write-Error; exit 1 }'], { input: step.run, encoding: 'utf8' })
    assert.equal(result.status, 0, `${step.name}: ${result.stderr}`)
  }
})
