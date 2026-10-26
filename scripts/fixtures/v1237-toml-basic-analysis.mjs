// UI-only simulated IPC. Real TOML parsing and bytes are checked in Rust/native.
import {fixtureTomlLiteralAnalysis as prior,fixtureTomlLiteralInspect as inspectLiteral,fixtureTomlLiteralReplace as replaceLiteral} from './v1235-toml-literal-analysis.mjs'
const byte=(s,n)=>new TextEncoder().encode(s.slice(0,n)).length
function basics(s){return [...s.matchAll(/^([ \t]*)([\w-]+)\s*=\s*"""((?:\\[\s\S]|(?!""")[\s\S])*?)("""(?:"{1,2})?)/gm)].map(m=>{
 const start=m.index+m[0].indexOf('"""'),end=m.index+m[0].length
 const body=(m[3]+m[4].slice(3)).replace(/^\r?\n/,'').replaceAll('\r\n','\n');let text=''
 for(let i=0;i<body.length;i++){
  if(body[i]!=='\\'){text+=body[i];continue}
  const c=body[++i]
  if(/[ \t\n]/.test(c)){while(i<body.length&&/[ \t\n]/.test(body[i]))i++;i--;continue}
  if(c==='u'||c==='U'){const count=c==='u'?4:8;text+=String.fromCodePoint(parseInt(body.slice(i+1,i+1+count),16));i+=count}
  else text+=({b:'\b',t:'\t',n:'\n',f:'\f',r:'\r','"':'"','\\':'\\'}[c])
 }
 return{start,end,text}
})}
export function fixtureTomlBasicAnalysis(content){
 const entries=basics(content);let masked=content
 for(const e of [...entries].reverse())masked=masked.slice(0,e.start+3)+masked.slice(e.start+3,e.end).replace(/[!-~]/g,' ')+masked.slice(e.end)
 const a=prior(masked)
 for(const e of entries){const node=a.outline.find(n=>n.start===byte(content,e.start));if(node)Object.assign(node,{multilineBasic:true,editable:true,end:byte(content,e.end),preview:content.slice(e.start,e.end)})}
 return a
}
function selected(args){return basics(args.content).find(e=>byte(args.content,e.start)===args.start&&byte(args.content,e.end)===args.end)}
export function fixtureTomlBasicInspect(args){return selected(args)?.text??inspectLiteral(args)}
export function fixtureTomlBasicReplace(args){
 const e=selected(args);if(!e)return replaceLiteral(args)
 const text=args.replacement.replaceAll('\r\n','\n');if(e.text===text)return args.content
 const raw=args.content.slice(e.start,e.end),opening=/^"""\r?\n/.test(raw)||text.startsWith('\n')?'\n':''
 const body=text.replace(/["\\\u0000-\u0008\u000b-\u001f\u007f]/g,c=>c==='"'?'\\"':c==='\\'?'\\\\':'\\u'+c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0'))
 return args.content.slice(0,e.start)+'"""'+opening+body+'"""'+args.content.slice(e.end)
}
