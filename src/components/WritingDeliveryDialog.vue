<template>
  <n-modal :show="true" preset="card" :title="`导出文档 · ${title}`" class="writing-delivery-dialog" :style="{width:'min(880px,96vw)',maxHeight:'92dvh'}" :mask-closable="false" :closable="!busy" :close-on-esc="!busy" @close="emit('close')" @esc="emit('close')">
    <p class="delivery-context">导出当前草稿，不会保存或改写原文件。<br>{{ path }}</p>
    <p class="delivery-context">HTML 携带本地位图；PDF 通过系统打印选择“另存为 PDF”。字体使用本机字体及后备字体，交互图等请核对预览。</p>
    <p v-if="loading" role="status">正在准备正文与图片…</p>
    <p v-if="error" role="alert" class="delivery-error">{{error}} <n-button v-if="!busy" size="small" @click="prepare">重新准备</n-button></p>
    <details v-if="warnings.length" class="delivery-warnings" open><summary>交付注意事项（{{warnings.length}}）</summary><ul><li v-for="warning in warnings" :key="warning">{{warning}}</li></ul></details>
    <iframe v-if="documentHtml" ref="preview" title="实际交付预览" sandbox="allow-same-origin allow-modals" :srcdoc="documentHtml" @load="frameReady=true" />
    <p v-if="result" role="status" class="delivery-context">{{result}}</p>
    <template #footer><div class="delivery-actions"><n-button :disabled="busy" @click="emit('close')">关闭</n-button><n-button :disabled="busy" @click="save('md')">Markdown 仅正文…</n-button><n-button :disabled="busy||!frameReady||!documentHtml" @click="save('html')">独立 HTML…</n-button><n-button type="primary" :disabled="busy||!frameReady||!documentHtml" @click="print">打印 / PDF…</n-button></div><p class="delivery-footnote">Markdown 图片仍依赖原引用；需要换目录阅读时建议使用独立 HTML。已有文件不直接覆盖。</p></template>
  </n-modal>
</template>
<script setup lang="ts">
import {onMounted,onUnmounted,ref} from 'vue'
import {NModal,NButton} from 'naive-ui'
import {invoke} from '../services/tauriRuntime'
import {deliveryDocument,waitForDeliveryFrame,type DeliveryResources} from '../utils/writingDelivery'
import type {DisplayPreferences} from '../config/displayPreferences'
import {beginWindowSave} from '../services/windowDrafts'
const props=defineProps<{root:string;path:string;title:string;markdown:string;html:string;preferences:DisplayPreferences}>()
const emit=defineEmits<{close:[]}>()
const loading=ref(false),busy=ref(false),error=ref(''),result=ref(''),warnings=ref<string[]>([]),documentHtml=ref(''),frameReady=ref(false),preview=ref<HTMLIFrameElement>()
let generation=0,live=true
onUnmounted(()=>{live=false;++generation})
async function prepare(){
 if(busy.value)return
 const token=++generation;loading.value=true;error.value='';documentHtml.value='';frameReady.value=false;result.value=''
 try{
  const resources=await invoke<DeliveryResources>('prepare_writing_delivery',{libraryRoot:props.root,documentPath:props.path,markdown:props.markdown})
  if(!live||token!==generation)return
  const ready=deliveryDocument(props.title,props.html,resources,props.preferences);documentHtml.value=ready.document;warnings.value=ready.warnings
 }catch(cause){if(live&&token===generation)error.value=`交付预览未完成：${String(cause)}。原稿未改动，可修复图片后重新准备。`}
 finally{if(live&&token===generation)loading.value=false}
}
async function save(format:'md'|'html'){
 if(busy.value||(format==='html'&&!documentHtml.value))return
 busy.value=true;error.value='';result.value='';const finish=beginWindowSave()
 try{
  const target=await invoke<string|null>('save_writing_delivery',{suggestedName:props.title,format,content:format==='md'?props.markdown:documentHtml.value})
  if(live&&target)result.value=`已导出：${target}。原稿仍保持当前保存状态。`
 }catch(cause){if(live)error.value=`导出未完成：${String(cause)}。请换名、检查目录权限或重试；原稿未改动。`}
 finally{finish();if(live)busy.value=false}
}
async function print(){
 if(busy.value||!preview.value||!frameReady.value)return
 busy.value=true;error.value='';result.value=''
 try{await waitForDeliveryFrame(preview.value);if(!live)return;preview.value.contentWindow!.focus();preview.value.contentWindow!.print();if(live)result.value='已请求系统打印；请选择打印机或另存为 PDF。取消打印不会改动原稿，不代表已生成 PDF。'}
 catch(cause){if(live)error.value=`未开始打印：${String(cause)}`}
 finally{if(live)busy.value=false}
}
onMounted(prepare)
</script>
<style scoped>
.delivery-context,.delivery-footnote{font-size:var(--font-size-sm,13px);color:var(--text-secondary);overflow-wrap:anywhere;margin:0 0 10px}
.delivery-error{color:var(--status-danger-text);overflow-wrap:anywhere}.delivery-warnings{font-size:13px;margin:10px 0;overflow-wrap:anywhere;max-height:100px;overflow:auto}
iframe{display:block;width:100%;height:clamp(120px,43vh,460px);border:1px solid var(--border-color);background:#fff;border-radius:var(--radius-sm,6px)}
.delivery-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.delivery-footnote{margin:8px 0 0}
.writing-delivery-dialog :deep(.n-card__content){min-height:0;overflow:auto}
</style>
<style>
.writing-delivery-dialog > .n-card__content{min-height:0;overflow:auto}
.writing-delivery-dialog > .n-card-header,.writing-delivery-dialog > .n-card__footer{flex-shrink:0}
</style>
