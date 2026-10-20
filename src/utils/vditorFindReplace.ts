import type { TextSpan } from './documentFindReplace'
import {findDocumentMatches} from './documentFindReplace'
import {editorSearchMatches,scrollSearchRange} from './searchLocation'
const rootFor=(editor:any)=>editor?.vditor?.[editor.getCurrentMode()]?.element as HTMLElement|undefined
function locateClone(root:Node,clone:Node,node:Node){const path:number[]=[];for(let at:Node|null=node;at&&at!==root;at=at.parentNode){if(!at.parentNode)return;path.unshift(Array.prototype.indexOf.call(at.parentNode.childNodes,at))}let at=clone;for(const index of path){if(!at.childNodes[index])return;at=at.childNodes[index]}return at}
export function vditorSourceSelection(editor:any,provided?:Range):TextSpan|undefined {
 const root=rootFor(editor),selection=window.getSelection(),range=provided||(selection?.rangeCount?selection.getRangeAt(0):undefined)
 if(!root||!range||range.collapsed||!root.contains(range.startContainer)||!root.contains(range.endContainer))return
 const clone=root.cloneNode(true) as HTMLElement,start=locateClone(root,clone,range.startContainer),end=locateClone(root,clone,range.endContainer);if(!start||!end)return
 const nonce=crypto.randomUUID().replace(/-/g,''),a='LONGEDITBEGIN'+nonce,b='LONGEDITEND'+nonce,copy=document.createRange();copy.setStart(start,range.startOffset);copy.setEnd(end,range.endOffset)
 const last=copy.cloneRange();last.collapse(false);last.insertNode(document.createTextNode(b));copy.collapse(true);copy.insertNode(document.createTextNode(a))
 const mode=editor.getCurrentMode(),lute=editor.vditor.lute,source=mode==='sv'?`${clone.textContent}\n`.replace(/\n\n$/,'\n').replace(/\u00a0/g,' '):mode==='ir'?lute.VditorIRDOM2Md(clone.innerHTML):lute.VditorDOM2Md(clone.innerHTML)
 const from=source.indexOf(a),finish=source.indexOf(b);if(from<0||finish<from||source.split(a).length!==2||source.split(b).length!==2)return
 if(source.replace(a,'').replace(b,'')!==editor.getValue())return
 return {from,to:finish-a.length}
}
export function revealVditorSourceMatch(editor:any,span:TextSpan){
 const root=rootFor(editor);if(!root)return false
 const source=editor.getValue(),text=source.slice(span.from,span.to);if(!text)return false
 if(editor.getCurrentMode()==='sv'){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),range=document.createRange();let at=0,started=false,node:Node|null
  while((node=walker.nextNode())){const end=at+(node.textContent?.length||0);if(!started&&span.from>=at&&span.from<end){range.setStart(node,span.from-at);started=true}if(started&&span.to<=end){range.setEnd(node,span.to-at);show(range);return true}at=end}
 }else{
  const raw=findDocumentMatches(source,{query:text,caseSensitive:true,wholeWord:false}),index=raw.matches.findIndex(item=>item.from===span.from&&item.to===span.to),visible=editorSearchMatches(root,text)
  if(raw.reason||index<0||visible.count!==raw.matches.length)return false
  const range=visible.rangeAt(index),mapped=range&&vditorSourceSelection(editor,range);if(range&&mapped?.from===span.from&&mapped.to===span.to){show(range);return true}
 }
 return false
}
function show(range:Range){scrollSearchRange(range);const api=(CSS as any).highlights,HighlightCtor=(window as any).Highlight;if(api&&HighlightCtor)api.set('longedit-find',new HighlightCtor(range))}
export function clearFindHighlight(){(CSS as any).highlights?.delete('longedit-find')}
