<template>
  <NModal v-model:show="show" :mask-closable="true" :close-on-esc="true" @after-leave="retire">
    <NCard class="pdf-reading-update-dialog" title="更新 PDF 阅读笔记" role="dialog" aria-modal="true" aria-label="更新 PDF 阅读笔记" :closable="true" @close="show = false">
      <label v-if="blocks.length > 1">生成片段 <select v-model.number="selected" :disabled="busy"><option v-for="(block,index) in blocks" :key="block.metadata.id" :value="index">{{ index + 1 }} · {{ block.metadata.snapshot.relativePath }}</option></select></label>
      <template v-if="block">
        <p class="source">{{ block.metadata.snapshot.relativePath }}</p>
        <div class="update-options"><label><input v-model="includeNew" type="checkbox" :disabled="busy" /> 加入生成笔记后新增的批注</label><label v-if="changes.deleted"><input v-model="removeDeleted" type="checkbox" :disabled="busy" /> 移除已删除的批注摘录</label></div>
        <p v-if="fresh" class="update-summary" role="status">新增 {{ changes.added }} · 更新 {{ changes.changed }} · 已删除 {{ changes.deleted }}<span v-if="changes.deleted && !removeDeleted">（保留原摘录）</span></p>
        <p v-if="block.edited" class="update-notice">生成范围内已有修改。为保留你的补写，可将新版追加到末尾；原内容保持。</p>
        <p v-else class="update-notice">只更新这段生成内容，其他正文和未保存补写保留。更新后可撤销，请手动保存。</p>
        <div v-if="effective" class="update-preview" aria-label="阅读笔记更新预览"><article v-for="item in effective.items" :key="item.annotation.id"><strong>第 {{ item.annotation.page }} 页</strong><blockquote v-if="item.annotation.quote">{{ item.annotation.quote }}</blockquote><p v-if="block.metadata.comments && item.annotation.comment">{{ item.annotation.comment }}</p><small v-if="effective.missingIds?.includes(item.annotation.id)">原批注已删除，保留原摘录</small></article><p v-if="!effective.items.length">所选批注已全部删除，确认后仅保留生成标题。</p></div>
      </template>
      <p v-else-if="!error">这篇旧笔记没有可核对的生成范围，不能直接替换。请从 PDF 重新整理后插入或新建，原文保留。</p>
      <p v-if="error" class="update-error" role="alert">{{ error }}</p>
      <template #footer><div class="update-actions"><button @click="show = false">取消</button><button v-if="error && block" :disabled="busy" @click="load">重新核对</button><button v-if="block" class="primary" :disabled="busy || !effective || !!error || !hasChanges" @click="apply">{{ busy ? '正在核对…' : block.edited ? '保留原文，追加新版' : '更新当前草稿' }}</button></div></template>
    </NCard>
  </NModal>
