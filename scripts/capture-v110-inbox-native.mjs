import fs from 'node:fs/promises'
const base=await fs.readFile(new URL('./capture-v110-quick-note-windows.mjs',import.meta.url),'utf8')
const prefix=base.slice(0,base.indexOf('try{\n  let mainTarget'))
if(!prefix || prefix===base)throw Error('Connection helper changed')
const scenario=String.raw`
try {
  let t
  await wait(async()=>{try{t=(await targets()).find(t=>t.type==='page');return !!t}catch{return false}},'main target')
  const main=await connect(t),lib=process.env.LONGEDIT_E2E_LIBRARY
  await wait(()=>main.evaluate("document.body.innerText.includes('Note.md')"),'main ready')
  await fs.mkdir(output,{recursive:true})
  await click(main,"document.querySelector('.inbox-shortcut')")
  if(process.argv.includes('--restart')) {
    await wait(()=>main.evaluate("document.querySelector('.inbox-browser')?.textContent.includes('原生选择记录.md')"),'restart shows configured inbox')
    check('fresh process restores configured inbox',await main.evaluate("document.querySelector('.inbox-browser .location').textContent==='原生收集箱'"))
    await main.evaluate("window.__TAURI_INTERNALS__.invoke('open_quick_note')")
    let qt
    await wait(async()=>{qt=(await targets()).find(t=>t.url.includes('quick-note'));return !!qt},'quick after restart')
    const q=await connect(qt)
    await wait(()=>q.evaluate("document.querySelector('[aria-label=保存到]')?.value.endsWith('/原生收集箱')"),'quick restored target')
    check('new native quick window reads persisted inbox',true)
    await fs.writeFile(path.join(output,'restart-quick.png'),Buffer.from((await q.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
    await fs.writeFile(path.join(output,'restart-checks.json'),JSON.stringify({checks},null,2))
  } else {
    const chosen=path.join(lib,'原生收集箱')
    await fs.mkdir(chosen);await fs.writeFile(path.join(chosen,'原生选择记录.md'),'# 原生目录选择验收')
    console.log('Fixture target: '+chosen)
    console.log('Outside target: '+path.dirname(lib))
    const choose=async()=>{
      if(!await main.evaluate("!!document.querySelector('.inbox-settings')"))await click(main,"document.querySelector('[aria-label=收集箱设置]')")
      await click(main,"[...document.querySelectorAll('.inbox-settings button')].find(e=>e.textContent.includes('设置收集目录'))")
    }
    const until=async(expression,label)=>{for(let i=0;i<2400;i++){if(await main.evaluate(expression))return;await pause(100)}throw Error(label)}
    await choose();console.log('STAGE 1: cancel native folder picker')
    await until("!document.querySelector('[aria-label=收集箱设置]').disabled",'native cancel')
    check('cancel keeps default Inbox',await main.evaluate("document.querySelector('.inbox-browser .location').textContent==='Inbox'"))
    await choose();console.log('STAGE 2: choose fixture child folder')
    await until("document.querySelector('.inbox-browser')?.textContent.includes('收集目录已保存')",'native selection saved')
    await wait(()=>main.evaluate("document.querySelector('.inbox-browser').textContent.includes('原生选择记录.md')"),'selected file listing')
    const disk=JSON.parse(await fs.readFile(path.join(process.env.LONGEDIT_E2E_CONFIG_DIR,'config.json'),'utf8'))
    check('native choice persisted through production save_config',disk.libraries[0].inboxDirectory==='原生收集箱')
    await fs.writeFile(path.join(output,'native-selected.png'),Buffer.from((await main.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
    await choose();console.log('STAGE 3: choose fixture parent outside library')
    await until("document.querySelector('.inbox-browser')?.textContent.includes('设置失败')",'outside directory rejected')
    check('native outside selection keeps original directory',await main.evaluate("document.querySelector('.inbox-browser .location').textContent==='原生收集箱'"))
    const after=JSON.parse(await fs.readFile(path.join(process.env.LONGEDIT_E2E_CONFIG_DIR,'config.json'),'utf8'))
    check('outside rejection preserves persisted configuration',after.libraries[0].inboxDirectory==='原生收集箱')
    await fs.writeFile(path.join(output,'outside-rejected.png'),Buffer.from((await main.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
    await fs.writeFile(path.join(output,'native-checks.json'),JSON.stringify({checks},null,2))
  }
  console.log(JSON.stringify(checks))
} finally {for(const c of connections)c.socket.close()}
`
try {await import('data:text/javascript;base64,'+Buffer.from(prefix+scenario).toString('base64'))}
catch(error){console.error(error.message);process.exitCode=1}
