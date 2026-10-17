import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

export const sessionProductCommit='6a3b10357bda9a2ee095fa07fe26cafd622a2ab0'
export const baselineSessionChecks=[
 'runtime-and-config-identity','metadata-export-whitelist-and-real-roundtrip','existing-export-and-invalid-fields-never-write',
 'invalid-schema-and-oversize-import-preserve-bytes','configured-new-root-partial-preflight','traversal-duplicates-and-unconfigured-root-rejected',
 'canonical-junction-and-private-files-rejected','locate-real-inside-file-only','secondary-window-rejects-all-four-session-commands',
 'real-webview-storage-import-is-idempotent','metadata-actions-preserve-document-bytes',
]
export const restartSessionChecks=['same-program-and-export-survive-process-restart','real-webview-stored-scene-survives-process-restart']
export function assertSessionHosted(env=process.env){
 assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.RUNNER_ENVIRONMENT,'github-hosted');assert.equal(env.RUNNER_OS,'Windows')
}
export function sessionFixturePaths(root){
 assert.match(path.basename(root),/^longedit-v119-session-[a-z0-9-]+$/i)
 assert.ok(path.isAbsolute(root));return {root,library:path.join(root,'原资料库'),target:path.join(root,'新资料 & 中文'),outside:path.join(root,'库外资料'),config:path.join(root,'config'),webview:path.join(root,'webview'),exportPath:path.join(root,'客户交付.longedit-session.json')}
}
export async function createSessionFixture(root){
 const f=sessionFixturePaths(root);await fs.mkdir(root,{recursive:false})
 await fs.writeFile(path.join(root,'.v119-session-owner'),crypto.randomUUID(),{flag:'wx'})
 for(const folder of [f.library,f.target,f.outside,f.config,f.webview])await fs.mkdir(folder)
 for(const library of [f.library,f.target]){
  await fs.mkdir(path.join(library,'项目'));await fs.mkdir(path.join(library,'.longedit'))
  await fs.writeFile(path.join(library,'项目','纪要.md'),'# PRIVATE DOCUMENT BODY — keep every byte\n',{flag:'wx'})
  await fs.writeFile(path.join(library,'参考.md'),'PRIVATE REFERENCE BODY\n',{flag:'wx'})
  await fs.writeFile(path.join(library,'.longedit','config.json'),'PRIVATE INTERNAL CONFIG',{flag:'wx'})
  await fs.writeFile(path.join(library,'secrets.json'),'PRIVATE KEY',{flag:'wx'})
  await fs.writeFile(path.join(library,'program.exe'),'NOT AN EXECUTABLE',{flag:'wx'})
 }
 await fs.writeFile(path.join(f.outside,'outside.md'),'OUTSIDE PRIVATE BODY',{flag:'wx'})
 await fs.symlink(f.outside,path.join(f.target,'目录别名'),'junction')
 const config={libraries:[{name:'原资料库',path:f.library},{name:'新资料库',path:f.target}],activeLibraryPath:f.library,theme:'white',visualStyle:'minimal',motionSpeed:'calm',textAutoSaveEnabled:false,aiEnabled:false}
 await fs.writeFile(path.join(f.config,'config.json'),JSON.stringify(config),{flag:'wx'})
 await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify(f,null,2),{flag:'wx'});return f
}
export function validateNativeSessionReport(report,phase){
 assert.ok(['baseline','restart'].includes(phase));assert.equal(report.phase,phase);assert.equal(report.status,'passed')
 assert.equal(report.productCommit,sessionProductCommit);assert.match(report.harnessCommit,/^[a-f0-9]{40}$/)
 assert.match(report.executableSha256,/^[a-f0-9]{64}$/);assert.equal(report.runtimeBaseVersion,'1.1.8')
 assert.equal(report.evidenceLevel,'debug-tauri-wry-real-session-ipc-not-installed');assert.equal(report.releaseCandidate,false)
 assert.equal(report.isInstaller,false);assert.equal(report.sourceUserContentIncluded,false);assert.equal(report.desktopInputUsed,false)
 assert.deepEqual(report.checks,phase==='baseline'?baselineSessionChecks:restartSessionChecks)
 assert.ok(report.calls.length>= (phase==='baseline'?20:3))
 const commands=['export_work_session_bundle','read_work_session_bundle','preflight_work_session','locate_work_session_file']
 if(phase==='baseline')for(const command of commands){assert.ok(report.calls.some(call=>call.window==='main'&&call.command===command&&call.ok));assert.ok(report.calls.some(call=>call.window==='quick-note'&&call.command===command&&!call.ok))}
 return report
}
