<template>
  <section v-if="mounted" v-show="open" class="pdf-settings-task" role="region" aria-label="PDF 阅读设置" :inert="mobileHelpOpen || undefined" @keydown.esc.stop.prevent="back">
    <div class="pdf-settings-surface" :inert="!!panel || undefined" :aria-hidden="panel?true:undefined">
      <header class="pdf-settings-heading"><button class="pdf-settings-back" :aria-label="returnMenu?'返回 PDF 操作':'关闭阅读设置'" @click="hide(true)"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 ref="heading" tabindex="-1">阅读设置</h1><MobileHelp topic="pdfReading" /></header>
      <div class="pdf-settings-context"><p class="pdf-settings-file">{{ name }}</p><span class="pdf-settings-count">第 {{ page }} / {{ pages }} 页</span></div>
      <div ref="body" class="pdf-settings-body" @focusin="rememberMain">
        <div v-if="textMode" class="pdf-settings-text-state"><p id="pdf-reading-unavailable" role="status">在原版页面中调整显示方式。</p><button class="button" @click="original">返回原版页面</button></div>
        <div class="pdf-settings-rows"><button class="pdf-setting-row" :disabled="busy||textMode" :aria-describedby="textMode?'pdf-reading-unavailable':undefined" aria-haspopup="dialog" :aria-expanded="panel==='mode'" @click="showPanel('mode')"><strong>阅读方式</strong><small>{{ mode==='continuous'?'连续阅读':'逐页阅读' }}</small><ChevronRight :size="20" aria-hidden="true" /></button><button class="pdf-setting-row" :disabled="busy||textMode" :aria-describedby="textMode?'pdf-reading-unavailable':undefined" aria-haspopup="dialog" :aria-expanded="panel==='direction'" @click="showPanel('direction')"><strong>显示方向</strong><small>{{ directionLabel }}</small><ChevronRight :size="20" aria-hidden="true" /></button><button class="pdf-setting-row" :disabled="busy||textMode" :aria-describedby="textMode?'pdf-reading-unavailable':undefined" aria-haspopup="dialog" :aria-expanded="panel==='zoom'" @click="showPanel('zoom')"><strong>缩放比例</strong><small>{{ Math.round(zoom*100) }}%</small><ChevronRight :size="20" aria-hidden="true" /></button><label class="pdf-setting-row pdf-setting-theme"><strong id="pdf-dark-switch-label">深色界面</strong><small aria-hidden="true">{{ dark?'已开启':'已关闭' }}</small><span class="pdf-setting-switch" :class="{'is-on':dark}"><input type="checkbox" role="switch" aria-labelledby="pdf-dark-switch-label" :checked="dark" @change="emit('theme')" /><i aria-hidden="true" /></span></label><button class="pdf-setting-row" @click="emit('permissions', $event.currentTarget as HTMLElement)"><strong>文档权限</strong><small>{{ permissionSummary }}</small><ChevronRight :size="20" aria-hidden="true" /></button></div>
      </div>
      <footer class="pdf-settings-footer"><button class="button primary-button" @click="hide()">继续阅读 · 第 {{ page }} 页</button></footer>
    </div>
    <div v-if="panel" class="pdf-settings-layer" @click.self="cancelPanel">
      <section ref="dialog" class="pdf-settings-dialog" role="dialog" aria-modal="true" aria-label="PDF 阅读选项" @keydown.tab.prevent="tab" @keydown.esc.stop.prevent="cancelPanel">
        <header class="pdf-settings-dialog-header"><h2 ref="panelHeading" tabindex="-1">{{ panelTitle }}</h2><MobileHelp topic="pdfReading" /><button class="pdf-settings-dialog-close" aria-label="返回阅读设置" @click="cancelPanel"><X :size="22" aria-hidden="true" /></button></header>
        <div ref="panelBody" class="pdf-settings-dialog-body" @focusin="rememberPanel">
          <div v-if="panel==='zoom'" class="pdf-setting-zoom"><output class="pdf-setting-zoom-value" for="pdf-setting-zoom" aria-live="polite">{{ draft }}%</output><input id="pdf-setting-zoom" aria-label="PDF 缩放百分比" type="range" min="100" max="300" step="25" :value="draft" data-setting-focus="range" :disabled="busy" @input="setDraft(Number(($event.target as HTMLInputElement).value))" /><div class="pdf-setting-zoom-steps"><button class="button" aria-label="缩小 PDF" data-setting-focus="minus" :disabled="draft<=100||busy" @click="setDraft(draft-25)"><Minus :size="20" aria-hidden="true" /></button><button class="button" aria-label="放大 PDF" data-setting-focus="plus" :disabled="draft>=300||busy" @click="setDraft(draft+25)"><Plus :size="20" aria-hidden="true" /></button></div><button class="button pdf-setting-fit" data-setting-focus="fit" :disabled="busy" @click="setDraft(100)">适合宽度</button></div>
          <div v-else class="pdf-setting-choices"><button v-for="choice in choices" :key="choice.value" class="pdf-setting-choice" :data-setting-focus="String(choice.value)" :disabled="busy" :aria-pressed="panel==='mode'?mode===choice.value:rotation===choice.value" @click="choose(choice.value)">{{ choice.label }}<CheckCircle2 v-if="panel==='mode'?mode===choice.value:rotation===choice.value" :size="22" aria-hidden="true" /></button></div>
        </div>
        <footer class="pdf-settings-dialog-footer"><button class="button" @click="cancelPanel">返回设置</button><button v-if="panel==='zoom'" class="button primary-button" :disabled="busy||textMode" @click="applyZoom">应用缩放</button></footer>
      </section>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { ArrowLeft, ChevronRight, X, Minus, Plus, CheckCircle2 } from 'lucide-vue-next'
