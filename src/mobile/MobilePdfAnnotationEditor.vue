<template>
  <section v-if="mounted" v-show="open" class="pdf-annotation-editor" role="region" aria-label="PDF 批注编辑" :inert="mobileHelpOpen||undefined" @keydown.esc.stop.prevent="requestBack">
    <div class="annotation-editor-surface" :inert="!!panel||undefined" :aria-hidden="panel?true:undefined">
      <header class="annotation-editor-header"><button class="annotation-editor-back" aria-label="返回批注" :disabled="busy" @click="requestBack"><ArrowLeft :size="22" aria-hidden="true" /></button><h1 ref="heading" tabindex="-1"><span>{{ existing?'编辑':'记录' }}</span><wbr><span>{{ existing?'批注':'想法' }}</span></h1><button class="button primary-button annotation-editor-save" :disabled="busy||!writable" :aria-label="busy?'正在保存…':'保存批注'" @click="emit('save')">{{ busy?'正在保存…':'保存' }}</button></header>
      <div class="annotation-editor-context assistive-status">{{ name }} · 第 {{ annotation.page }} 页 · {{ kind }}</div>
      <div ref="body" class="annotation-editor-body">
        <section v-if="canCopy&&annotation.quote" class="annotation-source"><div class="annotation-source-label"><span>摘录（第 {{ annotation.page }} 页）</span><MobileHelp topic="annotationEditor" /></div><blockquote><MobilePdfExcerpt :text="annotation.quote" :color="annotation.color" :limit="240" panel /></blockquote><button class="annotation-editor-row annotation-source-row" aria-label="原文摘录，查看完整摘录" :disabled="busy" aria-haspopup="dialog" @click="showPanel('quote',$event.currentTarget as HTMLElement)"><span>查看完整摘录</span><ChevronRight :size="20" aria-hidden="true" /></button></section>
        <div v-else class="annotation-source-label"><span>第 {{ annotation.page }} 页 · {{ kind }}</span><MobileHelp topic="annotationEditor" /></div>
        <button class="annotation-editor-row annotation-color-row" aria-haspopup="dialog" :disabled="busy" @click="showPanel('color',$event.currentTarget as HTMLElement)"><span>{{ annotation.kind==='highlight'?'高亮颜色':'标记颜色' }}</span><i class="annotation-editor-swatch" :class="'color-'+annotation.color" aria-hidden="true" /><span class="assistive-status">{{ colors[annotation.color] }}</span><ChevronRight :size="20" aria-hidden="true" /></button>
        <label class="annotation-comment-label" for="pdf-comment">批注</label><textarea id="pdf-comment" ref="input" class="annotation-comment-field" :value="annotation.comment" :disabled="busy" :aria-describedby="error?'annotation-editor-error':undefined" maxlength="20000" rows="3" @input="emit('input',($event.target as HTMLTextAreaElement).value)" />
        <span class="assistive-status" role="status">{{ protecting?'正在暂存输入…':'' }}</span>
        <p v-if="error" id="annotation-editor-error" class="annotation-editor-error" role="alert">{{ error }}</p><p v-else-if="!writable&&!busy" class="annotation-editor-error" role="status">当前无法保存批注，输入仍保留。</p>
        <button class="annotation-editor-discard" :disabled="busy" @click="showPanel('discard',$event.currentTarget as HTMLElement)">放弃输入</button>
      </div>
    </div>
    <div v-if="panel" class="annotation-editor-layer" @click.self="closePanel">
      <section ref="dialog" class="annotation-editor-dialog" role="dialog" aria-modal="true" :aria-label="panelTitle" @keydown.tab.prevent="tab" @keydown.esc.stop.prevent="closePanel">
        <header class="annotation-editor-dialog-header"><h2 ref="panelHeading" tabindex="-1">{{ panelTitle }}</h2><button class="annotation-editor-close" aria-label="返回编辑" :disabled="busy" @click="closePanel"><X :size="22" aria-hidden="true" /></button></header>
        <div ref="panelBody" class="annotation-editor-dialog-body" role="region" :aria-label="panelTitle+'内容'" tabindex="0">
          <template v-if="panel==='color'"><button v-for="(label,color) in colors" :key="color" class="annotation-editor-choice" :disabled="busy" :aria-pressed="annotation.color===color" @click="chooseColor(color)"><i class="annotation-editor-swatch" :class="'color-'+color" aria-hidden="true" /><span>{{ label }}</span><CheckCircle2 v-if="annotation.color===color" :size="22" aria-hidden="true" /></button></template>
          <blockquote v-else-if="panel==='quote'" class="annotation-editor-quote">{{ annotation.quote }}</blockquote>
          <p v-else class="annotation-discard-copy">{{ existing?'尚未保存的修改会丢弃，已保存批注不变。':'这次输入尚未保存，放弃后不会新增批注。' }}</p>
          <p v-if="error&&/暂存|放弃/.test(error)" class="annotation-editor-error" role="alert">{{ error }}</p>
        </div>
        <footer v-if="panel==='discard'" class="annotation-editor-dialog-footer"><button class="button" :disabled="busy" @click="closePanel">{{ panel==='discard'?'继续编辑':'返回编辑' }}</button><button v-if="panel==='discard'" class="button danger-button" :disabled="busy" @click="emit('discard')">确认放弃</button></footer>
      </section>
    </div>
  </section>
