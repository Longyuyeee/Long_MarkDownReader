<template>
  <section ref="task" class="text-export-task">
    <div v-show="view!=='preview'" ref="reviewBody" class="text-export-body task-scroll" :class="{'is-result':complete}" tabindex="0" role="region" :aria-label="complete?'导出结果':'导出核对内容'">
      <template v-if="complete">
        <div class="text-export-result"><span class="text-export-success-icon" aria-hidden="true"><Check :size="34" :stroke-width="3" /></span><h3 ref="resultHeading" tabindex="-1">{{ storage.preview?'已发起下载':'副本已导出' }}</h3><p>{{ storage.preview?'请在浏览器下载记录中核对文件。':'文件已保存到所选位置。' }}</p></div>
        <div class="text-export-result-details"><div><FileText :size="25" aria-hidden="true" /><dl><dt>{{ storage.preview?'建议文件名':'文件名' }}</dt><dd>{{ displayedName }}</dd></dl></div><div><Folder :size="25" aria-hidden="true" /><dl><dt>位置</dt><dd>{{ storage.preview?'浏览器下载记录':'系统所选位置' }}</dd></dl></div></div>
      </template>
      <template v-else>
        <div class="text-export-file"><span class="text-export-file-icon" aria-hidden="true"><FileText :size="28" /></span><span class="text-export-file-name"><strong>{{ snapshot.relativePath.split('/').pop() }}</strong><small>{{ metadata }} · {{ libraryName }}</small></span></div>
        <section class="text-export-summary"><h3>预览</h3><div><div class="text-export-summary-lines"><strong v-if="snippetTitle">{{ snippetTitle }}</strong><p>{{ snippetBody || (snippetTitle?'':'（空白正文）') }}</p></div></div></section>
        <button ref="previewButton" class="text-export-preview-row" :disabled="busy" @click="showPreview"><span class="text-export-row-icon" aria-hidden="true"><AlignLeft :size="22" /></span><span><strong>完整内容</strong><small>导出文件包含全部内容</small></span><ChevronRight :size="20" aria-hidden="true" /></button>
        <div class="text-export-output"><span class="text-export-row-icon" aria-hidden="true"><PencilLine :size="22" /></span><dl><dt>建议文件名</dt><dd>{{ displayedName }}</dd></dl></div>
        <p v-if="snapshot.dirty" class="text-export-warning">包含未保存内容；原笔记仍需保存。</p>
      </template>
      <p v-if="error" ref="errorMessage" class="text-export-error" tabindex="-1" role="alert">{{ error }}</p>
      <p v-if="status" ref="statusMessage" class="text-export-status" tabindex="-1" role="status">{{ status }}</p>
      <button v-if="error||retained" class="button text-export-recovery" :disabled="busy" @click="emit('recovery')">查看保存恢复记录</button>
    </div>
    <div v-if="previewMounted" v-show="view==='preview'" ref="previewBody" class="text-export-body text-export-preview-body task-scroll" tabindex="0" role="region" aria-label="完整导出文字">
      <div class="text-export-preview-context"><strong>{{ displayedName }}</strong><small>{{ metadata }}</small></div>
      <p v-if="!snapshot.content" class="text-export-empty">这份副本没有文字</p>
      <RecoverySource :storage="storage" v-else-if="longContent" :identity="'text-export:'+snapshot.recoveryId" :content="snapshot.content" label="导出文字预览" subject="导出" />
      <textarea v-else id="text-export-preview" aria-label="导出文字预览" readonly spellcheck="false" :value="snapshot.content" />
    </div>
    <footer v-show="view!=='preview'" class="text-export-footer" :class="{'has-result':complete}"><template v-if="complete"><button class="button primary-button" aria-label="完成，返回文档" @click="emit('close')">完成</button><button ref="resultPreviewButton" class="button text-export-result-preview" aria-label="查看内容：完整文字" @click="showPreview">查看内容</button></template><button v-else ref="exportButton" class="button primary-button" :disabled="busy" :aria-busy="busy" @click="exportText">{{ actionLabel }}</button></footer>
  </section>
