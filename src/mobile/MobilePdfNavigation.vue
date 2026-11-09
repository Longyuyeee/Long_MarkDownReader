<template>
  <section ref="root" v-if="mounted" v-show="open" class="pdf-navigation" role="region" aria-label="PDF 目录与页面" :inert="mobileHelpOpen||undefined" @keydown.esc.stop.prevent="hide">
    <div class="pdf-navigation-surface" :inert="layerOpen||undefined" :aria-hidden="layerOpen?true:undefined">
    <header class="pdf-navigation-heading"><button class="pdf-navigation-back" aria-label="关闭导航" @click="hide"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 ref="heading" tabindex="-1">目录与页面</h1><MobileHelp :topic="mode==='bookmarks'?'bookmarks':'pdfNavigation'" /></header>
    <p class="assistive-status">{{ pdfReadingTitle(source.relativePath) }}.pdf · 共 {{ pdf.numPages }} 页</p>
    <div class="pdf-navigation-tabs" role="group" aria-label="导航方式"><button v-for="tab in tabs" :key="tab.mode" class="text-button" :aria-pressed="mode===tab.mode" @click="switchMode(tab.mode)"><span>{{ tab.label }}<small v-if="tab.mode==='bookmarks'&&bookmarkCount">{{ bookmarkCount }}</small></span><i v-if="mode===tab.mode" class="pdf-navigation-indicator" aria-hidden="true" /></button></div>
    <div ref="body" class="pdf-navigation-body" @focusin="rememberFocus">
      <p v-if="error" class="pdf-navigation-error" role="alert">{{ error }}</p>
      <template v-if="mode==='outline'">

        <div v-if="loading" class="pdf-navigation-status"><p role="status">正在读取目录…</p></div>
        <div v-else-if="outlineError" class="pdf-navigation-status"><p role="status">目录暂时无法读取。</p><div class="pdf-navigation-status-actions"><button class="button" @click="loadOutline">重新读取目录</button><button class="button" @click="switchMode('pages')">查看页面</button></div></div>
        <div v-else-if="!rows.length" class="pdf-navigation-status"><p>这份 PDF 没有内置目录。</p><div class="pdf-navigation-status-actions"><button class="button" @click="switchMode('pages')">查看页面</button></div></div>
        <ol v-else class="pdf-outline"><li v-for="row in visibleRows" :key="row.id" :class="{'is-root':row.depth===0,'is-current':activeRow===row.id}" :style="{paddingLeft:Math.min(row.depth,5)*20+'px'}">
          <span v-for="(parent,index) in row.parents.slice(0,5)" :key="parent" aria-hidden="true" class="pdf-outline-guide" :class="{'is-elbow':index===row.parents.length-1,'is-last':lastChild.get(parent)===(row.parents[index+1] || row.id)}" :style="{left:22+index*20+'px'}" />
          <button v-if="row.children" class="icon-button" :data-nav-key="'toggle-'+row.id" :aria-label="`${collapsed.has(row.id)?'展开':'收起'}章节：${row.title}`" :aria-expanded="!collapsed.has(row.id)" @click="toggle(row.id)"><ChevronRight v-if="collapsed.has(row.id)" :size="19" /><ChevronDown v-else :size="19" /></button><span v-else class="pdf-outline-indent" />
          <button class="pdf-outline-link" :data-nav-key="row.id" :aria-current="activeRow===row.id?'location':undefined" :disabled="!row.local || !!busy" @click="go(row)"><span>{{ row.title }}<small v-if="!row.local" class="assistive-status">此项不是本文件页码，暂不打开</small></span><LoaderCircle v-if="busy===row.id" class="spinning" :size="18" /><span v-else-if="pageLabels.has(row.id)" class="pdf-outline-page">{{ pageLabels.get(row.id) }}</span><span v-else-if="!row.local" class="pdf-outline-external" aria-hidden="true">外部</span><ChevronRight v-else :size="19" aria-hidden="true" /></button>
        </li></ol>
        <button v-if="filteredRows.length>visibleCount" class="button" @click="visibleCount+=50">再显示 50 个章节</button><p v-if="partial" class="pdf-navigation-partial">目录已截断，可按页码定位。</p>
      </template>
      <template v-else-if="mode==='pages'">
        <div class="pdf-page-grid"><button v-for="n in batch" :key="n" class="pdf-page-preview" :data-nav-key="'page-'+n" :class="{'is-current':n===page}" :aria-label="`打开第 ${n} 页${n===page?'，当前页':''}`" :aria-current="n===page?'page':undefined" @click="choose(n)"><MobilePdfThumbnail v-if="open" :pdf="pdf" :page="n" :schedule="schedule" /><span class="pdf-page-number">{{ n }}<small v-if="n===page" class="assistive-status">当前页</small></span></button></div>
        <p v-if="pdf.numPages>6" class="pdf-navigation-batch" role="status">第 {{ batch[0] }}–{{ batch[batch.length-1] }} 页</p>
        <div class="pdf-thumbnail-paging"><button class="button" data-nav-key="previous-batch" :disabled="batch[0]===1" @click="changeBatch(-1)">前 6 页</button><button class="text-button" data-nav-key="current-page" @click="currentBatch">回到当前页</button><button class="button" data-nav-key="next-batch" :disabled="batch[batch.length-1]===pdf.numPages" @click="changeBatch(1)">后 6 页</button></div>

      </template>
      <MobilePdfBookmarks v-if="bookmarksMounted" v-show="mode==='bookmarks'" ref="bookmarks" :source="source" :storage="storage" :page="page" :overlay-target="root" :active="open&&mode==='bookmarks'" @layer="layerOpen=$event" @goto="choose" @count="bookmarkCount=$event" />
    </div>
    </div>
  </section>
