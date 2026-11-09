<template>
  <section class="draft-review">
    <header class="draft-heading"><button class="icon-button" :aria-label="preview?'返回草稿核对':returnLabel" :disabled="busy" @click="back() || emit('close')"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 ref="heading" tabindex="-1" :aria-label="preview ? undefined : '未保存草稿'"><template v-if="preview">完整内容</template><template v-else><span>未保存</span><wbr><span>草稿</span></template></h1><MobileHelp topic="draft" /></header>
    <div v-show="!preview" ref="body" class="draft-body task-scroll" tabindex="0" role="region" aria-label="草稿核对内容">
      <div class="draft-file"><span aria-hidden="true"><FileText :size="28" /></span><div><h2>{{ source.relativePath }}</h2><p>{{ libraryName }}</p></div></div>
      <p v-if="sourceError" class="draft-warning" role="status">原资料暂不可用。{{ humanStorageError(sourceError) }}</p><p v-else-if="changed" class="draft-warning" role="status">原文件已变化。继续编辑后，保存时会重新核对。</p>
      <div v-if="canRead" class="draft-tabs" role="tablist" aria-label="核对原文件与草稿" @keydown="tabKeydown"><button v-for="v in versions" :id="'draft-'+v+'-tab'" :key="v" role="tab" :aria-selected="version===v" :tabindex="version===v?0:-1" :aria-controls="'draft-'+v+'-panel'" :disabled="busy" @click="selectVersion(v)">{{ label(v) }}</button></div>
      <p v-else-if="isNew" class="draft-only">新笔记 · 尚未保存</p>
      <p class="draft-time">{{ version==='draft'?'草稿时间：':'修改时间：' }}{{ date(version==='draft'?draft.updated:source.modified) }}</p>
      <div v-for="v in versions" :id="'draft-'+v+'-panel'" :key="v" v-show="version===v" :inert="version!==v" class="draft-inline" :role="canRead?'tabpanel':undefined" :aria-labelledby="canRead?'draft-'+v+'-tab':undefined"><p v-if="long(v)" class="draft-excerpt">{{ excerpt(v) }}</p><textarea v-else readonly spellcheck="false" :aria-label="label(v)+'核对'" :value="text(v)" /></div>
      <button ref="fullButton" class="draft-read-full" :disabled="busy" @click="showPreview">查看完整内容<ChevronRight :size="20" aria-hidden="true" /></button>
    </div>
    <div v-for="v in previewMounted" :key="v" v-show="preview && version===v" :inert="!preview||version!==v" :ref="e=>previewBodies[v]=e as HTMLElement" class="draft-body draft-preview task-scroll" tabindex="0" role="region" :aria-label="label(v)+'完整内容'"><div class="draft-preview-context"><strong>{{ source.relativePath }}</strong><small>{{ label(v) }}</small></div><RecoverySource v-if="long(v)" :storage="storage" :identity="'draft-review:'+identityKey(source)+':'+draft.revision+':'+v" :content="text(v)" :label="label(v)+'完整内容'" subject="草稿核对" /><textarea v-else readonly spellcheck="false" :aria-label="label(v)+'完整内容'" :value="text(v)" /></div>
    <footer v-show="!preview" class="draft-footer"><button v-show="version==='draft'" class="button primary-button" :disabled="busy" @click="emit('continue')">继续这份草稿</button><button v-if="canRead" v-show="version==='original'" ref="readButton" class="button primary-button draft-read-original" :disabled="busy" @click="readOriginal">先阅读文件</button></footer>
  </section>
