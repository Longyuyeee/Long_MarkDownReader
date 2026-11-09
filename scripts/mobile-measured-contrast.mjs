// Supplement axe's incomplete solid-color text checks. This is a computed-color
// measurement, not a substitute for human legibility or native screen readers.
export async function measureIncompleteContrast(page,incomplete){
  const targets=incomplete.filter(v=>v.id==='color-contrast').flatMap(v=>v.nodes.map(n=>n.target))
  return page.evaluate(targets=>{
    const rgb=value=>{const m=value.match(/[\d.]+/g)?.map(Number);if(!m||m.length<3)throw Error('Unsupported color '+value);return[m[0],m[1],m[2],m[3]??1]}
    const luminance=c=>c.slice(0,3).map(v=>{const n=v/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((v,n,i)=>v+n*[.2126,.7152,.0722][i],0)
    return targets.map(target=>{
      if(target.length!==1)throw Error('Nested contrast target needs explicit review: '+target)
      const element=document.querySelector(target[0]);if(!element)throw Error('Missing contrast target: '+target)
      const layers=[];for(let node=element;node;node=node.parentElement){const s=getComputedStyle(node);if(Number(s.opacity)!==1||s.backgroundImage!=='none')throw Error('Complex contrast backdrop: '+target);layers.push(rgb(s.backgroundColor))}
      let background=[255,255,255];for(const layer of layers.reverse())background=background.map((v,i)=>layer[i]*layer[3]+v*(1-layer[3]))
      const style=getComputedStyle(element),foreground=rgb(style.color);if(foreground[3]!==1)throw Error('Translucent contrast text: '+target)
      const a=luminance(foreground),b=luminance(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),large=parseFloat(style.fontSize)>=24||parseFloat(style.fontSize)>=18.6667&&Number(style.fontWeight)>=700
      return{target,foreground:foreground.slice(0,3),background,ratio,minimum:large?3:4.5,fontSize:style.fontSize,fontWeight:style.fontWeight}
    })
  },targets)
}
