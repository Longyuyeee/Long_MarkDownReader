import {editableFileLink,inlineFileLinks,type InlineFileLink} from './inlineFileLinks.ts'
import {applyVditorDraftUpdate} from './vditorDraftUpdate.ts'
export interface InlineLinkContext { content:string; link:InlineFileLink; index:number; root:HTMLElement; target:Element; mode:string }
const outsideCode=(root:HTMLElement,node:Element)=>{const parent=node.closest('pre,code,.vditor-ir__preview,.vditor-wysiwyg__preview');return !parent||parent===root}
export const inlineSourceMatches=(source:string,rendered:string)=>{
 const normalize=(value:string)=>value.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trimEnd()
 return normalize(source)===normalize(rendered)
}
export function inlineLinkContext(editor:any,path:string,event:MouseEvent):InlineLinkContext|undefined{
 const mode=editor?.getCurrentMode(),root=editor?.vditor?.[mode]?.element as HTMLElement|undefined
 if(!root||!['wysiwyg','ir','sv'].includes(mode))return
 const content=editor.getValue(),links=inlineFileLinks(content)
 const target=event.target instanceof Element?event.target:undefined
 if(!target||!root.contains(target)||target.closest('img,[data-type="img"]'))return
 let index=-1,element:Element|undefined
 if(mode==='sv'){
  const selection=window.getSelection(),range=event.clientX||event.clientY?document.caretRangeFromPoint?.(event.clientX,event.clientY):selection?.rangeCount?selection.getRangeAt(0):undefined
  if(!range||!root.contains(range.startContainer))return
  const prefix=document.createRange();prefix.selectNodeContents(root);prefix.setEnd(range.startContainer,range.startOffset)
  const offset=prefix.toString().length
  index=links.findIndex(link=>link.start<=offset&&offset<=link.end);element=target
 }else{
  const anchor=target.closest('a[href]'),marker=target.closest('.vditor-ir__marker--link')||target.closest('.vditor-ir__node[data-type="a"]')?.querySelector('.vditor-ir__marker--link')
  const nodes=Array.from(root.querySelectorAll(mode==='ir'&&marker?'.vditor-ir__marker--link':'a[href]')).filter(node=>outsideCode(root,node))
  if(nodes.length!==links.length||nodes.some((node,i)=>(node.getAttribute('href')??node.textContent)!==links[i].href))return
  element=(marker||anchor)||undefined;index=element?nodes.indexOf(element):-1
 }
 const link=links[index]
 if(!element||!link||!editableFileLink(link,path))return
 return{content,link,index,root,target:element,mode}
}
export function applyInlineLinkDraft(editor:any,context:InlineLinkContext,after:string){
 if(editor.getCurrentMode()!==context.mode||editor.vditor[context.mode]?.element!==context.root||!context.target.isConnected)throw Error('编辑位置已变化，未修改正文')
 const {top,left}={top:context.root.scrollTop,left:context.root.scrollLeft}
 applyVditorDraftUpdate(editor,context.content,after)
 context.root.focus({preventScroll:true});context.root.scrollTop=top;context.root.scrollLeft=left
}
export function focusInlineLink(editor:any,context:InlineLinkContext){
 const root=editor.vditor[context.mode]?.element as HTMLElement|undefined
 if(!root||root!==context.root||!root.isConnected)return
 const top=root.scrollTop,left=root.scrollLeft,range=document.createRange()
 if(context.mode==='sv'){
  let offset=inlineFileLinks(editor.getValue())[context.index]?.end??0
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node:Node|null
  while((node=walker.nextNode())){const size=node.textContent?.length||0;if(offset<=size){range.setStart(node,offset);break}offset-=size}
  if(!node){range.selectNodeContents(root);range.collapse(false)}
 }else{
  const nodes=Array.from(root.querySelectorAll(context.mode==='ir'?'.vditor-ir__marker--link':'a[href]')).filter(node=>outsideCode(root,node))
  const node=nodes[context.index]
  if(node)range.setStartAfter(context.mode==='ir'?(node.closest('.vditor-ir__node')||node):node);else{range.selectNodeContents(root);range.collapse(false)}
 }
 range.collapse(true);root.focus({preventScroll:true});window.getSelection()?.removeAllRanges();window.getSelection()?.addRange(range);root.scrollTop=top;root.scrollLeft=left
}
