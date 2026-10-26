// Simulated IPC for real Vue/CodeMirror state checks only. Rust/native prove
// actual grammar, spans, ownership and byte preservation independently.
import {fixtureTomlBasicAnalysis as prior} from './v1237-toml-basic-analysis.mjs'
const byte=(s,n)=>new TextEncoder().encode(s.slice(0,n)).length
function triples(s){
 const result=[]
 for(let i=0;i<s.length;){
  if(s[i]==='#'){i=s.indexOf('\n',i);if(i<0)break;continue}
  if(s[i]!=="'"&&s[i]!=='"'){i++;continue}
  const q=s[i],delimiter=q.repeat(3),start=i
  if(!s.startsWith(delimiter,i)){i++;while(i<s.length){if(q==='"'&&s[i]==='\\'){i+=2;continue}if(s[i++]===q)break}continue}
  i+=3;const from=i
  while(i<s.length){if(q==='"'&&s[i]==='\\'){i+=2;continue}if(s.startsWith(delimiter,i))break;i++}
  if(i>=s.length)throw Error('模拟文本缺少结束分隔符')
  let end=i+3;while(end<s.length&&end<i+5&&s[end]===q)end++
  let text=s.slice(from,i)+s.slice(i+3,end);text=text.replace(/^\r?\n/,'').replaceAll('\r\n','\n')
  if(q==='"'){let decoded='';for(let n=0;n<text.length;n++){if(text[n]!=='\\'){decoded+=text[n];continue}const c=text[++n];if(/[ \t\n]/.test(c)){while(n<text.length&&/[ \t\n]/.test(text[n]))n++;n--;continue}if(c==='u'||c==='U'){const width=c==='u'?4:8;decoded+=String.fromCodePoint(parseInt(text.slice(n+1,n+1+width),16));n+=width}else decoded+=({b:'\b',t:'\t',n:'\n',f:'\f',r:'\r','"':'"','\\':'\\'}[c])}text=decoded}
  result.push({start,end,text,literal:q==="'",multilineBasic:q==='"'});i=end
 }
 return result
}
function arrays(content){
 const blocks=triples(content),all=[]
 for(const m of content.matchAll(/^([ \t]*)([\w-]+)\s*=\s*\[/gm)){
  if(blocks.some(e=>m.index>=e.start&&m.index<e.end))continue
  const start=m.index+m[0].lastIndexOf('['),items=[];let i=start+1,end
  while(i<content.length){
   while(/[\s,]/.test(content[i]||'')&&i<content.length)i++
   if(content[i]==='#'){i=content.indexOf('\n',i);if(i<0)break;continue}
   if(content[i]===']'){end=i+1;break}
   const block=blocks.find(e=>e.start===i);if(block){items.push({...block,preview:content.slice(i,block.end),editable:true,index:items.length});i=block.end;continue}
   const from=i;let quote='',escaped=false,depth=0
   while(i<content.length){const c=content[i];if(quote){if(escaped)escaped=false;else if(c==='\\'&&quote==='"')escaped=true;else if(c===quote)quote='';i++;continue}if(c==='"'||c==="'"){quote=c;i++;continue}if(c==='['||c==='{'){depth++;i++;continue}if(c===']'&&depth===0||c===','&&depth===0||c==='#'&&depth===0)break;if(c===']'||c==='}')depth--;i++}
   const raw=content.slice(from,i).trimEnd();if(!raw)break;items.push({start:from,end:from+raw.length,preview:raw,index:items.length,editable:!raw.startsWith('[')&&!raw.startsWith('{')})
  }
  if(end)all.push({start,end,items})
 }
 return all
}
export function fixtureTomlArrayMultilineAnalysis(content){
 let masked=content;for(const e of triples(content).reverse())masked=masked.slice(0,e.start)+masked.slice(e.start,e.end).replace(/[!-~]/g,' ')+masked.slice(e.end)
 const a=prior(masked)
 for(const array of arrays(content)){const node=a.outline.find(e=>e.start===byte(content,array.start));if(node)Object.assign(node,{array:true,editable:false,literal:undefined,multilineBasic:undefined,end:byte(content,array.end),childCount:array.items.length,preview:content.slice(array.start,array.end)})}
 return a
}
export function fixtureTomlArrayMultilineItems(args){const array=arrays(args.content).find(a=>byte(args.content,a.start)===args.start&&byte(args.content,a.end)===args.end);if(!array)throw Error('数组位置已变化');return array.items.map(e=>({...e,start:byte(args.content,e.start),end:byte(args.content,e.end)}))}
function selected(args){const e=triples(args.content).find(e=>byte(args.content,e.start)===args.start&&byte(args.content,e.end)===args.end);if(!e)throw Error('多行文字位置已变化；输入与草稿仍保留');return e}
export function fixtureTomlArrayMultilineInspect(args){return selected(args).text}
export function fixtureTomlArrayMultilineReplace(args){
 const e=selected(args),text=args.replacement.replaceAll('\r\n','\n');if(e.literal&&(text.includes("'''")||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)))throw Error('文字无法沿用当前格式；输入与草稿仍保留')
 if(e.text===text)return args.content
 const delimiter=e.literal?"'''":'"""',raw=args.content.slice(e.start,e.end),opening=raw.slice(3).startsWith('\n')||text.startsWith('\n')?'\n':''
 const body=e.literal?text:text.replace(/["\\\u0000-\u0008\u000b-\u001f\u007f]/g,c=>c==='"'?'\\"':c==='\\'?'\\\\':'\\u'+c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0'))
 return args.content.slice(0,e.start)+delimiter+opening+body+delimiter+args.content.slice(e.end)
}
