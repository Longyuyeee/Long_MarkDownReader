import { ref, shallowRef, computed } from 'vue'
import type { TreeOption } from 'naive-ui'
import { markdownSections, headingSlug, type SectionDocument } from '../utils/markdownSections'

export interface OutlineItem { id: string; text: string; level: number; slug:string }
export function useOutline(getVditor: () => any, getDocumentKey:()=>string=()=> '') {
  const outlineItems = shallowRef<OutlineItem[]>([])
  const sectionModel = shallowRef<SectionDocument>({content:'',sections:[],reason:''})
  const mapped = ref(false), activeHeadingKey = ref<string|null>(null)
  const nodes = new Map<string,HTMLElement>()
  const fragments=new Map<string,string>()
  let observer: MutationObserver|null = null, timer: ReturnType<typeof setTimeout>|null = null
  let observed: HTMLElement|null = null, frame = 0, lastSignature:string|null=null,lastDocument=''
  const currentRoot = ():HTMLElement|undefined => { const editor=getVditor(),root=editor?.vditor?.[editor.getCurrentMode()]?.element as HTMLElement|undefined,preview=editor?.vditor?.preview?.element as HTMLElement|undefined;return root?.getClientRects().length?root:preview?.getClientRects().length?preview:root }
  const outlineTreeData = computed(() => {
    const result:TreeOption[]=[], stack:{level:number;children:TreeOption[]}[]=[{level:0,children:result}]
    for(const item of outlineItems.value){const node:TreeOption={label:item.text,key:item.id,level:item.level,children:[]};while(stack.length>1&&stack[stack.length-1].level>=item.level)stack.pop();stack[stack.length-1].children.push(node);stack.push({level:item.level,children:node.children as TreeOption[]})}
    const clean=(items:TreeOption[])=>items.forEach(item=>{if(item.children?.length)clean(item.children);else delete item.children});clean(result);return result
  })
  const syncOutlineManual = (force=false) => {
    const editor=getVditor(),root=currentRoot();nodes.clear();fragments.clear();mapped.value=false
    if(!editor||!root){outlineItems.value=[];lastSignature=null;return}
    const mode=root===editor.vditor.preview.element?'preview':editor.getCurrentMode()
    const elements=Array.from(root.querySelectorAll<HTMLElement>(mode==='sv'?'[data-type="heading-marker"]':'h1,h2,h3,h4,h5,h6')).filter(node=>{
      for(let parent=node.parentElement;parent&&parent!==root;parent=parent.parentElement)if(['PRE','CODE'].includes(parent.tagName)||parent.dataset.type==='code-block')return false
      return true
    })
    const editableElements=elements.filter(node=>{for(let parent=node.parentElement;parent&&parent!==root;parent=parent.parentElement)if(['BLOCKQUOTE','LI'].includes(parent.tagName))return false;return true})
    const level=(node:HTMLElement)=>mode==='sv'?Number(node.className.match(/(?:^|\s)h([1-6])(?:\s|$)/)?.[1]||0):Number(node.tagName.slice(1))
    const label=(node:HTMLElement)=>{if(mode==='sv'){let text='';for(let next=node.nextSibling;next;next=next.nextSibling){if(next instanceof HTMLElement&&next.dataset.type==='newline')break;text+=next.textContent||''}return text.trim()||'标题'}const clone=node.cloneNode(true) as HTMLElement;clone.querySelectorAll('.vditor-ir__marker').forEach(e=>e.remove());return clone.textContent?.trim()||'标题'}
    const signature=elements.map(node=>`${level(node)}:${label(node)}`).join('\n'),documentKey=getDocumentKey()
    // Ordinary body input updates the DOM outline without re-lexing the entire
    // note. Source ranges are refreshed synchronously before every command.
    if(force||signature!==lastSignature||documentKey!==lastDocument){sectionModel.value=markdownSections(editor.getValue());lastSignature=signature;lastDocument=documentKey}
    const model=sectionModel.value
    mapped.value=!model.reason&&model.sections.length===editableElements.length&&model.sections.every((section,index)=>section.level===level(editableElements[index])&&headingSlug(section.text)===headingSlug(label(editableElements[index])))
    const editable=new Map(mapped.value?model.sections.map((section,index)=>[editableElements[index],section] as const):[]),used=new Set<string>()
    const items:OutlineItem[]=elements.map((node,index)=>{const section=editable.get(node),text=section?.text||label(node),base=headingSlug(text)||'section';let slug=base,suffix=0;while(used.has(slug))slug=`${base}-${++suffix}`;used.add(slug);if(section)section.slug=slug;const item=section||{id:`context-heading-${index}`,text,level:level(node)||1,slug};fragments.set(slug,item.id);return item})
    items.forEach((item,index)=>{nodes.set(item.id,elements[index]);elements[index].dataset.longeditSection=item.id})
    if(items.length!==outlineItems.value.length||items.some((item,i)=>{const old=outlineItems.value[i];return old.id!==item.id||old.text!==item.text||old.level!==item.level}))outlineItems.value=items
    updateActive()
  }
  const updateActive=()=>{
    const root=currentRoot();if(!root)return
    const edge=root.getBoundingClientRect().top+70
    let current:string|null=null
    for(const[id,node]of nodes)if(node.getBoundingClientRect().top<=edge)current=id
    activeHeadingKey.value=current
  }
  const onScroll=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;updateActive()})}
  const scrollToHeading=(id:string, behavior:ScrollBehavior='smooth')=>{
    let node=nodes.get(id);if(!node?.isConnected||node.dataset.longeditSection!==id){syncOutlineManual();node=nodes.get(id)}if(!node?.isConnected)return false
    node.scrollIntoView({behavior,block:'center'});activeHeadingKey.value=id;return true
  }
  const scrollToFragment=(fragment:string)=>{syncOutlineManual(true);const id=fragments.get(fragment.replace(/^user-content-/,''));return Boolean(id&&scrollToHeading(id))}
  const destroyOutlineObserver=()=>{observer?.disconnect();observer=null;if(timer!==null)clearTimeout(timer);timer=null;observed?.removeEventListener('scroll',onScroll,true);observed=null;if(frame)cancelAnimationFrame(frame);frame=0}
  const setupOutlineObserver=(extraCallback?:()=>void)=>{
    destroyOutlineObserver();observed=currentRoot()||null;if(!observed)return
    observer=new MutationObserver(()=>{if(timer!==null)return;timer=setTimeout(()=>{timer=null;syncOutlineManual();extraCallback?.()},120)})
    observer.observe(observed,{childList:true,subtree:true,characterData:true});observed.addEventListener('scroll',onScroll,true)
  }
  return {outlineItems,outlineTreeData,sectionModel,mapped,activeHeadingKey,syncOutlineManual,scrollToHeading,scrollToFragment,setupOutlineObserver,destroyOutlineObserver,currentRoot,headingNode:(id:string)=>nodes.get(id)}
}
