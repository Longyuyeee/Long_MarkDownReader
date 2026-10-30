import {Lexer, type Token} from 'marked'
import {localMarkdownLink} from './localMarkdownLinks.ts'

export interface InlineFileLink { href:string; start:number; end:number; destinationStart:number; destinationEnd:number }
// Keep every parsed link in rendered order, including reference links that are
// not editable here. Never locate a later occurrence by searching the whole file.
export function inlineFileLinks(content:string):InlineFileLink[]{
 const normalized=content.replace(/\r\n?/g,'\n'),offsets:number[]=[]
 for(let i=0;i<content.length;i++){offsets.push(i);if(content[i]==='\r'&&content[i+1]==='\n')i++}offsets.push(content.length)
 const front=normalized.match(/^(?:\uFEFF)?(---|\+\+\+)\n[\s\S]*?\n(?:\1|\.\.\.)[ \t]*(?:\n|$)/)
 const text=front?front[0].replace(/[^\n]/g,' ')+normalized.slice(front[0].length):normalized,links:InlineFileLink[]=[]
 const walk=(tokens:Token[],parent:string,base:number)=>{
  let cursor=0
  for(const token of tokens){
   const at=parent.indexOf(token.raw,cursor),start=base<0||at<0?-1:base+at
   if(at>=0)cursor=at+token.raw.length
   if(token.type==='link'){
    const item:InlineFileLink={href:token.href,start:start<0?-1:offsets[start],end:start<0?-1:offsets[start+token.raw.length],destinationStart:-1,destinationEnd:-1}
    const span=inlineDestination(token.raw)
    if(start>=0&&span){item.destinationStart=offsets[start+span[0]];item.destinationEnd=offsets[start+span[1]]}
    links.push(item);continue
   }
   if(token.type==='list')walk(token.items as Token[],token.raw,start)
   else if('tokens'in token&&Array.isArray(token.tokens))walk(token.tokens,token.raw,start)
  }
 }
 try{walk(Lexer.lex(text),text,0)}catch{return []}
 return links
}
function inlineDestination(raw:string):[number,number]|undefined{
 if(raw[0]!=='[')return
 let level=0,close=-1
 for(let i=0;i<raw.length;i++){if(raw[i]==='\\'){i++;continue}if(raw[i]==='[')level++;if(raw[i]===']'&&--level===0){close=i;break}}
 if(close<0||raw[close+1]!=='(')return
 let start=close+2;while(/\s/.test(raw[start]||'')&&start<raw.length)start++
 if(raw[start]==='<'){let end=start+1;for(;end<raw.length;end++){if(raw[end]==='\\'){end++;continue}if(raw[end]==='>')return[start+1,end]}return}
 let depth=0,end=start
 for(;end<raw.length;end++){const c=raw[end];if(c==='\\'){end++;continue}if(c==='(')depth++;else if(c===')'){if(!depth)break;depth--}else if(/\s/.test(c)&&depth===0)break}
 if(end>start&&end<raw.length)return[start,end]
}
export function editableFileLink(link:InlineFileLink,path:string){return link.destinationStart>=0&&!link.href.startsWith('#')&&Boolean(localMarkdownLink(path,link.href)?.path)}
export function replaceInlineDestination(before:string,link:InlineFileLink,destination:string){
 const current=inlineFileLinks(before).find(item=>item.start===link.start&&item.end===link.end&&item.href===link.href)
 if(!current||current.destinationStart<0)throw Error('原链接已变化，未修改正文')
 return before.slice(0,current.destinationStart)+destination+before.slice(current.destinationEnd)
}
export function relativeFileDestination(source:string,target:string,fragment=''){
 const clean=(p:string)=>p.replace(/\\/g,'/').replace(/^\/\/\?\/UNC\//i,'//').replace(/^\/\/\?\//,'')
 const from=clean(source).split('/').slice(0,-1),to=clean(target).split('/')
 let common=0;while(common<from.length&&common<to.length&&from[common].toLowerCase()===to[common].toLowerCase())common++
 if(!common)throw Error('请选择当前资料库内的文件')
 const relative=[...from.slice(common).map(()=>'..'),...to.slice(common)].map(part=>encodeURIComponent(part)).join('/')
 return relative+(fragment?'#'+encodeURIComponent(fragment):'')
}
