import assert from 'node:assert/strict'
import {execFileSync,spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

export function assertFrozenBuildSource(buildHead, productCommit, repository=process.cwd()) {
  for(const sha of [buildHead,productCommit])assert.match(sha||'',/^[a-f0-9]{40}$/,'Exact Git commit required')
  const git=args=>execFileSync('git',args,{cwd:repository,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
  for(const sha of [buildHead,productCommit])git(['cat-file','-e',sha+'^{commit}'])
  const ancestor=(a,b)=>spawnSync('git',['merge-base','--is-ancestor',a,b],{cwd:repository,stdio:'ignore'}).status===0
  assert.ok(ancestor(buildHead,productCommit)||ancestor(productCommit,buildHead),'Build and product must share the same development history')
  const files=['.github/workflows/v1-1-0-candidate-lifecycle.yml','src-tauri/tauri.u2.conf.json']
  const definitions=Object.fromEntries(files.map(file=>{
    const actual=git(['rev-parse',buildHead+':'+file]),expected=git(['rev-parse',productCommit+':'+file])
    assert.equal(actual,expected,'Frozen builder definition differs: '+file)
    return [file,actual]
  }))
  return {buildHead,productCommit,definitions}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=new Map();for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i],process.argv[i+1])
  console.log(JSON.stringify(assertFrozenBuildSource(args.get('--head'),args.get('--product'))))
}
