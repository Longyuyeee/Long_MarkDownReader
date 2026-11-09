<template>
  <div class="pack-import-panel" :class="{ 'is-confirming': removing }">
    <div v-show="!removing && !actionsOpen" ref="body" class="pack-import-body task-scroll" :inert="removing" tabindex="0" role="region" :aria-label="title">
      <p v-if="error" ref="errorElement" tabindex="-1" role="alert" class="pack-task-error">{{ error }}</p>
      <p v-if="receivedError" role="alert" class="pack-task-error">{{ receivedError }}</p>
      <p v-if="busy || message" role="status" class="pack-task-status">{{ busy ? progress : message }}</p>
      <input v-if="storage.preview" ref="input" type="file" accept=".textpack,.zip,application/zip,application/octet-stream" aria-label="选择附件包文件" hidden @change="picked" />
      <section v-show="view === 'history'" :inert="view !== 'history'">
        <div class="pack-history-toolbar"><span>{{ entries.length }} 份附件包</span><button class="icon-button" :aria-label="historyError ? '重新读取导入记录' : '刷新导入记录'" :disabled="busy" @click="refresh"><RefreshCw :size="20" aria-hidden="true" /></button></div>
        <p v-if="historyError" role="alert" class="pack-task-error">{{ entries.length ? '记录未刷新，仍显示上次读取的列表。' : '导入记录未能读取。' }}{{ historyError }}</p>
        <p v-if="!entries.length && !busy && !historyError" class="pack-task-status">暂无导入记录。</p>
        <button v-for="entry in entries" :key="entry.id" class="pack-task-row pack-record-row" :data-pack-import-id="entry.id" :disabled="busy" @click="inspect(entry)"><FileArchive :size="24" aria-hidden="true" /><span><strong>{{ entry.name }}</strong><small>{{ statusLabel(entry) }} · {{ new Date(entry.created).toLocaleString('zh-CN') }}</small></span><ChevronRight :size="20" aria-hidden="true" /></button>
      </section>
      <section v-if="record" v-show="view === 'review'" :inert="view !== 'review'">
        <div class="pack-import-file"><span class="pack-file-icon" aria-hidden="true"><FileText :size="28" /></span><span class="pack-file-name"><h3 ref="heading" tabindex="-1">{{ record.name }}</h3><small>{{ recordReadFailed ? '附件包读取失败' : record.source === 'picker' ? '来源：选择的附件包' : '来源：收到的内容' }} · {{ recordDate(record.created) }}</small></span></div>
        <p v-if="record.error" role="alert" class="pack-task-error">{{ humanStorageError(record.error) }}</p>
        <template v-if="record.status === 'ready' && record.content !== null">
          <section class="pack-summary"><h3>笔记摘要</h3><p><span>{{ summary }}</span></p><button class="pack-read-full" :disabled="busy" @click="showText">查看全文<ChevronRight :size="20" aria-hidden="true" /></button></section>
          <div class="pack-asset-summary"><ImageIcon :size="25" aria-hidden="true" /><span>{{ imageCount }} 张图片 · {{ record.assets.length - imageCount }} 个附件</span></div>
          <button class="pack-task-row pack-review-row" aria-label="查看正文" :disabled="busy" @click="showText"><FileText :size="24" aria-hidden="true" /><span><strong>正文</strong></span><ChevronRight :size="20" aria-hidden="true" /></button>
          <button class="pack-task-row pack-review-row" :disabled="busy" @click="showAssets"><Paperclip :size="24" aria-hidden="true" /><span><strong>附件清单</strong></span><ChevronRight :size="20" aria-hidden="true" /></button>
        </template>
        <div v-if="record.status === 'ready' || record.status === 'imported'" class="pack-task-row pack-review-row pack-destination"><Folder :size="24" aria-hidden="true" /><span><strong>保存位置</strong></span><span class="pack-destination-value">手机资料库</span></div>
        <details v-if="record.status === 'imported' && record.localPath" class="pack-import-location"><summary>查看笔记位置</summary><p>{{ record.localPath }}</p></details>
      </section>
      <section v-if="record && textMounted" v-show="view === 'text'" class="pack-text-page" :inert="view !== 'text'">
        <h3 class="pack-subject">{{ record.name }}</h3>
        <RecoverySource :storage="storage" v-if="longContent" :key="record.id + record.archiveDigest" :identity="record.id" :content="record.content || ''" label="待导入正文" subject="附件包导入" />
        <textarea v-else id="pack-import-content" aria-label="待导入正文（只读）" class="pack-text-preview" readonly spellcheck="false" :value="record.content"></textarea>
      </section>
      <section v-if="record" v-show="view === 'assets'" :inert="view !== 'assets'">
        <h3 class="pack-subject">{{ record.name }}</h3><p class="pack-task-status">{{ record.assets.length }} 个附件</p>
        <ul class="pack-asset-list" aria-label="待导入附件"><li v-for="asset in record.assets" :key="asset.path"><button v-if="asset.width" class="pack-task-row" :aria-label="`查看包内图片：${asset.path}`" :disabled="busy" @click="preview(asset.path)"><ImageIcon :size="24" aria-hidden="true" /><span><strong>{{ asset.path }}</strong><small>{{ size(asset.bytes) }} · {{ asset.width }} × {{ asset.height }}</small></span><ChevronRight :size="20" aria-hidden="true" /></button><div v-else class="pack-task-row pack-asset-info"><FileText :size="24" aria-hidden="true" /><span><strong>{{ asset.path }}</strong><small>{{ size(asset.bytes) }}</small></span></div></li></ul>
        <p v-if="!record.assets.length" class="pack-task-status">这份包没有附件。</p>
      </section>
      <figure v-if="image" v-show="view === 'image'" class="pack-image-page" :inert="view !== 'image'"><figcaption class="pack-subject">{{ image.path }}</figcaption><p class="pack-task-status">{{ image.width }} × {{ image.height }} · {{ size(image.bytes) }}</p><div class="pack-image-stage"><img :src="image.dataUrl" :alt="`包内图片：${image.path}`" /></div></figure>
      <template v-if="sourceTask && !record && !busy"><p v-if="historyError" role="alert" class="pack-task-error">导入记录未能读取。{{ historyError }}</p><button class="button full-width" @click="loadInitial">重新读取收到的附件包</button></template>
    </div>
    <footer v-show="!removing && !actionsOpen && (view === 'history' || view === 'review')" class="pack-import-footer" :inert="removing">
      <button v-if="view === 'history' && !sourceTask" class="button primary-button" :disabled="busy" @click="choose">选择附件包</button>
      <template v-else-if="view === 'review' && record">
        <button v-if="record.status === 'ready' && record.content !== null" class="button primary-button" aria-label="确认存入：将笔记和附件存入手机资料库" :disabled="busy" @click="commit">确认存入</button>
        <button v-else-if="record.status === 'imported'" class="button primary-button" :disabled="busy" @click="commit">打开已导入笔记</button>
        <button v-else-if="recordReadFailed" class="button primary-button" :disabled="busy" @click="inspect(record)">重新读取附件包</button>
        <button v-else-if="sourceTask && record.status === 'failed'" class="button primary-button" :disabled="busy" @click="inspect(record)">重新核对附件包</button>
      </template>
    </footer>
    <div v-show="actionsOpen && !removing" class="pack-import-actions task-scroll"><button class="pack-task-row pack-remove-action" :disabled="busy" @click="requestRemoval"><Trash2 :size="22" aria-hidden="true" /><span>移除记录</span></button></div>
    <div v-if="removing && record" class="recovery-card" role="group" aria-label="确认移除附件包导入记录"><div><h3>移除这份导入记录？</h3><p>{{ recordReadFailed ? '记录内容暂时无法读取。移除后，其中可能尚未存入的正文和附件也会移除。源文件和已存入的笔记、附件继续保留。' : record.status === 'imported' ? '只移除本机保留的原附件包和这条记录。已经存入的笔记、附件和源文件都保留。' : '移除后无法从这条记录继续。只清理本机暂存包，源文件和已有笔记都保留。' }}</p><div class="inline-actions"><button ref="cancelButton" class="button" :disabled="busy" @click="cancelRemoval">继续保留</button><button class="button" :disabled="busy" @click="remove">确认移除导入记录</button></div></div></div>
    <p v-if="removing && error" role="alert" class="pack-task-error">{{ error }}</p>
  </div>
