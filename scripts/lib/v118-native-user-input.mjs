// CDP input into the disposable application's real WebView. Never call a
// component handler, dispatch a DOM event or replace the native bridge.
import assert from 'node:assert/strict'
export function nativeUserInput({send,evaluate},{timeoutMs=20000,pollMs=80}={}){
  const waitFor=async(expression,label)=>{
    const end=Date.now()+timeoutMs
    do{const value=await evaluate(expression);if(value)return value;await new Promise(resolve=>setTimeout(resolve,pollMs))}while(Date.now()<end)
    throw Error('Actual native UI did not become ready: '+label)
  }
  const key=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{
    await send('Input.dispatchKeyEvent',{type:key==='Enter'?'keyDown':'rawKeyDown',key,code,windowsVirtualKeyCode,modifiers,...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})})
    await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode,modifiers})
  }
  const clickTarget=async(target)=>{
    const expression=`(() => {const e=(${target});if(!e||e.disabled||getComputedStyle(e).display==='none'||getComputedStyle(e).visibility==='hidden')return null;e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:null})()`
    await waitFor(expression,'unobscured target '+target)
    const point=await evaluate(expression);assert.ok(point,'target moved before input')
    for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1})
  }
  const click=selector=>clickTarget(`document.querySelector(${JSON.stringify(selector)})`)
  const clickText=(selector,text)=>clickTarget(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)})`)
  const fill=async(selector,text)=>{
    await click(selector)
    assert.equal(await evaluate(`document.activeElement.matches(${JSON.stringify(selector)})`),true,'input must have real keyboard focus')
    await key('a','KeyA',65,2);await key('Backspace','Backspace',8)
    if(text)await send('Input.insertText',{text})
  }
  const tabTo=async(selector)=>{
    for(let n=0;n<100;n++){
      if(await evaluate(`document.activeElement?.matches(${JSON.stringify(selector)})`))return
      await key('Tab','Tab',9)
    }
    throw Error('Native keyboard cannot reach '+selector)
  }
  return {waitFor,key,clickTarget,click,clickText,fill,tabTo}
}
