import type {FindDocumentSnapshot,Replacement,TextSpan} from '../utils/documentFindReplace'
import {vditorSourceSelection,revealVditorSourceMatch,clearFindHighlight} from '../utils/vditorFindReplace'
interface DocumentIdentity {key:string;path:string;generation:number;ready:boolean;revision?:string;readOnlyReason?:string}
interface Owner {editor:any;identity:DocumentIdentity;mode:string;scrollTop:number;scrollLeft:number}
export function createVditorFindAdapter(getEditor:()=>any,documentIdentity:()=>DocumentIdentity,onChange:(content:string,path:string)=>void){
 let remembered:{key:string;generation:number;editor:any;mode:string;content:string;span?:TextSpan}|undefined
 let captured:{key:string;generation:number;editor:any;mode:string;revision?:string}|undefined
 const rememberSelection=()=>{const editor=getEditor(),id=documentIdentity();if(!editor||!id.ready)return;remembered={key:id.key,generation:id.generation,editor,mode:editor.getCurrentMode(),content:editor.getValue(),span:vditorSourceSelection(editor)}}
 const capture=():FindDocumentSnapshot=>{const editor=getEditor(),id=documentIdentity();if(!editor||!id.path||!id.ready)throw Error('正文正在读取、保存或整理，请稍后再打开查找替换。')
  const mode=editor.getCurrentMode(),root=editor.vditor[mode].element as HTMLElement,content=editor.getValue(),selection=vditorSourceSelection(editor)||(remembered?.key===id.key&&remembered.generation===id.generation&&remembered.editor===editor&&remembered.mode===mode&&remembered.content===content?remembered.span:undefined)
  if(captured&&captured.editor===editor&&captured.key===id.key&&captured.generation===id.generation&&captured.mode===mode&&id.revision!==captured.revision&&id.revision!==content)throw Error('正文尚未同步到编辑器，新草稿已保留；请重新打开文档后再查找。')
  captured={editor,key:id.key,generation:id.generation,mode,revision:id.revision}
  const selected=window.getSelection();remembered=undefined
  return {path:id.path,content,owner:{editor,identity:id,mode,scrollTop:root.scrollTop,scrollLeft:root.scrollLeft} satisfies Owner,selection,label:'Markdown 源码',readOnlyReason:id.readOnlyReason,selectionReason:!selection&&!selected?.isCollapsed?'当前选区无法准确对应源码，可在源码模式重新选择范围。':undefined}}
 const isCurrent=(snapshot:FindDocumentSnapshot)=>{const owner=snapshot.owner as Owner,id=documentIdentity();return id.ready&&owner.editor===getEditor()&&owner.identity.key===id.key&&owner.identity.generation===id.generation&&owner.mode===owner.editor.getCurrentMode()&&snapshot.content===owner.editor.getValue()&&(id.revision===owner.identity.revision||id.revision===snapshot.content)}
 const applyChange=(snapshot:FindDocumentSnapshot,change:Replacement)=>{if(!isCurrent(snapshot))throw Error('正文或文档已有变化，原稿已保留。');const id=documentIdentity();if(id.readOnlyReason)throw Error(id.readOnlyReason);if(change.content===snapshot.content)throw Error('替换内容与原文相同，没有修改。')
  const owner=snapshot.owner as Owner,editor=owner.editor,lute=editor.vditor.lute,mode=owner.mode
  let canonical:string
  if(mode==='sv'){const clone=document.createElement('div');clone.innerHTML=lute.SpinVditorSVDOM(change.content);canonical=`${clone.textContent}\n`.replace(/\n\n$/,'\n').replace(/\u00a0/g,' ')}else canonical=mode==='ir'?lute.VditorIRDOM2Md(lute.Md2VditorIRDOM(change.content)):lute.VditorDOM2Md(lute.Md2VditorDOM(change.content))
  if(canonical!==change.content)throw Error('此替换会改变 Markdown 的排版，请在源码模式调整后再试；当前原稿未改动。')
  const undo=editor.vditor.undo,prior=undo[mode],history={...prior,undoStack:[...prior.undoStack],redoStack:[...prior.redoStack]}
  clearFindHighlight();undo.addToUndoStack(editor.vditor);editor.setValue(change.content)
  const applied=editor.getValue();if(applied!==change.content){editor.setValue(snapshot.content);Object.assign(undo[mode],history);undo.resetIcon(editor.vditor);throw Error('当前模式未能准确保留替换范围，原稿和撤销记录已恢复。')}
  undo.addToUndoStack(editor.vditor);const root=editor.vditor[mode].element as HTMLElement;root.scrollTop=owner.scrollTop;root.scrollLeft=owner.scrollLeft;onChange(applied,snapshot.path)
  return capture()
 }
 const reveal=(snapshot:FindDocumentSnapshot,span:TextSpan)=>{if(isCurrent(snapshot))revealVditorSourceMatch((snapshot.owner as Owner).editor,span)}
 return {capture,isCurrent,applyChange,reveal,rememberSelection,clearHighlight:clearFindHighlight}
}
