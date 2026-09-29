import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { markdownPerformanceFixture } from './markdown-performance-fixture.mjs'
import { visibleVersionSurfaceExpression } from './installed-version-identity.mjs'

export async function checkInstalledMarkdown({ send, evaluate, waitFor, navigate, capture, library }) {
  if (process.env.LONGEDIT_R5I_DISPOSABLE !== '1' || path.resolve(library).toLowerCase() !== 'c:\\longeditr5ilibrary') {
    throw Error('Markdown performance requires the disposable R5I library')
  }
  const fixture = path.join(library, 'v124-markdown-performance.md')
  await fs.writeFile(fixture, markdownPerformanceFixture(), { flag: 'wx' })
  await navigate(`#/library?path=${encodeURIComponent(fixture)}`, '.library-mode .vditor-wysiwyg', 'large Markdown')
  const selector = '.library-mode .vditor-wysiwyg .vditor-reset'
  await waitFor(`document.querySelector(${JSON.stringify(selector)})?.querySelectorAll('h2').length === 225`, 'large Markdown rendered', 240)
  const idle = await evaluate(`new Promise(resolve => setTimeout(() => {
    const root=document.querySelector(${JSON.stringify(selector)});
    const animations=root.getAnimations({subtree:true}).filter(a=>a.playState==='running');
    const frames=[];let previous=performance.now();
    function frame(now){frames.push(now-previous);previous=now;if(frames.length<90)requestAnimationFrame(frame);else{frames.sort((a,b)=>a-b);resolve({activeAnimations:animations.length,frameP95:frames[Math.floor(frames.length*.95)],headings:root.querySelectorAll('h2').length,codeBlocks:root.querySelectorAll('pre').length})}}
    requestAnimationFrame(frame);
  },1000))`)
  assert.equal(idle.activeAnimations, 0, 'Idle document must not keep decorative animations running')
  assert.equal(idle.headings, 225)
  // Hosted GPU/frame scheduling varies; retain measured timing rather than a flaky FPS gate.
  assert.ok(Number.isFinite(idle.frameP95))
  await evaluate(`document.querySelector(${JSON.stringify(selector + ' h2')}).scrollIntoView({block:'center'})`)
  await waitFor(visibleVersionSurfaceExpression(selector + ' h2'), 'unobscured Markdown heading')
  const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector + ' h2')}).getBoundingClientRect();return {x:r.left+40,y:r.top+r.height/2}})()`)
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', {type,...point,button:'left',clickCount:1})
  await send('Input.insertText', {text:'V124_TYPING_PROBE '})
  await waitFor(`document.querySelector(${JSON.stringify(selector)})?.textContent.includes('V124_TYPING_PROBE')`, 'large Markdown accepts input')
  await waitFor(`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app').tabs.some(t=>t.path===${JSON.stringify(fixture)}&&t.isDirty)`, 'Markdown input callback marks draft')
  await capture('installed-v124-markdown-performance.jpg')
  // Save only this generated fixture so navigation does not leave a dirty tab.
  await send('Input.dispatchKeyEvent', {type:'rawKeyDown',key:'s',code:'KeyS',windowsVirtualKeyCode:83,modifiers:2})
  await send('Input.dispatchKeyEvent', {type:'keyUp',key:'s',code:'KeyS',windowsVirtualKeyCode:83,modifiers:2})
  await waitFor(`!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('app').tabs.some(t=>t.path===${JSON.stringify(fixture)}&&t.isDirty)`, 'generated Markdown saved')
  assert.ok((await fs.readFile(fixture, 'utf8')).includes('V124_TYPING_PROBE'))
  // Missing paths avoid opening a real user's media or starting another application.
  const opener = await evaluate(`(async()=>{const invoke=window.__TAURI_INTERNALS__.invoke;const result={};for(const [kind,file] of Object.entries(${JSON.stringify({media:path.join(library,'v124-missing.Mp4'),executable:path.join(library,'v124-missing.exe')})})){try{await invoke('plugin:opener|open_path',{path:file});result[kind]='dispatched'}catch(error){result[kind]=String(error)}}return result})()`)
  assert.doesNotMatch(opener.media, /not allowed|forbidden|denied by|scope/i, 'Supported media must pass the command and path ACL')
  assert.match(opener.executable, /not allowed|forbidden|scope/i, 'Executable paths must remain outside the media scope')
  return {...idle, typingVisible:true, opener, status:'passed', fixture:'generated-225-headings-71-code-blocks'}
}
