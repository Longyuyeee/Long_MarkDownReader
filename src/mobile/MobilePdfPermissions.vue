<template>
  <section v-if="mounted" v-show="open" class="pdf-permissions-task" role="region" aria-label="PDF 文档权限" :inert="mobileHelpOpen || undefined" @keydown.esc.stop.prevent="back">
    <div class="permissions-surface" :inert="!!detail || undefined" :aria-hidden="detail ? true : undefined">
      <header class="permissions-header"><button class="permissions-icon" :aria-label="returnSettings?'返回阅读设置':returnMenu?'返回 PDF 操作':'返回 PDF 阅读'" @click="emit('close', false)"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 ref="heading" tabindex="-1">文档权限</h1><MobileHelp topic="pdfPermissions" /></header>
      <div ref="body" class="permissions-body" tabindex="0" role="region" aria-label="文档权限内容">
        <div class="permissions-card"><FileText :size="24" aria-hidden="true" /><span><strong>{{ title }}.pdf</strong><small>{{ libraryName }}</small></span></div>
        <ul class="permissions-rows"><li v-for="cap in capabilities" :key="cap.id"><button class="permissions-row" aria-haspopup="dialog" :aria-expanded="detail===cap.id" :data-permission="cap.id" @click="showDetail(cap.id, $event.currentTarget as HTMLElement)"><component :is="cap.icon" :size="24" aria-hidden="true" /><span class="permissions-row-text"><strong>{{ cap.label }}</strong><small>{{ cap.sub }}</small></span><span class="permissions-status" :class="{'is-limited':state(cap.id)!=='可用'}">{{ state(cap.id) }}</span><ChevronRight class="permissions-chevron" :size="20" aria-hidden="true" /></button></li></ul>
      </div>
      <footer class="permissions-footer"><button class="button primary-button" @click="emit('close', true)">继续阅读</button></footer>
    </div>
    <div v-if="detail" class="permissions-layer" @click.self="closeDetail">
      <section ref="dialog" class="permissions-dialog" role="dialog" aria-modal="true" :aria-label="detailTitle" @keydown.tab.prevent="tab" @keydown.esc.stop.prevent="closeDetail">
        <header class="permissions-dialog-header"><h2 ref="detailHeading" tabindex="-1">{{ detailTitle }}</h2><button class="permissions-icon" aria-label="返回文档权限" @click="closeDetail"><X :size="22" aria-hidden="true" /></button></header>
        <div ref="detailBody" class="permissions-dialog-body" tabindex="0" role="region" :aria-label="detailTitle+'说明内容'"><p class="permissions-detail-status"><span class="permissions-status" :class="{'is-limited':state(detail)!=='可用'}">{{ state(detail) }}</span></p><p class="permissions-detail-copy">{{ detailCopy }}</p></div>
        <footer class="permissions-dialog-footer"><button class="button" @click="closeDetail">返回权限</button></footer>
      </section>
    </div>
  </section>
