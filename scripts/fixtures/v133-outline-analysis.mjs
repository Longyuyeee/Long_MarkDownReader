import {outlineNavigationAnalysis} from './v132-outline-analysis.mjs'
// This is a browser-only IPC fixture; native release checks use the real parser.
export function outlineContinuityAnalysis(content,mode){
 const result=outlineNavigationAnalysis(content,mode),size=s=>new TextEncoder().encode(s).length
 if(mode==='json'){
  result.paths.forEach((e,i)=>e.depth=i?2:1)
  const match=/"group"\s*:\s*(\{\s*"nested"\s*:\s*("[^"\n]*")\s*\})/.exec(content)
  if(match){const start=size(content.slice(0,match.index+match[0].indexOf('{'))),end=start+size(match[1]),root=result.paths[0]
   const valueStart=size(content.slice(0,match.index+match[0].lastIndexOf(match[2])))
   result.paths.push({...root,path:'$.group',label:'group',kind:'object',depth:2,start,end,childCount:1,preview:match[1]},{...root,path:'$.group.nested',label:'nested',kind:'string',depth:3,start:valueStart,end:valueStart+size(match[2]),childCount:0,preview:match[2]});root.childCount=4
  }
 }
 if(mode==='toml'){
  result.outline.forEach(e=>{e.kind='value';e.editable=true})
  const match=/^items\s*=\s*(\[[^\n]*\])/m.exec(content)
  if(match){const start=size(content.slice(0,match.index+match[0].indexOf('[')));result.outline.push({path:'items',label:'items',kind:'value',depth:1,start,end:start+size(match[1]),childCount:2,preview:match[1],array:true,line:1,column:1,field:{name:'items',start:size(content.slice(0,match.index)),end:size(content.slice(0,match.index))+5}})}
 }
 return result
}
