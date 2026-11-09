<template><div class="pdf-thumbnail-image" aria-hidden="true"><canvas ref="canvas" v-show="!loading && !error" /><span v-if="loading">正在预览…</span><span v-else-if="error">预览暂不可用<br />仍可打开本页</span></div></template>
<script setup lang="ts">
import {ref,onMounted,onBeforeUnmount} from 'vue'
import type {PDFDocumentProxy,RenderTask} from 'pdfjs-dist'
import {pdfThumbnailSize} from './pdfNavigation'
const props=defineProps<{pdf:PDFDocumentProxy;page:number;schedule:(work:()=>Promise<void>)=>Promise<void>}>()
const canvas=ref<HTMLCanvasElement>(),loading=ref(true),error=ref(false)
let disposed=false, task:RenderTask|undefined
onMounted(()=>{void props.schedule(async()=>{
  try{
    if(disposed || !canvas.value)return
    const page=await props.pdf.getPage(props.page)
    if(disposed || !canvas.value)return
    const initial=page.getViewport({scale:1}),size=pdfThumbnailSize(initial.width,initial.height,window.devicePixelRatio||1),view=page.getViewport({scale:size.scale}),element=canvas.value,context=element.getContext('2d')
    if(!context)throw new Error('Canvas unavailable')
    element.width=size.width;element.height=size.height
    task=page.render({canvas:element,canvasContext:context,viewport:view,annotationMode:1});await task.promise
  }catch{if(!disposed)error.value=true}finally{if(!disposed)loading.value=false}
})})
onBeforeUnmount(()=>{disposed=true;const element=canvas.value;task?.cancel();void (task?.promise.catch(()=>{})||Promise.resolve()).then(()=>{if(element){element.width=1;element.height=1}})})
</script>
<style scoped>
.pdf-thumbnail-image{aspect-ratio:1/1.414;display:flex;align-items:center;justify-content:center;background:#fff;overflow:hidden;color:#53685b;font-size:.75rem;line-height:1.5;text-align:center}.pdf-thumbnail-image canvas{display:block;width:100%;height:100%;object-fit:contain}@media(prefers-reduced-motion:reduce){*{animation:none}}
</style>
