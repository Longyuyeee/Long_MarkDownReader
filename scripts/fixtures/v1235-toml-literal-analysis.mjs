// Simulated browser IPC for Vue ownership checks. Rust/native tests prove grammar and bytes.
import {fixtureTomlDatetimeAnalysis as previous} from './v1233-toml-datetime-analysis.mjs'
const byte=(s,n)=>new TextEncoder().encode(s.slice(0,n)).length
function literals(content){return [...content.matchAll(/^([ \t]*)([\w-]+)\s*=\s*(''')([\s\S]*?)('''(?:''|')?)/gm)].map(m=>{const start=m.index+m[0].indexOf("'''"),end=m.index+m[0].length,body=m[4]+m[5].slice(3);return{start,end,text:body.replace(/^\r?\n/,'').replaceAll('\r\n','\n')}})}
export function fixtureTomlLiteralAnalysis(content){
 let masked=content;const entries=literals(content)
 for(const e of [...entries].reverse())masked=masked.slice(0,e.start+3)+masked.slice(e.start+3,e.end).replace(/[!-~]/g,' ')+masked.slice(e.end)
 const a=previous(masked)
 for(const e of entries){const node=a.outline.find(n=>n.start===byte(content,e.start));if(node)Object.assign(node,{literal:true,editable:true,end:byte(content,e.end),preview:content.slice(e.start,e.end)})}
 return a
}
function selected(args){const e=literals(args.content).find(e=>byte(args.content,e.start)===args.start&&byte(args.content,e.end)===args.end);if(!e)throw Error('多行文字位置已变化；草稿仍保留');return e}
export function fixtureTomlLiteralInspect(args){return selected(args).text}
export function fixtureTomlLiteralReplace(args){
 const e=selected(args),text=args.replacement.replaceAll('\r\n','\n');if(text.includes("'''")||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(text))throw Error('文字无法沿用当前格式；输入与草稿仍保留')
 if(e.text===text)return args.content
 const raw=args.content.slice(e.start,e.end),opening=/^'''\r?\n/.test(raw)||text.startsWith('\n')?'\n':''
 return args.content.slice(0,e.start)+"'''"+opening+text+"'''"+args.content.slice(e.end)
}
