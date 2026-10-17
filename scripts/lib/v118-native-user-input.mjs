// CDP input into the disposable application's real WebView. Never call a
// component handler, dispatch a DOM event or replace the native bridge.
import assert from 'node:assert/strict'
export function nativeUserInput({send,evaluate},{timeoutMs=20000,pollMs=80,stableMs=160}={}){
  const waitFor=async(expression,label)=>{
    const end=Date.now()+timeoutMs
    do{const value=await evaluate(expression);if(value)return value;await new Promise(resolve=>setTimeout(resolve,pollMs))}while(Date.now()<end)
    throw Error('Actual native UI did not become ready: '+label)
  }
  const key=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{
    await send('Input.dispatchKeyEvent',{type:key==='Enter'?'keyDown':'rawKeyDown',key,code,windowsVirtualKeyCode,modifiers,...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})})
    await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode,modifiers})
  }
  const settledPoint=async(target)=>{
    const scroll="e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});"
    const expression=`(() => {const e=(${target});if(!e||e.disabled||getComputedStyle(e).display==='none'||getComputedStyle(e).visibility==='hidden')return null;${scroll}const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:null})()`
    await waitFor(expression,'unobscured target '+target)
    const observe=expression.replace(scroll,''),end=Date.now()+timeoutMs
    let previous=null,stableSince=Date.now(),point=null,lastScroll=Date.now()
    while(Date.now()<end){
      const current=await evaluate(observe),now=Date.now()
      if(!current||!previous||Math.abs(current.x-previous.x)>.5||Math.abs(current.y-previous.y)>.5)stableSince=now
      if(current&&now-stableSince>=stableMs){point=current;break}
      previous=current
      // A pending focus/scroll restoration may have moved the target away.
      // Re-scroll only before input; never retry a click or a product request.
      if(!current&&now-lastScroll>=320){await evaluate(expression);lastScroll=now}
      await new Promise(resolve=>setTimeout(resolve,pollMs))
    }
    assert.ok(point,'target did not settle before native input: '+target)
    return point
  }
  const clickTarget=async(target,button='left')=>{
    assert.ok(['left','right'].includes(button),'unsupported native input button')
    const point=await settledPoint(target)
    for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button,clickCount:1})
  }
  const hoverTarget=async(target)=>{const point=await settledPoint(target);await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y})}
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
  return {waitFor,key,clickTarget,hoverTarget,click,clickText,fill,tabTo}
}
