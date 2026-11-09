<template>
  <section v-if="mounted" v-show="open" class="pdf-search-task" role="region" aria-label="PDF 文内查找" :inert="mobileHelpOpen || undefined" @keydown.esc.stop.prevent="hide">
    <header class="pdf-search-heading"><button class="pdf-search-back" aria-label="返回 PDF 阅读" @click="hide"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 tabindex="-1">查找 PDF</h1><MobileHelp topic="pdfSearch" /></header>
    <div class="pdf-search-context"><p class="pdf-search-file">{{ name }}</p><span class="pdf-search-count">共 {{ pdf.numPages }} 页</span></div>
    <form class="pdf-search-form" @submit.prevent="submit" @focusin="rememberFocus"><label for="pdf-search">查找 PDF 文字</label><div class="pdf-search-input-row"><input id="pdf-search" ref="input" v-model="query" type="search" maxlength="120" autocomplete="off" placeholder="输入关键词" :aria-invalid="phase==='invalid'" :aria-describedby="phase==='invalid'?'pdf-search-input-error':undefined" @input="queryChanged" @select="rememberSelection" @blur="rememberSelection" /><button v-if="phase==='searching'" type="button" class="button primary-button" @click="stop">停止</button><button v-else type="submit" class="button primary-button">{{ phase==='error'?'重新查找':'查找' }}</button></div><p v-if="phase==='invalid'" id="pdf-search-input-error" class="pdf-search-input-error" role="alert">请输入查找词。</p></form>
    <div ref="body" class="pdf-search-body" @focusin="rememberFocus">
      <template v-if="phase==='complete' && results.length"><p ref="status" class="pdf-search-status" role="status" tabindex="-1"><span class="pdf-search-full-status">{{ statusText }}</span><span class="pdf-search-short-status">{{ partial ? `部分结果 · ${checked} / ${pdf.numPages} 页 · ${matches} 处` : `${matches} 处 · ${results.length} 页` }}</span></p><ul class="pdf-results"><li v-for="hit in results.slice(0,visibleCount)" :key="hit.page"><button :data-search-page="hit.page" @click="choose(hit.page,$event)"><strong>第 {{ hit.page }} 页 · {{ hit.count }} 处<ChevronRight :size="22" aria-hidden="true" /></strong><span>{{ hit.excerpt }}</span></button></li></ul><button v-if="results.length>visibleCount" class="button pdf-search-more" @click="visibleCount+=50">再显示 50 页结果</button></template>
      <div v-else-if="phase==='searching'||phase==='stopped'||phase==='complete'||phase==='error'" ref="message" class="pdf-search-message" :class="{'is-error':phase==='error'}" :role="phase==='error'?'alert':'status'" tabindex="-1"><h2 v-if="phase==='error'">查找未完成</h2><p>{{ phase==='error'?error:phase==='searching'?`已检查 ${checked} / ${pdf.numPages} 页…`:phase==='stopped'?`已停止 · 已检查 ${checked} / ${pdf.numPages} 页。`:partial?statusText:'没有找到匹配文字。' }}</p></div>
    </div>
    <footer class="pdf-search-footer"><button class="button primary-button" @click="hide">继续阅读 · 第 {{ page }} 页</button></footer>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowLeft, ChevronRight } from 'lucide-vue-next'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import MobileHelp from './MobileHelp.vue'
