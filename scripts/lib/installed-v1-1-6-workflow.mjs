import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

export const moveContinuityChecks = [
  'moving-note-rebases-local-images-and-links-without-moving-shared-resources',
  'renaming-image-updates-all-saved-incoming-notes',
  'renaming-linked-note-retains-fragment-and-title',
  'moving-folder-keeps-internal-and-outgoing-references',
  'undo-restores-position-links-and-history',
  'fresh-unsaved-only-incoming-link-blocks-move-without-losing-draft',
  'explicit-save-then-retry-completes-the-original-operation',
  'plain-unsaved-markdown-follows-rename-without-implicit-save',
  'pdf-annotations-and-ocr-follow-the-document',
  'another-real-markdown-window-retains-its-draft-and-refreshes-links-after-save',
  'same-folder-rename-does-not-require-repairing-unrelated-old-broken-links',
  'move-continuity-keeps-interface-operable-without-global-error-overlay',
  'cached-text-draft-keeps-encoding-and-saves-only-at-the-renamed-path',
]
export async function runInstalledV116Workflow({ send, evaluate, navigate, waitFor, capture, library, output, sourceCommit, installerSha256, appVersion }) {
  assert.ok(['1.1.6', '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25'].includes(appVersion))
  if (process.env.LONGEDIT_R5I_DISPOSABLE !== '1' || path.resolve(library).toLowerCase() !== 'c:\\longeditr5ilibrary') throw Error('Use only the disposable installer fixture library')
  const report = { appVersion, sourceCommit, installerSha256, evidenceLevel: 'installed-tauri-ipc-and-disk', sourceUserContentIncluded: false, status: 'running', checks: [] }
  const invoke = async (command, args = {}) => {
    const result = await evaluate(`(async()=>{try{return {ok:true,value:await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)})}}catch(error){return {ok:false,error:String(error)}}})()`)
    if (!result.ok) throw Error(result.error)
    return result.value
  }
  const check = (id, condition) => { assert.ok(condition, id); report.checks.push({ id, status: 'passed' }) }
  const press = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers })
  }
  const click = async expression => {
    await waitFor(`!!(${expression})`, 'v116 control exists')
    await evaluate(`(${expression}).scrollIntoView({block:'nearest'})`)
    const rectangle = `(()=>{const e=${expression},r=e?.getBoundingClientRect();return r?.width&&r?.height&&!e.disabled?{x:r.x+r.width/2,y:r.y+r.height/2}:null})()`
    await waitFor(rectangle, 'v116 control ready'); const point = await evaluate(rectangle)
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 })
  }
  const editor = `[...document.querySelectorAll('#vditor-lib [contenteditable="true"]')].find(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden')`
  const store = `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app')`
  const root = path.join(library, 'v116-continuity'), p = name => path.join(root, name)
  const read = file => fs.readFile(file, 'utf8')
  const move = async (file, directory) => {
    const result = await invoke('transfer_library_items', { libraryRoot: library, paths: [file], targetDir: directory, operation: 'move' })
    assert.deepEqual(result.errors, []); assert.equal(result.items.length, 1); return result.items[0].newPath
  }
  const normalize = value => value.replaceAll('\\', '/').replace(/^\/\/\?\//, '').toLowerCase()
  const currentDraft = async file => evaluate(`(${store}).tabs.find(tab=>{const value=tab.path.replaceAll('\\\\','/').toLowerCase();return (value.startsWith('//?/')?value.slice(4):value)===${JSON.stringify(normalize(file))}})?.content`)
  try {
    await navigate('#/library', '.library-mode', 'v116 library')
    await waitFor(`(()=>{const s=${store},value=s.libraryPath.replaceAll(String.fromCharCode(92),'/').toLowerCase(),root=value.startsWith('//?/')?value.slice(4):value,tab=s.tabs.find(t=>t.id===s.activeTabId);return root===${JSON.stringify(normalize(library))}&&(!tab||typeof tab.content==='string'&&!tab.textReadOnlyReason&&!tab.textLoadError)&&!document.querySelector('.editor-loading')})()`, 'restored library document finishes loading before filesystem operations')
    assert.equal(await evaluate(`(${store}).tabs.filter(tab=>tab.isDirty).length`), 0, 'predecessor workflows must explicitly save their drafts')
    await fs.mkdir(p('assets'), { recursive: true }); await fs.mkdir(p('notes')); await fs.mkdir(p('archive'))
    const image = await fs.readFile(new URL('../../src-tauri/icons/32x32.png', import.meta.url))
    await fs.writeFile(p('assets/pic.png'), image); await fs.writeFile(p('reference.txt'), 'shared document')
    await fs.writeFile(p('note.md'), '# Continuity\n\n![图](assets/pic.png)\n[参考](reference.txt)\n\n'+ '正文段落\n\n'.repeat(35) + '## Heading\n\n锚点目标正文\n')
    const moved = await move(p('note.md'), p('notes'))
    const movedContent = await read(moved)
    await navigate('#/library?path=' + encodeURIComponent(moved), '.library-mode', 'v116 moved image note')
    await waitFor(`(${editor})?.textContent.includes('Continuity')`, 'moved note opened')
    if (await evaluate(`(${store}).editorMode!=='wysiwyg'`)) {
      await click(`document.querySelector('.inline-mode')`)
      await click(`[...document.querySelectorAll('.n-dropdown-option')].find(e=>e.textContent.includes('所见即所得'))`)
    }
    await waitFor(`!![...document.querySelectorAll('#vditor-lib .vditor-reset img')].find(image=>image.naturalWidth>0)`, 'moved local image rendered')
    await click(`[...document.querySelectorAll('#vditor-lib .vditor-reset a')].find(anchor=>anchor.textContent==='参考')`)
    await waitFor(`document.querySelector('.text-workspace .cm-content')?.textContent.includes('shared document')`,'moved relative link opens the actual text file')
    await navigate('#/library?path='+encodeURIComponent(moved),'.library-mode','return to moved image note')
    await waitFor(`!![...document.querySelectorAll('#vditor-lib .vditor-reset img')].find(image=>image.naturalWidth>0)`,'moved image note reopens')
    check(moveContinuityChecks[0], movedContent.includes('../assets/pic.png') && movedContent.includes('../reference.txt') && (await fs.readFile(p('assets/pic.png'))).equals(image))
    await fs.writeFile(p('incoming.md'), '[图](assets/pic.png)\n[笔记](notes/note.md#heading "标题")\n')
    await invoke('rename_item', { libraryRoot: library, oldPath: p('assets/pic.png'), newName: '新图.png' })
    await waitFor(`!![...document.querySelectorAll('#vditor-lib .vditor-reset img')].find(image=>image.naturalWidth>0&&decodeURIComponent(image.src).includes('新图.png'))`, 'renamed image refreshed in the open editor')
    assert.ok(!await evaluate(`!!document.querySelector('.n-message--error-type')`), 'loading and moving notes must not produce a visible read error')
    await capture('installed-v116-images.jpg')
    check(moveContinuityChecks[1], (await read(moved)).includes('../assets/%E6%96%B0%E5%9B%BE.png') && (await read(p('incoming.md'))).includes('assets/%E6%96%B0%E5%9B%BE.png'))
    const renamed = await invoke('rename_item', { libraryRoot: library, oldPath: moved, newName: 'renamed.md' })
    await navigate('#/library?path='+encodeURIComponent(p('incoming.md')),'.library-mode','incoming renamed note link')
    await waitFor(`!![...document.querySelectorAll('#vditor-lib .vditor-reset a')].find(anchor=>anchor.textContent==='笔记')`,'updated incoming link visible')
    await click(`[...document.querySelectorAll('#vditor-lib .vditor-reset a')].find(anchor=>anchor.textContent==='笔记')`)
    await waitFor(`!![...document.querySelectorAll('#vditor-lib h2')].find(heading=>heading.textContent==='Heading'&&heading.getBoundingClientRect().top>100&&heading.getBoundingClientRect().bottom<innerHeight-30)&&location.hash.includes('markdownAnchor=heading')`,'renamed linked note opens at its heading')
    check(moveContinuityChecks[2], (await read(p('incoming.md'))).includes('notes/renamed.md#heading "标题"'))
    await move(p('notes'), p('archive'))
    check(moveContinuityChecks[3], (await read(p('archive/notes/renamed.md'))).includes('../../reference.txt') && (await read(p('incoming.md'))).includes('archive/notes/renamed.md#heading'))
    const undone = await invoke('undo_library_moves', { libraryRoot: library, items: [{ oldPath: p('notes'), newPath: p('archive/notes') }] })
    assert.deepEqual(undone.errors, [])
    check(moveContinuityChecks[4], (await read(renamed)).includes('../reference.txt') && (await read(p('incoming.md'))).includes('notes/renamed.md#heading'))
    const draftPath = p('draft.md'); await fs.writeFile(draftPath, '# 尚未保存的链接\n\n')
    await navigate('#/library?path=' + encodeURIComponent(draftPath), '.library-mode', 'v116 fresh editor snapshot')
    await waitFor(`(${editor})?.textContent.includes('尚未保存的链接')`, 'v116 editor ready')
    await click(`document.querySelector('.inline-mode')`)
    await click(`[...document.querySelectorAll('.n-dropdown-option')].find(e=>e.textContent.includes('源码编辑'))`)
    await waitFor(`!!document.querySelector('#vditor-lib .vditor-sv[contenteditable="true"]')?.getClientRects().length`, 'v116 source mode ready')
    await click(editor); await press('End', 'End', 35, 2); await send('Input.insertText', { text: '\n[新增](reference.txt)\n尚未保存的新正文' })
    await assert.rejects(invoke('rename_item', { libraryRoot: library, oldPath: p('reference.txt'), newName: 'reference-new.txt' }), /保存/)
    check(moveContinuityChecks[5], (await currentDraft(draftPath)).includes('尚未保存的新正文') && await read(draftPath) === '# 尚未保存的链接\n\n' && await read(p('reference.txt')) === 'shared document')
    await click(`document.querySelector('[data-testid="library-explicit-save"]')`)
    await waitFor(`!(${store}).tabs.some(tab=>tab.isDirty)`, 'v116 explicit save settled')
    await invoke('rename_item', { libraryRoot: library, oldPath: p('reference.txt'), newName: 'reference-new.txt' })
    check(moveContinuityChecks[6], (await read(draftPath)).includes('reference-new.txt') && (await read(draftPath)).includes('尚未保存的新正文'))
    const plain = p('plain.md'); await fs.writeFile(plain, '# 原文\n')
    await navigate('#/library?path=' + encodeURIComponent(plain), '.library-mode', 'v116 retained draft')
    await waitFor(`(${editor})?.textContent.includes('原文')`, 'plain editor ready'); await click(editor); await press('End', 'End', 35, 2); await send('Input.insertText', { text: ' 保留本地修改' })
    const plainNew = await invoke('rename_item', { libraryRoot: library, oldPath: plain, newName: 'plain-new.md' })
    check(moveContinuityChecks[7], (await currentDraft(plainNew)).includes('保留本地修改') && await read(plainNew) === '# 原文\n' && await evaluate(`(${store}).tabs.some(tab=>tab.isDirty)`))
    await click(`document.querySelector('[data-testid="library-explicit-save"]')`); await waitFor(`!(${store}).tabs.some(tab=>tab.isDirty)`, 'retained draft explicitly saved')
    await fs.writeFile(p('sample.pdf'), 'synthetic PDF path test')
    for (const kind of ['annotations', 'ocr']) await fs.writeFile(p(`sample.pdf.${kind}.json`), JSON.stringify({ source: { pdfFile: 'sample.pdf' }, userField: 'preserved' }))
    await invoke('rename_item', { libraryRoot: library, oldPath: p('sample.pdf'), newName: 'sample-new.pdf' })
    check(moveContinuityChecks[8], (await read(p('sample-new.pdf.annotations.json'))).includes('preserved') && (await read(p('sample-new.pdf.ocr.json'))).includes('sample-new.pdf'))
    const secondPath = p('second-window.md'); await fs.writeFile(secondPath, '# 第二窗口\n\n[参考](reference-new.txt)\n')
    const label = await invoke('open_external_file_window', { path: secondPath })
    const second = await connectWindow(label)
    try {
      await second.until(`!![...document.querySelectorAll('#vditor [contenteditable="true"]')].find(e=>e.getClientRects().length)`)
      const point = await second.evaluate(`(()=>{const e=[...document.querySelectorAll('#vditor [contenteditable="true"]')].find(e=>e.getClientRects().length);const r=e.getBoundingClientRect();return {x:r.x+30,y:r.y+20}})()`)
      for (const type of ['mousePressed','mouseReleased']) await second.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1})
      for (const type of ['keyDown','keyUp']) await second.send('Input.dispatchKeyEvent',{type,key:'End',code:'End',windowsVirtualKeyCode:35,modifiers:2})
      await second.send('Input.insertText',{text:' 第二窗口草稿'})
      await assert.rejects(invoke('rename_item',{libraryRoot:library,oldPath:p('reference-new.txt'),newName:'reference-final.txt'}),/second-window\.md/)
      await second.until(`!document.body.inert&&!!document.querySelector('.dirty-dot')`)
      const savePoint = await second.evaluate(`(()=>{const e=[...document.querySelectorAll('.temp-mode button')].find(e=>e.textContent.trim()==='保存'),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
      for (const type of ['mousePressed','mouseReleased']) await second.send('Input.dispatchMouseEvent',{type,...savePoint,button:'left',clickCount:1})
      await second.until(`!document.querySelector('.dirty-dot')`)
      await invoke('rename_item',{libraryRoot:library,oldPath:p('reference-new.txt'),newName:'reference-final.txt'})
      await second.until(`!document.body.inert&&!![...document.querySelectorAll('#vditor a, #vditor .vditor-sv')].find(e=>(e.getAttribute('href')||e.getAttribute('data-href')||e.textContent||'').includes('reference-final.txt'))`)
      check(moveContinuityChecks[9],(await read(secondPath)).includes('第二窗口草稿')&&(await read(secondPath)).includes('reference-final.txt')&&!await second.evaluate(`!!document.querySelector('.dirty-dot')`))
    } finally { second.close() }
    await invoke('plugin:window|close',{label})
    const brokenBody='# 原有内容\n\n[旧链接](already-missing-v116.txt)\n'
    await fs.writeFile(p('old-broken.md'),brokenBody)
    const brokenRenamed=await invoke('rename_item',{libraryRoot:library,oldPath:p('old-broken.md'),newName:'old-broken-renamed.md'})
    check(moveContinuityChecks[10],await read(brokenRenamed)===brokenBody)
    check(moveContinuityChecks[11], await evaluate(`!document.body.inert&&!document.querySelector('#crash-screen')&&!document.querySelector('.route-error')&&!document.querySelector('.n-message--error-type')`))
    const textOld=p('保留草稿.txt'),textOriginal='original\r\n';await fs.writeFile(textOld,textOriginal)
    await navigate('#/library?path='+encodeURIComponent(textOld),'.library-mode','v116 cached text draft')
    await waitFor(`document.querySelector('.text-workspace .cm-content')?.textContent.includes('original')`,'text editor ready')
    await click(`document.querySelector('.text-workspace .cm-content')`);await press('End','End',35,2);await send('Input.insertText',{text:'新的未保存内容'})
    const textNew=await invoke('rename_item',{libraryRoot:library,oldPath:textOld,newName:'接续草稿.txt'})
    await waitFor(`document.querySelector('.text-workspace .cm-content')?.textContent.includes('新的未保存内容')&&!document.body.inert`,'text draft follows renamed path')
    const retainedText=await currentDraft(textNew);assert.equal(await read(textNew),textOriginal)
    await click(`[...document.querySelectorAll('.text-workspace button')].find(button=>button.textContent.trim()==='保存')`)
    await waitFor(`!(${store}).tabs.some(tab=>tab.isDirty)`,'text draft explicitly saved at new path')
    const savedText=await read(textNew)
    check(moveContinuityChecks[12],retainedText.includes('新的未保存内容')&&savedText.includes('新的未保存内容')&&savedText.includes('\r\n')&&!await fs.stat(textOld).then(()=>true,()=>false))
    await capture('installed-v116-move-continuity.jpg'); report.status = 'passed'
  } catch (error) { report.status = 'failed'; report.error = String(error); await capture('installed-v116-failure.jpg').catch(() => {}); throw error }
  finally { await fs.writeFile(path.join(output, 'installed-v116-workflow.json'), JSON.stringify(report, null, 2) + '\n') }
}

async function connectWindow(label) {
  const endpoint = process.env.LONGEDIT_CDP_ENDPOINT || 'http://127.0.0.1:9343'
  for (let attempt=0;attempt<100;attempt++) {
    const targets = await fetch(endpoint+'/json').then(response=>response.json())
    for (const target of targets.filter(target=>target.type==='page'&&target.webSocketDebuggerUrl)) {
      const socket = new WebSocket(target.webSocketDebuggerUrl)
      await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
      const pending=new Map();let id=0
      socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const task=pending.get(message.id);if(task){pending.delete(message.id);clearTimeout(task.timer);message.error?task.reject(Error(message.error.message)):task.resolve(message.result)}}})
      const send=(method,params={})=>new Promise((resolve,reject)=>{const token=++id,timer=setTimeout(()=>{pending.delete(token);reject(Error('Secondary window CDP timeout: '+method))},15000);pending.set(token,{resolve,reject,timer});socket.send(JSON.stringify({id:token,method,params}))})
      const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value}
      const found=await evaluate('window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label').catch(()=>null)
      if(found===label)return {send,evaluate,close:()=>socket.close(),until:async expression=>{for(let index=0;index<150;index++){if(await evaluate(expression).catch(()=>false))return;await new Promise(resolve=>setTimeout(resolve,100))}throw Error('Secondary window did not reach: '+expression)}}
      socket.close()
    }
    await new Promise(resolve=>setTimeout(resolve,100))
  }
  throw Error('Secondary native window was not found: '+label)
}
