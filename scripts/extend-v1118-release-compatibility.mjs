// Mechanical successor support; predecessor validators, reports and product bytes remain binding.
import fs from 'node:fs'
import path from 'node:path'
const apply=process.argv.includes('--apply'),changed=[]
if(process.argv.slice(2).some(a=>a!=='--apply'))throw Error('Only --apply is supported')
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)])
const extend=whole=>{if(!/['"]1\.1\.17['"]/.test(whole)||whole.includes('1.1.18'))return whole;const quote=whole.match(/['"]/)[0];return whole.slice(0,-1)+', '+quote+'1.1.18'+quote+whole.slice(-1)}
for(const file of [...walk('scripts'),...walk('.github/workflows')].filter(f=>/\.(mjs|yml|ps1)$/.test(f)&&! /^(extend-|apply-)/.test(path.basename(f)))){
 const before=fs.readFileSync(file,'utf8');let after=before.replace(/\[(?:\s*['"]1\.\d+\.\d+['"]\s*,?)+\]/g,extend).replace(/@\((?:\s*['"]1\.\d+\.\d+['"]\s*,?)+\)/g,extend)
 if(path.basename(file).startsWith('check-'))after=after.replace(/\[(?:\s*['"][^'"\r\n]*['"]\s*,?)+\]/g,whole=>{
  if(whole.includes('v1.1.17-docx-editing'))return whole
  const states=[...whole.matchAll(/['"]([vV]1\.1\.17-[^'"]+)['"]/g)].map(m=>m[1].replace('1.1.17','1.1.18')).filter(state=>!whole.includes(state));return states.length?whole.slice(0,-1)+', '+states.map(JSON.stringify).join(', ')+']':whole
 })
 if(['import-community-release-review.mjs','installed-release-runtime.mjs'].includes(path.basename(file)))after=after.replaceAll("version==='1.1.17'","['1.1.17','1.1.18'].includes(version)").replaceAll("version === '1.1.17'","['1.1.17','1.1.18'].includes(version)").replaceAll("manifest.appVersion==='1.1.17'","['1.1.17','1.1.18'].includes(manifest.appVersion)")
 if(path.basename(file)==='installed-release-runtime.mjs'&&!after.includes("manifest.appVersion === '1.1.18' ? 'docs/evidence/v1-1-18-candidate-lifecycle/'"))after=after.replace('const evidenceRoot = ',"const evidenceRoot = manifest.appVersion === '1.1.18' ? 'docs/evidence/v1-1-18-candidate-lifecycle/' : ")
 if(['v1-1-0-candidate-lifecycle.yml','v1-1-0-installer-review.yml'].includes(path.basename(file)))after=after.replace(/(current_version:[\s\S]*?default: ")1\.1\.\d+("?)/,'$11.1.18$2').replace(/(previous_version:[\s\S]*?default: ")1\.1\.\d+("?)/,'$11.1.17$2')
 if(path.basename(file)==='community-release-publish.yml')after=after.replaceAll("-eq '1.1.17'","-in @('1.1.17','1.1.18')")
 if(path.basename(file)==='capture-r5j-installed-artifact-smoke.mjs')after=after.replaceAll("appVersion === '1.1.17'","['1.1.17','1.1.18'].includes(appVersion)")
 if(path.basename(file)==='installed-v1-1-17-workflow.mjs')after=after.replace("assert.equal(appVersion,'1.1.17')","assert.ok(['1.1.17','1.1.18'].includes(appVersion))")
 if(path.basename(file)==='installed-v1-1-17-evidence.mjs')after=after.replace("assert.equal(manifest.appVersion,'1.1.17')","assert.ok(['1.1.17','1.1.18'].includes(manifest.appVersion))")
 if(after!==before){changed.push(file);if(apply)fs.writeFileSync(file,after)}
}
console.log(JSON.stringify({apply,files:changed},null,2))
