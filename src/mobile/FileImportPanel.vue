<template>
  <div class="file-import-panel" :class="{'is-confirming':removing}">
    <div v-show="!removing && !actionsOpen" ref="body" class="file-import-body task-scroll" :inert="removing || actionsOpen" tabindex="0" role="region" :aria-label="title">
      <p v-if="receivedError" class="file-task-error" role="alert">{{ receivedError }}</p>
      <p v-if="error" ref="errorElement" tabindex="-1" class="file-task-error" role="alert">{{ error }}</p>
      <p v-if="busy || message" ref="statusElement" tabindex="-1" class="file-task-status" role="status">{{ busy ? progress : message }}</p>
      <input v-if="storage.preview" ref="input" type="file" :accept="codeFileAccept + ',.md,.txt,.json,.yaml,.yml,.xml,.toml,application/toml,application/x-toml,text/toml,text/x-toml,application/xml,text/xml,text/markdown,text/plain,application/json,application/yaml,application/x-yaml,text/yaml,text/x-yaml'" aria-label="选择导入文件" hidden @change="picked" />
      <section v-show="view === 'history' && !sourceTask" :inert="view !== 'history' || sourceTask">
        <div class="file-history-toolbar"><span>{{ entries.length }} 条记录</span><button class="icon-button" :aria-label="historyError ? '重新读取记录' : '刷新记录'" :disabled="busy" @click="refresh"><RefreshCw :size="20" aria-hidden="true" /></button></div>
        <p v-if="historyError" class="file-task-error" role="alert">{{ entries.length ? '记录未刷新，仍显示上次读取的列表。' : '导入记录未能读取。' }}{{ historyError }}</p>
        <p v-if="!entries.length && !busy && !historyError" class="file-task-status">暂无导入记录。</p>
        <button v-for="entry in entries.slice(0,visible)" :key="entry.id" class="file-task-row" :data-file-import-id="entry.id" :disabled="busy" @click="inspect(entry)"><FileText :size="24" aria-hidden="true" /><span><strong>{{ entry.name }}</strong><small>{{ entry.incoming ? '新收到 · ' : '' }}{{ statusLabel(entry) }} · {{ new Date(entry.created).toLocaleString('zh-CN') }}</small></span><ChevronRight :size="20" aria-hidden="true" /></button>
        <button v-if="entries.length > visible" class="button full-width" :disabled="busy" @click="visible+=25">显示更多记录</button><p v-if="truncated" class="file-task-status">先显示最近100条，其他记录仍保留。</p>
      </section>
      <section v-if="record" v-show="view === 'review'" :inert="view !== 'review'">
        <div class="file-import-identity"><MobileFileIcon :name="record.name" text-badge /><span class="file-import-name"><h3 ref="heading" tabindex="-1">{{ record.name }}</h3><small>{{ recordReadFailed ? '记录读取失败' : record.status === 'ready' ? 'UTF-8' : statusLabel(record) }}<span class="assistive-status"> · {{ size(record.bytes) }}</span></small><small v-if="originLabel">{{ originLabel }}</small></span></div>
        <p v-if="record.error" class="file-task-error" role="alert">{{ humanStorageError(record.error) }}</p>
        <section v-if="record.status === 'ready' && record.content !== null" class="file-import-summary" aria-label="内容预览"><h4>内容预览</h4><p>{{ snippet }}</p><button class="file-task-row file-preview-link" :disabled="busy" @click="showPreview"><span>查看全文</span><ChevronRight :size="20" aria-hidden="true" /></button></section>
        <dl v-if="record.status === 'ready' || record.status === 'imported'" class="file-import-destination"><dt>存入位置</dt><dd><FolderOpen :size="23" aria-hidden="true" /><span>手机资料库</span></dd></dl>
        <details v-if="record.status === 'imported' && record.localPath" class="file-import-location"><summary>查看笔记位置</summary><p>{{ record.localPath }}</p></details>
      </section>
      <section v-if="record && previewMounted" v-show="view === 'preview'" class="file-preview-page" :inert="view !== 'preview'">
        <h3 class="file-import-subject">{{ record.name }}</h3>
        <RecoverySource :storage="storage" v-if="longContent" :key="record.id + record.digest" :identity="record.id" :content="record.content || ''" label="待导入文字" subject="导入" />
        <textarea v-else id="file-import-content" class="file-text-preview" aria-label="待导入文字（只读）" readonly spellcheck="false" :value="record.content"></textarea>
      </section>
      <template v-if="sourceTask && !record && !busy"><p v-if="historyError" class="file-task-error" role="alert">导入记录未能读取。{{ historyError }}</p><button class="button full-width" @click="loadInitial">重新读取收到的文字</button></template>
    </div>
    <footer v-show="!removing && !actionsOpen && view !== 'preview'" class="file-import-footer" :inert="removing || actionsOpen">
      <template v-if="view === 'history' && !sourceTask"><button class="button primary-button" :disabled="busy" @click="choose">选择文件</button></template>
      <template v-else-if="view === 'review' && record"><button v-if="record.status === 'ready' && record.content !== null" class="button primary-button" aria-label="存入资料库并打开" :disabled="busy" @click="commit">存入资料库</button><button v-else-if="record.status === 'imported'" class="button primary-button" :disabled="busy" @click="commit">打开已导入笔记</button><button v-else-if="recordReadFailed" class="button primary-button" :disabled="busy" @click="inspect(record)">重新读取这条记录</button><button v-else-if="sourceTask && record.status === 'failed'" class="button primary-button" :disabled="busy" @click="inspect(record)">重新核对这份文字</button><button v-else-if="!sourceTask && record.status === 'failed'" class="button primary-button" :disabled="busy" @click="choose">重新选择文件</button></template>
    </footer>
    <div v-show="actionsOpen && !removing" ref="actionsBody" class="file-import-actions task-scroll" :inert="!actionsOpen || removing"><button v-if="!sourceTask" class="file-task-row" :disabled="busy" @click="emit('chooseFolder')"><FolderOpen :size="23" aria-hidden="true" /><span>连接原文件夹</span><ChevronRight :size="20" aria-hidden="true" /></button><button class="file-task-row file-import-remove" :disabled="busy" @click="requestRemoval"><Trash2 :size="23" aria-hidden="true" /><span>移除记录</span></button></div>
    <div v-if="removing && record" class="recovery-card" role="group" aria-label="确认移除导入记录"><div><h3>移除这条导入记录？</h3><p>{{ recordReadFailed ? '记录内容暂时无法读取。移除后，其中可能尚未存入笔记的文字也会移除。源文件和已存入的笔记不会删除。' : record.status === 'ready' ? '这会移除尚未存入笔记的完整文字。源文件不会删除。' : '仅移除此条导入记录，源文件和已经存入的笔记都不会删除。' }}</p><div class="inline-actions"><button ref="cancelButton" class="button" :disabled="busy" @click="cancelRemoval">保留记录</button><button class="button" :disabled="busy" @click="remove">确认移除记录</button></div></div></div>
    <p v-if="removing && error" class="file-task-error" role="alert">{{ error }}</p>
  </div>
