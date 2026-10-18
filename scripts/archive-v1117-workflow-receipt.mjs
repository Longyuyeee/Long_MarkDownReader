// Generated API/log receipts only. Never overwrite accepted or user evidence.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
const [run,folder]=process.argv.slice(2),root=path.resolve('docs/evidence')
assert.match(run||'',/^[1-9][0-9]+$/);const target=path.resolve(folder||'')
assert.equal(path.dirname(target),root);assert.match(path.basename(target),/^v1117-[a-z0-9-]+$/);assert.equal(fs.existsSync(target),false)
const api=route=>execFileSync('gh',['api','repos/Longyuyeee/Long_MarkDownReader/'+route],{maxBuffer:16*1024*1024})
const runBytes=api('actions/runs/'+run),receipt=JSON.parse(runBytes);assert.equal(receipt.status,'completed')
const jobs=api('actions/runs/'+run+'/jobs'),artifacts=api('actions/runs/'+run+'/artifacts')
fs.mkdirSync(target)
for(const[name,bytes]of [['workflow-run.json',runBytes],['jobs.json',jobs],['artifacts.json',artifacts]])fs.writeFileSync(path.join(target,name),bytes,{flag:'wx'})
try{const log=execFileSync('gh',['run','view',run,'--log'],{maxBuffer:32*1024*1024});fs.writeFileSync(path.join(target,'workflow.log'),log,{flag:'wx'})}catch(error){fs.writeFileSync(path.join(target,'log-retrieval-failure.json'),JSON.stringify({status:'retrieval-failed',message:String(error.message),runId:Number(run)},null,2)+'\n',{flag:'wx'})}
console.log(JSON.stringify({runId:Number(run),status:receipt.conclusion,headSha:receipt.head_sha,folder}))