</template>
<script setup lang="ts">
import {computed,nextTick,ref} from 'vue'
import {ArrowLeft,FileText,ChevronRight} from 'lucide-vue-next'
import MobileHelp from './MobileHelp.vue'
import RecoverySource from './RecoverySource.vue'
import {sourceReadingReason} from './documentBudget'
import {humanStorageError,identityKey,type Storage,type Document,type Draft} from './storage'
import {captureTaskPosition,restoreTaskPosition,type TaskPosition} from './taskPosition'
const props=defineProps<{source:Document;draft:Draft;sourceError:string;libraryName:string;returnLabel:string;busy:boolean;storage:Storage}>(),emit=defineEmits<{continue:[];read:[];close:[]}>()
type Version='original'|'draft'
const version=ref<Version>('draft'),preview=ref(false),previewMounted=ref<Version[]>([]),heading=ref<HTMLElement>(),body=ref<HTMLElement>(),fullButton=ref<HTMLButtonElement>(),readButton=ref<HTMLButtonElement>()
const previewBodies:Partial<Record<Version,HTMLElement>>={},previewPositions:Partial<Record<Version,TaskPosition>>={}
const versionScroll:Partial<Record<Version,number>>={}
let reviewPosition:TaskPosition|null=null,readPosition:TaskPosition|null=null
const canRead=computed(()=>props.source.signature!==null&&!props.sourceError),isNew=computed(()=>!props.sourceError&&props.source.signature===null&&props.draft.expectedSignature===null),changed=computed(()=>canRead.value&&props.source.signature!==props.draft.expectedSignature),versions=computed<Version[]>(()=>canRead.value?['original','draft']:['draft'])
const label=(v:Version)=>v==='original'?'原文件':'未保存草稿',text=(v:Version)=>v==='original'?props.source.content:props.draft.content,long=(v:Version)=>!!sourceReadingReason(text(v)),excerpt=(v:Version)=>Array.from(text(v).slice(0,480)).slice(0,240).join('')
function date(value:number) {
  if (!(value > 0)) return '未提供时间'
  const timestamp = new Date(value)
  const year = timestamp.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  return timestamp.toLocaleString('zh-CN',{year,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})
}
function selectVersion(next:Version) {
  const container = body.value
  if (!container || next === version.value) return
  versionScroll[version.value] = container.scrollTop
  version.value = next
  void nextTick(() => { container.scrollTop = versionScroll[next] ?? 0 })
}
function tabKeydown(e:KeyboardEvent){if(props.busy||!canRead.value||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();selectVersion(e.key==='Home'?'original':e.key==='End'?'draft':version.value==='draft'?'original':'draft');void nextTick(()=>body.value?.querySelector<HTMLElement>('#draft-'+version.value+'-tab')?.focus())}
async function showPreview(){if(props.busy)return;reviewPosition=captureTaskPosition(body.value);if(!previewMounted.value.includes(version.value))previewMounted.value.push(version.value);preview.value=true;await nextTick();restoreTaskPosition(previewPositions[version.value]||null);if(!previewPositions[version.value])heading.value?.focus({preventScroll:true})}
function back(){if(props.busy)return true;if(!preview.value)return false;previewPositions[version.value]=captureTaskPosition(previewBodies[version.value]);preview.value=false;void nextTick(()=>{restoreTaskPosition(reviewPosition);fullButton.value?.focus({preventScroll:true})});return true}
function readOriginal(){readPosition=captureTaskPosition(body.value);emit('read')}
async function resume(){await nextTick();restoreTaskPosition(readPosition);readButton.value?.focus({preventScroll:true})}
defineExpose({back,resume})
</script>
<style scoped>
.draft-review{display:flex;flex:1;min-height:0;flex-direction:column;overflow:hidden;color:var(--ink)}.draft-heading{display:flex;flex:none;align-items:center;gap:8px;min-height:64px;padding:8px;border-bottom:1px solid var(--line)}.draft-heading h1{flex:1;min-width:0;margin:0;font-size:1.25rem;line-height:1.5;overflow-wrap:anywhere}.draft-heading .icon-button{flex:none}.draft-body{flex:1;min-height:0;padding:16px;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column}.draft-body:focus-visible{outline:2px solid var(--primary);outline-offset:-4px}.draft-file{display:flex;gap:14px;align-items:center;margin:8px 0 16px;flex:none}.draft-file>span{display:grid;place-items:center;flex:0 0 52px;height:52px;background:var(--panel);color:var(--muted);border-radius:12px}.draft-file>div{flex:1;min-width:0}.draft-file h2{margin:0;font-size:1.125rem;line-height:1.5;font-weight:650;overflow-wrap:anywhere}.draft-file p{margin:4px 0 0;font-size:.875rem;line-height:1.6;color:var(--muted)}.draft-warning{flex:none;margin:0 0 12px;padding:12px;border:1px solid var(--warning-line);border-radius:12px;background:var(--warning-soft);color:var(--ink);font-size:.875rem;line-height:1.6;overflow-wrap:anywhere}
.draft-tabs{display:flex;flex:none;border-bottom:1px solid var(--line);margin:8px 0 20px}.draft-tabs button{position:relative;flex:1;min-width:0;min-height:56px;padding:12px 8px;font:inherit;font-size:1rem;line-height:1.5;background:none;border:0;color:var(--muted);overflow-wrap:anywhere}.draft-tabs [aria-selected=true]{font-weight:700;color:var(--primary)}.draft-tabs [aria-selected=true]:after{content:'';position:absolute;bottom:0;left:8px;right:8px;height:3px;border-radius:3px;background:var(--primary)}.draft-time{flex:none;font-size:.875rem;line-height:1.6;color:var(--muted);margin:0 0 8px}.draft-only{font-size:1rem;line-height:1.5;margin:8px 0 16px;font-weight:600}.draft-inline{display:flex;flex:1;min-height:220px}.draft-inline textarea,.draft-preview>textarea{flex:1;min-height:160px;width:100%;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink);font:inherit;font-size:1rem;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere;resize:none}.draft-excerpt{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid var(--line);border-radius:12px;padding:14px;margin:0;font-size:1rem;line-height:1.75;background:var(--surface)}.draft-read-full{display:flex;flex:none;align-items:center;gap:6px;min-height:48px;margin-top:8px;padding:8px 4px;border:0;background:none;color:var(--primary);font:inherit;font-size:1rem;line-height:1.5;text-align:left}.draft-preview{gap:16px}.draft-preview-context{flex:none;min-width:0}.draft-preview-context strong{display:block;font-size:1rem;line-height:1.5;font-weight:600;overflow-wrap:anywhere}.draft-preview-context small{display:block;font-size:.875rem;line-height:1.6;margin-top:4px;color:var(--muted)}.draft-preview>.recovery-source{flex:1;min-height:0}.draft-footer{display:flex;flex:none;flex-direction:column;gap:12px;padding:16px 16px max(16px,env(safe-area-inset-bottom));background:var(--bg)}.draft-footer>.button{width:100%;min-height:48px;padding:12px;font-size:1rem;line-height:1.5;font-weight:600;border-radius:10px}.draft-review button{-webkit-tap-highlight-color:transparent}
.draft-heading h1>span{display:inline-block;white-space:nowrap}
@media(max-height:500px){.draft-inline{min-height:160px}.draft-footer{gap:8px;padding:12px 16px}}
@media(max-width:340px){
  .draft-heading h1{font-size:1.0625rem}
  .draft-file{gap:10px;margin:4px 0 10px}
  .draft-file>span{flex-basis:44px;height:44px}
  .draft-file h2{font-size:1rem;line-height:1.35}
  .draft-file p{font-size:.8125rem;line-height:1.4}
  .draft-tabs{margin:4px 0 8px}
  .draft-tabs button{padding:8px 4px;font-size:.8125rem}
  .draft-time{font-size:.75rem;line-height:1.4}
  .draft-inline textarea,.draft-excerpt,.draft-preview>textarea{padding:10px}
  .draft-preview{gap:10px}
}
</style>
