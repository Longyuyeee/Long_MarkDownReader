import assert from 'node:assert/strict'
import {sessionProductCommit,validateNativeSessionReport} from './v119-native-session-fixture.mjs'
const driver='3e426634f71e437a2d65ad3af575d1aa381a28e9'
export function validateNativeSessionReceipt({run,jobs,baseline,restart,productCI}){
 assert.equal(run.id,39017273250);assert.equal(run.repository.full_name,'Longyuyeee/Long_MarkDownReader')
 assert.equal(run.path,'.github/workflows/v119-session-native.yml');assert.equal(run.head_sha,driver)
 assert.equal(run.head_branch,'codex/v119-native-session-audit');assert.equal(run.event,'push')
 assert.equal(run.status,'completed');assert.equal(run.conclusion,'success')
 assert.equal(jobs.total_count,1);assert.equal(jobs.jobs.length,1);assert.equal(jobs.jobs[0].run_id,run.id);assert.equal(jobs.jobs[0].conclusion,'success')
 for(const name of ['Check out fixed product (not an installer candidate)','Build fixed Debug Tauri program with isolated identity','Verify actual native session IPC and same-program restart','Run actions/upload-artifact@v4']){
  const steps=jobs.jobs[0].steps.filter(step=>step.name===name);assert.equal(steps.length,1);assert.equal(steps[0].conclusion,'success')
 }
 validateNativeSessionReport(baseline,'baseline');validateNativeSessionReport(restart,'restart')
 assert.equal(baseline.harnessCommit,driver);assert.equal(restart.harnessCommit,driver)
 assert.equal(baseline.executableSha256,restart.executableSha256);assert.match(baseline.exportSha256,/^[a-f0-9]{64}$/)
 assert.equal(productCI.databaseId,39016996509);assert.equal(productCI.status,'completed');assert.equal(productCI.conclusion,'success');assert.equal(productCI.headSha,sessionProductCommit)
 assert.equal(productCI.jobs.length,1);assert.equal(productCI.jobs[0].conclusion,'success')
 for(const name of ['Run the v1 patch release quality gate','Run Rust functional regression tests']){
  const steps=productCI.jobs[0].steps.filter(step=>step.name===name);assert.equal(steps.length,1);assert.equal(steps[0].conclusion,'success')
 }
 return {productCommit:sessionProductCommit,harnessCommit:driver,checks:baseline.checks.length+restart.checks.length,executableSha256:baseline.executableSha256}
}