import MobileHelp from './MobileHelp.vue'
import { mobileHelpOpen } from './mobileHelp'
import { canFocus, focusableControls } from './accessibility'
import type { PdfRotation } from './pdfOrientation'
const props=defineProps<{returnMenu?:boolean;name:string;page:number;pages:number;mode:'single'|'continuous';rotation:PdfRotation;zoom:number;dark:boolean;textMode:boolean;busy:boolean;permissionSummary:string}>()
const emit=defineEmits<{opened:[value:boolean];return:[];mode:[value:'single'|'continuous'];direction:[value:PdfRotation];zoom:[value:number];theme:[];original:[];permissions:[target:HTMLElement]}>()
type Panel='mode'|'direction'|'zoom'
const mounted=ref(false),open=ref(false),panel=ref<Panel|''>(''),heading=ref<HTMLElement>(),body=ref<HTMLElement>(),dialog=ref<HTMLElement>(),panelHeading=ref<HTMLElement>(),panelBody=ref<HTMLElement>(),draft=ref(100)
const directionLabel=computed(()=>({0:'原始方向',90:'向右 90°',180:'倒置 180°',270:'向左 90°'}[props.rotation])),panelTitle=computed(()=>panel.value?{mode:'阅读方式',direction:'显示方向',zoom:'缩放比例'}[panel.value]:''),choices=computed(()=>panel.value==='mode'?[{value:'single',label:'逐页阅读'},{value:'continuous',label:'连续阅读'}]:[{value:0,label:'原始方向'},{value:90,label:'向右 90°'},{value:180,label:'倒置 180°'},{value:270,label:'向左 90°'}])
let pending=false,epoch=0,savedScroll=0,lastFocus:HTMLElement|undefined
const places=new Map<Panel,{scroll:number;focus?:string}>(),focusKeys=new Map<Panel,string>()
function rememberMain(event:FocusEvent){if(event.target instanceof HTMLElement)lastFocus=event.target}
function rememberPanel(event:FocusEvent){const key=(event.target as HTMLElement)?.dataset.settingFocus;if(panel.value&&key)focusKeys.set(panel.value,key)}
function savePanel(){if(panel.value)places.set(panel.value,{scroll:panelBody.value?.scrollTop||0,focus:focusKeys.get(panel.value)})}
async function show(){if(open.value)return;const owner=++epoch;mounted.value=true;open.value=true;emit('opened',true);await nextTick();if(!open.value||owner!==epoch)return;(canFocus(lastFocus)?lastFocus:heading.value)?.focus({preventScroll:true});if(body.value)body.value.scrollTop=savedScroll}
function hide(restore=false){if(!open.value)return;epoch++;savePanel();savedScroll=body.value?.scrollTop||0;panel.value='';open.value=false;emit('opened',false);if(restore)emit('return')}
async function showPanel(value:Panel){if(props.busy||props.textMode)return;const owner=++epoch;savedScroll=body.value?.scrollTop||0;if(value==='zoom'&&!pending)draft.value=Math.round(props.zoom*100);panel.value=value;await nextTick();if(!open.value||panel.value!==value||owner!==epoch)return;const place=places.get(value),target=[...(panelBody.value?.querySelectorAll<HTMLElement>('[data-setting-focus]')||[])].find(e=>e.dataset.settingFocus===place?.focus);(canFocus(target)?target:panelHeading.value)?.focus({preventScroll:true});if(panelBody.value)panelBody.value.scrollTop=place?.scroll||0}
async function cancelPanel(){epoch++;savePanel();panel.value='';await nextTick();if(!open.value)return;if(canFocus(lastFocus))lastFocus.focus({preventScroll:true});if(body.value)body.value.scrollTop=savedScroll}
function setDraft(value:number){draft.value=Math.max(100,Math.min(300,Math.round(value/25)*25));pending=true}
function applyZoom(){if(props.busy||props.textMode)return;const value=draft.value/100;pending=false;hide();emit('zoom',value)}
function choose(value:string|number){if(props.busy||props.textMode)return;const kind=panel.value;hide();if(kind==='mode')emit('mode',value as 'single'|'continuous');else emit('direction',value as PdfRotation)}
function original(){hide();emit('original')}
function tab(event:KeyboardEvent){const controls=focusableControls(dialog.value),index=controls.indexOf(document.activeElement as HTMLElement);controls[event.shiftKey?(index<=0?controls.length-1:index-1):(index+1)%controls.length]?.focus()}
function back(){if(!open.value)return false;if(panel.value)void cancelPanel();else hide(true);return true}
onBeforeUnmount(()=>{epoch++;emit('opened',false)})
defineExpose({show,hide,back})
</script>
<style scoped>
/* Settings task and choices */
.pdf-settings-task { position:absolute; z-index:11; inset:0; min-height:0; overflow:hidden; background:var(--bg); color:var(--ink); }
.pdf-settings-task button { -webkit-tap-highlight-color:transparent; }
.pdf-settings-surface { height:100%; display:flex; flex-direction:column; min-height:0; }
.pdf-settings-heading { display:flex; flex:none; align-items:center; gap:8px; min-height:64px; padding:7.5px 8px; border-bottom:1px solid var(--line); }
.pdf-settings-heading h1 { flex:1; min-width:0; margin:0; font-size:1.25rem; line-height:1.5; letter-spacing:0; font-weight:700; overflow-wrap:anywhere; }
.pdf-settings-back { display:grid; place-items:center; flex:0 0 48px; width:48px; height:48px; padding:0; border:0; background:transparent; color:var(--muted); }
.pdf-settings-heading :deep(.mobile-help-trigger svg),.pdf-settings-dialog-header :deep(.mobile-help-trigger svg) { width:22px; height:22px; }
.pdf-settings-context { display:flex; flex:none; align-items:start; gap:12px; padding:12px 16px; }
.pdf-settings-file { flex:1; min-width:0; margin:0; color:var(--muted); font-size:.8125rem; line-height:1.5384615385; overflow-wrap:anywhere; }
.pdf-settings-count { flex:none; color:var(--muted); font-size:.8125rem; line-height:1.5384615385; }
.pdf-settings-body { flex:1; min-height:0; padding:16px; overflow:auto; overscroll-behavior:contain; }
.pdf-settings-rows { border:1px solid var(--line); border-radius:12px; overflow:hidden; background:var(--surface); }
.pdf-setting-row { display:flex; align-items:center; gap:8px; width:100%; min-width:0; min-height:72px; padding:12px 16px; border:0; background:var(--surface); color:var(--ink); text-align:left; }
.pdf-setting-row+.pdf-setting-row { border-top:1px solid var(--line); }
.pdf-setting-row strong { flex:1; min-width:0; font-size:1rem; line-height:1.5; font-weight:600; overflow-wrap:anywhere; }
.pdf-setting-row small { max-width:50%; font-size:.875rem; line-height:1.5; font-weight:400; color:var(--muted); overflow-wrap:anywhere; }
.pdf-setting-row svg { flex:none; color:var(--muted); }
.pdf-setting-row:active,.pdf-setting-choice:active,.pdf-settings-back:active { background:var(--panel); }
.pdf-setting-switch { flex:none; position:relative; width:44px; height:26px; border-radius:99px; background:var(--muted); }
.pdf-setting-theme { cursor:pointer; -webkit-tap-highlight-color:transparent; }
.pdf-setting-switch input { position:absolute; left:-2px; top:-11px; width:48px; height:48px; margin:0; opacity:0; cursor:pointer; z-index:1; }
.pdf-setting-switch:focus-within { outline:3px solid #6da68c; outline-offset:3px; }
.pdf-setting-switch i { pointer-events:none; position:absolute; width:20px; height:20px; left:3px; top:3px; border-radius:50%; background:var(--bg); }
.pdf-setting-switch.is-on { background:var(--primary); }
.pdf-setting-switch.is-on i { left:21px; }
.pdf-settings-text-state { padding:16px; margin-bottom:16px; border:1px solid var(--line); border-radius:12px; background:var(--surface); }
.pdf-settings-text-state p { margin:0 0 12px; font-size:.875rem; line-height:1.5; }
.pdf-settings-text-state .button { width:100%; }
.pdf-settings-footer { flex:none; padding:12px 16px calc(12px + env(safe-area-inset-bottom)); border-top:1px solid var(--line); background:var(--bg); max-height:45dvh; overflow:auto; }
.pdf-settings-footer .button { width:100%; min-height:48px; padding:11px 14px; border-radius:10px; font-size:.875rem; line-height:1.7142857143; font-weight:400; }
.pdf-settings-layer { position:absolute; z-index:20; inset:0; display:grid; place-items:center; padding:16px; background:#14261d66; }
.pdf-settings-dialog { width:min(100%,400px); max-height:100%; display:flex; flex-direction:column; min-height:0; border:1px solid var(--line); border-radius:16px; background:var(--bg); overflow:hidden; box-shadow:0 12px 40px #14261d26; }
.pdf-settings-dialog-header { display:flex; flex:none; align-items:center; gap:8px; min-height:64px; padding:7.5px 8px 7.5px 16px; border-bottom:1px solid var(--line); }
.pdf-settings-dialog-header h2 { flex:1; min-width:0; margin:0; letter-spacing:normal; font-size:1.25rem; line-height:1.5; font-weight:700; overflow-wrap:anywhere; }
.pdf-settings-dialog-close { display:grid; place-items:center; flex:0 0 48px; width:48px; height:48px; padding:0; border:0; background:transparent; color:var(--muted); }
.pdf-settings-dialog-body { padding:16px; min-height:0; overflow:auto; overscroll-behavior:contain; }
.pdf-setting-choices { display:grid; gap:8px; }
.pdf-setting-choice { display:flex; justify-content:space-between; align-items:center; gap:12px; width:100%; min-height:56px; padding:12px 16px; text-align:left; color:var(--ink); background:var(--surface); border:1px solid var(--line); border-radius:10px; font-size:1rem; line-height:1.5; }
.pdf-setting-choice[aria-pressed=true] { border-color:var(--primary); background:var(--primary-soft); }
.pdf-setting-choice svg { flex:none; color:var(--primary); }
.pdf-setting-zoom-value { display:block; margin:0 0 12px; text-align:center; font-size:1.5rem; line-height:1.5; font-weight:600; }
.pdf-setting-zoom input { display:block; width:100%; height:48px; margin:0 0 12px; accent-color:var(--primary); }
.pdf-setting-zoom-steps { display:flex; gap:8px; }
.pdf-setting-zoom-steps .button { flex:1; min-width:0; min-height:48px; padding:10px; font-size:.875rem; line-height:1.5; font-weight:400; border-radius:10px; }
.pdf-setting-fit { width:100%; margin-top:12px; }
.pdf-settings-dialog-footer { display:flex; flex:none; gap:8px; padding:12px 16px; border-top:1px solid var(--line); max-height:45dvh; overflow:auto; }
.pdf-settings-dialog-footer .button { flex:1; min-width:0; min-height:48px; padding:11px 10px; font-size:.875rem; line-height:1.7142857143; font-weight:400; border-radius:10px; }
@media(max-width:340px) { .pdf-settings-dialog-footer { flex-direction:column; } .pdf-settings-dialog-footer .button { flex:none; } .pdf-setting-row { flex-wrap:wrap; } .pdf-setting-row strong { flex-basis:calc(100% - 36px); } .pdf-setting-row small { max-width:none; } .pdf-settings-dialog-header h2 { font-size:1.125rem; } }
@media(max-height:400px) { .pdf-settings-heading { min-height:49px; padding:0 8px; } .pdf-settings-heading h1 { font-size:1rem; } .pdf-settings-context,.pdf-settings-footer { display:none; } .pdf-settings-body { padding:12px; } .pdf-settings-layer { padding:8px; } .pdf-settings-dialog-header { min-height:49px; padding:0 8px 0 12px; } .pdf-settings-dialog-header h2 { font-size:1rem; } .pdf-settings-dialog-body { padding:12px; } .pdf-settings-dialog-footer { flex-direction:row; padding:8px 12px; } .pdf-settings-dialog-footer .button { flex:1; padding:8px 6px; font-size:.75rem; line-height:1.5; } }

</style>
