<template>
  <div ref="root" class="pdf-continuous-stack pdf-paper" :aria-busy="busy || undefined">
    <section v-for="item in frames" :key="item.page" class="pdf-continuous-item" :data-page="item.page" :style="{minHeight:Math.max(item.height+(item.page>1?40:0),(host?.clientHeight||300)/5)+'px'}" :aria-label="`第 ${item.page} 页`">
      <div v-if="item.page>1" class="pdf-continuous-label" aria-hidden="true"><span />第 {{ item.page }} 页<span /></div>
      <div v-if="item.oversize" class="pdf-continuous-surface pdf-continuous-unavailable" :data-page="item.page" :style="{width:item.width+'px',height:item.height+'px'}"><p>本页尺寸特殊，请逐页查看原版。</p><button class="button" @click="emit('single',item.page)">逐页查看本页</button></div>
      <MobilePdfContinuousPage v-else :ref="value=>setPageRef(item.page,value)" :pdf="pdf" :page="item.page" :width="item.width" :height="item.height" :available="available" :zoom="displayZoom" :rotation="displayRotation" :schedule="schedule" :priority="item.page===currentPage?0:1" :annotations="annotations.filter(a=>a.page===item.page)" :reference-annotation="referenceAnnotation" @single="emit('single',$event)" @ready="pageReady" />
    </section>
    <p v-if="error" class="pdf-continuous-error" role="alert">{{ error }}<button class="button" @click="emit('single',currentPage)">逐页查看本页</button></p>
  </div>
