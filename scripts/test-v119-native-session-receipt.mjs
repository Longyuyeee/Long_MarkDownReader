import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {validateNativeSessionReceipt} from './lib/v119-native-session-receipt.mjs'
const root='docs/evidence/v119-native-session/',json=file=>JSON.parse(fs.readFileSync(root+file,'utf8'))
const evidence=()=>({run:json('native-run.json'),jobs:json('native-jobs.json'),baseline:json('run-39017273250/baseline.json'),restart:json('run-39017273250/restart.json'),productCI:json('product-core-ci.json')})
test('actual hosted session reports bind 13 checks to exact source, driver, program and complete successful jobs',()=>{
 const result=validateNativeSessionReceipt(evidence());assert.equal(result.checks,13);assert.equal(result.productCommit,'6a3b10357bda9a2ee095fa07fe26cafd622a2ab0')
})
test('missing or stale native evidence, mismatched programs and failed/pending jobs never count as success',()=>{
 for(const mutate of [e=>e.run.conclusion='failure',e=>e.run.status='in_progress',e=>e.run.head_sha='a'.repeat(40),e=>e.run.path='other.yml',e=>e.jobs.jobs[0].steps.find(step=>step.name==='Verify actual native session IPC and same-program restart').conclusion='failure',e=>e.baseline.checks.pop(),e=>e.restart.executableSha256='b'.repeat(64),e=>e.restart.runtimeBaseVersion='1.1.9',e=>e.baseline.isInstaller=true,e=>e.productCI.conclusion='failure',e=>e.productCI.headSha='c'.repeat(40)]){const data=evidence();mutate(data);assert.throws(()=>validateNativeSessionReceipt(data))}
})