</template>
<script setup lang="ts">
import MobileHelp from './MobileHelp.vue'
import {mobileHelpOpen} from './mobileHelp'
import {ref,computed,nextTick,onBeforeUnmount,watch} from 'vue'
import type {PDFDocumentProxy} from 'pdfjs-dist'
import {ArrowLeft,ChevronRight,ChevronDown,LoaderCircle} from 'lucide-vue-next'
import MobilePdfThumbnail from './MobilePdfThumbnail.vue'
import MobilePdfBookmarks from './MobilePdfBookmarks.vue'
import {pdfReadingTitle} from './pdfAnnotations'
import {type PdfBookmarkScope} from './pdfBookmarks'
import {readPersistedPdfBookmarks,type PdfBookmarkPersistence} from './pdfBookmarkRepository'
import {flattenPdfOutline,resolvePdfDestination,pdfThumbnailBatch,pdfThumbnailQueue,type PdfOutlineRow} from './pdfNavigation'
const props=defineProps<{pdf:PDFDocumentProxy;page:number;source:PdfBookmarkScope;storage:PdfBookmarkPersistence}>(),emit=defineEmits<{goto:[page:number];opened:[value:boolean]}>()
const root=ref<HTMLElement>(),layerOpen=ref(false),mounted=ref(false),open=ref(false),bookmarksMounted=ref(false),mode=ref<'outline'|'pages'|'bookmarks'>('outline'),heading=ref<HTMLElement>(),body=ref<HTMLElement>(),rows=ref<PdfOutlineRow[]>([]),loading=ref(false),outlineError=ref(false),partial=ref(false),error=ref(''),busy=ref(''),collapsed=ref(new Set<string>()),visibleCount=ref(50),batchPage=ref(1),bookmarkCount=ref(0),bookmarks=ref<InstanceType<typeof MobilePdfBookmarks>>()
let epoch=0,outlineEpoch=0,loaded=false,disposed=false,pageChangedWhileClosed=false
const schedule=pdfThumbnailQueue(),filteredRows=computed(()=>rows.value.filter(r=>r.parents.every(id=>!collapsed.value.has(id)))),visibleRows=computed(()=>filteredRows.value.slice(0,visibleCount.value)),batch=computed(()=>pdfThumbnailBatch(Math.min(batchPage.value,props.pdf.numPages),props.pdf.numPages))
watch(()=>props.page,()=>{if(!open.value)pageChangedWhileClosed=true},{flush:'sync'})
const pageLabels=ref(new Map<string,number>());let labelsEpoch=0
const activeRow=computed(()=>{let best='',position=-1;for(const row of rows.value){const n=pageLabels.value.get(row.id);if(n!==undefined&&n<=props.page&&n>position){position=n;best=row.id}}return best})
async function labelPages(){const owner=++labelsEpoch,queue=visibleRows.value.filter(row=>row.local&&!pageLabels.value.has(row.id));async function work(){while(queue.length&&!disposed&&owner===labelsEpoch){const row=queue.shift()!;try{const n=await resolvePdfDestination(props.pdf,row.destination,()=>disposed||owner!==labelsEpoch);if(n!==null&&!disposed&&owner===labelsEpoch)pageLabels.value=new Map(pageLabels.value).set(row.id,n)}catch{}}}await Promise.all([work(),work()])}
watch(()=>visibleRows.value.map(row=>row.id).join('|'),()=>{void labelPages()})
const lastChild=computed(()=>new Map(rows.value.filter(row=>row.parents.length).map(row=>[row.parents[row.parents.length-1],row.id])))
async function scrollTop(){await nextTick();if(body.value)body.value.scrollTop=0}
async function loadOutline(){const current=++outlineEpoch;loading.value=true;outlineError.value=false;try{const result=flattenPdfOutline(await props.pdf.getOutline());if(disposed || current!==outlineEpoch)return;rows.value=result.rows;partial.value=result.partial;loaded=true}catch{if(!disposed && current===outlineEpoch)outlineError.value=true}finally{if(!disposed && current===outlineEpoch)loading.value=false}}
type Mode = 'outline'|'pages'|'bookmarks'
const tabs=[{"mode": "outline", "label": "目录", "paths": ["M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"]}, {"mode": "pages", "label": "页面", "paths": ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z", "M14 2v6h6"]}, {"mode": "bookmarks", "label": "书签", "paths": ["M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"]}] as const
type Focus = { element:HTMLElement; key?:string; id?:string }
const places=new Map<Mode,{scroll:number;focus?:Focus}>(),focuses=new Map<Mode,Focus>()
function rememberFocus(event:FocusEvent){const element=event.target;if(element instanceof HTMLElement)focuses.set(mode.value,{element,key:element.dataset.navKey,id:element.id||undefined})}
function savePlace(){places.set(mode.value,{scroll:body.value?.scrollTop||0,focus:focuses.get(mode.value)})}
async function restorePlace(focus=false){await nextTick();if(!open.value)return;const place=places.get(mode.value);if(body.value)body.value.scrollTop=place?.scroll||0;if(!focus)return;const saved=place?.focus;let target=saved?.element.isConnected?saved.element:undefined;if(!target&&saved?.key)target=[...(body.value?.querySelectorAll<HTMLElement>('[data-nav-key]')||[])].find(e=>e.dataset.navKey===saved.key);if(!target&&saved?.id)target=[...(body.value?.querySelectorAll<HTMLElement>('[id]')||[])].find(e=>e.id===saved.id);(target||heading.value)?.focus({preventScroll:true})}
async function show(){
  if(open.value)return
  if(pageChangedWhileClosed&&!batch.value.includes(props.page)){
    batchPage.value=props.page
    places.delete('pages')
    focuses.delete('pages')
  }
  pageChangedWhileClosed=false
  mounted.value=true;open.value=true;emit('opened',true)
  if(mode.value==='pages'&&!places.has('pages'))batchPage.value=props.page
  void readPersistedPdfBookmarks(props.source,props.storage).then(value=>{if(!disposed)bookmarkCount.value=value.record.items.length}).catch(()=>{})
  if(!loaded&&!loading.value)void loadOutline()
  await restorePlace(true)
}
async function protect(){return await bookmarks.value?.protect()??true}
let changing=false
async function hide(){if(changing)return false;changing=true;try{if(!await protect())return false;savePlace();epoch++;busy.value='';open.value=false;emit('opened',false);return true}finally{changing=false}}
async function switchMode(next:Mode){if(next===mode.value||changing)return;changing=true;try{if(!await protect())return;savePlace();epoch++;busy.value='';error.value='';mode.value=next;if(next==='pages'&&!places.has('pages'))batchPage.value=props.page;if(next==='bookmarks')bookmarksMounted.value=true;await restorePlace()}finally{changing=false}}
async function currentBatch(){
  batchPage.value=props.page
  await nextTick()
  if(!open.value||mode.value!=='pages')return
  const current=body.value?.querySelector<HTMLButtonElement>('.pdf-page-preview[aria-current="page"]')
  current?.scrollIntoView({block:'nearest'})
  current?.focus({preventScroll:true})
}

function toggle(id:string){const next=new Set(collapsed.value);next.has(id)?next.delete(id):next.add(id);collapsed.value=next}
async function choose(n:number){if(await hide())emit('goto',n)}
async function go(row:PdfOutlineRow){if(!row.local||busy.value)return;const current=++epoch;busy.value=row.id;error.value='';try{const page=await resolvePdfDestination(props.pdf,row.destination,()=>disposed || !open.value || current!==epoch);if(disposed || !open.value || current!==epoch)return;if(page===null)throw new Error();choose(page)}catch{if(!disposed && open.value && current===epoch)error.value='这个章节的位置无法识别，阅读位置未改变。可切换页面预览定位。'}finally{if(current===epoch)busy.value=''}}
function changeBatch(direction:number){batchPage.value=Math.max(1,Math.min(props.pdf.numPages,batch.value[0]+direction*6));void scrollTop()}
onBeforeUnmount(()=>{disposed=true;labelsEpoch++;epoch++;outlineEpoch++;emit('opened',false)})
defineExpose({show,hide,protect,back(){if(!open.value)return false;if(mode.value==='bookmarks'&&bookmarks.value?.back())return true;void hide();return true}})
</script>
<style scoped>
.pdf-navigation { --nav-error:#a13e32; --outline-guide:#c7d2c5; position:absolute; z-index:10; inset:0; background:var(--bg); color:var(--ink); display:flex; flex-direction:column; min-height:0; overflow:hidden; }
.pdf-navigation-surface { display:flex; flex:1; flex-direction:column; min-height:0; }
.pdf-navigation button { -webkit-tap-highlight-color:transparent; }
.pdf-navigation-back:active,.pdf-navigation-tabs button:active,.pdf-outline-link:active { background:var(--panel); }
.pdf-navigation-heading { display:flex; flex:none; align-items:center; gap:8px; min-height:64px; padding:7.5px 8px; border-bottom:1px solid var(--line); }
.pdf-navigation-heading h1 { flex:1; min-width:0; margin:0; font-size:1.125rem; line-height:1.5; letter-spacing:0; font-weight:700; overflow-wrap:anywhere; }
.pdf-navigation-back { display:grid; place-items:center; flex:0 0 48px; width:48px; height:48px; padding:0; border:0; background:transparent; color:var(--muted); }
.pdf-navigation-heading :deep(.mobile-help-trigger svg) { width:22px; height:22px; }
.pdf-navigation-context { display:flex; flex:none; align-items:start; gap:12px; padding:12px 16px; }
.pdf-navigation-file { flex:1; min-width:0; margin:0; color:var(--muted); font-size:.8125rem; line-height:1.5384615385; overflow-wrap:anywhere; }
.pdf-navigation-count { flex:none; color:var(--muted); font-size:.8125rem; line-height:1.5384615385; }
.pdf-navigation-tabs { display:flex; flex:none; margin:0; border-bottom:1px solid var(--line); }
.pdf-navigation-tabs button { position:relative; flex:1; min-width:0; min-height:48px; padding:0 4px; font-size:1rem; line-height:1.5; }
.pdf-navigation-tabs button>span { display:inline-flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:4px 8px; padding:12px 0; }
.pdf-navigation-tabs small { font-size:.75rem; }
.pdf-navigation-tabs [aria-pressed=true] { color:var(--primary); font-weight:600; }
.pdf-navigation-tabs .pdf-navigation-indicator { position:absolute; bottom:0; left:12px; right:12px; height:3px; border-radius:3px 3px 0 0; background:var(--primary); }
.pdf-navigation-body { overflow:auto; min-height:0; flex:1; padding:16px; overscroll-behavior:contain; }
.pdf-navigation-footer { flex:none; padding:12px 16px calc(12px + env(safe-area-inset-bottom)); border-top:1px solid var(--line); background:var(--bg); max-height:45dvh; overflow:auto; }
.pdf-navigation-footer>.button { width:100%; min-height:48px; padding:11px 14px; border-radius:10px; font-size:.875rem; line-height:1.7142857143; font-weight:400; }
.pdf-navigation-batch { margin:12px 0 0; font-size:.875rem; line-height:1.5; color:var(--muted); text-align:center; }
.pdf-navigation-status { padding:16px; border:1px solid var(--line); border-radius:12px; background:var(--surface); }
.pdf-navigation-status p { margin:0; font-size:.875rem; line-height:1.5; overflow-wrap:anywhere; }
.pdf-navigation-status-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
.pdf-navigation-status-actions .button { flex:1 1 8em; min-height:48px; padding:11px 14px; font-size:.875rem; line-height:1.7142857143; font-weight:400; border-radius:10px; }
.pdf-navigation-error { margin:0 0 16px; padding:12px; border:1px solid var(--line); border-radius:10px; color:var(--nav-error); font-size:.875rem; line-height:1.5; overflow-wrap:anywhere; }
.pdf-navigation-partial { font-size:.8125rem; line-height:1.5; color:var(--muted); }
.pdf-outline {list-style:none;padding:0;margin:0}
.pdf-outline li {position:relative;display:flex;border-bottom:1px solid var(--line);align-items:center;min-width:0}
.pdf-outline .icon-button {min-width:48px;min-height:48px;flex-shrink:0;margin-left:-8px;color:var(--primary)}
.pdf-outline-indent {width:40px;flex-shrink:0}
.pdf-outline-guide {position:absolute;top:0;bottom:-1px;width:16px;border-left:1px solid var(--outline-guide,var(--line));pointer-events:none}
.pdf-outline-guide.is-elbow::after {content:'';position:absolute;top:50%;left:0;width:16px;border-top:1px solid var(--outline-guide,var(--line))}
.pdf-outline-guide.is-elbow.is-last {bottom:50%}
.pdf-outline-guide.is-elbow.is-last::after {top:100%}
.pdf-outline-guide.is-last:not(.is-elbow) {display:none}
.pdf-outline-link {display:flex;align-items:center;gap:8px;justify-content:space-between;min-height:48px;text-align:left;flex:1;min-width:0;padding:10px 4px 10px 0;color:var(--ink);font:inherit;font-size:1rem;line-height:1.7;background:none;border:0}
.pdf-outline .is-root>.pdf-outline-link {font-weight:650}.pdf-outline li.is-current{background:var(--primary-soft);border-radius:7px}.pdf-outline-page{flex:none;min-width:2ch;text-align:right;color:var(--muted);font-weight:500;font-variant-numeric:tabular-nums}
.pdf-outline li.is-current .pdf-outline-link,.pdf-outline li.is-current .pdf-outline-page{color:var(--primary);font-weight:650}
.pdf-outline-link>span:first-child {overflow-wrap:anywhere;min-width:0}
.pdf-outline-external{flex:none;border:1px solid var(--line);border-radius:5px;padding:0 5px;color:var(--muted);font-size:.75rem;font-weight:500;white-space:nowrap}
.pdf-outline-link>svg {flex-shrink:0;color:var(--muted)}
.pdf-outline-link:disabled {color:var(--muted)}
.pdf-page-grid {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.pdf-page-preview {min-width:0;padding:0;border:0;background:transparent;color:var(--ink)}.pdf-page-preview :deep(.pdf-thumbnail-image){border:1px solid var(--line);border-radius:4px}
.pdf-page-preview.is-current :deep(.pdf-thumbnail-image){outline:2px solid var(--primary);outline-offset:-2px}
.pdf-page-preview>span {display:table;margin:6px auto 0;padding:2px 9px;font-size:1rem;line-height:1.5;border-radius:16px}.pdf-page-preview.is-current>span{background:var(--primary);color:var(--bg)}
.pdf-page-preview small {color:var(--primary);font-size:.75rem}
.pdf-thumbnail-paging {display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;margin-top:12px}
.pdf-thumbnail-paging .button {flex:1}
.pdf-thumbnail-paging .text-button {font-size:.75rem}

@media(max-height:400px) { .pdf-navigation-heading { min-height:49px; padding:0 8px; } .pdf-navigation-heading h1 { font-size:1rem; } .pdf-navigation-context { display:none; } .pdf-navigation-tabs { margin:0 12px; } .pdf-navigation-tabs button { font-size:.8125rem; min-height:44px; } .pdf-navigation-tabs button>span { gap:4px; padding:4px 0; } .pdf-navigation-tabs svg { width:18px; } .pdf-navigation-footer { padding:8px 12px; } .pdf-navigation-footer>.button { font-size:.8125rem; padding:8px; } }


:global(.theme-dark .pdf-navigation) { --outline-guide:#647564; --nav-error:#ffb4a8; }
</style>