</template>
<script setup lang="ts">
import {ref,nextTick,onBeforeUnmount} from 'vue'
import type {ComponentPublicInstance} from 'vue'
import type {PDFDocumentProxy} from 'pdfjs-dist'
import type {PdfAnnotation,PdfAnnotationRect} from '../types/pdfAnnotations'
import MobilePdfContinuousPage from './MobilePdfContinuousPage.vue'
import {continuousPageLimit,continuousMetricsLimit,continuousCurrent,continuousEdge,continuousOffset,continuousRenderQueue} from './pdfContinuous'
import {pdfAnchorAt,pdfAnchorScroll,type PdfAnchor,type PdfXY} from './pdfGestures'
import {pdfCanvasSize,pdfScrollFraction} from './pdfDocument'
import {normalizedPdfRects} from './pdfAnnotations'
import {humanStorageError} from './storage'
const props=defineProps<{pdf:PDFDocumentProxy;host:HTMLElement|undefined;zoom:number;rotation:number;annotations:PdfAnnotation[];referenceAnnotation:string;paused:boolean}>()
const emit=defineEmits<{move:[page:number];busy:[value:boolean];saved:[];single:[page:number]}>()
interface Frame {page:number;width:number;height:number;oversize:boolean}
interface Request {page:number;offset?:number;inset?:number;horizontal?:number;anchor?:PdfAnchor;rect?:PdfAnnotationRect;automatic?:boolean}
const displayZoom=ref(props.zoom),displayRotation=ref(props.rotation)
const root=ref<HTMLElement>(),frames=ref<Frame[]>([]),busy=ref(false),error=ref(''),currentPage=ref(1),available=ref(358)
const components=new Map<number,InstanceType<typeof MobilePdfContinuousPage>>(),metrics=new Map<number,{width:number;height:number}>()
const schedule=continuousRenderQueue()
let epoch=0,disposed=false,raf=0
function setPageRef(n:number,value:Element|ComponentPublicInstance|null){if(value)components.set(n,value as InstanceType<typeof MobilePdfContinuousPage>);else components.delete(n)}
function surfaces(){return Array.from(root.value?.querySelectorAll<HTMLElement>('.pdf-continuous-surface')||[])}
function boxes(){return surfaces().map(e=>{const b=e.getBoundingClientRect();return{page:Number(e.dataset.page),top:b.top,bottom:b.bottom,height:b.height}})}
function element(n:number){return surfaces().find(e=>Number(e.dataset.page)===n)}
function getAnchor(point:PdfXY){const host=props.host,b=continuousEdge(boxes(),point.y);if(!host||!b)return undefined;const e=element(b.page);if(!e)return undefined;return{page:b.page,anchor:pdfAnchorAt(point,e.getBoundingClientRect(),host.getBoundingClientRect())}}
function point(){
 const host=props.host;if(!host)return undefined
 const bounds=host.getBoundingClientRect(),b=continuousEdge(boxes(),bounds.top+12);if(!b)return undefined
 const offset=continuousOffset(b.top,b.height,bounds.top+12)
 return {page:b.page,pageOffset:offset.offset,pageInset:offset.inset,horizontal:pdfScrollFraction(host.scrollLeft,host.scrollWidth,host.clientWidth),fraction:0}
}
function hasSelection(){const s=window.getSelection();return !!s?.rangeCount&&!s.isCollapsed&&!!root.value&&(root.value.contains(s.anchorNode)||root.value.contains(s.focusNode))}
function selection(){
 const s=window.getSelection();if(!s?.rangeCount||s.isCollapsed||!root.value)return null
 const layerFor=(node:Node|null)=>{const e=node?.nodeType===Node.ELEMENT_NODE?node as Element:node?.parentElement;return e?.closest<HTMLElement>('.textLayer')}
 const a=layerFor(s.anchorNode),b=layerFor(s.focusNode);if(!a||!b||!root.value.contains(a)||!root.value.contains(b))return null
 if(a!==b)return {issue:'跨页选文请分段添加高亮；仍可使用系统复制。'}
 const quote=s.toString().trim();if(!quote||Array.from(quote).length>20000)return null
 const rects=normalizedPdfRects(s.getRangeAt(0).getClientRects(),a.getBoundingClientRect()),page=Number(a.parentElement?.dataset.page)
 return rects.length?{page,quote,rects,issue:''}:null
}
async function frame(n:number):Promise<Frame>{
 let metric=metrics.get(n)
 if(!metric){const p=await props.pdf.getPage(n),v=p.getViewport({scale:1});metric={width:v.width,height:v.height};metrics.set(n,metric);while(metrics.size>continuousMetricsLimit)metrics.delete(metrics.keys().next().value!)}
 const turned=props.rotation%180!==0,w=turned?metric.height:metric.width,h=turned?metric.width:metric.height,size=pdfCanvasSize(w,h,available.value,props.zoom,1),height=h*size.scale,width=w*size.scale,oversize=height>50000||width>10000
 return {page:n,width:oversize?available.value:width,height:oversize?Math.max(200,(props.host?.clientHeight||300)*.8):height,oversize}
}
async function refresh(request:Request){
 const host=props.host;if(!host||disposed)return
 available.value=Math.max(80,host.clientWidth-32)
 currentPage.value=request.page
 const current=++epoch;busy.value=true;emit('busy',true);error.value=''
 try{
  const next:Frame[]=[],first=Math.max(1,request.page-1);let forward=0,needed=host.clientHeight*2
  for(let n=first;n<=props.pdf.numPages&&next.length<continuousPageLimit;n++){
   const item=await frame(n);if(disposed||current!==epoch)return;next.push(item)
   if(n===request.page)needed+=Math.max(0,(request.anchor?.page.y??request.offset??0)*item.height+(request.inset||0))
   if(n>=request.page)forward+=Math.max(item.height+(n>1?40:0),host.clientHeight/5)
   if(n>request.page&&forward>=needed)break
  }
  if(request.automatic){const h=host.getBoundingClientRect(),live=getAnchor({x:h.x+h.width/2,y:h.y+12});if(live){if(!next.some(f=>f.page===live.page)){void refresh({page:live.page,anchor:live.anchor,automatic:true});return}request={...request,page:live.page,anchor:live.anchor}}}
  frames.value=next;displayZoom.value=props.zoom;displayRotation.value=props.rotation;await nextTick();if(disposed||current!==epoch)return
  const e=element(request.page);if(!e)throw new Error('本页尚未准备好。')
  if(request.anchor){const p=pdfAnchorScroll(request.anchor,e.getBoundingClientRect(),{x:host.scrollLeft,y:host.scrollTop},host.getBoundingClientRect(),{x:host.scrollWidth,y:host.scrollHeight});host.scrollLeft=p.x;host.scrollTop=p.y}
  else {const b=e.getBoundingClientRect(),h=host.getBoundingClientRect();host.scrollTop+=b.top-h.top-12+(request.offset||0)*b.height+(request.inset||0);host.scrollLeft=(request.horizontal||0)*Math.max(0,host.scrollWidth-host.clientWidth)}
  if(request.rect){const b=e.getBoundingClientRect(),h=host.getBoundingClientRect();host.scrollTop+=b.top-h.top+request.rect.y*b.height-24}
  report();await components.get(request.page)?.whenReady();if(disposed||current!==epoch)return
 }catch(e){if(!disposed&&current===epoch)error.value=`连续页面暂未显示：${humanStorageError(e)}`}
 finally{if(!disposed&&current===epoch){busy.value=false;emit('busy',false);emit('saved');onScroll()}}
}
function report(){const host=props.host;if(!host||!frames.value.length)return;const b=host.getBoundingClientRect();currentPage.value=continuousCurrent(boxes(),b.top,b.height);emit('move',currentPage.value)}
function onScroll(){
 if(raf||disposed||busy.value||props.paused)return
 raf=requestAnimationFrame(()=>{raf=0;if(disposed||busy.value||props.paused)return;if(hasSelection()){emit('saved');return}report();emit('saved');
  const host=props.host;if(!host)return;const h=host.getBoundingClientRect(),anchor=getAnchor({x:h.x+h.width/2,y:h.y+12});if(!anchor)return
  const all=boxes(),first=frames.value[0]?.page,last=frames.value[frames.value.length-1]?.page,lastBox=all[all.length-1]
  if(first!==Math.max(1,anchor.page-1)||(frames.value.length<continuousPageLimit&&last&&last<props.pdf.numPages&&lastBox&&lastBox.bottom<h.bottom+Math.min(120,h.height/2)))void refresh({page:anchor.page,anchor:anchor.anchor,automatic:true})
 })
}
function pageReady(){if(!busy.value&&!props.paused&&!hasSelection()){report();emit('saved')}}
onBeforeUnmount(()=>{disposed=true;epoch++;cancelAnimationFrame(raf);components.clear();metrics.clear()})
defineExpose({root,refresh,point,getAnchor,selection,onScroll})
</script>
<style scoped>
.pdf-continuous-stack{width:max-content;min-width:100%;transform-origin:0 0;overflow-anchor:none}.pdf-continuous-item{display:flex;flex-direction:column;align-items:center;width:100%;overflow-anchor:none}.pdf-continuous-label{display:flex;align-items:center;justify-content:center;gap:16px;margin:8px 0;height:24px;width:min(100%,358px);font-size:.8125rem;color:var(--muted);flex-shrink:0}.pdf-continuous-label>span{height:1px;background:var(--line);width:70px;max-width:20%}.pdf-continuous-unavailable{background:var(--surface);display:grid;place-content:center;gap:12px;text-align:center;padding:16px;color:var(--muted)}.pdf-continuous-error{max-width:358px;white-space:normal;color:var(--warning-ink);font-size:.875rem}
</style>
