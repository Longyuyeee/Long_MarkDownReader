<template>
  <div ref="surface" class="pdf-continuous-surface pdf-page-surface" :style="{width:width+'px',height:height+'px'}" :data-page="page">
    <canvas ref="canvas" tabindex="0" role="img" :aria-label="`PDF 第 ${page} 页，可长按选文或切换页面文字阅读`" :style="{width:width+'px',height:height+'px'}" />
    <div ref="layer" class="textLayer" aria-hidden="true" />
    <div class="pdf-mark-layer" aria-hidden="true"><template v-for="a in annotations" :key="a.id"><i v-for="(r,index) in a.rects" :key="index" class="pdf-mark" :class="[`color-${a.color}`,`kind-${a.kind}`,{'is-reference':a.id===referenceAnnotation}]" :style="{left:r.x*100+'%',top:r.y*100+'%',width:r.width*100+'%',height:r.height*100+'%'}" /></template></div>
    <p v-if="loading" class="pdf-continuous-page-message" role="status">正在显示第 {{ page }} 页…</p>
    <div v-else-if="error" class="pdf-continuous-page-message" role="alert"><p>第 {{ page }} 页暂未显示：{{ error }}</p><button class="button" @click="refresh">重试本页</button><button class="button" @click="emit('single',page)">逐页查看本页</button></div>
  </div>
</template>
<script setup lang="ts">
import {ref,watch,nextTick,onBeforeUnmount} from 'vue'
import type {PDFDocumentProxy,PDFPageProxy,RenderTask,TextLayer} from 'pdfjs-dist'
import type {PdfAnnotation} from '../types/pdfAnnotations'
import {pdfRotation,sizePdfTextLayer} from './pdfOrientation'
import {continuousCanvasSize} from './pdfContinuous'
import {humanStorageError} from './storage'
const props=defineProps<{pdf:PDFDocumentProxy;page:number;width:number;height:number;available:number;zoom:number;rotation:number;schedule:(work:()=>Promise<void>,priority:number)=>Promise<void>;priority:number;annotations:PdfAnnotation[];referenceAnnotation:string}>()
const emit=defineEmits<{single:[page:number];ready:[]}>()
const canvas=ref<HTMLCanvasElement>(),surface=ref<HTMLElement>(),layer=ref<HTMLElement>(),loading=ref(true),error=ref('')
let task:RenderTask|undefined,textLayer:TextLayer|undefined,pageProxy:PDFPageProxy|undefined,epoch=0,disposed=false,ready:Promise<void>=Promise.resolve()
function refresh(){const current=++epoch;task?.cancel();textLayer?.cancel();loading.value=true;error.value='';ready=props.schedule(()=>render(current),props.priority);return ready}
async function render(current:number){
 if(disposed||current!==epoch)return
 const previous=task
 try{
  await previous?.promise.catch(()=>{});await nextTick()
  if(disposed||current!==epoch||!canvas.value||!layer.value)return
  const page=await props.pdf.getPage(props.page);if(disposed||current!==epoch)return;pageProxy=page
  const initial=page.getViewport({scale:1,rotation:pdfRotation(page.rotate+props.rotation)}),size=continuousCanvasSize(initial.width,initial.height,props.available,props.zoom,window.devicePixelRatio||1),view=page.getViewport({scale:size.scale,rotation:pdfRotation(page.rotate+props.rotation)}),element=canvas.value,context=element.getContext('2d')
  if(!context)throw new Error('设备暂时无法显示页面。')
  layer.value.replaceChildren();element.width=size.width;element.height=size.height
  task=page.render({canvas:element,canvasContext:context,viewport:view,transform:[size.dpr,0,0,size.dpr,0,0],annotationMode:1});await task.promise
  if(disposed||current!==epoch)return
  const content=await page.getTextContent();if(disposed||current!==epoch)return
  if(content.items.length>50000)throw new Error('本页文字较多，请逐页查看。')
  const {TextLayer}=await import('pdfjs-dist/legacy/build/pdf.mjs');if(disposed||current!==epoch)return
  const host=layer.value;host.style.width=props.width+'px';host.style.height=props.height+'px';host.style.setProperty('--total-scale-factor',String(view.scale))
  textLayer=new TextLayer({container:host,textContentSource:content,viewport:view});sizePdfTextLayer(host,view);await textLayer.render()
 }catch(e){if(!disposed&&current===epoch&&!/RenderingCancelled/.test(String(e)))error.value=humanStorageError(e)}
 finally{if(!disposed&&current===epoch){loading.value=false;emit('ready')}}
}
watch(()=>[props.page,props.width,props.height,props.zoom,props.rotation],refresh,{immediate:true})
onBeforeUnmount(()=>{disposed=true;epoch++;task?.cancel();textLayer?.cancel();const c=canvas.value;void(task?.promise.catch(()=>{})||Promise.resolve()).then(()=>{if(c){c.width=1;c.height=1}pageProxy?.cleanup()})})
defineExpose({surface,whenReady:()=>ready})
</script>
<style scoped>
.pdf-continuous-surface{position:relative;flex-shrink:0;background:white;outline:1px solid #d4ddd6;outline-offset:-1px;transform-origin:0 0}.pdf-continuous-surface canvas{display:block;background:white}.pdf-continuous-page-message{position:absolute;inset:0;display:flex;flex-wrap:wrap;align-content:center;justify-content:center;gap:8px;padding:16px;margin:0;background:var(--surface);color:var(--muted);font-size:.875rem;overflow:auto}.pdf-mark-layer{position:absolute;inset:0;pointer-events:none}.pdf-mark{position:absolute;mix-blend-mode:multiply}.pdf-mark.color-yellow{background:#ffe16a66}.pdf-mark.color-green{background:#88bc7c66}.pdf-mark.color-pink{background:#ed9cb566}.pdf-mark.color-blue{background:#88b9ed66}.pdf-mark.kind-area{background:transparent;outline:2px solid #c89200}.pdf-mark.is-reference{outline:2px solid #315f49;outline-offset:1px}
.textLayer{--min-font-size:1;--text-scale-factor:calc(var(--total-scale-factor) * var(--min-font-size));--min-font-size-inv:calc(1 / var(--min-font-size));position:absolute;inset:0;overflow:clip;line-height:1;text-align:initial;transform-origin:0 0;-webkit-text-size-adjust:none;text-size-adjust:none;forced-color-adjust:none;user-select:text;-webkit-user-select:text}
.textLayer :deep(span),.textLayer :deep(br){position:absolute;color:transparent;white-space:pre;cursor:text;transform-origin:0 0}.textLayer :deep(> :not(.markedContent)),.textLayer :deep(.markedContent span:not(.markedContent)){--font-height:0;--scale-x:1;--rotate:0deg;font-size:calc(var(--text-scale-factor) * var(--font-height));transform:rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv))}.textLayer :deep(.markedContent){display:contents}.textLayer :deep(::selection){background:#407ab955}
</style>
