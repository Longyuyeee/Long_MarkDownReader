import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'

export const nativeSearchProduct = 'b32e8d7930a1e94364c9b1951a86b9325624fa50'
export function assertHostedSearchAudit(env=process.env) {
  assert.equal(env.GITHUB_ACTIONS,'true','native runtime audit is restricted to GitHub-hosted disposable runners')
  assert.equal(env.RUNNER_ENVIRONMENT,'github-hosted','never run against a self-hosted/user desktop')
  assert.equal(env.RUNNER_OS,'Windows','this audit exercises actual Windows WebView2 IPC')
}
export function fixturePaths(root) {
  assert.match(path.basename(root),/^longedit-v118-native-[a-z0-9-]+$/i)
  return {root,library:path.join(root,'项目 & 资料'),second:path.join(root,'第二资料库'),missing:path.join(root,'未连接资料库'),config:path.join(root,'config'),webview:path.join(root,'webview')}
}
export async function createNativeSearchFixture(root, repo) {
  const fixture=fixturePaths(root)
  // Exclusive root creation establishes ownership; no cleanup of pre-existing data.
  await fs.mkdir(root,{recursive:false})
  await fs.writeFile(path.join(root,'.v118-native-owner'),JSON.stringify({kind:'generated-search-fixture',nonce:crypto.randomUUID()}),{flag:'wx'})
  for(const directory of [fixture.library,fixture.second,fixture.config,fixture.webview])await fs.mkdir(directory)
  for(const library of [fixture.library,fixture.second]) {
    for(let n=0;n<240;n++)await fs.writeFile(path.join(library,`a-${String(n).padStart(4,'0')}-记录.md`),`项目预算确认\n保留正文 ${n}\n#Budget\n`,{flag:'wx'})
    await fs.writeFile(path.join(library,'zz-项目预算.md'),'保留最相关文件原文\n#Budget\n',{flag:'wx'})
    for(const folder of ['目录 A','目录 B']){await fs.mkdir(path.join(library,folder));await fs.writeFile(path.join(library,folder,'同名.md'),'项目预算记录\n#Budget\n',{flag:'wx'})}
  }
  // Non-matching files force real cooperative work continuations, not just pages.
  await fs.mkdir(path.join(fixture.library,'普通资料'))
  for(let n=0;n<1400;n++)await fs.writeFile(path.join(fixture.library,'普通资料',`${n}.txt`),'ordinary unrelated generated text',{flag:'wx'})
  await fs.writeFile(path.join(fixture.library,'仅文件名#Budget.md'),'没有这个标签',{flag:'wx'})
  await fs.writeFile(path.join(fixture.library,'前缀.md'),'#BudgetExtra #budget',{flag:'wx'})
  await fs.writeFile(path.join(fixture.library,'非笔记.txt'),'#Budget',{flag:'wx'})
  await fs.mkdir(path.join(fixture.library,'.private'))
  await fs.writeFile(path.join(fixture.library,'.private','secret.md'),'项目预算确认 #Budget',{flag:'wx'})
  await fs.copyFile(path.join(repo,'scripts/fixtures/v126-search/Paper.pdf'),path.join(fixture.library,'多批注.pdf'))
  const annotations=Array.from({length:8},(_,n)=>({id:`批注-${n}`,kind:'comment',page:1,color:'yellow',quote:'项目预算确认',comment:`预算位置${n}`,rects:[],createdAt:1,updatedAt:2}))
  await fs.writeFile(path.join(fixture.library,'多批注.pdf.annotations.json'),JSON.stringify({schemaVersion:1,source:{pdfFile:'多批注.pdf',size:1,modifiedAt:1},annotations}),{flag:'wx'})
  const config={libraries:[{name:'项目资料库',path:fixture.library},{name:'学习资料库',path:fixture.second},{name:'离线资料库',path:fixture.missing}],activeLibraryPath:fixture.library,theme:'white',visualStyle:'minimal',motionSpeed:'calm',textAutoSaveEnabled:false,aiEnabled:false}
  await fs.writeFile(path.join(fixture.config,'config.json'),JSON.stringify(config),{flag:'wx'})
  await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify(fixture,null,2),{flag:'wx'})
  return fixture
}
export const groupIdentity = files => files.map(file=>({path:file.path.replaceAll('\\','/').replace(/^\/\/\?\//,''),matches:file.matches})).sort((a,b)=>a.path.localeCompare(b.path))
