<template>
  <section class="pdf-intake">
    <div ref="body" class="pdf-intake-body">
      <div v-show="!removing" :inert="removing">

      <p v-if="receivedError" class="pdf-intake-error" role="alert">{{ receivedError }}</p><p v-if="error" class="pdf-intake-error" role="alert">{{ error }}</p><p v-if="busy||message" role="status" class="pdf-intake-status">{{ busy?'正在核对本机副本…':message }}</p>
      <template v-if="record">
        <article class="pdf-intake-file"><span class="pdf-badge">PDF</span><div><h3 ref="heading" tabindex="-1">{{ record.name }}</h3><p>{{ receivedPdfSize(record.bytes) }} · {{ record.source==='open'?'通过打开方式收到':'其他应用分享' }}</p></div></article>
        <PdfImportPreview v-if="record.status==='ready'&&record.base64" :key="record.id+record.digest" :base64="record.base64" :digest="record.digest" />
        <p v-if="record.status==='ready'" class="pdf-intake-retained"><CheckCircle2 :size="20" aria-hidden="true"/>待存入</p>
        <p v-if="record.status==='imported'" class="pdf-intake-retained"><CheckCircle2 :size="20" aria-hidden="true"/>已存入资料库</p>
        <p v-if="record.error" class="pdf-intake-error" role="alert">{{ humanStorageError(record.error) }}</p>
        <button v-if="record.status==='failed'" class="button" :disabled="busy" @click="select(record)">重新核对这份 PDF</button>
        <button class="text-button pdf-intake-remove-link" :disabled="busy" @click="requestRemoval">移除这条接收记录</button>
        <button v-if="!sourceTask" class="text-button pdf-intake-history" :disabled="busy" @click="backToHistory">查看全部 PDF 接收记录</button>
      </template>
      <template v-else-if="!sourceTask">
        <div v-if="!entries.length&&!busy" class="pdf-intake-empty"><FileInput :size="36" aria-hidden="true"/><h3>还没有待核对的 PDF</h3></div>
        <button v-for="entry in entries" :key="entry.id" class="pdf-intake-entry" :data-pdf-import-id="entry.id" :disabled="busy" @click="select(entry)"><FileText :size="22" aria-hidden="true"/><span><strong>{{ entry.name }}</strong><small>{{ entry.status==='ready'?'等待核对':entry.status==='imported'?'已存入资料库':'接收未完成' }} · {{ receivedPdfSize(entry.bytes) }}</small><small>{{ receivedAt(entry.created) }} · {{ entry.source==='open'?'打开方式':'分享' }}</small></span><ChevronRight :size="18" aria-hidden="true"/></button>

        <button class="button" :disabled="busy" @click="refresh">刷新接收记录</button>
      </template>
      <button v-else-if="!busy" class="button" @click="loadInitial">重新读取收到的 PDF</button>
      </div>
      <div v-if="removing && record" class="pdf-intake-remove" role="group" aria-label="移除 PDF 接收记录确认"><h3>移除这条 PDF 接收记录？</h3><p>{{ record.status==='imported'?'仅移除这条接收记录，已存入的 PDF 和原文件都保留。':'移除后，本机待存入的这份副本将删除；原文件保持原样。' }}</p><div><button class="button" :disabled="busy" ref="cancelButton" @click="cancelRemoval">继续保留</button><button class="button" :disabled="busy" @click="remove">确认移除记录</button></div></div>
      <p v-if="removing && error" class="pdf-intake-error" role="alert">{{ error }}</p>
    </div>
    <footer v-show="!removing" :inert="removing" class="pdf-intake-footer"><button v-if="record&&(record.status==='ready'||record.status==='imported')" class="button primary-button" :disabled="busy" @click="commit">{{ record.status==='imported'?'打开已存入的 PDF':'存入并开始阅读' }}<ChevronRight :size="20" aria-hidden="true"/></button><button class="button" :disabled="busy" @click="emit('close')">稍后处理</button></footer>
  </section>
