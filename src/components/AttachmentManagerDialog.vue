<template>
  <n-modal :show="visible" preset="card" title="管理附件" class="attachment-manager" :style="{ width: 'min(800px, calc(100vw - 28px))' }" @update:show="show => !show && close()">
    <div class="attachment-heading"><strong>{{ filename(path) }}</strong><n-button size="small" :loading="loading" :disabled="working" aria-label="刷新附件" @click="refresh"><template #icon><RefreshCw :size="16" /></template>刷新</n-button></div>
    <p v-if="error" role="alert" class="attachment-error">{{ error }}</p>
    <p v-if="notice" role="status" class="attachment-note">{{ notice }}</p>
    <template v-if="report?.markdown">
      <n-input v-model:value="query" placeholder="查找文件名或路径" :input-props="{ 'aria-label': '查找附件' }" clearable />
      <div v-if="filtered.length" class="attachment-layout">
        <div class="attachment-list" aria-label="文中引用的文件">
          <button v-for="item in filtered" :key="item.target" type="button" class="attachment-row" :class="{ selected: selected?.target === item.target }" :data-attachment-target="item.target" :aria-pressed="selected?.target === item.target" @click="selectedTarget = item.target">
            <Paperclip :size="18" /><span><strong>{{ referenceName(item.target) }}</strong><small>{{ item.target }}</small></span><small class="attachment-status" :class="item.status">{{ status(item.status) }}</small>
          </button>
        </div>
        <div v-if="selected" class="attachment-detail">
          <strong>{{ referenceName(selected.target) }}</strong><p class="attachment-path">{{ selected.path || selected.target }}</p>
          <small>第 {{ selected.line }} 行 · {{ selected.count }} 处引用</small>
          <div class="attachment-actions">
            <n-button size="small" :disabled="selected.status !== 'resolved_file' || working || !canOpen(selected.path)" @click="openFile(selected.path)">打开</n-button>
            <n-button size="small" :disabled="selected.status !== 'resolved_file' || working" @click="locate(selected.path)">查看位置</n-button>
            <n-button size="small" :disabled="selected.status !== 'resolved_file' || working" @click="showUses(selected.path)">查看引用</n-button>
            <n-button v-if="selected.canReplace" type="primary" size="small" :loading="working" @click="prepareReplacement">更换引用…</n-button>
          </div>
          <p v-if="selected.status === 'missing'" class="attachment-note">文件已找不到。可选择现有文件修复这篇笔记的引用。</p>
          <p v-else-if="selected.status === 'resolved_file' && !canOpen(selected.path)" class="attachment-note">此类型暂无内置编辑器，可查看文件位置。</p>
          <p v-else-if="!selected.canReplace && selected.status !== 'resolved_file'" class="attachment-note">这类路径需要在正文中核对，原文保持不变。</p>
        </div>
      </div>
      <div v-else-if="!loading" class="attachment-empty"><Paperclip :size="28" /><span>{{ query ? '没有匹配的附件' : '这篇笔记没有本地附件引用' }}</span></div>
    </template>
    <div v-else-if="loading" class="attachment-empty">正在读取…</div>
    <div class="attachment-footer"><n-button size="small" :disabled="loading || working" @click="showUses(path)">哪些笔记引用此文件</n-button><n-button size="small" @click="close">关闭</n-button></div>
  </n-modal>
  <n-modal :show="usesVisible" preset="card" title="引用位置" class="attachment-uses" :style="{ width: 'min(620px, calc(100vw - 28px))' }" @update:show="value => usesVisible = value">
    <strong>{{ filename(usesPath) }}</strong><p v-if="usesError" role="alert" class="attachment-error">{{ usesError }}</p>
    <p v-if="usesLoading">正在查找 Markdown 引用…</p>
    <div class="attachment-list"><button v-for="item in uses" :key="item.document" class="attachment-row" type="button" @click="openUse(item)"><FileText :size="18" /><span><strong>{{ filename(item.document) }}</strong><small v-if="relative(item.document) !== filename(item.document)">{{ relative(item.document) }}</small></span><span class="attachment-use-location"><small>{{ item.source === 'draft' ? '未保存' : '已保存' }}</small><small>第 {{ item.line }} 行 · {{ item.count }} 处</small></span></button></div>
    <p v-if="!usesLoading && !usesError && !uses.length" class="attachment-note">没有找到引用。没有结果不表示可以删除文件。</p>
    <details class="attachment-note attachment-scope"><summary>检查范围</summary>资料库内已保存的 Markdown，以及当前窗口的完整未保存笔记；同一篇以草稿为准。其他窗口、库外文件和其他格式未检查。每篇最多 2 MiB、总计 32 MiB，遇到读取限制会说明。</details>
    <div class="attachment-footer"><n-button size="small" :loading="usesLoading" @click="showUses(usesPath)">刷新引用</n-button><n-button size="small" @click="usesVisible = false">返回</n-button></div>
  </n-modal>
  <n-modal :show="!!replacement" preset="card" title="更换引用" class="attachment-replacement" :style="{ width: 'min(560px, calc(100vw - 28px))' }" @update:show="value => !value && (replacement = null)">
    <template v-if="replacement"><p class="attachment-path">{{ replacement.oldTarget }} → {{ replacement.target }}</p><p>仅更改这篇笔记的 {{ replacement.count }} 处引用，原附件保留。</p><p v-if="replacement.imported" class="attachment-note">库外文件已复制到附件目录，原件保持不变；取消更换也会保留副本。</p><p v-if="replacementError" role="alert" class="attachment-error">{{ replacementError }}</p><div class="attachment-footer"><n-button @click="replacement = null">取消</n-button><n-button type="primary" @click="applyReplacement">应用到草稿</n-button></div></template>
  </n-modal>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NModal, NInput, NButton, useMessage } from 'naive-ui'