</template>
<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,ref,watch} from 'vue'
import {ArrowLeft,ChevronRight,X,CheckCircle2} from 'lucide-vue-next'
import MobileHelp from './MobileHelp.vue'
import MobilePdfExcerpt from './MobilePdfExcerpt.vue'
import {mobileHelpOpen} from './mobileHelp'
import {canFocus,focusableControls} from './accessibility'
import type {PdfAnnotation} from '../types/pdfAnnotations'
const props=defineProps<{open:boolean;name:string;annotation:PdfAnnotation;existing:boolean;busy:boolean;protecting?:boolean;writable:boolean;canCopy:boolean;error:string;protect:()=>Promise<boolean>}>(),emit=defineEmits<{input:[value:string];color:[value:PdfAnnotation['color']];save:[];discard:[];back:[]}>()
const colors={yellow:'黄色',green:'绿色',pink:'粉色',blue:'蓝色'} as const,kind=computed(()=>props.annotation.kind==='highlight'?'高亮':props.annotation.kind==='area'?'区域批注':'评论')
type Panel=''|'color'|'quote'|'discard'
const mounted=ref(false),body=ref<HTMLElement>(),input=ref<HTMLTextAreaElement>(),heading=ref<HTMLElement>(),panel=ref<Panel>(''),dialog=ref<HTMLElement>(),panelHeading=ref<HTMLElement>(),panelBody=ref<HTMLElement>(),panelTitle=computed(()=>panel.value==='color'?'标记颜色':panel.value==='quote'?'原文摘录':'放弃输入？')
const panelPlaces=new Map<Panel,number>()
let mainScroll=0,panelOpener:HTMLElement|undefined,selection:{start:number;end:number;direction:'forward'|'backward'|'none'}|undefined,observer:ResizeObserver|undefined
function remember(){if(body.value)mainScroll=body.value.scrollTop;if(input.value)selection={start:input.value.selectionStart,end:input.value.selectionEnd,direction:input.value.selectionDirection}}
function value(){remember();return input.value?.value??props.annotation.comment}
function keepInputVisible(){if(!props.open||panel.value||!input.value||!body.value)return;input.value.style.maxHeight=Math.max(48,body.value.clientHeight-16)+'px';input.value.style.minHeight=Math.min(96,Math.max(48,body.value.clientHeight-16))+'px';if(document.activeElement!==input.value)return;const field=input.value.getBoundingClientRect(),view=body.value.getBoundingClientRect();body.value.scrollTop+=field.height>view.height-16?field.top-view.top-8:field.bottom>view.bottom?field.bottom-view.bottom+8:field.top<view.top?field.top-view.top-8:0}
watch(()=>props.error,async error=>{if(!error||!props.open||panel.value)return;await nextTick();const e=body.value?.querySelector('.annotation-editor-error');if(e&&body.value){const r=e.getBoundingClientRect(),b=body.value.getBoundingClientRect();if(r.bottom>b.bottom)body.value.scrollTop+=r.bottom-b.bottom+8}})
watch(body,element=>{observer?.disconnect();if(element){observer=new ResizeObserver(keepInputVisible);observer.observe(element)}},{flush:'post'})
watch(()=>props.open,async open=>{if(!open){remember();panel.value='';return}mounted.value=true;await nextTick();if(body.value)body.value.scrollTop=mainScroll;input.value?.focus({preventScroll:true});if(input.value&&selection)input.value.setSelectionRange(selection.start,selection.end,selection.direction);else if(input.value)input.value.setSelectionRange(input.value.value.length,input.value.value.length);keepInputVisible()},{immediate:true})
let changing=false
async function showPanel(next:Panel,opener:HTMLElement){if(props.busy||changing)return;changing=true;try{if(next==='discard'){if(value()!==props.annotation.comment)emit('input',value())}else if(!await props.protect())return;remember();panelOpener=opener;panel.value=next;await nextTick();if(panelBody.value)panelBody.value.scrollTop=panelPlaces.get(next)||0;panelHeading.value?.focus({preventScroll:true})}finally{changing=false}}
async function closePanel(){if(props.busy||changing)return;changing=true;try{if(panel.value!=='discard'&&!await props.protect())return;panelPlaces.set(panel.value,panelBody.value?.scrollTop||0);panel.value='';await nextTick();if(body.value)body.value.scrollTop=mainScroll;(canFocus(panelOpener)?panelOpener:heading.value)?.focus({preventScroll:true})}finally{changing=false}}
function chooseColor(color:PdfAnnotation['color']){if(props.busy||changing)return;emit('color',color);void closePanel()}
function back(){if(!panel.value)return false;void closePanel();return true}
function requestBack(){if(!back())emit('back')}
function tab(event:KeyboardEvent){const items=focusableControls(dialog.value),index=items.indexOf(document.activeElement as HTMLElement);if(items.length)items[(index+(event.shiftKey?-1:1)+items.length)%items.length]?.focus()}
onBeforeUnmount(()=>observer?.disconnect())
defineExpose({value,back})
</script>
<style scoped>
.pdf-annotation-editor{--annotation-error:#a13e32;position:absolute;z-index:18;inset:0;display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--bg);color:var(--ink)}
.annotation-editor-surface{display:flex;flex:1;flex-direction:column;min-height:0}
.annotation-editor-header{display:flex;align-items:center;gap:8px;flex:none;min-height:64px;padding:7.5px 8px;border-bottom:1px solid var(--line)}.annotation-editor-header h1{flex:1;min-width:0;margin:0;letter-spacing:normal;font-size:1.25rem;line-height:1.5;font-weight:700;overflow-wrap:anywhere}
.annotation-editor-header h1 span{display:inline-block;white-space:nowrap}
.annotation-editor-back,.annotation-editor-close{display:grid;place-items:center;flex:0 0 48px;width:48px;height:48px;padding:0;border:0;background:transparent;color:var(--ink)}
.annotation-editor-save{flex:none;min-width:64px;max-width:46%;min-height:48px;padding:10px 16px;font-size:1rem;line-height:1.5;border-radius:10px;overflow-wrap:anywhere;font-weight:500}
.annotation-editor-body{flex:1;min-height:0;padding:12px 16px 24px;overflow:auto;overscroll-behavior:contain}
.annotation-source-label{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:40px;font-size:1rem;line-height:1.5}.annotation-source-label>span{flex:1;min-width:0}.annotation-source-label :deep(.mobile-help-trigger){flex:none}
.annotation-source blockquote{margin:0;border:0;padding:0;font-size:1rem;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}
.annotation-editor-row{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:12px 0;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--ink);text-align:left;font:inherit;font-size:1rem;line-height:1.5}.annotation-editor-row>span:first-child{flex:1;min-width:0}.annotation-editor-row>svg{flex:none;color:var(--muted)}.annotation-source-row{margin-top:0}.annotation-color-row{margin-bottom:20px}
.annotation-editor-swatch{display:inline-block;flex:none;width:28px;height:28px;border:1px solid var(--line);border-radius:50%}.annotation-color-row .annotation-editor-swatch{outline:1.5px solid var(--primary);outline-offset:3px;margin-right:4px}.color-yellow{background:#ffe16a}.color-green{background:#88bc7c}.color-pink{background:#ed9cb5}.color-blue{background:#88b9ed}
.annotation-comment-label{display:block;font-size:1rem;line-height:1.5;margin:0 0 8px}.annotation-comment-field{display:block;width:100%;min-width:0;min-height:96px;height:7.5rem;padding:12px;resize:none;border:1px solid var(--primary);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit;font-size:1rem;line-height:1.65}.annotation-comment-field:focus-visible{outline:1px solid var(--primary);outline-offset:0}
.annotation-editor-discard{display:block;min-height:48px;margin:20px auto 0;padding:10px 16px;border:0;background:transparent;color:var(--muted);font:inherit;font-size:.875rem;line-height:1.5}
.annotation-editor-error{font-size:.875rem;line-height:1.6;margin:16px 0 0;color:var(--annotation-error);overflow-wrap:anywhere}
.annotation-editor-dialog-footer{display:flex;gap:8px;flex:none;padding:12px 16px;border-top:1px solid var(--line);background:var(--bg);max-height:45dvh;overflow:auto}.annotation-editor-dialog-footer .button{flex:1;min-width:0;min-height:48px;padding:11px 10px;border-radius:10px;font-size:1rem;line-height:1.5;font-weight:400}
.annotation-editor-layer{position:absolute;z-index:20;inset:0;display:grid;place-items:center;padding:16px;background:#14261d66}.annotation-editor-dialog{display:flex;flex-direction:column;width:min(100%,400px);max-height:100%;min-height:0;border:1px solid var(--line);border-radius:16px;background:var(--bg);overflow:hidden;box-shadow:0 12px 40px #14261d26}
.annotation-editor-dialog-header{display:flex;gap:8px;align-items:center;flex:none;min-height:64px;padding:7.5px 8px 7.5px 16px;border-bottom:1px solid var(--line);background:var(--bg)}.annotation-editor-dialog-header h2{flex:1;min-width:0;margin:0;letter-spacing:normal;font-size:1.25rem;line-height:1.5;font-weight:700;overflow-wrap:anywhere}.annotation-editor-dialog-body{min-height:0;padding:16px;overflow:auto;overscroll-behavior:contain}.annotation-editor-choice{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:12px 4px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--ink);font:inherit;font-size:1rem;line-height:1.5;text-align:left}.annotation-editor-choice:last-child{border:0}.annotation-editor-choice>span{flex:1}.annotation-editor-choice svg{color:var(--primary);flex:none}
.annotation-editor-quote{margin:0;padding:0 0 0 12px;border-left:3px solid var(--primary-soft);white-space:pre-wrap;overflow-wrap:anywhere;font-size:1rem;line-height:1.75}.annotation-discard-copy{margin:0;font-size:.875rem;line-height:1.6;overflow-wrap:anywhere}.annotation-editor-dialog-footer .danger-button{background:var(--annotation-error);border-color:var(--annotation-error);color:var(--bg)}
@media(max-width:340px){.annotation-editor-context{flex-wrap:wrap;gap:4px 12px}.annotation-editor-context p{flex-basis:100%}.annotation-editor-footer,.annotation-editor-dialog-footer{flex-direction:column}.annotation-editor-footer .button,.annotation-editor-dialog-footer .button{flex:none}.annotation-editor-dialog-header h2{font-size:1.125rem}}
@media(max-height:400px){.annotation-editor-header{min-height:49px;padding:0 8px}.annotation-editor-header h1{font-size:1rem}.annotation-editor-context{display:none}.annotation-editor-body{padding:12px}.annotation-editor-layer{padding:8px}.annotation-editor-dialog-header{min-height:49px;padding:0 8px 0 12px}.annotation-editor-dialog-header h2{font-size:1rem}.annotation-editor-dialog-body{padding:12px}.annotation-editor-footer,.annotation-editor-dialog-footer{flex-direction:row;padding:8px 12px}.annotation-editor-footer .button,.annotation-editor-dialog-footer .button{flex:1;padding:8px 6px;font-size:.75rem;line-height:1.5}}


.pdf-annotation-editor :deep(button){-webkit-tap-highlight-color:transparent}
:global(.theme-dark .pdf-annotation-editor){--annotation-error:#ffb4a8}

</style>
