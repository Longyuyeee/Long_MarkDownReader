import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {nativeUserInput} from './v118-native-user-input.mjs'

// Uses the actual packaged UI and IPC only on the disposable release runner.
export async function runInstalledV111Workflow({ send, evaluate, navigate, waitFor, capture, library, output, sourceCommit, installerSha256, appVersion }) {
  if (process.env.LONGEDIT_R5I_DISPOSABLE !== '1' || !['1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16'].includes(appVersion)) throw Error('Disposable 1.1.1 installation required')
  const report = { appVersion, sourceCommit, installerSha256, evidenceLevel: 'installed-tauri-ipc-and-disk', sourceUserContentIncluded: false, status: 'running', checks: [] }
  const invoke = async (command, args={}) => {
    const result = await evaluate(`(async()=>{try{return {ok:true,value:await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})}}catch(error){return {ok:false,error:String(error)}}})()`)
    if (!result.ok) throw Error(result.error)
    return result.value
  }
  const check = (id, condition) => { assert.ok(condition,id); report.checks.push({id,status:'passed'}) }
  const nativeInput=nativeUserInput({send,evaluate})
  const click = async selector => {
    report.lastControlSelector = selector
    await nativeInput.clickTarget(selector)
  }
  const dir=path.join(library,'release-v111-workflow')
  try {
    await fs.mkdir(dir) // A collision must not overwrite any pre-existing files.
    const inboxRoot=path.join(dir,'inbox-library');await fs.mkdir(inboxRoot)
    const listing=await invoke('read_inbox_directory',{libraryRoot:inboxRoot,inboxDirectory:'Inbox',path:path.join(inboxRoot,'Inbox')})
    check('missing-default-inbox-is-normal-empty',listing.directoryMissing===true && listing.entries.length===0 && !(await fs.stat(path.join(inboxRoot,'Inbox')).then(()=>true,()=>false)))
    const prepared=await invoke('create_inbox_directory',{libraryRoot:inboxRoot,inboxDirectory:'Inbox'})
    const note=await invoke('create_new_file',{libraryRoot:inboxRoot,targetDir:prepared})
    const listed=await invoke('read_inbox_directory',{libraryRoot:inboxRoot,inboxDirectory:'Inbox',path:prepared})
    check('first-inbox-note-is-created-in-place',listed.directoryMissing===false && listed.entries.some(e=>e.name==='未命名.md') && (await fs.readFile(note,'utf8'))==='')

    const source=path.join(dir,'关系起点.md'), target=path.join(dir,'关系目标.attachment')
    await fs.writeFile(source,'# Release relation\n\nUnsaved drafts remain independent.\n',{flag:'wx'})
    await fs.writeFile(target,Buffer.from([0,1,2,3,255]),{flag:'wx'})
    const original=await fs.readFile(target)
    const catalog=await invoke('list_relation_files',{libraryRoot:library,query:'关系目标'})
    check('any-file-catalog-includes-attachments',catalog.files.some(f=>f.name==='关系目标.attachment'))
    await navigate('#/library?path='+encodeURIComponent(source),'.library-mode','installed file relation toolbar')
    await waitFor(`document.querySelector('.vditor-wysiwyg')?.innerText.includes('Release relation')`,'installed Markdown content')
    await click(`document.querySelector('[data-testid="library-add-relation"]')`)
    await waitFor(`document.querySelector('.file-relation-dialog .relation-dialog-body')`,'unified relation dialog')
    await click(`document.querySelectorAll('.file-relation-dialog .relation-file-picker .n-select')[1]`)
    await send('Input.insertText',{text:'关系目标'})
    await waitFor(`[...document.querySelectorAll('.n-base-select-option')].some(e=>e.textContent.includes('关系目标.attachment'))`,'native attachment search option')
    await click(`[...document.querySelectorAll('.n-base-select-option')].find(e=>e.textContent.includes('关系目标.attachment'))`)
    await waitFor(`document.querySelector('.file-relation-dialog .relation-preview')?.textContent.includes('关系目标.attachment')`,'actual attachment selected before submitting its relation')
    await click(`document.querySelector('.file-relation-dialog button[type="submit"]')`)
    await waitFor(`document.querySelector('.dialog-notice')?.textContent.includes('关系已保存')`,'native relationship saved from UI')
    const [entry]=await invoke('list_file_relations',{libraryRoot:library,path:source})
    check('toolbar-dialog-saves-cross-format-relation',entry?.relationType==='related' && entry.targetPath.endsWith('关系目标.attachment'))
    const metadata=JSON.parse(await fs.readFile(path.join(library,'.longedit','file-relations.json'),'utf8'))
    check('relationship-persisted-without-editing-files',metadata.relations.some(e=>e.id===entry.id && !path.isAbsolute(e.sourcePath) && !path.isAbsolute(e.targetPath)) && (await fs.readFile(target)).equals(original) && (await fs.readFile(source,'utf8')).includes('Unsaved drafts'))
    await capture('installed-v111-relation-dialog.jpg')
    await click(`[...document.querySelectorAll('.file-relation-dialog button')].find(e=>e.textContent==='完成')`)
    const graph=await invoke('build_link_graph',{libraryRoot:library})
    check('manual-relationship-in-native-graph',graph.edges.some(e=>e.manualRelationIds?.includes(entry.id)))
    const newPath=await invoke('rename_item',{libraryRoot:library,oldPath:target,newName:'关系目标已改名.attachment'})
    check('renaming-retains-file-relationship',(await invoke('list_file_relations',{libraryRoot:library,path:source})).some(e=>e.targetPath===newPath))
    await invoke('remove_file_relation',{libraryRoot:library,relationId:entry.id})
    check('removing-relation-retains-both-files',(await invoke('list_file_relations',{libraryRoot:library,path:source})).length===0 && (await fs.readFile(newPath)).equals(original) && (await fs.stat(source)).isFile())
    report.status='passed'
  } catch(error) {report.status='failed';report.error=String(error);await capture('installed-v111-failure.jpg').catch(()=>{});throw error}
  finally {await fs.writeFile(path.join(output,'installed-v111-workflow.json'),JSON.stringify(report,null,2)+'\n')}
}