</template>
<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {NCard,NModal,useMessage} from 'naive-ui'
import {invoke} from '@tauri-apps/api/core'
import {useAppStore} from '../store/app'
import {beginWindowSave} from '../services/windowDrafts'
import {readingNoteBlocks,readingUpdateChanges,readingUpdateSnapshot,replaceReadingNote,type ReadingNoteBlock} from '../utils/pdfReadingContinuity'
import type {PdfReadingSnapshot} from '../utils/pdfReadingNote'
export interface ReadingUpdateContext {key:string;content:string;revision?:string;ready:boolean}
const props=defineProps<{context:()=>ReadingUpdateContext;apply:(before:string,after:string,key:string)=>void}>()
const store=useAppStore(),message=useMessage(),show=ref(false),busy=ref(false),error=ref(''),blocks=ref<ReadingNoteBlock[]>([]),selected=ref(0),fresh=ref<PdfReadingSnapshot|null>(null),includeNew=ref(false),removeDeleted=ref(false)
let original='',owner='',root='',generation=0,revision:string|undefined
const block=computed(()=>blocks.value[selected.value]),effective=computed(()=>block.value&&fresh.value?readingUpdateSnapshot(block.value.metadata.snapshot,fresh.value,removeDeleted.value):null)
const changes=computed(()=>block.value&&fresh.value?readingUpdateChanges(block.value.metadata.snapshot,fresh.value):{added:0,changed:0,deleted:0})
const hasChanges=computed(()=>changes.value.added>0||changes.value.changed>0||JSON.stringify([...(fresh.value?.missingIds||[])].sort())!==JSON.stringify([...(block.value?.metadata.snapshot.missingIds||[])].sort())||(removeDeleted.value&&changes.value.deleted>0))
const valid=()=>{const live=props.context();return show.value&&store.libraryPath===root&&live.ready&&live.key===owner&&live.content===original&&live.revision===revision}
const retire=()=>{generation++;fresh.value=null;busy.value=false}
async function request():Promise<PdfReadingSnapshot>{
  if(!block.value||!valid())throw Error('笔记或编辑模式已有变化，请关闭后重新打开；未修改草稿')
  const s=block.value.metadata.snapshot
  return invoke('refresh_pdf_reading_note',{libraryRoot:root,pdfPath:root+'/'+s.relativePath,sourceDigest:s.sourceDigest,annotationIds:s.items.map(i=>i.annotation.id),knownAnnotationIds:s.knownAnnotationIds||[],includeNew:includeNew.value})
}
async function load(){
  const turn=++generation;fresh.value=null;error.value='';busy.value=true
  try{const value=await request();if(turn===generation){if(!valid())throw Error('核对期间笔记已有变化，未修改草稿，请重新打开');fresh.value=value}}
  catch(cause){if(turn===generation)error.value=String(cause).replace(/^Error:\s*/,'')}
  finally{if(turn===generation)busy.value=false}
}
function open(){
  const live=props.context();if(!live.ready){message.warning('请先返回可编辑的正文，再更新阅读笔记');return}
  show.value=false;retire();revision=live.revision;original=live.content;owner=live.key;root=store.libraryPath;selected.value=0;includeNew.value=false;removeDeleted.value=false;error.value='';show.value=true
  try{blocks.value=readingNoteBlocks(original);if(block.value)void load()}catch(cause){blocks.value=[];error.value=String(cause).replace(/^Error:\s*/,'')}
}
async function apply(){
  if(busy.value||!fresh.value||!effective.value||!block.value)return
  const turn=++generation,previous=JSON.stringify(fresh.value);busy.value=true;error.value='';const release=beginWindowSave()
  try{
    const checked=await request();if(turn!==generation)return
    if(!valid()||JSON.stringify(checked)!==previous)throw Error('PDF、批注或笔记已有变化，未修改草稿；请重新核对')
    const next=replaceReadingNote(original,block.value,effective.value,block.value.edited)
    props.apply(original,next,owner);show.value=false;message.success('阅读笔记已更新到草稿，可撤销，请手动保存')
  }catch(cause){if(turn===generation)error.value=String(cause).replace(/^Error:\s*/,'')}
  finally{if(turn===generation)busy.value=false;release()}
}
watch([selected,includeNew],()=>{if(show.value&&block.value)void load()},{flush:'sync'})
defineExpose({open})
</script>
<style scoped>
.pdf-reading-update-dialog.n-card{width:min(680px,calc(100vw - 24px));max-height:calc(100dvh - 32px);display:flex;flex-direction:column;background:var(--theme-card);color:var(--theme-text);border-radius:var(--theme-radius-lg,12px);box-shadow:var(--theme-shadow)}
.pdf-reading-update-dialog :deep(>.n-card__content){overflow:auto;min-height:0}.source{overflow-wrap:anywhere;font-weight:600}.update-options{display:flex;gap:12px;flex-wrap:wrap}.update-options label{display:flex;gap:6px;align-items:center}.update-summary{font-weight:600;color:var(--theme-primary)}.update-notice{color:var(--theme-text-secondary)}.update-preview{border:1px solid var(--workspace-border-color);border-radius:8px;padding:12px;overflow-wrap:anywhere}.update-preview article+article{border-top:1px solid var(--workspace-border-color);margin-top:12px;padding-top:12px}.update-preview blockquote{border-left:3px solid var(--theme-primary);margin:8px 0;padding-left:12px;white-space:pre-wrap}.update-preview p{white-space:pre-wrap}.update-preview small,.update-error{color:var(--theme-danger,#b93232)}.update-error{padding:10px;border:1px solid currentColor}.update-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}button,select{font:inherit;color:var(--theme-text);background:var(--theme-card);border:1px solid var(--workspace-border-color);border-radius:var(--theme-radius-sm,6px);padding:6px 12px}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}.primary{background:var(--theme-primary);color:var(--theme-text-on-primary,#fff)}
</style>