</template>
<script setup lang="ts">
import {computed,nextTick,ref} from 'vue'
import {Check,FileText,AlignLeft,ChevronRight,PencilLine,Folder} from 'lucide-vue-next'
import RecoverySource from './RecoverySource.vue'
import {sourceReadingReason} from './documentBudget'
import {humanStorageError,type Storage} from './storage'
import {textExportName,type TextExportSnapshot} from './textExport'
const props=defineProps<{storage:Storage;snapshot:TextExportSnapshot;libraryName:string}>(),emit=defineEmits<{busy:[value:boolean];recovery:[];close:[]}>()
const task=ref<HTMLElement>(),reviewBody=ref<HTMLElement>(),previewBody=ref<HTMLElement>(),previewButton=ref<HTMLButtonElement>(),resultPreviewButton=ref<HTMLButtonElement>(),resultHeading=ref<HTMLElement>(),exportButton=ref<HTMLButtonElement>(),errorMessage=ref<HTMLElement>(),statusMessage=ref<HTMLElement>()
const busy=ref(false),complete=ref(false),retained=ref(false),error=ref(''),status=ref(''),view=ref<'review'|'preview'>('review'),previewMounted=ref(false)
const outputName=computed(()=>textExportName(props.snapshot.relativePath)),longContent=computed(()=>!!sourceReadingReason(props.snapshot.content))
const snippet=computed(()=>Array.from(props.snapshot.content.replace(/^\uFEFF/,'').slice(0,480)).slice(0,240).join('')),snippetTitle=computed(()=>snippet.value.split(/\r\n|\r|\n/)[0]),snippetBody=computed(()=>snippet.value.split(/\r\n|\r|\n/).slice(1).join('\n').trim())
const exportedName=ref<string|null>(null)
const displayedName=computed(()=>complete.value&&!props.storage.preview?exportedName.value||'系统未提供文件名':outputName.value)
const metadata=computed(()=>{const extension=props.snapshot.relativePath.split('.').pop()?.toLowerCase()||'txt',format=({md:'Markdown',txt:'纯文字',json:'JSON',yaml:'YAML',yml:'YAML',xml:'XML',toml:'TOML'} as Record<string,string>)[extension]||extension.toUpperCase(),bytes=new TextEncoder().encode(props.snapshot.content).length;return `${format} · ${bytes<1024?bytes+' B':(bytes/1024).toFixed(1)+' KiB'}`})
const title=computed(()=>view.value==='preview'?'文字预览':complete.value?'导出结果':'导出副本'),backLabel=computed(()=>view.value==='preview'?complete.value?'返回导出结果':'返回导出核对':'返回文档'),actionLabel=computed(()=>busy.value?'正在等待导出结果…':props.storage.preview?error.value?'重试下载':'下载副本':error.value?'重新选择位置导出':'选择位置并导出')
let reviewScroll=0,previewScroll=0
function focusTitle(){const heading=task.value?.closest('.bottom-sheet')?.querySelector<HTMLElement>('.sheet-heading h2');heading?.focus({preventScroll:true})}
async function showPreview(){if(busy.value)return;reviewScroll=reviewBody.value?.scrollTop||0;previewMounted.value=true;view.value='preview';await nextTick();focusTitle();if(previewBody.value)previewBody.value.scrollTop=previewScroll}
function back(){if(busy.value)return true;if(view.value!=='preview')return false;previewScroll=previewBody.value?.scrollTop||0;view.value='review';void nextTick(()=>{(complete.value?resultPreviewButton.value:previewButton.value)?.focus({preventScroll:true});if(reviewBody.value)reviewBody.value.scrollTop=reviewScroll});return true}
async function exportText(){
  if(busy.value||complete.value)return
  busy.value=true;emit('busy',true);error.value='';status.value='正在保护导出内容…'
  let cancelled=false
  try{const result=await props.storage.exportDocument(props.snapshot);retained.value=!!result.retained;complete.value=!!result.exported;cancelled=!!result.cancelled;exportedName.value=complete.value&&typeof result.displayName==='string'&&result.displayName.length<=1024&&result.displayName.trim()?result.displayName:null;status.value=complete.value?'':result.cancelled?'已取消导出。':'导出未完成，可重试。';if(result.retained)status.value+=(status.value?' ':'')+'导出恢复记录仍保留。'}
  catch(failure){status.value='';error.value=humanStorageError(failure)}
  finally{busy.value=false;emit('busy',false);await nextTick();if(complete.value){if(reviewBody.value)reviewBody.value.scrollTop=0;resultHeading.value?.focus({preventScroll:true})}else if(error.value){errorMessage.value?.focus({preventScroll:true});errorMessage.value?.scrollIntoView({block:'nearest'})}else if(cancelled)exportButton.value?.focus({preventScroll:true});else statusMessage.value?.focus({preventScroll:true})}
}
defineExpose({back,title,backLabel})
</script>
<style scoped>
.text-export-task{--text-export-error-bg:#fff0da;--text-export-error-ink:#765529;--text-export-error-line:#d8b785;display:flex;flex-direction:column;flex:1;min-height:0;color:var(--ink);overflow:hidden}.text-export-body{flex:1;min-height:0;overflow:auto;padding:16px;overscroll-behavior:contain}.text-export-file{display:flex;align-items:center;gap:12px;min-height:80px;padding:14px 16px;background:var(--surface);border:1px solid var(--line);border-radius:12px}.text-export-file>svg{flex:none;color:var(--primary)}.text-export-file>span{min-width:0}.text-export-file strong{display:block;font-size:1rem;font-weight:650;line-height:1.5;overflow-wrap:anywhere}.text-export-file small{display:block;margin-top:4px;font-size:.875rem;line-height:1.5;color:var(--muted)}
.text-export-output{margin:24px 0 0}.text-export-output dt{color:var(--muted);font-size:.875rem;line-height:1.5}.text-export-output dd{white-space:pre-wrap;margin:6px 0 0;font-size:1rem;font-weight:600;line-height:1.6;overflow-wrap:anywhere}.text-export-preview-row{display:flex;align-items:center;gap:12px;width:100%;min-height:80px;padding:14px 16px;margin-top:20px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink);text-align:left}.text-export-preview-row>svg:first-child{flex:none;color:var(--primary)}.text-export-preview-row>span:not(.text-export-row-icon){flex:1;min-width:0}.text-export-preview-row strong{display:block;font-size:1rem;line-height:1.5;font-weight:600}.text-export-preview-row small{display:block;margin-top:4px;font-size:.875rem;line-height:1.5;color:var(--muted)}.text-export-preview-row>svg:last-child{flex:none;color:var(--muted)}.text-export-preview-row:active{background:var(--panel)}
.text-export-warning,.text-export-status,.text-export-error{margin:16px 0 0;padding:12px;border:1px solid var(--line);border-radius:12px;font-size:.875rem;line-height:1.6;overflow-wrap:anywhere}.text-export-warning{background:var(--primary-soft);color:var(--ink)}.text-export-status{color:var(--muted);padding:0;border:0}.text-export-error{background:var(--text-export-error-bg);color:var(--text-export-error-ink);border-color:var(--text-export-error-line)}.text-export-recovery{width:100%;min-height:48px;margin-top:16px;font-size:.875rem;line-height:1.6}
.text-export-footer{display:flex;flex:none;padding:12px 16px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--bg);max-height:45dvh;overflow:auto}.text-export-footer>.button{flex:1;width:100%;min-height:48px;padding:11px 10px;border-radius:10px;font-size:.875rem;line-height:1.7142857143;font-weight:400}
.text-export-preview-body{display:flex;flex-direction:column;gap:16px}.text-export-preview-context{flex:none;min-width:0}.text-export-preview-context strong{display:block;font-size:1rem;line-height:1.5;font-weight:600;overflow-wrap:anywhere}.text-export-preview-context small{display:block;margin-top:4px;font-size:.875rem;line-height:1.5;color:var(--muted)}#text-export-preview{display:block;flex:1;width:100%;min-height:160px;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink);resize:none;font:inherit;font-size:1rem;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}.text-export-empty{flex:1;display:grid;place-items:center;text-align:center;color:var(--muted);font-size:1rem;line-height:1.6;min-height:120px;margin:0}
.text-export-result{padding:8px 0 24px;display:flex;flex-direction:column;align-items:center;text-align:center}.text-export-result>svg{color:var(--primary)}.text-export-result h3{font-size:1.25rem;line-height:1.5;letter-spacing:normal;margin:12px 0 0}.text-export-result p{font-size:.875rem;line-height:1.6;margin:8px 0 0;color:var(--muted)}.text-export-task :deep(button){-webkit-tap-highlight-color:transparent}
:global(.theme-dark .text-export-task){--text-export-error-bg:#4b3829;--text-export-error-ink:#ffce87;--text-export-error-line:#8a6744}
@media(max-height:400px){.text-export-body{padding:12px}.text-export-footer{padding:8px 12px}.text-export-footer>.button{font-size:.75rem;line-height:1.5;padding:8px 6px}.text-export-result{padding:4px 0 16px}}

.text-export-file{padding:8px 0;margin-bottom:24px;min-height:64px;background:none;border:0;border-radius:0;gap:14px}.text-export-file>.text-export-file-icon{display:grid;place-items:center;flex:0 0 52px;width:52px;height:52px;border-radius:12px;background:var(--panel);color:var(--muted)}.text-export-file>.text-export-file-name{flex:1;min-width:0}.text-export-file strong{font-size:1.125rem}.text-export-summary>h3{margin:0 0 8px;font-size:.875rem;line-height:1.5;color:var(--muted);font-weight:500}.text-export-summary>div{padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--surface);font-size:1rem;line-height:1.65;overflow-wrap:anywhere}.text-export-summary-lines{display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}.text-export-summary strong{display:block}.text-export-summary p{margin:8px 0 0;white-space:pre-wrap}.text-export-summary p:empty{display:none}.text-export-preview-row{margin-top:24px;padding:14px 4px;min-height:80px;border:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);border-radius:0;background:none}.text-export-output{display:flex;align-items:center;gap:12px;margin:0;padding:16px 4px;border-bottom:1px solid var(--line)}.text-export-output>svg{flex:none;color:var(--primary)}.text-export-row-icon{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;border-radius:10px;background:var(--primary-soft);color:var(--primary)}.text-export-output>dl{margin:0;min-width:0;flex:1}.text-export-output dt{font-size:1rem;font-weight:600;color:var(--ink)}.text-export-output dd{font-weight:400;font-size:.875rem;margin-top:4px;color:var(--muted)}.text-export-footer{max-height:none;border:0;padding:16px 16px max(16px,env(safe-area-inset-bottom))}.text-export-footer>.button{font-size:1rem;font-weight:600;line-height:1.5;min-height:48px;padding:12px}.text-export-footer.has-result{flex-direction:column;gap:12px}.text-export-result{padding:72px 0 28px}.text-export-success-icon{display:grid;place-items:center;width:60px;height:60px;background:#159936;color:white;border-radius:50%}.text-export-result h3{font-size:1.75rem;line-height:1.4;margin:20px 0 0}.text-export-result p{font-size:1rem;line-height:1.6;margin-top:12px}.text-export-result-details{margin:0;border:1px solid var(--line);border-radius:12px;padding:0 16px}.text-export-result-details>div{display:flex;gap:14px;align-items:center;padding:16px 0;min-height:80px}.text-export-result-details>div+div{border-top:1px solid var(--line)}.text-export-result-details svg{flex:none;color:var(--muted)}.text-export-result-details dl{margin:0;min-width:0;flex:1}.text-export-result-details dt{font-size:1rem;line-height:1.5;font-weight:600}.text-export-result-details dd{margin:4px 0 0;font-size:.875rem;line-height:1.6;color:var(--muted);overflow-wrap:anywhere}.text-export-result-preview{color:var(--primary);border-color:var(--primary);background:transparent}
@media(max-height:600px){.text-export-result{padding-top:24px}.text-export-footer.has-result{gap:8px}}
@media(max-width:340px){
  .text-export-file{margin-bottom:14px}
  .text-export-file strong{font-size:1rem}
  .text-export-summary-lines{-webkit-line-clamp:4}
  .text-export-result{padding:8px 0 16px}
  .text-export-result h3{font-size:1.5rem;margin-top:12px}
  .text-export-result p{font-size:.875rem;margin-top:8px}
  .text-export-success-icon{width:52px;height:52px}
}
</style>