</template>
<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,reactive,ref,shallowRef} from 'vue'
import {FileText,Trash2,ChevronRight,RefreshCw,FolderOpen} from 'lucide-vue-next'
import {captureTaskPosition,restoreTaskPosition,restoreTaskRecord,type TaskPosition} from './taskPosition'
import {humanStorageError,type Document,type Storage} from './storage'
import type {FileImportRecord,FileImportSummary} from './textImport'
import {sourceReadingReason} from './documentBudget'
import {codeFileAccept} from './codeFormats'
import RecoverySource from './RecoverySource.vue'
import MobileFileIcon from './MobileFileIcon.vue'
const props=withDefaults(defineProps<{storage:Storage;openDocument:(document:Document)=>Promise<void>;initialId?:string;initialError?:string;sourceTask?:boolean;returnLabel?:string}>(),{returnLabel:'返回资料'})
const emit=defineEmits<{busy:[value:boolean];chooseFolder:[];updated:[];back:[]}>()
type View='history'|'review'|'preview'
const view=ref<View>(props.sourceTask?'review':'history'),body=ref<HTMLElement>(),heading=ref<HTMLElement>(),input=ref<HTMLInputElement>(),cancelButton=ref<HTMLButtonElement>(),errorElement=ref<HTMLElement>(),statusElement=ref<HTMLElement>()
const busy=ref(false),progress=ref(''),removing=ref(false),actionsOpen=ref(false),actionsBody=ref<HTMLElement>(),receivedError=ref(props.initialError||''),historyError=ref(''),recordReadFailed=ref(false),truncated=ref(false),visible=ref(25),previewMounted=ref(false)
const errors=reactive<Record<View,string>>({history:'',review:'',preview:''}),messages=reactive<Record<View,string>>({history:'',review:'',preview:''})
const error=computed({get:()=>errors[view.value],set:(v:string)=>{errors[view.value]=v}}),message=computed({get:()=>messages[view.value],set:(v:string)=>{messages[view.value]=v}})
const entries=ref<FileImportSummary[]>([]),record=shallowRef<FileImportRecord|null>(null)
const title=computed(()=>actionsOpen.value?'导入操作':({history:'文件导入',review:'核对导入',preview:'查看全文'})[view.value]),backLabel=computed(()=>actionsOpen.value?'返回导入核对':view.value==='history'?props.returnLabel:view.value==='preview'?'返回导入核对':props.sourceTask?'返回收到的内容':'返回导入记录')
const canBack=computed(()=>removing.value||actionsOpen.value||view.value==='preview'||view.value==='review'&&!props.sourceTask)
const longContent=computed(()=>!!sourceReadingReason(record.value?.content||''))
const originLabel=computed(()=>record.value?.source==='share-text'?'其他应用分享的文字':record.value?.source==='share-file'?'其他应用分享的文件':record.value?.source==='open'?'通过打开方式收到':'')
const actionsAvailable=computed(()=>view.value==='review'&&!!record.value&&!removing.value&&!actionsOpen.value)
const snippet=computed(()=>{const points=Array.from((record.value?.content||'').replace(/^\uFEFF/,''));return points.slice(0,240).join('')+(points.length>240?'…':'')})
let actionsPosition:TaskPosition|null=null
const positions:Partial<Record<View,TaskPosition>>={};let historyPosition:TaskPosition|null=null,removalPosition:TaskPosition|null=null,alive=true
const size=(bytes:number)=>bytes<1024?`${bytes} B`:`${(bytes/1024).toFixed(1)} KiB`
const statusLabel=(entry:FileImportSummary)=>entry.status==='ready'?'等待核对存入':entry.status==='imported'?'已存入手机资料库':entry.status==='preparing'?'正在读取文件':'未完成导入'
function focusTitle(){body.value?.closest('.bottom-sheet')?.querySelector<HTMLElement>('.sheet-heading h2')?.focus({preventScroll:true})}
function rememberHistory(){if(view.value==='history')historyPosition=captureTaskPosition(body.value)}
async function showPreview(){if(busy.value||record.value?.content==null)return;positions.review=captureTaskPosition(body.value);previewMounted.value=true;view.value='preview';await nextTick();if(positions.preview)restoreTaskPosition(positions.preview);else{if(body.value)body.value.scrollTop=0;focusTitle()}}
async function openActions(){if(busy.value||!actionsAvailable.value)return;positions.review=captureTaskPosition(body.value);positions.review.focus=body.value?.closest('.bottom-sheet')?.querySelector<HTMLElement>('[data-focus-key="text-import-actions"]')||positions.review.focus;actionsOpen.value=true;await nextTick();if(actionsPosition)restoreTaskPosition(actionsPosition);focusTitle()}
async function closeActions(){actionsPosition=captureTaskPosition(actionsBody.value);actionsOpen.value=false;await nextTick();restoreTaskRecord(positions.review||null,'data-focus-key','text-import-actions')}
async function task(text:string,action:()=>Promise<void>){if(busy.value)return;busy.value=true;emit('busy',true);progress.value=text;error.value='';message.value='';try{await action()}catch(cause){if(alive)error.value=humanStorageError(cause)}finally{busy.value=false;emit('busy',false);await nextTick();if(alive&&error.value){errorElement.value?.focus({preventScroll:true});errorElement.value?.scrollIntoView({block:'nearest'})}}}
async function load(){historyError.value='';try{const result=await props.storage.fileImports();if(!alive)return false;entries.value=result.entries;truncated.value=result.truncated;return true}catch(cause){if(alive)historyError.value=humanStorageError(cause);return false}}
const refresh=()=>task('正在读取记录…',async()=>{await load()})
async function readEntry(entry:FileImportSummary){const previous=record.value;try{const next=entry.readable?await props.storage.fileImport(entry.id):{...entry,content:null,digest:null};if(!alive)return;record.value=next;recordReadFailed.value=false}catch(cause){if(!alive)return;recordReadFailed.value=true;record.value={...entry,status:'failed',content:null,digest:null,error:humanStorageError(cause)}}
 if(previous?.id!==record.value.id||previous?.content!==record.value.content){previewMounted.value=false;for(const key of ['review','preview']as View[]){delete positions[key];errors[key]='';messages[key]=''}}
 view.value='review';removing.value=false;actionsOpen.value=false;if(entry.incoming){await props.storage.acknowledgeIncoming(entry.id);record.value.incoming=false;emit('updated')}
 await nextTick();if(body.value)body.value.scrollTop=0;heading.value?.focus({preventScroll:true})
}
async function inspect(entry:FileImportSummary){rememberHistory();await task('正在核对文字…',()=>readEntry(entry))}
async function stage(file?:File, opener?:HTMLElement){
  rememberHistory()
  const position=opener?{...captureTaskPosition(body.value),focus:opener}:null
  let cancelled=false
  await task('正在读取文件…',async()=>{
    const entry=await props.storage.chooseTextImport(file)
    if(!alive)return
    if(entry)await readEntry(entry)
    else cancelled=true
    await load()
  })
  if(cancelled&&alive)restoreTaskPosition(position)
}
function choose(event:MouseEvent){receivedError.value='';if(props.storage.preview)input.value?.click();else void stage(undefined,event.currentTarget as HTMLElement)}
async function picked(event:Event){const target=event.target as HTMLInputElement,file=target.files?.[0];target.value='';if(file)await stage(file)}
async function commit(){const id=record.value?.id;if(id)await task('正在存入手机资料库…',async()=>{const document=await props.storage.commitFileImport(id);if(alive){record.value=await props.storage.fileImport(id);await props.openDocument(document)}})}
async function requestRemoval(){if(busy.value)return;removalPosition=captureTaskPosition(actionsOpen.value?actionsBody.value:body.value);removing.value=true;await nextTick();cancelButton.value?.focus()}
async function cancelRemoval(){removing.value=false;await nextTick();restoreTaskPosition(removalPosition)}
async function backToHistory(){const id=record.value?.id;view.value='history';record.value=null;previewMounted.value=false;removing.value=false;await refresh();await nextTick();restoreTaskRecord(historyPosition,'data-file-import-id',id)}
function back(){if(busy.value)return true;if(removing.value){void cancelRemoval();return true}if(actionsOpen.value){void closeActions();return true}if(view.value==='preview'){positions.preview=captureTaskPosition(body.value);view.value='review';void nextTick(()=>restoreTaskPosition(positions.review||null));return true}if(view.value==='review'&&!props.sourceTask){void backToHistory();return true}return false}
async function remove(){const id=record.value?.id;if(id)await task('正在移除导入记录…',async()=>{await props.storage.removeFileImport(id);record.value=null;previewMounted.value=false;removing.value=false;actionsOpen.value=false;if(!props.sourceTask)view.value='history';await load();emit('updated');message.value='已移除导入记录，源文件和已存入的笔记继续保留。'});if(props.sourceTask&&!record.value){emit('back');return}await nextTick();if(!record.value&&message.value){statusElement.value?.focus({preventScroll:true});statusElement.value?.scrollIntoView({block:'nearest'})}}
const loadInitial=()=>task('正在读取记录…',async()=>{if(!await load()||!alive)return;const initial=entries.value.find(entry=>entry.id===props.initialId);if(initial)await readEntry(initial);else if(props.sourceTask)error.value='这条接收记录已不可用，请返回收到的内容。'})
defineExpose({back,canBack,confirming:removing,title,backLabel,actionsOpen,actionsAvailable,openActions})
onMounted(loadInitial);onBeforeUnmount(()=>{alive=false;emit('busy',false)})
</script>
<style scoped>
.file-import-panel{display:flex;flex:1;min-height:0;flex-direction:column;overflow:hidden;color:var(--ink)}.file-import-panel.is-confirming{display:block;flex:none;overflow:visible}.file-import-panel button{-webkit-tap-highlight-color:transparent}.file-import-body{flex:1;min-height:0;overflow:auto;padding:16px;overscroll-behavior:contain}.file-import-body:focus-visible{outline:2px solid var(--primary);outline-offset:-4px}.file-history-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;color:var(--muted);font-size:.875rem;margin-bottom:8px}.file-import-identity{display:flex;align-items:flex-start;gap:14px;margin:8px 0 24px}.file-import-identity>svg{color:var(--primary);flex-shrink:0;margin-top:5px}.file-import-identity>.file-import-name{min-width:0;flex:1}.file-import-identity h3{margin:0;font-size:1.125rem;line-height:1.5;overflow-wrap:anywhere}.file-import-identity small{display:block;color:var(--muted);font-size:.875rem;line-height:1.5;margin-top:6px}.file-task-row{width:100%;display:flex;align-items:center;gap:14px;min-height:80px;padding:16px 0;text-align:left;border:0;border-bottom:1px solid var(--line);background:none;color:var(--ink)}.file-task-row>svg{flex-shrink:0;color:var(--muted)}.file-task-row>span{min-width:0;flex:1}.file-task-row strong{display:block;overflow-wrap:anywhere;font-size:1rem;font-weight:600;line-height:1.5}.file-task-row small{display:block;overflow-wrap:anywhere;font-size:.875rem;line-height:1.5;color:var(--muted);margin-top:4px}.file-import-destination{margin:24px 0 0}.file-import-destination dt{font-size:.875rem;line-height:1.5;color:var(--muted)}.file-import-destination dd{margin:6px 0 0;font-size:1rem;line-height:1.5}.file-folder-row{margin-top:16px}.file-task-error{background:var(--warning-soft);color:var(--ink);border:1px solid var(--warning-line);border-radius:12px;padding:14px;overflow-wrap:anywhere;font-size:.875rem;line-height:1.7;margin:0 0 16px}.file-task-status{color:var(--muted);font-size:.875rem;line-height:1.6;margin:0 0 16px}.file-import-footer{display:flex;flex-direction:column;flex-shrink:0;gap:8px;padding:12px 16px max(16px,env(safe-area-inset-bottom));border-top:1px solid var(--line)}.file-import-footer .button,.file-import-footer .text-button{margin:0;min-height:48px;width:100%;justify-content:center;font-size:1rem;line-height:1.5;padding:10px 16px;overflow-wrap:anywhere}.file-import-subject{font-size:1rem;line-height:1.5;font-weight:600;overflow-wrap:anywhere;margin:0 0 16px}.file-preview-page{height:100%;min-height:280px;display:flex;flex-direction:column}.file-text-preview{width:100%;min-height:160px;flex:1;resize:none;box-sizing:border-box;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px;font-size:.875rem;line-height:1.8;color:var(--ink)}.file-import-location{margin-top:16px;overflow-wrap:anywhere;font-size:.875rem;line-height:1.7}.file-import-location summary{min-height:48px;align-content:center}.file-import-panel .recovery-source{min-height:0;flex:1}

