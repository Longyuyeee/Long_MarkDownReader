import type {SourceRange} from './sourceReadingState'
export function sourceSelection(host:HTMLElement,from:number):SourceRange|null|undefined {
 const selection=getSelection(),text=host.querySelector('.source-page-text');if(!selection||!text||!selection.rangeCount||!selection.anchorNode||!text.contains(selection.anchorNode)||!selection.focusNode||!text.contains(selection.focusNode))return undefined
 if(selection.isCollapsed)return null
 const range=selection.getRangeAt(0),prefix=document.createRange();prefix.selectNodeContents(text);prefix.setEnd(range.startContainer,range.startOffset);const start=prefix.toString().length;prefix.setEnd(range.endContainer,range.endOffset);const end=prefix.toString().length
 return{from:from+start,to:from+end,backward:selection.anchorNode===range.endContainer&&selection.anchorOffset===range.endOffset}
}
export function restoreSourceSelection(host:HTMLElement,from:number,saved:SourceRange|null){
 if(!saved)return;const text=host.querySelector('.source-page-text');if(!text)return
 const walker=document.createTreeWalker(text,NodeFilter.SHOW_TEXT);let node:Node|null,total=0,start:{node:Node;offset:number}|undefined,end:typeof start
 while((node=walker.nextNode())){const n=node.textContent?.length||0;if(!start&&saved.from-from<=total+n)start={node,offset:Math.max(0,saved.from-from-total)};if(saved.to-from<=total+n){end={node,offset:Math.max(0,saved.to-from-total)};break}total+=n}
 if(start&&end){const selection=getSelection();if(saved.backward)selection?.setBaseAndExtent(end.node,end.offset,start.node,start.offset);else selection?.setBaseAndExtent(start.node,start.offset,end.node,end.offset)}
}