</template>
<script setup lang="ts">
import {computed,ref,onMounted,onBeforeUnmount,nextTick} from 'vue'
import {CheckCircle2,FileInput,FileText,ChevronRight} from 'lucide-vue-next'
import type {Identity,Storage} from './storage'
import { captureTaskPosition, restoreTaskPosition, restoreTaskRecord, type TaskPosition } from './taskPosition'
import {humanStorageError} from './storage'
import {receivedPdfSize,type PdfImportSummary,type PdfImportRecord} from './pdfImport'
import PdfImportPreview from './PdfImportPreview.vue'
const props=defineProps<{storage:Storage;initialId:string;initialError:string;openDocument:(identity:Identity)=>Promise<void>;sourceTask?:boolean}>(),emit=defineEmits<{updated:[];busy:[boolean];close:[];back:[]}>()
const entries=ref<PdfImportSummary[]>([]),record=ref<PdfImportRecord|null>(null),error=ref(''),receivedError=ref(props.initialError),busy=ref(false),message=ref(''),removing=ref(false),heading=ref<HTMLElement>(),body=ref<HTMLElement>()
const receivedAt=(value:number)=>new Date(value).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})
const cancelButton=ref<HTMLButtonElement>()
const canBack=computed(()=>!!record.value||removing.value)
let historyPosition:TaskPosition|null=null,removalPosition:TaskPosition|null=null
async function requestRemoval(){removalPosition=captureTaskPosition();removing.value=true;await nextTick();cancelButton.value?.focus()}
async function cancelRemoval(){removing.value=false;await nextTick();restoreTaskPosition(removalPosition)}
function back(){
  if(busy.value)return true
  if(removing.value){void cancelRemoval();return true}
  if(record.value&&!props.sourceTask){void backToHistory();return true}
  return false
}
defineExpose({back,canBack,confirming:removing})
let alive=true
async function task(work:()=>Promise<void>){if(busy.value)return;busy.value=true;emit('busy',true);error.value='';try{await work()}catch(e){if(alive)error.value=humanStorageError(e)}finally{if(alive){busy.value=false;emit('busy',false)}}}
async function load(){entries.value=(await props.storage.pdfImports()).entries}
async function refresh(){await task(load)}
async function select(entry:PdfImportSummary){if(!record.value)historyPosition=captureTaskPosition();await task(async()=>{removing.value=false;message.value='';try{record.value=await props.storage.pdfImport(entry.id);await props.storage.acknowledgeIncoming(entry.id,'pdf');emit('updated')}catch(e){record.value={...entry,status:'failed',base64:null,error:humanStorageError(e)}};await nextTick();body.value?.scrollTo(0,0);heading.value?.focus()})}
async function backToHistory(){if(busy.value)return;const id=record.value?.id;record.value=null;removing.value=false;error.value='';await refresh();await nextTick();restoreTaskRecord(historyPosition,'data-pdf-import-id',id)}
async function remove(){const id=record.value?.id;if(!id)return;await task(async()=>{await props.storage.removePdfImport(id);record.value=null;removing.value=false;await load();emit('updated');message.value='接收记录已移除，原文件和已存入的 PDF 继续保留。'});if(props.sourceTask&&!record.value)emit('back')}
async function commit(){const current=record.value;if(!current)return;await task(async()=>{const identity=await props.storage.commitPdfImport(current.id,current.digest);emit('updated');if(alive){record.value=await props.storage.pdfImport(current.id);await props.openDocument(identity)}})}
async function loadInitial(){await refresh();if(!alive)return;const initial=entries.value.find(e=>e.id===props.initialId);if(initial)await select(initial);else if(props.sourceTask&&!error.value)error.value='这条接收记录已不可用，请返回收到的内容。'}
onMounted(loadInitial)
onBeforeUnmount(()=>{alive=false;emit('busy',false)})
</script>
<style scoped>
.pdf-intake{display:flex;flex-direction:column;min-height:0;flex:1}.pdf-intake-body{overflow:auto;min-height:40px;flex:1;padding:0 16px 12px;overscroll-behavior:contain}.pdf-intake-hint{display:flex;align-items:center;gap:16px;min-height:62px;background:var(--primary-soft);border-radius:10px;padding:8px 18px;margin:12px 0 14px;font-size:1rem}.pdf-intake-hint>svg{flex-shrink:0;color:var(--primary)}.pdf-intake-hint strong{display:block;line-height:22px}.pdf-intake-hint p{font-size:.875rem;line-height:20px;color:var(--muted);margin:4px 0 0}.pdf-intake-file{display:flex;align-items:center;gap:16px;padding:7px 14px;min-height:65px;background:var(--surface);border:1px solid var(--line);border-radius:12px}.pdf-intake-file>div{min-width:0}.pdf-intake-file h3{font-size:1.125rem;line-height:1.4;margin:0;overflow-wrap:anywhere}.pdf-intake-file p{font-size:.875rem;color:var(--muted);line-height:1.4;margin:2px 0 0}.pdf-intake-file .pdf-badge{font-size:.75rem;width:34px;height:34px;display:grid;place-items:center;border-radius:4px;background:#b54742;color:white;flex-shrink:0}.pdf-intake-retained{display:flex;justify-content:center;gap:8px;color:var(--primary);font-size:.875rem;line-height:1.5;margin:12px 0 4px}.pdf-intake-retained svg{flex-shrink:0}.pdf-intake-remove-link{display:flex;min-height:44px;width:100%;justify-content:center;color:var(--muted);font-size:.875rem}.pdf-intake-history{display:block;width:100%;min-height:44px;font-size:.8125rem;text-align:center}.pdf-intake-footer{flex-shrink:0;padding:12px 16px 12px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:10px;background:var(--bg)}.pdf-intake-footer>.button{padding:8px 12px;line-height:24px;width:100%;justify-content:center;font-size:1rem;min-height:44px;border-radius:12px}.pdf-intake-footer>.primary-button{min-height:48px}.pdf-intake-footer>.button:not(.primary-button){border-color:var(--primary);color:var(--primary)}.pdf-intake-footer small{font-size:.75rem;line-height:18px;color:var(--muted);text-align:center;margin-top:2px}.pdf-intake-error{font-size:.875rem;line-height:1.6;color:var(--warning-ink);overflow-wrap:anywhere}.pdf-intake-status{font-size:.8125rem;color:var(--primary)}.pdf-intake-entry{display:flex;gap:12px;width:100%;align-items:center;text-align:left;padding:12px;margin:12px 0;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink)}.pdf-intake-entry>span{flex:1;min-width:0;overflow-wrap:anywhere}.pdf-intake-entry strong{display:block;font-size:1rem}.pdf-intake-entry small{display:block;font-size:.875rem;color:var(--muted);margin-top:4px}.pdf-intake-budget,.pdf-intake-empty p{font-size:.875rem;color:var(--muted);line-height:1.6}.pdf-intake-empty{text-align:center;padding:24px 0}.pdf-intake-empty h3{font-size:1.125rem}.pdf-intake-remove{padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--panel);font-size:.875rem;line-height:1.6}.pdf-intake-remove>div{display:flex;flex-wrap:wrap;gap:8px}.pdf-intake-remove .button{flex:1;justify-content:center}
@media(max-height:500px){.pdf-intake-hint{display:none}.pdf-intake-file{margin-top:8px}.pdf-intake-footer{padding:6px 12px;gap:6px}.pdf-intake-footer small{display:none}.pdf-intake-footer>.button{min-height:44px;font-size:.875rem;padding:8px}.pdf-intake-history{margin-bottom:6px}}
</style>