.file-import-identity{gap:16px;margin:12px 0 28px;align-items:center}.file-import-identity :deep(.phone-file-icon){width:56px;height:56px;flex-basis:56px;border-radius:12px}.file-import-identity :deep(.phone-file-icon>svg){width:32px;height:32px}.file-import-identity h3{font-size:1.125rem;line-height:1.5}.file-import-identity small{margin-top:4px}
.file-import-summary h4{font-size:.9375rem;line-height:1.5;font-weight:500;color:var(--primary);margin:0 0 12px}.file-import-summary>p{font-size:1rem;line-height:1.75;margin:0;white-space:pre-line;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}
.file-preview-link{min-height:56px;padding:12px 0;margin-top:4px;font-size:1rem;line-height:1.5}.file-preview-link>span{flex:1}.file-import-destination{display:flex;align-items:center;gap:16px;min-height:72px;padding:16px 0;margin:12px 0 0;border-bottom:1px solid var(--line);font-size:1rem;line-height:1.5}.file-import-destination dt{font-size:1rem;color:var(--ink);flex:1}.file-import-destination dd{display:flex;align-items:center;gap:12px;min-width:0;margin:0;font-size:1rem}.file-import-destination dd>svg{color:var(--primary);flex:none}.file-import-destination dd>span{min-width:0;overflow-wrap:anywhere}
.file-import-footer{padding:12px 16px max(16px,env(safe-area-inset-bottom))}.file-import-footer .primary-button{border-radius:8px}.file-import-actions{min-height:0;overflow:auto;padding:0 20px 24px}.file-import-actions .file-task-row{min-height:56px;font-size:1rem;line-height:1.5;padding:12px 4px;gap:16px}.file-import-actions .file-task-row:last-child{border:0}.file-import-remove,.file-import-remove>svg{color:var(--file-import-danger,#a43b30)}
:global(.theme-dark .file-import-panel){--file-import-danger:#ffb4a9}
.file-import-body .file-preview-page{min-height:0}.file-import-panel :deep(.recovery-source-search button),.file-import-panel :deep(.recovery-source-search input){min-height:48px;min-width:48px}.file-import-panel :deep(.recovery-source-search){flex-wrap:wrap}
@media(max-width:340px){.file-import-destination{flex-wrap:wrap;gap:8px 16px}.file-import-destination dd{flex-wrap:wrap}.file-import-identity{margin-top:12px}}
.file-text-preview{font-size:1rem;line-height:1.8;padding:0;border:0;border-radius:0;background:transparent}.file-import-subject{font-size:1rem;font-weight:500;color:var(--muted)}
.file-import-panel .inline-actions button:last-child{color:var(--file-import-danger,#a43b30)}
</style>