import { Paperclip, FileText, RefreshCw } from 'lucide-vue-next'
import { invoke } from '@tauri-apps/api/core'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { findFileFormat } from '../config/fileFormats'
import type { AttachmentDraft } from '../utils/attachmentDrafts'
interface Attachment { target:string; path:string|null; status:string; line:number; count:number; canReplace:boolean }
interface Report { document:string; markdown:boolean; references:Attachment[] }
interface Use { document:string; line:number; count:number; source:'draft'|'saved' }
interface Replacement { content:string; count:number; target:string; oldTarget:string; expected:string; imported:boolean }
const props=defineProps<{libraryRoot:string; contextKey:string; captureDraft:(path:string)=>string|null; captureReferenceDrafts?:()=>AttachmentDraft[]; applyDraft:(path:string,expected:string,content:string)=>void}>()
const emit=defineEmits<{open:[path:string]}>(), message=useMessage()
const visible=ref(false), path=ref(''), report=ref<Report|null>(null), query=ref(''), selectedTarget=ref(''), loading=ref(false), working=ref(false), error=ref(''), notice=ref('')
const usesVisible=ref(false), usesLoading=ref(false), usesError=ref(''), usesPath=ref(''), uses=ref<Use[]>([]), replacement=ref<Replacement|null>(null), replacementError=ref('')
let generation=0, useGeneration=0, usesSnapshot=''
const referenceDrafts=()=>props.captureReferenceDrafts?.()||[]
const filename=(value:string)=>value.split(/[\\/]/).pop()||value
const canOpen=(value?:string|null)=>!!value && !!findFileFormat(value)
const referenceName=(value:string)=>{try{return filename(decodeURIComponent(value.split(/[?#]/)[0]||value))}catch{return filename(value)}}
const relative=(value:string)=>value.replace(props.libraryRoot,'').replace(/^[\\/]/,'')
const status=(value:string)=>({resolved_file:'可用',missing:'已失效',unreadable:'无法读取',outside_library:'库外路径',internal:'内部记录'}[value]||'需核对')
const filtered=computed(()=>report.value?.references.filter(item=>`${item.target}\n${item.path||''}`.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()))||[])
const selected=computed(()=>filtered.value.find(item=>item.target===selectedTarget.value)||filtered.value[0])
const close=()=>{visible.value=false;usesVisible.value=false;replacement.value=null;++generation;++useGeneration;loading.value=false}
const refresh=async()=>{
  if(!visible.value)return
  const token=++generation, root=props.libraryRoot, document=path.value;loading.value=true;error.value=''
  try {const draft=props.captureDraft(document);const value=await invoke<Report>('inspect_library_attachments',{libraryRoot:root,documentPath:document,draft});if(token===generation&&visible.value)report.value=value}
  catch(cause){if(token===generation)error.value=`附件暂时无法读取：${String(cause)}`}
  finally{if(token===generation)loading.value=false}
}
const open=async(document:string)=>{close();path.value=document;report.value=null;query.value='';selectedTarget.value='';notice.value='';working.value=false;visible.value=true;await refresh();const current=report.value as Report|null;if(visible.value&&current&&!current.markdown)void showUses(document)}
const openFile=(value?:string|null)=>{if(!value)return;close();emit('open',value)}
const locate=async(value?:string|null)=>{if(!value)return;const token=generation;try{await revealItemInDir(value)}catch(cause){if(token===generation)error.value=`文件位置暂时无法打开：${String(cause)}`}}
const showUses=async(value?:string|null)=>{
  if(!value)return
  const token=++useGeneration, root=props.libraryRoot;usesPath.value=value;uses.value=[];usesError.value='';usesLoading.value=true;usesVisible.value=true
  try{
    const drafts=referenceDrafts(), snapshot=JSON.stringify(drafts)
    const result=await invoke<Use[]>('list_library_attachment_uses',{libraryRoot:root,path:value,drafts})
    if(token!==useGeneration||!usesVisible.value)return
    if(JSON.stringify(referenceDrafts())!==snapshot)throw Error('笔记已有新修改，请刷新引用后查看。')
    usesSnapshot=snapshot;uses.value=result
  }
  catch(cause){if(token===useGeneration)usesError.value=`引用检查未完成：${String(cause)}`}
  finally{if(token===useGeneration)usesLoading.value=false}
}
const openUse=(item:Use)=>{
  try{
    if(JSON.stringify(referenceDrafts())!==usesSnapshot)throw Error('笔记已有新修改，请刷新引用后打开。')
    openFile(item.document)
  }catch(cause){uses.value=[];usesError.value=`引用已变化：${String(cause)}`}
}
const prepareReplacement=async()=>{
  const item=selected.value,document=path.value,root=props.libraryRoot,token=generation
  if(!item?.canReplace||working.value)return
  working.value=true;error.value='';replacementError.value=''
  try{
    const expected=props.captureDraft(document);if(expected===null)throw Error('请在编辑区打开这篇笔记后更换引用')
    const picked=await invoke<{path:string;imported:boolean;note:string}|null>('pick_library_attachment',{libraryRoot:root,documentPath:document})
    if(!picked||token!==generation||!visible.value)return
    notice.value=picked.note||(picked.imported?'附件副本已保留在 .assets 目录。':'')
    const preview=await invoke<{content:string;count:number;target:string}>('preview_attachment_reference',{libraryRoot:root,documentPath:document,content:expected,oldTarget:item.target,replacementPath:picked.path})
    if(token===generation&&visible.value)replacement.value={...preview,oldTarget:item.target,expected,imported:picked.imported}
  }catch(cause){if(token===generation)error.value=`未更换引用：${String(cause)}`}
  finally{if(token===generation)working.value=false}
}
const applyReplacement=()=>{
  const value=replacement.value;if(!value)return
  try{props.applyDraft(path.value,value.expected,value.content);replacement.value=null;message.success('引用已更换，可撤销；请保存笔记。');void refresh()}
  catch(cause){replacementError.value=`草稿保持原样：${String(cause)}`}
}
watch(()=>props.contextKey,close,{flush:'sync'})
defineExpose({open,close})
</script>
<style scoped>
.attachment-use-location{flex:0 0 auto!important;text-align:right}.attachment-scope{margin-top:12px;line-height:1.6}.attachment-scope summary{cursor:pointer;width:fit-content}
.attachment-heading,.attachment-footer,.attachment-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.attachment-heading{margin-bottom:12px}.attachment-heading>strong{min-width:0;overflow-wrap:anywhere}.attachment-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;margin-top:12px}.attachment-list{max-height:48vh;overflow:auto;display:grid;align-content:start;gap:5px}.attachment-row{display:flex;align-items:center;gap:9px;width:100%;padding:10px;text-align:left;color:var(--theme-text);background:var(--theme-surface);border:1px solid transparent;border-radius:var(--theme-radius-sm);cursor:pointer}.attachment-row:hover{background:var(--theme-background)}.attachment-row.selected{background:color-mix(in srgb,var(--theme-primary) 10%,var(--theme-surface));border-color:var(--theme-primary)}.attachment-row>svg{flex-shrink:0;color:var(--theme-primary)}.attachment-row>span{display:grid;gap:4px;flex:1;min-width:0}.attachment-row strong,.attachment-row small{overflow-wrap:anywhere}.attachment-status{flex-shrink:0}.attachment-status.missing,.attachment-error{color:var(--theme-error,#d03050)}.attachment-detail{padding:12px;background:var(--theme-surface);border:var(--theme-border);border-radius:var(--theme-radius-sm);min-width:0}.attachment-path,.attachment-error{overflow-wrap:anywhere}.attachment-actions{justify-content:flex-start;margin-top:14px}.attachment-note,small{color:var(--theme-text-secondary);font-size:var(--text-compact)}.attachment-empty{display:flex;align-items:center;justify-content:center;gap:10px;padding:30px 10px;color:var(--theme-text-secondary)}.attachment-footer{margin-top:14px}.attachment-row:focus-visible{outline:2px solid var(--theme-primary);outline-offset:-2px}@media(max-width:600px){.attachment-layout{grid-template-columns:1fr}.attachment-list{max-height:27vh}}
</style>