</template>
<script setup lang="ts">
import {computed,nextTick,ref,watch} from 'vue'
import {ArrowLeft,FileText,BookOpen,Copy,MessageSquare,ChevronRight,X} from 'lucide-vue-next'
import MobileHelp from './MobileHelp.vue'
import {mobileHelpOpen} from './mobileHelp'
import {canFocus,focusableControls} from './accessibility'
import type {PdfAccess} from './pdfPermissions'
const props=defineProps<{open:boolean;returnSettings:boolean;returnMenu?:boolean;title:string;libraryName:string;access:PdfAccess;local:boolean}>(),emit=defineEmits<{close:[reader:boolean]}>()
type Capability='reading'|'copy'|'annotate'
const capabilities=[{id:'reading' as const,label:'阅读与导航',sub:'原版页面 · 目录 · 书签',icon:BookOpen},{id:'copy' as const,label:'复制与摘录',sub:'原文文字 · 阅读笔记',icon:Copy},{id:'annotate' as const,label:'批注操作',sub:'新增 · 修改 · 删除',icon:MessageSquare}]
const mounted=ref(false),detail=ref<Capability|''>(''),heading=ref<HTMLElement>(),body=ref<HTMLElement>(),dialog=ref<HTMLElement>(),detailHeading=ref<HTMLElement>(),detailBody=ref<HTMLElement>()
let epoch=0,savedScroll=0,lastRow:HTMLElement|undefined
const detailScroll=new Map<Capability,number>()
const detailTitle=computed(()=>capabilities.find(c=>c.id===detail.value)?.label||'')
function state(key:Capability){return key==='reading'?'可用':!props.access.known?'未确认':key==='copy'?props.access.copy?'可用':'受限':!props.access.annotate?'受限':!props.local?'需导入':'可用'}
const detailCopy=computed(()=>{
  if(detail.value==='reading')return '可阅读原版页面，翻页并使用目录和本机书签。'
  if(detail.value==='copy')return !props.access.known?'暂未确认原文件是否允许复制，当前不复制或摘录。可重新打开文档核对。':props.access.copy?'可复制原文；已有批注可整理为独立阅读笔记。':'这份文件限制原文复制与摘录。自己的评论输入不受这项限制。'
  return !props.access.known?'暂未确认原文件是否允许修改批注，当前保留记录和未完成输入。可重新打开文档核对。':!props.access.annotate?'这份文件限制新增、修改和删除批注。已有本机记录及未完成输入继续保留。':!props.local?'原文件允许批注；当前来源暂只读。先导入手机资料库，再添加或修改批注。':props.access.copy?'可选取原文高亮，也可添加、修改或删除自己的批注。':'可新增、修改或删除自己的页评论；原文摘录仍受限。'
})
function saveDetail(){if(detail.value)detailScroll.set(detail.value,detailBody.value?.scrollTop||0)}
watch(()=>props.open,async open=>{const owner=++epoch;if(!open){saveDetail();savedScroll=body.value?.scrollTop||0;detail.value='';return}mounted.value=true;await nextTick();if(!props.open||owner!==epoch)return;(canFocus(lastRow)?lastRow:heading.value)?.focus({preventScroll:true});if(body.value)body.value.scrollTop=savedScroll},{immediate:true})
async function showDetail(value:Capability,target:HTMLElement){const owner=++epoch;lastRow=target;savedScroll=body.value?.scrollTop||0;detail.value=value;await nextTick();if(!props.open||owner!==epoch)return;detailHeading.value?.focus({preventScroll:true});if(detailBody.value)detailBody.value.scrollTop=detailScroll.get(value)||0}
async function closeDetail(){epoch++;saveDetail();detail.value='';await nextTick();if(!props.open)return;if(canFocus(lastRow))lastRow.focus({preventScroll:true});if(body.value)body.value.scrollTop=savedScroll}
function tab(event:KeyboardEvent){const controls=focusableControls(dialog.value),i=controls.indexOf(window.document.activeElement as HTMLElement);controls[event.shiftKey?(i<=0?controls.length-1:i-1):(i+1)%controls.length]?.focus()}
function back(){if(!props.open)return false;if(detail.value)void closeDetail();else emit('close',false);return true}
defineExpose({back})
</script>
<style scoped>
/* permissions-task */
.pdf-permissions-task{--permission-limited-bg:#fff0dc;--permission-limited-ink:#895817;position:absolute;inset:0;z-index:14;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--bg);color:var(--ink)}.permissions-surface{display:flex;flex:1;flex-direction:column;min-height:0}.permissions-header{display:flex;align-items:center;gap:8px;min-height:64px;padding:7.5px 8px;border-bottom:1px solid var(--line);flex:none}.permissions-header h1{flex:1;min-width:0;margin:0;font-size:1.25rem;line-height:1.5;letter-spacing:normal;font-weight:700;overflow-wrap:anywhere}.permissions-icon{display:grid;place-items:center;flex:0 0 48px;width:48px;height:48px;padding:0;border:0;background:transparent;color:var(--muted)}
.permissions-body{flex:1;min-height:0;padding:16px;overflow:auto;overscroll-behavior:contain}.permissions-card{display:flex;align-items:center;gap:12px;min-height:80px;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.permissions-card>svg{flex:none;color:var(--primary)}.permissions-card>span{flex:1;min-width:0}.permissions-card strong{display:block;font-size:1rem;line-height:1.5;font-weight:650;overflow-wrap:anywhere}.permissions-card small{display:block;margin-top:4px;color:var(--muted);font-size:.875rem;line-height:1.5}
.permissions-rows{list-style:none;margin:20px 0 0;padding:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--surface)}.permissions-rows>li+li{border-top:1px solid var(--line)}.permissions-row{display:grid;grid-template-columns:24px minmax(0,1fr) auto 20px;align-items:center;gap:12px;width:100%;min-height:80px;padding:14px;border:0;background:transparent;color:var(--ink);text-align:left}.permissions-row>svg{color:var(--muted);flex:none}.permissions-row-text{min-width:0}.permissions-row strong{display:block;font-size:1rem;line-height:1.5;font-weight:650;overflow-wrap:anywhere}.permissions-row-text small{display:block;margin-top:4px;font-size:.875rem;line-height:1.5;color:var(--muted);overflow-wrap:anywhere}.permissions-status{display:inline-block;justify-self:start;flex:none;padding:4px 10px;border-radius:99px;background:var(--primary-soft);color:var(--primary);font-size:.8125rem;line-height:1.5;font-weight:600;white-space:nowrap}.permissions-status.is-limited{background:var(--permission-limited-bg);color:var(--permission-limited-ink)}.permissions-row:active{background:var(--panel)}
.permissions-footer,.permissions-dialog-footer{display:flex;gap:8px;flex:none;padding:12px 16px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--bg);max-height:45dvh;overflow:auto}.permissions-footer>.button,.permissions-dialog-footer>.button{flex:1;min-width:0;min-height:48px;padding:11px 10px;border-radius:10px;font-size:.875rem;line-height:1.7142857143;font-weight:400}
.permissions-layer{position:absolute;inset:0;z-index:16;display:flex;align-items:flex-end;background:#14261d66}.permissions-dialog{display:flex;flex-direction:column;width:100%;max-height:calc(100% - 16px);min-height:0;background:var(--bg);border:1px solid var(--line);border-radius:16px 16px 0 0;overflow:hidden}.permissions-dialog-header{display:flex;align-items:center;gap:8px;min-height:64px;padding:7.5px 8px 7.5px 16px;border-bottom:1px solid var(--line);flex:none}.permissions-dialog h2{flex:1;min-width:0;margin:0;letter-spacing:normal;font-size:1.25rem;line-height:1.5;font-weight:700;overflow-wrap:anywhere}.permissions-dialog-body{padding:16px;min-height:0;overflow:auto;overscroll-behavior:contain}.permissions-detail-status{margin:0 0 12px}.permissions-detail-copy{margin:0;font-size:1rem;line-height:1.75;overflow-wrap:anywhere;white-space:pre-wrap}.pdf-permissions-task button{-webkit-tap-highlight-color:transparent}
:global(.theme-dark .pdf-permissions-task){--permission-limited-bg:#45372a;--permission-limited-ink:#f5d9ad}
@media(max-width:340px){.permissions-header h1{font-size:1.125rem}.permissions-card{padding:12px}.permissions-row{grid-template-columns:24px minmax(0,1fr) 20px;padding:12px;gap:10px}.permissions-row>svg:first-child{grid-column:1;grid-row:1/span 2}.permissions-row-text{grid-column:2;grid-row:1}.permissions-row>.permissions-status{grid-column:2;grid-row:2}.permissions-row>.permissions-chevron{grid-column:3;grid-row:1/span 2}.permissions-dialog h2{font-size:1.125rem}}
@media(max-height:400px){.permissions-header{min-height:49px;padding:0 8px}.permissions-header h1{font-size:1rem}.permissions-body{padding:12px}.permissions-footer,.permissions-dialog-footer{padding:8px 12px}.permissions-footer>.button,.permissions-dialog-footer>.button{padding:8px 6px;font-size:.75rem;line-height:1.5}.permissions-dialog-header{min-height:49px;padding:0 8px 0 12px}.permissions-dialog h2{font-size:1rem}.permissions-layer{padding-top:8px}.permissions-dialog{max-height:100%}.permissions-dialog-body{padding:12px}}

.permissions-header :deep(.mobile-help-trigger svg){width:22px;height:22px}

</style>
