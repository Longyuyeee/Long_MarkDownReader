import assert from 'node:assert/strict'
import {test} from 'node:test'
import fs from 'node:fs'
import {resolve,dirname,basename} from 'node:path'
import {execFileSync} from 'node:child_process'
import {assertFrozenBuildSource} from './assert-frozen-build-source.mjs'

test('frozen product permits an unchanged ancestor builder and rejects changed build definitions',()=>{
 const parent=resolve('.release-secrets');fs.mkdirSync(parent,{recursive:true})
 const root=fs.mkdtempSync(resolve(parent,'v120-build-source-'))
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
 const write=(file,text)=>{fs.mkdirSync(dirname(resolve(root,file)),{recursive:true});fs.writeFileSync(resolve(root,file),text)}
 const commit=()=>{git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-m','owned fixture');return git('rev-parse','HEAD')}
 try {
  git('init');write('.github/workflows/v1-1-0-candidate-lifecycle.yml','checkout: frozen-product\n');write('src-tauri/tauri.u2.conf.json','{}\n');const builder=commit()
  write('screen.css','fixed toolbar width\n');const product=commit()
  assert.equal(assertFrozenBuildSource(builder,product,root).productCommit,product)
  assert.equal(assertFrozenBuildSource(product,builder,root).productCommit,builder)
  const orphan=git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit-tree',git('rev-parse',builder+'^{tree}'),'-m','independent fixture')
  assert.throws(()=>assertFrozenBuildSource(orphan,product,root),/same development history/)
  write('src-tauri/tauri.u2.conf.json','{"changed":true}\n');const changedConfig=commit()
  assert.throws(()=>assertFrozenBuildSource(builder,changedConfig,root),/builder definition differs/)
  write('src-tauri/tauri.u2.conf.json','{}\n');write('.github/workflows/v1-1-0-candidate-lifecycle.yml','checkout: mutable-product\n');const changedWorkflow=commit()
  assert.throws(()=>assertFrozenBuildSource(builder,changedWorkflow,root),/builder definition differs/)
  assert.throws(()=>assertFrozenBuildSource('main',product,root),/Exact Git commit/)
 } finally {
  assert.equal(dirname(root),parent);assert.ok(basename(root).startsWith('v120-build-source-'))
  fs.rmSync(root,{recursive:true,force:true})
 }
})


// A terminal successful job can have stale individual step snapshots. Keep
// all source/byte checks; never turn a missing, skipped or failed gate into success.
import {assertFrozenBuildGates,requiredBuildGates} from './assert-frozen-build-gates.mjs'
import YAML from 'yaml'
import {prepareRustBaseline} from './lib/rust-backend-baseline.mjs'
const buildFixture=()=>({run:{id:123,run_attempt:1,status:'completed',conclusion:'success',path:'.github/workflows/v1-1-0-candidate-lifecycle.yml'},jobs:{jobs:[{id:456,run_id:123,run_attempt:1,name:'Build MSI/NSIS and exercise official upgrade',status:'completed',conclusion:'success',steps:requiredBuildGates.map(name=>({name,status:'completed',conclusion:'success'}))}]}})
test('successful whole frozen job permits stale step snapshots without accepting explicit failures',()=>{
 const {run,jobs}=buildFixture();assert.deepEqual(assertFrozenBuildGates(run,jobs).staleStepNames,[])
 for(const status of ['pending','queued','in_progress']){jobs.jobs[0].steps[2]={name:requiredBuildGates[2],status,conclusion:null};assert.deepEqual(assertFrozenBuildGates(run,jobs).staleStepNames,[requiredBuildGates[2]])}
 for(const conclusion of ['failure','skipped','cancelled','timed_out','neutral']){const f=buildFixture();f.jobs.jobs[0].steps[2].conclusion=conclusion;assert.throws(()=>assertFrozenBuildGates(f.run,f.jobs))}
})
test('build gate receipts reject incomplete runs, wrong attempts and missing or duplicate jobs and steps',()=>{
 for(const change of [f=>f.run.status='in_progress',f=>f.run.conclusion='failure',f=>f.run.path='other.yml',f=>f.jobs.jobs[0].status='in_progress',f=>f.jobs.jobs[0].conclusion='failure',f=>f.jobs.jobs[0].run_id++,f=>f.jobs.jobs[0].run_attempt++,f=>f.jobs.jobs.push(structuredClone(f.jobs.jobs[0])),f=>f.jobs.jobs=[],f=>f.jobs.jobs[0].steps.pop(),f=>f.jobs.jobs[0].steps.push(structuredClone(f.jobs.jobs[0].steps[0])),f=>f.jobs.jobs[0].steps[0]={name:requiredBuildGates[0],status:'completed',conclusion:null}]){const f=buildFixture();change(f);assert.throws(()=>assertFrozenBuildGates(f.run,f.jobs))}
})
test('only verified unchanged backend regressions can be skipped; install compilation remains required',()=>{
 const proof=prepareRustBaseline('1.3.10')
 if(proof.reused){
  const f=buildFixture();f.jobs.jobs[0].steps[1].conclusion='skipped'
  assert.throws(()=>assertFrozenBuildGates(f.run,f.jobs))
  f.jobs.jobs[0].steps.push({name:'Resolve backend regression baseline',status:'completed',conclusion:'success'})
  assert.equal(assertFrozenBuildGates(f.run,f.jobs,proof).rustValidation,'unchanged-backend-published-baseline')
  assert.throws(()=>assertFrozenBuildGates(f.run,f.jobs,{...proof,currentFingerprint:{sha256:'changed'}}))
  f.jobs.jobs[0].steps[2].conclusion='skipped';assert.throws(()=>assertFrozenBuildGates(f.run,f.jobs,proof))
 }
})
test('frozen build gates fail on error in the single required job',()=>{
 const workflow=YAML.parse(fs.readFileSync('.github/workflows/v1-1-0-candidate-lifecycle.yml','utf8'))
 assert.deepEqual(Object.keys(workflow.jobs),['candidate-lifecycle'])
 const job=workflow.jobs['candidate-lifecycle'];assert.equal(job.if,undefined);assert.equal(job['continue-on-error'],undefined)
 for(const name of requiredBuildGates){const steps=job.steps.filter(s=>s.name===name);assert.equal(steps.length,1);assert.equal(steps[0].if,name==='Run complete Rust regression suite'?"${{ env.REUSE_RUST_BASELINE != '1' }}":undefined);assert.equal(steps[0]['continue-on-error'],undefined)}
 for(const file of ['.github/workflows/v1-1-0-installer-review.yml','.github/workflows/community-release-publish.yml']){const text=fs.readFileSync(file,'utf8');assert.ok(text.includes('scripts/assert-frozen-build-source.mjs'));assert.ok(text.includes('scripts/assert-frozen-build-gates.mjs'));assert.ok(text.includes('sha256'))}
})
