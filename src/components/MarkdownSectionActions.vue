<template>
  <n-dropdown trigger="manual" :show="visible" :x="position.x" :y="position.y" :options="options" @select="select" @clickoutside="visible=false" />
  <n-modal v-model:show="preview" preset="card" title="移动章节" class="markdown-section-preview" :style="{width:'min(580px,94vw)'}">
    <template v-if="context && change && selected">
      <div class="section-meta">{{ filename }} · H{{ selected.level }} · 第 {{ selected.line }} 行</div>
      <p><strong>{{ selected.text }}</strong> 将移到 <strong>{{ change.destination }}</strong> 的{{ action==='up'?'前面':'后面' }}<span v-if="neighbor">（第 {{ neighbor.line }} 行）</span>。</p>
      <pre class="section-snippet">{{ context.model.content.slice(selected.start,selected.end).slice(0,600) }}{{ selected.end-selected.start>600?'\n…':'' }}</pre>
      <p v-if="change.headings>1" class="section-meta">包含 {{ change.headings }} 个标题及其正文</p>
      <p v-if="error" role="alert" class="section-error">{{ error }}</p>
    </template>
    <template #footer><div class="section-actions"><span>应用到草稿，可撤销</span><n-button @click="preview=false">取消</n-button><n-button type="primary" :disabled="!change" @click="apply">移动章节</n-button></div></template>
  </n-modal>
</template>
<script setup lang="ts">
import { ref, shallowRef, computed, watch } from 'vue'
import { NDropdown, NModal, NButton, useMessage, type DropdownOption } from 'naive-ui'
import { changeMarkdownSection, markdownChapterLink, sectionNeighbor, type SectionAction, type SectionChange } from '../utils/markdownSections'
import type { MarkdownSectionContext } from '../utils/markdownSectionContext'
const props=defineProps<{contextKey:string;capture:(id:string)=>MarkdownSectionContext;applyChange:(context:MarkdownSectionContext,change:SectionChange)=>void}>()
const message=useMessage(),visible=ref(false),preview=ref(false),position=ref({x:0,y:0}),error=ref('')
const context=shallowRef<MarkdownSectionContext|null>(null),change=shallowRef<SectionChange|null>(null),action=ref<SectionAction>('up')
const selected=computed(()=>context.value?.model.sections.find(item=>item.id===context.value?.id))
const displayHeading=computed(()=>context.value?.heading||selected.value)
const neighbor=computed(()=>context.value&&selected.value&&(action.value==='up'||action.value==='down')?sectionNeighbor(context.value.model,selected.value,action.value):undefined)
const filename=computed(()=>context.value?.path.split(/[\\/]/).pop())
const options=computed<DropdownOption[]>(()=>{
  const model=context.value?.model,section=displayHeading.value
  if(!model||!section)return[{label:error.value||'正在加载正文，请稍后重试',key:'unavailable',disabled:true}]
  const can=(kind:SectionAction)=>{if(context.value?.readOnlyReason)return false;try{changeMarkdownSection(model,section.id,kind);return true}catch{return false}}
  return[{label:'复制章节链接',key:'copy'},{label:'复制本机章节链接',key:'copy-local'},{type:'divider',key:'divider'},...(context.value?.readOnlyReason?[{label:context.value.readOnlyReason,key:'readonly',disabled:true}]:[]),{label:'上移章节…',key:'up',disabled:!can('up')},{label:'下移章节…',key:'down',disabled:!can('down')},{label:'提高一级',key:'promote',disabled:!can('promote')},{label:'降低一级',key:'demote',disabled:!can('demote')}]
})
function open(event:MouseEvent,id:string){
  error.value='';context.value=null;change.value=null
  try{context.value=props.capture(id)}catch(cause){error.value=String(cause).replace(/^Error:\s*/,'')}
  const target=event.currentTarget as HTMLElement|null,rect=target?.getBoundingClientRect()
  position.value={x:event.clientX||rect?.left||20,y:event.clientY||rect?.bottom||20};visible.value=true
}
async function select(key:string){
  visible.value=false;if(!context.value||!displayHeading.value)return
  try{
    if(key==='copy'||key==='copy-local'){
      const current=props.capture(context.value.id)
      if(current.path!==context.value.path||current.libraryRoot!==context.value.libraryRoot||current.model.content!==context.value.model.content)throw Error('正文已有变化，请重新选择章节后复制链接。')
      // Library-relative chapter addresses follow a library when its root changes.
      await navigator.clipboard.writeText(markdownChapterLink(context.value.path,displayHeading.value.text,displayHeading.value.slug,key==='copy'?current.libraryRoot:undefined))
      message.success('已复制章节链接');return
    }
    if(context.value.readOnlyReason)throw Error(context.value.readOnlyReason)
    action.value=key as SectionAction;change.value=changeMarkdownSection(context.value.model,context.value.id,action.value)
    if(key==='up'||key==='down'){error.value='';preview.value=true}else{props.applyChange(context.value,change.value);message.success('已调整章节层级，可撤销')}
  }catch(cause){message.warning(String(cause).replace(/^Error:\s*/,''))}
}
function apply(){if(!context.value||!change.value)return;try{props.applyChange(context.value,change.value);preview.value=false;message.success('章节已移动，可撤销')}catch(cause){error.value=String(cause).replace(/^Error:\s*/,'')}}
watch(()=>props.contextKey,()=>{visible.value=false;preview.value=false;context.value=null;change.value=null})
defineExpose({open})
</script>
<style scoped>
.section-meta { color:var(--theme-text-secondary);font-size:12px; }
.section-snippet { max-height:260px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;background:var(--theme-bg-secondary);border:1px solid var(--theme-border);border-radius:var(--theme-radius-sm);font:13px/1.6 monospace; }
.section-actions { display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap; }
.section-actions>span { margin-right:auto;color:var(--theme-text-secondary);font-size:12px; }
.section-error { color:var(--theme-error); }
</style>
