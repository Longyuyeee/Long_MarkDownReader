import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {nativeUserInput} from './v118-native-user-input.mjs'

export const saveHistoryChecks = [
  'markdown-conflict-copy-keeps-disk-and-unsaved-editor',
  'markdown-conflict-reload-protects-draft-in-history',
  'text-conflict-rejects-stale-comparison-and-keeps-draft',
  'text-conflict-reload-protects-draft-before-replacement',
  'history-records-return-to-older-content',
  'history-search-finds-body-and-note',
  'context-menu-pin-and-note-persist',
  'retention-and-move-keep-important-version-metadata',
  'explicit-markdown-save-keeps-before-and-after-versions',
  'history-list-and-metadata-load-in-parallel-without-busy-errors',
  'interrupted-version-metadata-recovers-without-losing-important-history',
  'save-history-workflows-have-no-global-error-overlay',
]

export async function runInstalledV117Workflow({send,evaluate,navigate,waitFor,capture,library,output,sourceCommit,installerSha256,appVersion}) {
  assert.ok(['1.1.7','1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32'].includes(appVersion))
  if(process.env.LONGEDIT_R5I_DISPOSABLE!=='1'||path.resolve(library).toLowerCase()!=='c:\\longeditr5ilibrary')throw Error('Disposable installer fixture required')
  const report={appVersion,sourceCommit,installerSha256,evidenceLevel:'installed-tauri-ipc-and-disk',sourceUserContentIncluded:false,status:'running',checks:[]}
  const check=id=>report.checks.push({id,status:'passed'})
  const invoke=async(command,args={})=>{
    const result=await evaluate(`(async()=>{try{return {ok:true,value:await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})}}catch(e){return {ok:false,error:String(e)}}})()`)
    if(!result.ok)throw Error(result.error);return result.value
  }
  const press=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers})}
  const {clickTarget:click}=nativeUserInput({send,evaluate})
  const button=(scope,label)=>`[...document.querySelectorAll(${JSON.stringify(scope+' button')})].find(e=>e.textContent.trim()===${JSON.stringify(label)})`
  const fill=async(selector,value)=>{await click(`document.querySelector(${JSON.stringify(selector)})`);await press('a','KeyA',65,2);await send('Input.insertText',{text:value})}
  const store=`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')`
  const editor=`[...document.querySelectorAll('#vditor-lib [contenteditable="true"]')].find(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden')`
  const root=path.join(library,'v117-save-history'), md=path.join(root,'方案.md'), txt=path.join(root,'记录.txt')
  const conflict='.text-conflict-dialog', historyArgs=file=>({libraryRoot:library,path:file})
  const goLibrary = file => navigate('#/library?path='+encodeURIComponent(file),'.library-mode','v117 '+path.basename(file))
  try {
    await fs.mkdir(root,{recursive:true});await fs.writeFile(md,'# 方案\n\noriginal markdown\n');await fs.writeFile(txt,'original text\n')
    await goLibrary(md);await waitFor(`(${editor})?.textContent.includes('original markdown')`,'v117 Markdown ready')
    await click(editor);await press('End','End',35,2);await send('Input.insertText',{text:'\nunsaved markdown 117'})
    await fs.writeFile(md,'# 磁盘最新方案\n\nexternal markdown\n')
    await click(`document.querySelector('[data-testid="library-explicit-save"]')`);await waitFor(`!!document.querySelector('${conflict}')`,'v117 MD conflict')
    await click(button(conflict,'另存当前副本'));await waitFor(`!document.querySelector('${conflict}')`,'v117 MD copied')
    assert.match(await fs.readFile(path.join(root,'方案-当前副本1.md'),'utf8'),/unsaved markdown 117/)
    assert.match(await fs.readFile(md,'utf8'),/external markdown/)
    assert.ok(await evaluate(`(${store}).tabs.some(t=>t.isDirty&&t.content?.includes('unsaved markdown 117'))`));check(saveHistoryChecks[0])
    await click(`document.querySelector('[data-testid="library-explicit-save"]')`);await waitFor(`!!document.querySelector('${conflict}')`,'v117 MD conflict again')
    await click(button(conflict,'使用磁盘版本'));await waitFor(`!document.querySelector('${conflict}')`,'v117 MD reload complete')
    assert.ok((await invoke('list_history',historyArgs(md))).some(([,content])=>content.includes('unsaved markdown 117')))
    await waitFor(`(${editor})?.textContent.includes('external markdown')`,'v117 actual disk content displayed');check(saveHistoryChecks[1])
    await goLibrary(txt);await waitFor(`document.querySelector('.text-workspace .cm-content')?.textContent.includes('original text')`,'v117 TXT ready')
    await fill('.text-workspace .cm-content','unsaved text 117')
    await fs.writeFile(txt,'external text first\n')
    await click(button('.text-toolbar','保存'));await waitFor(`!!document.querySelector('${conflict}')`,'v117 TXT conflict')
    await waitFor(`document.querySelector('${conflict} .diff-lines')?.textContent.includes('external text first')`,'v117 first disk compared')
    await fs.writeFile(txt,'external text second\n')
    await click(button(conflict,'使用磁盘版本'));await waitFor(`document.querySelector('${conflict} [role=alert]')?.textContent.includes('再次变化')`,'v117 stale disk rejected')
    assert.ok(await evaluate(`document.querySelector('.cm-content').textContent.includes('unsaved text 117')`));check(saveHistoryChecks[2])
    await click(button(conflict,'重新比较'));await waitFor(`document.querySelector('${conflict} .diff-lines')?.textContent.includes('external text second')`,'v117 disk refreshed')
    await capture('installed-v117-conflict.jpg')
    await click(button(conflict,'使用磁盘版本'));await waitFor(`!document.querySelector('${conflict}')`,'v117 TXT reload complete')
    assert.ok((await invoke('list_history',historyArgs(txt))).some(([,content])=>content==='unsaved text 117'))
    assert.equal(await fs.readFile(txt,'utf8'),'external text second\n');check(saveHistoryChecks[3])
    for(const content of ['timeline A 117','timeline B 117','timeline A 117'])await invoke('save_history_version',{...historyArgs(md),content,maxCount:20})
    const versions=await invoke('list_history',historyArgs(md));assert.deepEqual(versions.slice(0,3).map(([,content])=>content),['timeline A 117','timeline B 117','timeline A 117']);check(saveHistoryChecks[4])
    await goLibrary(md);await waitFor(`(${editor})?.textContent.includes('external markdown')`,'v117 MD restored reader')
    await click(`document.querySelector('#tab-history')`);await waitFor(`document.querySelectorAll('.history-version-row').length>=3`,'v117 history rows')
    await fill('.history-search input','timeline B 117');await waitFor(`document.querySelectorAll('.history-version-row').length===1`,'v117 body search')
    await fill('.history-search input','')
    await click(`document.querySelector('.history-version-row > button.n-button')`)
    const option=label=>`[...document.querySelectorAll('.n-dropdown-option-body')].find(e=>e.textContent.trim()===${JSON.stringify(label)})`
    await click(option('保留此版本'));await waitFor(`!!document.querySelector('.history-version-row .pinned')`,'v117 pinned row')
    await click(`document.querySelector('.history-version-row > button.n-button')`);await click(option('添加或修改备注…'))
    await fill('input[placeholder="例如：提交前、第一次修改"]','提交前 117')
    await click(button('.n-modal','保存备注'));await waitFor(`!document.querySelector('input[placeholder="例如：提交前、第一次修改"]')`,'v117 note saved')
    await fill('.history-search input','提交前 117');await waitFor(`document.querySelectorAll('.history-version-row').length===1`,'v117 note search');check(saveHistoryChecks[5])
    const metadata=await invoke('get_history_metadata',historyArgs(md)), important=versions[0][0]
    assert.deepEqual(metadata[important],{pinned:true,note:'提交前 117'});check(saveHistoryChecks[6])
    await capture('installed-v117-history.jpg')
    for(let index=0;index<5;index++)await invoke('save_history_version',{...historyArgs(md),content:'retention '+index,maxCount:2})
    assert.ok((await invoke('list_history',historyArgs(md))).some(([time])=>time===important))
    const target=path.join(root,'整理后');await fs.mkdir(target,{recursive:true})
    const moved=await invoke('transfer_library_items',{libraryRoot:library,paths:[md],targetDir:target,operation:'move'})
    assert.deepEqual(moved.errors,[]);assert.equal(moved.items.length,1)
    const next=moved.items[0].newPath;assert.deepEqual((await invoke('get_history_metadata',historyArgs(next)))[important],metadata[important]);check(saveHistoryChecks[7])
    await goLibrary(next);await waitFor(`(${editor})?.textContent.includes('external markdown')`,'v117 ordinary save reader ready')
    await evaluate(`(async()=>{await (${store}).updateConfig({maxHistoryCount:20})})()`)
    await click(editor);await press('End','End',35,2);await send('Input.insertText',{text:'\nnormal save checkpoint 117'})
    await click(`document.querySelector('[data-testid="library-explicit-save"]')`)
    await waitFor(`(${store}).tabs.some(t=>!t.isDirty&&t.content?.includes('normal save checkpoint 117'))`,'v117 ordinary save receipt')
    const automatic=await invoke('list_history',historyArgs(next))
    assert.ok(automatic[0][1].includes('normal save checkpoint 117'));assert.ok(automatic[1][1].includes('external markdown')&&!automatic[1][1].includes('normal save checkpoint 117'))
    assert.match(await fs.readFile(next,'utf8'),/normal save checkpoint 117/);check(saveHistoryChecks[8])
    // Exercise the real IPC pair used when opening history, without replacing native handlers.
    const parallel = await evaluate(`(async()=>{
      const args=${JSON.stringify(historyArgs(next))};
      return await Promise.all(Array.from({length:6},async()=>await Promise.all([
        window.__TAURI_INTERNALS__.invoke('list_history',args),
        window.__TAURI_INTERNALS__.invoke('get_history_metadata',args)
      ])))
    })()`)
    assert.equal(parallel.length,6)
    for(const [entries,notes] of parallel){assert.ok(entries.some(([,body])=>body.includes('normal save checkpoint 117')));assert.deepEqual(notes[important],metadata[important])}
    check(saveHistoryChecks[9])
    await click(`document.querySelector('#tab-files')`)
    const snapshot=await invoke('read_text_document',{...historyArgs(next),formatId:'markdown'})
    const cache=await invoke('plugin:path|resolve_directory',{directory:16}) // AppCache, from the bundled Tauri path API.
    const historyDirectory=path.join(cache,'history_v2',crypto.createHash('md5').update(snapshot.path).digest('hex'))
    const metadataFile=path.join(historyDirectory,'metadata.json'), backup=path.join(historyDirectory,'.metadata.json.longedit-bak'), temporary=path.join(historyDirectory,'.metadata.json.longedit-tmp')
    assert.deepEqual(JSON.parse(await fs.readFile(metadataFile,'utf8'))[important],metadata[important])
    const interrupt=async()=>{
      await assert.rejects(fs.access(backup));await assert.rejects(fs.access(temporary))
      await fs.writeFile(temporary,'{"incomplete":')
      await fs.rename(metadataFile,backup)
    }
    // Real disk state at the reliable-write interruption boundary, not mocked IPC.
    await interrupt()
    assert.deepEqual((await invoke('get_history_metadata',historyArgs(next)))[important],metadata[important])
    await assert.rejects(fs.access(backup));await assert.rejects(fs.access(temporary))
    await interrupt()
    await invoke('save_history_version',{...historyArgs(next),content:'after interrupted metadata recovery 117',maxCount:2})
    assert.ok((await invoke('list_history',historyArgs(next))).some(([time])=>time===important))
    assert.deepEqual((await invoke('get_history_metadata',historyArgs(next)))[important],metadata[important])
    assert.match(await fs.readFile(next,'utf8'),/normal save checkpoint 117/)
    await assert.rejects(fs.access(backup));await assert.rejects(fs.access(temporary))
    check(saveHistoryChecks[10])
    assert.ok(await evaluate(`!document.querySelector('.global-error-overlay,.startup-fatal-screen,#runtime-error-notice,.route-error-notice,#crash-screen,.route-error-fallback')&&!document.body.innerText.includes('应用加载失败')`));check(saveHistoryChecks[11])
    report.status='passed'
  } catch(error) {report.status='failed';report.error=String(error);await capture('installed-v117-failure.jpg').catch(()=>{});throw error}
  finally {await fs.writeFile(path.join(output,'installed-v117-workflow.json'),JSON.stringify(report,null,2)+'\n')}
}