import { mobileHelpOpen } from './mobileHelp'
import { canFocus } from './accessibility'
import { humanStorageError } from './storage'
import { searchPdfPages, type PdfSearchResult } from './pdfDocument'
const props=defineProps<{ pdf:PDFDocumentProxy; name:string; page:number; readText:(pdf:PDFDocumentProxy,page:number)=>Promise<string> }>()
const emit=defineEmits<{ opened:[open:boolean]; preview:[active:boolean]; goto:[page:number] }>()
const mounted=ref(false),open=ref(false),input=ref<HTMLInputElement>(),body=ref<HTMLElement>(),status=ref<HTMLElement>(),message=ref<HTMLElement>(),query=ref(''),phase=ref<'idle'|'invalid'|'searching'|'complete'|'stopped'|'error'>('idle'),results=ref<PdfSearchResult[]>([]),checked=ref(0),matches=ref(0),partial=ref(false),error=ref(''),visibleCount=ref(50)
const statusText=computed(()=>`${partial.value?'部分结果 · ':''}已检查 ${checked.value} / ${props.pdf.numPages} 页，找到 ${matches.value} 处。`)
let epoch=0,disposed=false,submitted:string|null=null,preview=false,savedScroll=0,lastFocus:HTMLElement|undefined,selection={start:0,end:0,direction:'none' as 'none'|'forward'|'backward'}
const normalized=(value:string)=>value.trim().toLocaleLowerCase()
function rememberSelection(){const live=input.value;if(live)selection={start:live.selectionStart??0,end:live.selectionEnd??0,direction:live.selectionDirection??'none'}}
function rememberFocus(event:FocusEvent){if(event.target instanceof HTMLElement)lastFocus=event.target}
function capture(){const live=input.value;if(live&&live.value!==query.value)query.value=live.value;rememberSelection();savedScroll=body.value?.scrollTop||0}
function queryChanged(){const term=input.value?.value??query.value;if(submitted!==null&&normalized(term)===submitted)return;submitted=null;epoch++;phase.value='idle';results.value=[];checked.value=0;matches.value=0;partial.value=false;error.value='';visibleCount.value=50;savedScroll=0}
watch(query,queryChanged)
function stop(){if(phase.value!=='searching')return;epoch++;phase.value='stopped'}
function setPreview(value:boolean){preview=value;emit('preview',value)}
async function show(){if(open.value)return;setPreview(false);mounted.value=true;open.value=true;emit('opened',true);await nextTick();if(!open.value||disposed)return;const target=canFocus(lastFocus)?lastFocus:input.value;target?.focus({preventScroll:true});if(target===input.value)input.value?.setSelectionRange(selection.start,selection.end,selection.direction);if(body.value)body.value.scrollTop=savedScroll}
function hide(){if(!open.value){setPreview(false);return};capture();stop();open.value=false;setPreview(false);emit('opened',false)}
function choose(page:number,event:MouseEvent){lastFocus=event.currentTarget as HTMLElement;lastFocus.focus({preventScroll:true});hide();setPreview(true);emit('goto',page)}
async function submit(){
 const term=input.value?.value??query.value,owner=++epoch;submitted=normalized(term);query.value=term;error.value='';results.value=[];checked.value=0;matches.value=0;partial.value=false;visibleCount.value=50;savedScroll=0
 if(!term.trim()){phase.value='invalid';await nextTick();input.value?.focus({preventScroll:true});return}
 phase.value='searching';const pdf=props.pdf;await nextTick();if(disposed||!open.value||owner!==epoch)return;input.value?.blur();if(body.value)body.value.scrollTop=0
 try{const found=await searchPdfPages(pdf.numPages,term,n=>props.readText(pdf,n),()=>disposed||!open.value||owner!==epoch,n=>{if(owner===epoch)checked.value=n});if(disposed||!open.value||owner!==epoch)return;results.value=found.results;checked.value=found.checked;matches.value=found.matches;partial.value=found.partial;phase.value='complete'}
 catch(reason){if(disposed||owner!==epoch)return;error.value=humanStorageError(reason);phase.value='error'}
 await nextTick();if(disposed||!open.value||owner!==epoch)return;(status.value||message.value)?.focus({preventScroll:true});if(body.value)body.value.scrollTop=0
}
onBeforeUnmount(()=>{disposed=true;epoch++;emit('opened',false);setPreview(false)})
defineExpose({show,hide,stop,back(){if(open.value){hide();return true};if(preview){void show();return true};return false}})
</script>
<style scoped>
.pdf-search-task { --search-error:#a13e32; position:absolute; z-index:10; inset:0; display:flex; flex-direction:column; min-height:0; overflow:hidden; background:var(--bg); color:var(--ink); }
.pdf-search-task button { -webkit-tap-highlight-color:transparent; }
.pdf-search-back:active,.pdf-results button:active { background:var(--panel); }
.pdf-search-heading { display:flex; flex:none; align-items:center; gap:8px; min-height:64px; padding:7.5px 8px; border-bottom:1px solid var(--line); }
.pdf-search-heading h1 { flex:1; min-width:0; margin:0; font-size:1.25rem; line-height:1.5; letter-spacing:0; font-weight:700; overflow-wrap:anywhere; }
.pdf-search-back { display:grid; place-items:center; flex:0 0 48px; width:48px; height:48px; padding:0; border:0; background:transparent; color:var(--muted); }
.pdf-search-heading :deep(.mobile-help-trigger svg) { width:22px; height:22px; }
.pdf-search-context { display:flex; flex:none; align-items:start; gap:12px; padding:12px 16px; }
.pdf-search-file { flex:1; min-width:0; margin:0; color:var(--muted); font-size:.8125rem; line-height:1.5384615385; overflow-wrap:anywhere; }
.pdf-search-count { flex:none; color:var(--muted); font-size:.8125rem; line-height:1.5384615385; }
.pdf-search-form { flex:none; padding:4px 16px 16px; border-bottom:1px solid var(--line); }
.pdf-search-form label { display:block; margin:0 0 8px; font-size:.875rem; line-height:1.5; }
.pdf-search-input-row { display:flex; gap:8px; align-items:stretch; }
.pdf-search-form input { flex:1; min-width:0; width:100%; min-height:48px; padding:11px 12px; border:1px solid var(--line); border-radius:10px; color:var(--ink); background:var(--surface); font-size:1rem; line-height:1.5; }
.pdf-search-form .button { flex:none; min-width:88px; min-height:48px; border-radius:10px; padding:11px 14px; font-size:.875rem; line-height:1.7142857143; font-weight:400; white-space:nowrap; }
.pdf-search-form input[aria-invalid=true] { border-color:var(--search-error); }
.pdf-search-input-error { margin:8px 0 0; font-size:.875rem; line-height:1.5; color:var(--search-error); }
.pdf-search-body { overflow:auto; min-height:0; flex:1; padding:16px; overscroll-behavior:contain; }
.pdf-search-short-status { display:none; }
.pdf-search-status { margin:0 0 16px; color:var(--muted); font-size:.875rem; line-height:1.5; overflow-wrap:anywhere; outline:0; }
.pdf-results { display:grid; gap:8px; margin:0; padding:0; list-style:none; }
.pdf-results li { min-width:0; }
.pdf-results button { display:block; width:100%; min-width:0; min-height:48px; padding:12px; text-align:left; border:1px solid var(--line); border-radius:10px; background:var(--surface); color:var(--ink); }
.pdf-results strong { display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:1rem; line-height:1.5; font-weight:600; }
.pdf-results span { display:block; margin-top:4px; color:var(--muted); font-size:.875rem; line-height:1.5; overflow-wrap:anywhere; }
.pdf-search-message { padding:16px; border:1px solid var(--line); border-radius:12px; background:var(--surface); }
.pdf-search-message h2 { margin:0 0 8px; font-size:1rem; line-height:1.5; font-weight:600; }
.pdf-search-message p { margin:0; font-size:.875rem; line-height:1.5; overflow-wrap:anywhere; }
.pdf-search-message.is-error { color:var(--search-error); }
.pdf-search-more { width:100%; margin-top:12px; }
.pdf-search-footer { flex:none; padding:12px 16px calc(12px + env(safe-area-inset-bottom)); border-top:1px solid var(--line); background:var(--bg); max-height:45dvh; overflow:auto; }
.pdf-search-footer .button { width:100%; min-height:48px; padding:11px 14px; border-radius:10px; font-size:.875rem; line-height:1.7142857143; font-weight:400; }
@media(max-height:400px) { .pdf-search-heading { min-height:49px; padding:0 8px; } .pdf-search-heading h1 { font-size:1rem; } .pdf-search-context { display:none; } .pdf-search-form { padding:8px 12px; } .pdf-search-form label { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; } .pdf-search-form .button { min-width:72px; padding:8px 10px; font-size:.75rem; line-height:1.5; } .pdf-search-footer { display:none; } .pdf-search-footer .button { font-size:.75rem; padding:8px; } .pdf-search-body { padding:8px 12px; } .pdf-search-status { margin-bottom:8px; font-size:.75rem; } .pdf-search-full-status { display:none; } .pdf-search-short-status { display:inline; } }

:global(.theme-dark .pdf-search-task) { --search-error:#f09d8f; }
</style>
