import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import fs from 'node:fs'
import {assertRustBaselineProof} from './lib/rust-backend-baseline.mjs'

export const requiredBuildGates = ['Run frozen candidate release quality gate','Run complete Rust regression suite','Build frozen candidate MSI and NSIS','Capture immutable installer receipt']

// The frozen builder has one job and these four unconditional, fail-on-error
// steps. GitHub can finish that job without updating its step snapshots.
// A successful whole job is authoritative only for missing conclusions;
// explicit failures, skips, missing steps and different runs still fail.
export function assertFrozenBuildGates(run, jobs, backendProof) {
  assert.equal(run.path,'.github/workflows/v1-1-0-candidate-lifecycle.yml')
  assert.equal(run.status,'completed');assert.equal(run.conclusion,'success')
  assert.ok(Number.isSafeInteger(run.id)&&run.id>0)
  assert.ok(Number.isSafeInteger(run.run_attempt)&&run.run_attempt>0)
  assert.equal(jobs.jobs?.length,1,'Expected the single required frozen build job')
  const job=jobs.jobs[0]
  assert.equal(job.run_id,run.id);assert.equal(job.run_attempt,run.run_attempt)
  assert.equal(job.name,'Build MSI/NSIS and exercise official upgrade')
  assert.equal(job.status,'completed');assert.equal(job.conclusion,'success')
  const staleStepNames=[]
  if (backendProof?.reused) {
    assertRustBaselineProof(backendProof)
    const prepare=job.steps?.filter(step=>step.name==='Resolve backend regression baseline')
    assert.equal(prepare?.length,1)
    assert.equal(prepare[0].status,'completed');assert.equal(prepare[0].conclusion,'success')
  }
  for(const name of requiredBuildGates) {
    const steps=job.steps?.filter(step=>step.name===name)
    assert.equal(steps?.length,1,'Expected one required build gate: '+name)
    const step=steps[0]
    if(name==='Run complete Rust regression suite'&&step.conclusion==='skipped'&&backendProof?.reused) {
      assert.equal(step.status,'completed');continue
    }
    if(step.conclusion==='success') {assert.equal(step.status,'completed');continue}
    assert.equal(step.conclusion,null,'Required build gate did not pass: '+name)
    assert.ok(['queued','pending','in_progress'].includes(step.status),'Unexpected required build gate status: '+name)
    staleStepNames.push(name)
  }
  return {runId:run.id,jobId:job.id,runAttempt:run.run_attempt,proof:'completed-required-frozen-build-job',staleStepNames,
    ...(backendProof?.reused?{rustValidation:'unchanged-backend-published-baseline',baseline:backendProof.baseline}: {})}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  assert.equal(process.argv[2],'--run-id');assert.match(process.argv[3]||'',/^[1-9][0-9]*$/)
  assert.match(process.env.GITHUB_REPOSITORY||'',/^[\w.-]+\/[\w.-]+$/)
  const base='repos/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.argv[3]
  const get=url=>JSON.parse(execFileSync('gh',['api',url],{encoding:'utf8',maxBuffer:8*1024*1024}))
  const file=process.argv[4]==='--backend-proof'?process.argv[5]:undefined
  const proof=file&&fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):undefined
  if(proof) {
    assert.equal(process.argv[6],'--candidate-commit')
    assert.equal(proof.sourceCommit,process.argv[7])
  }
  console.log(JSON.stringify(assertFrozenBuildGates(get(base),get(base+'/jobs'),proof)))
}