</template>
<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,reactive,ref,shallowRef} from 'vue'
import {FileArchive,FileText,Paperclip,ChevronRight,RefreshCw,Image as ImageIcon,Folder,Trash2} from 'lucide-vue-next'
import {captureTaskPosition,restoreTaskPosition,restoreTaskRecord,type TaskPosition} from './taskPosition'
import {humanStorageError,type Document,type Storage,type StoredImage} from './storage'
import type {PackImportRecord,PackImportSummary} from './packImport'
import {sourceReadingReason} from './documentBudget'
import RecoverySource from './RecoverySource.vue'
const props=withDefaults(defineProps<{storage:Storage;openDocument:(document:Document)=>Promise<void>;initialId?:string;initialError?:string;sourceTask?:boolean;returnLabel?:string}>(),{returnLabel:'返回设置'})
const emit=defineEmits<{busy:[value:boolean];updated:[];back:[]}>()
type View='history'|'review'|'text'|'assets'|'image'
const view=ref<View>(props.sourceTask?'review':'history'),body=ref<HTMLElement>(),heading=ref<HTMLElement>(),input=ref<HTMLInputElement>(),cancelButton=ref<HTMLButtonElement>(),errorElement=ref<HTMLElement>()
const actionsOpen=ref(false),actionsPosition=ref<TaskPosition|null>(null)
const busy=ref(false),progress=ref(''),removing=ref(false),historyError=ref(''),recordReadFailed=ref(false),textMounted=ref(false),receivedError=ref(props.initialError||'')
const errors=reactive<Record<View,string>>({history:'',review:'',text:'',assets:'',image:''}),messages=reactive<Record<View,string>>({history:'',review:'',text:'',assets:'',image:''})
const error=computed({get:()=>errors[view.value],set:(v:string)=>{errors[view.value]=v}}),message=computed({get:()=>messages[view.value],set:(v:string)=>{messages[view.value]=v}})
const entries=ref<PackImportSummary[]>([]),record=shallowRef<PackImportRecord|null>(null),image=shallowRef<(StoredImage&{path:string})|null>(null)
const actionsAvailable=computed(()=>view.value==='review'&&!!record.value&&!removing.value&&!actionsOpen.value)
async function openActions(){if(busy.value||!actionsAvailable.value)return;actionsPosition.value=captureTaskPosition(body.value);actionsOpen.value=true;await nextTick();focusTitle()}
async function closeActions(){actionsOpen.value=false;await nextTick();restoreTaskPosition(actionsPosition.value);body.value?.closest('.bottom-sheet')?.querySelector<HTMLElement>('[data-focus-key=pack-import-actions]')?.focus({preventScroll:true})}
const title=computed(()=>actionsOpen.value?'附件包操作':({history:'导入记录',review:'核对笔记与附件',text:'正文预览',assets:'附件清单',image:'包内图片'})[view.value])
const backLabel=computed(()=>actionsOpen.value?'返回附件包核对':view.value==='history'?props.returnLabel:view.value==='review'?props.sourceTask?'返回收到的内容':'返回导入记录':view.value==='image'?'返回附件清单':'返回导入核对')
const canBack=computed(()=>actionsOpen.value||removing.value||(!props.sourceTask&&view.value==='review')||view.value==='text'||view.value==='assets'||view.value==='image')
const summary=computed(()=>Array.from((record.value?.content||'').replace(/^\uFEFF/,'').split(/\r?\n\s*\r?\n/)[0]||'（空白正文）').slice(0,240).join(''))
const imageCount=computed(()=>record.value?.assets.filter(asset=>!!asset.width&&!!asset.height).length||0)
function recordDate(created:number){const d=new Date(created);return `${d.toDateString()===new Date().toDateString()?'今天':d.toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})} ${d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}`}
const longContent=computed(()=>!!sourceReadingReason(record.value?.content||''))
const positions:Partial<Record<View,TaskPosition>>={};let historyPosition:TaskPosition|null=null,removalPosition:TaskPosition|null=null,alive=true;const stack:View[]=[]
const size=(bytes:number)=>bytes<1024?`${bytes} B`:`${(bytes/1024).toFixed(1)} KiB`
const statusLabel=(entry:PackImportSummary)=>entry.status==='ready'?'等待核对存入':entry.status==='imported'?'已存入手机资料库':entry.status==='preparing'?'上次读取待核对':'导入尚未完成'
function focusTitle(){body.value?.closest('.bottom-sheet')?.querySelector<HTMLElement>('.sheet-heading h2')?.focus({preventScroll:true})}
async function enter(next:View){if(busy.value)return;positions[view.value]=captureTaskPosition(body.value);stack.push(view.value);view.value=next;await nextTick();if(positions[next])restoreTaskPosition(positions[next]!);else{if(body.value)body.value.scrollTop=0;focusTitle()}}
function showText(){if(!record.value||record.value.content===null)return;textMounted.value=true;void enter('text')}
function showAssets(){void enter('assets')}
function rememberHistory(){if(view.value==='history')historyPosition=captureTaskPosition(body.value)}
async function task(text:string,action:()=>Promise<void>){if(busy.value)return;busy.value=true;emit('busy',true);progress.value=text;error.value='';message.value='';try{await action()}catch(cause){if(alive)error.value=humanStorageError(cause)}finally{busy.value=false;emit('busy',false);await nextTick();if(alive&&error.value){errorElement.value?.focus({preventScroll:true});errorElement.value?.scrollIntoView({block:'nearest'})}}}
async function load(){historyError.value='';try{const result=await props.storage.packImports();if(!alive)return false;entries.value=result.entries;return true}catch(cause){if(alive)historyError.value=humanStorageError(cause);return false}}
const refresh=()=>task('正在读取导入记录…',async()=>{await load()})
async function select(entry:PackImportSummary){
 const retained=entry.status==='ready'||entry.status==='preparing'||(recordReadFailed.value&&record.value?.id===entry.id),previous=record.value
 try{const next=entry.readable?await props.storage.packImport(entry.id):{...entry,content:null,textName:'',assets:[],archiveDigest:''};if(!alive)return;record.value=next;recordReadFailed.value=retained&&next.status==='failed'}catch(cause){if(!alive)return;recordReadFailed.value=true;record.value={...entry,status:'failed',error:humanStorageError(cause),content:null,textName:'',assets:[],archiveDigest:''}}
 if(previous?.id!==record.value.id||previous?.content!==record.value.content){textMounted.value=false;for(const key of ['review','text','assets','image']as View[]){delete positions[key];errors[key]='';messages[key]=''}}
 view.value='review';stack.length=0;image.value=null;removing.value=false
 if(entry.incoming){await props.storage.acknowledgeIncoming(entry.id,'pack');emit('updated')}
 await nextTick();if(body.value)body.value.scrollTop=0;heading.value?.focus({preventScroll:true})
}
const inspect=(entry:PackImportSummary)=>{rememberHistory();return task('正在核对正文和附件…',()=>select(entry))}
async function stage(file?:File){rememberHistory();await task('正在读取并核对整个附件包…',async()=>{const entry=await props.storage.choosePackImport(file);if(alive&&entry){await select(entry);message.value=''}await load()})}
function choose(){receivedError.value='';if(props.storage.preview)input.value?.click();else void stage()}
async function picked(event:Event){const target=event.target as HTMLInputElement,file=target.files?.[0];target.value='';if(file)await stage(file)}
async function preview(path:string){const id=record.value?.id;if(!id)return;const position=captureTaskPosition(body.value);await task('正在读取包内图片…',async()=>{const value=await props.storage.packImportImage(id,path);if(!alive)return;positions.assets=position;stack.push('assets');image.value={...value,path};view.value='image';await nextTick();if(body.value)body.value.scrollTop=0;focusTitle()})}
async function commit(){const id=record.value?.id;if(id)await task('正在将整份笔记和附件存入独立文件夹…',async()=>{const document=await props.storage.commitPackImport(id);if(alive){record.value=await props.storage.packImport(id);await props.openDocument(document)}})}
async function requestRemoval(){if(busy.value)return;removalPosition=captureTaskPosition(body.value?.parentElement?.querySelector<HTMLElement>('.pack-import-actions')||body.value);removing.value=true;await nextTick();cancelButton.value?.focus()}
async function cancelRemoval(){removing.value=false;await nextTick();restoreTaskPosition(removalPosition)}
async function backToHistory(){const id=record.value?.id;view.value='history';record.value=null;image.value=null;textMounted.value=false;removing.value=false;stack.length=0;await refresh();await nextTick();restoreTaskRecord(historyPosition,'data-pack-import-id',id)}
function back(){if(busy.value)return true;if(removing.value){void cancelRemoval();return true}if(actionsOpen.value){void closeActions();return true}if(stack.length){positions[view.value]=captureTaskPosition(body.value);if(view.value==='image')image.value=null;view.value=stack.pop()!;void nextTick(()=>restoreTaskPosition(positions[view.value]||null));return true}if(view.value==='review'&&!props.sourceTask){void backToHistory();return true}return false}
async function remove(){const id=record.value?.id;if(id)await task('正在清理本机导入记录…',async()=>{await props.storage.removePackImport(id);record.value=null;image.value=null;textMounted.value=false;removing.value=false;stack.length=0;view.value='history';actionsOpen.value=false;await load();emit('updated');message.value='导入记录已移除，源文件和已存入的笔记、附件仍保留。'});if(props.sourceTask&&!record.value)emit('back')}
const loadInitial=()=>task('正在读取导入记录…',async()=>{if(!await load()||!alive)return;const initial=entries.value.find(entry=>entry.id===props.initialId);if(initial)await select(initial);else if(props.sourceTask)error.value='这条接收记录已不可用，请返回收到的内容。'})
defineExpose({back,canBack,confirming:removing,title,backLabel,actionsOpen,actionsAvailable,openActions})
onMounted(loadInitial);onBeforeUnmount(()=>{alive=false;emit('busy',false)})
</script>
<style scoped>
.pack-import-panel{display:flex;flex:1;min-height:0;flex-direction:column;overflow:hidden;color:var(--ink)}.pack-import-panel.is-confirming{display:block;flex:none;overflow:visible}.pack-import-panel button{-webkit-tap-highlight-color:transparent}.pack-import-body{flex:1;min-height:0;overflow:auto;padding:16px;overscroll-behavior:contain;outline:none}.pack-history-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;color:var(--muted);font-size:.875rem;margin-bottom:8px}.pack-import-file{display:flex;align-items:flex-start;gap:14px;margin:8px 0 24px}.pack-import-file>svg{color:var(--primary);flex-shrink:0;margin-top:5px}.pack-import-file>span{min-width:0;flex:1}.pack-import-file h3{margin:0;font-size:1.125rem;line-height:1.5;overflow-wrap:anywhere}.pack-import-file small{display:block;color:var(--muted);font-size:.875rem;line-height:1.5;margin-top:6px}.pack-task-row{width:100%;display:flex;align-items:center;gap:14px;min-height:80px;padding:16px 0;text-align:left;border:0;border-bottom:1px solid var(--line);background:none;color:var(--ink)}.pack-task-row>svg{flex-shrink:0;color:var(--muted)}.pack-task-row>span{min-width:0;flex:1}.pack-task-row strong{display:block;overflow-wrap:anywhere;font-size:1rem;font-weight:600;line-height:1.5}.pack-task-row small{display:block;overflow-wrap:anywhere;font-size:.875rem;line-height:1.5;color:var(--muted);margin-top:4px}.pack-import-destination{margin:24px 0 0}.pack-import-destination dt{font-size:.875rem;line-height:1.5;color:var(--muted)}.pack-import-destination dd{margin:6px 0 0;font-size:1rem;line-height:1.5}.pack-task-error{background:var(--warning-soft);color:var(--warning-ink);border:1px solid var(--warning-line);border-radius:12px;padding:14px;overflow-wrap:anywhere;font-size:.875rem;line-height:1.7;margin:0 0 16px}.pack-task-status{color:var(--muted);font-size:.875rem;line-height:1.6;margin:0 0 16px}.pack-import-footer{display:flex;flex-direction:column;flex-shrink:0;gap:8px;padding:12px 16px max(16px,env(safe-area-inset-bottom));border-top:1px solid var(--line)}.pack-import-footer .button,.pack-import-footer .text-button{margin:0;min-height:48px;width:100%;justify-content:center;font-size:1rem;line-height:1.5;padding:10px 16px;overflow-wrap:anywhere}.pack-subject{font-size:1rem;line-height:1.5;font-weight:600;overflow-wrap:anywhere;margin:0 0 16px}.pack-text-page{height:100%;min-height:280px;display:flex;flex-direction:column}.pack-text-preview{width:100%;min-height:160px;flex:1;resize:none;box-sizing:border-box;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px;font-size:.875rem;line-height:1.8;color:var(--ink)}.pack-asset-list{list-style:none;margin:0;padding:0}.pack-asset-info{cursor:default}.pack-image-page{margin:0}.pack-image-stage{display:grid;place-items:center;min-height:200px;border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:16px}.pack-image-stage img{max-width:100%;max-height:360px;object-fit:contain}.pack-import-location{margin-top:16px;overflow-wrap:anywhere;font-size:.875rem;line-height:1.7}.pack-import-location summary{min-height:48px;align-content:center}.pack-import-panel .recovery-source{min-height:0;flex:1}
.pack-import-body:focus-visible{outline:2px solid var(--primary);outline-offset:-4px}
.pack-import-file{align-items:center;margin:8px 0 20px;padding-bottom:20px;border-bottom:1px solid var(--line);gap:14px}.pack-import-file>.pack-file-icon{flex:0 0 52px;width:52px;height:52px;display:grid;place-items:center;background:var(--panel);border-radius:12px;color:var(--muted)}.pack-import-file>.pack-file-name{min-width:0;flex:1}.pack-summary>h3{font-size:1.125rem;line-height:1.5;margin:0 0 8px}.pack-summary>p{margin:0;padding:12px 16px;border-radius:12px;background:var(--panel);font-size:1rem;line-height:1.65;overflow-wrap:anywhere}.pack-summary>p>span{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.pack-read-full{display:flex;align-items:center;gap:4px;min-height:48px;padding:8px 4px;color:var(--primary);font-size:1rem;font-weight:600;background:none;border:0}.pack-asset-summary{display:flex;align-items:center;gap:12px;padding:12px 16px;min-height:52px;border-radius:12px;background:var(--primary-soft);font-size:1rem;line-height:1.5;margin:8px 0 16px}.pack-asset-summary svg{color:var(--primary);flex:none}.pack-review-row{min-height:56px;padding:12px 4px}.pack-destination>.pack-destination-value{flex:0 1 auto;max-width:50%;color:var(--muted);font-size:.875rem;text-align:right}.pack-import-footer{border:0;padding-top:16px}.pack-import-actions{padding:0 16px 16px;overflow:auto;min-height:0}.pack-import-actions .pack-task-row{min-height:64px;font-size:1rem}.pack-remove-action{color:#a43b30}.pack-remove-action>svg{color:inherit}:global(.theme-dark .pack-remove-action){color:#ffb4a9}.pack-import-actions .pack-task-row{border:0}
.pack-import-panel .recovery-card .button:last-child{color:#a43b30}:global(.theme-dark .pack-import-panel .recovery-card .button:last-child){color:#ffb4a9}
</style>
