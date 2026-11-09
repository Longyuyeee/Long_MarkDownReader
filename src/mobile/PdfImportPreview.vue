<template><figure class="pdf-intake-preview"><div><canvas ref="canvas" v-show="ready" /><p v-if="error" role="status">{{ error }}<br />仍可存入副本，打开时再次尝试。</p><p v-else-if="!ready" role="status">正在预览首页…</p></div><figcaption>{{ ready ? `首页预览 · 共 ${pages} 页` : '首页预览' }}</figcaption></figure></template>
<script setup lang="ts">
import {ref,onMounted,onBeforeUnmount} from 'vue'
import type {PDFDocumentLoadingTask,RenderTask} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import {base64Bytes,hashBytes} from './portablePack'
import {validatePdfBytes} from './pdfDocument'
const props=defineProps<{base64:string;digest:string}>(),canvas=ref<HTMLCanvasElement>(),ready=ref(false),pages=ref(0),error=ref('')
let disposed=false,loading:PDFDocumentLoadingTask|undefined,render:RenderTask|undefined
onMounted(async()=>{try{const bytes=base64Bytes(props.base64);validatePdfBytes(bytes);if(await hashBytes(bytes)!==props.digest)throw Error('digest');if(disposed)return;const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');if(disposed)return;pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;const base=new URL('./pdf/',window.location.href).href;loading=pdfjs.getDocument({data:bytes,enableXfa:false,useWasm:false,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/'});const pdf=await loading.promise;if(disposed)return;pages.value=pdf.numPages;const page=await pdf.getPage(1);if(disposed||!canvas.value)return;const original=page.getViewport({scale:1}),scale=Math.min(220/original.width,252/original.height);if(!Number.isFinite(scale)||scale<=0)throw Error('size');const view=page.getViewport({scale}),element=canvas.value,context=element.getContext('2d');if(!context)throw Error('canvas');element.width=Math.max(1,Math.floor(view.width));element.height=Math.max(1,Math.floor(view.height));render=page.render({canvas:element,canvasContext:context,viewport:view,annotationMode:1});await render.promise;if(!disposed)ready.value=true}catch(e){if(!disposed)error.value=/password/i.test(String(e))?'这份 PDF 需要密码，暂时无法预览。':'首页预览暂时不可用。'}})
onBeforeUnmount(()=>{disposed=true;render?.cancel();void loading?.destroy().catch(()=>{});const element=canvas.value;void (render?.promise.catch(()=>{})||Promise.resolve()).then(()=>{if(element){element.width=1;element.height=1}})})
</script>
<style scoped>
.pdf-intake-preview{margin:10px 0 0;height:300px;border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}.pdf-intake-preview>div{height:240px;display:flex;align-items:center;justify-content:center;max-width:100%}.pdf-intake-preview canvas{max-width:100%;max-height:240px;border:1px solid #dce2d8;box-shadow:0 3px 12px #163c2210;background:white}.pdf-intake-preview p{font-size:.875rem;line-height:1.6;text-align:center;color:var(--muted)}figcaption{font-size:.875rem;color:var(--muted);line-height:20px}
@media(max-height:500px){.pdf-intake-preview{height:220px}.pdf-intake-preview>div,.pdf-intake-preview canvas{max-height:162px}}
</style>
