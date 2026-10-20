<template>
 <n-modal v-model:show="visible" preset="card" title="查找与替换" class="document-find-dialog" :style="{width:'min(620px,94vw)',maxHeight:'calc(100dvh - 96px)',margin:'64px auto 32px'}" :content-style="{overflowY:'auto',minHeight:'0'}">
  <template v-if="snapshot">
   <div class="find-identity"><strong>{{ filename }}</strong><span>{{ snapshot.label }}</span></div>
   <div class="find-fields">
    <label>查找内容<n-input ref="queryInput" v-model:value="query" type="textarea" :autosize="{minRows:1,maxRows:3}" :input-props="{'aria-label':'查找内容'}" placeholder="输入文字，可粘贴多行" @keydown.enter="findEnter" /></label>
    <label>替换为<n-input v-model:value="replacement" type="textarea" :autosize="{minRows:1,maxRows:3}" :input-props="{'aria-label':'替换内容'}" placeholder="留空将删除匹配文字" /></label>
   </div>
   <div class="find-options"><n-select v-model:value="scope" aria-label="查找范围" :options="scopeOptions" :style="{width:'180px'}" size="small" /><n-checkbox v-model:checked="caseSensitive">区分大小写</n-checkbox><n-checkbox v-model:checked="wholeWord">整词匹配</n-checkbox></div>
   <p v-if="snapshot.selectionReason" class="find-note">{{ snapshot.selectionReason }} 也可明确选择“整篇文档”。</p>
   <div class="find-navigation"><span role="status">{{ found.reason || (query ? (found.matches.length ? `${index+1} / ${found.matches.length} 处` : '没有匹配') : '输入要查找的文字') }}</span><n-button size="small" :disabled="!canAct" @click="move(-1)">上一处</n-button><n-button size="small" :disabled="!canAct" @click="move(1)">下一处</n-button></div>
   <p v-if="stale" class="find-warning" role="alert">正文已有变化，请刷新匹配后再操作。<n-button text size="small" @click="refresh">刷新匹配</n-button></p>
   <p v-if="error" class="find-warning" role="alert">{{ error }}</p>
   <p v-if="snapshot.readOnlyReason" class="find-note">{{ snapshot.readOnlyReason }}</p>
   <div v-if="current" class="find-context"><span class="find-note">第 {{ line(current.from) }} 行 · {{ scope==='selection'?'打开前的选区':'整篇文档' }}</span><pre>{{ snippet(current).before }}<mark>{{ snapshot.content.slice(current.from,current.to) }}</mark>{{ snippet(current).after }}</pre></div>
   <section v-if="previewAll && canAct" class="replace-preview" aria-label="全部替换预览">
    <strong>将替换 {{ found.matches.length }} 处</strong><span v-if="!replacement" class="find-note"> · 删除匹配文字</span>
    <ol><li v-for="(match,i) in found.matches.slice(0,6)" :key="i"><span>第 {{ line(match.from) }} 行</span><pre>{{ snippet(match).before }}<del>{{ snapshot.content.slice(match.from,match.to) }}</del><ins>{{ replacement || '（删除）' }}</ins>{{ snippet(match).after }}</pre></li></ol>
    <p v-if="found.matches.length>6" class="find-note">另有 {{ found.matches.length-6 }} 处，均在当前范围内。</p>
   </section>
  </template>
  <template #footer><div class="find-footer"><span>只改当前草稿，可撤销</span><n-button @click="visible=false">关闭</n-button><n-button :disabled="!canReplace" @click="apply(false)">替换这一处</n-button><n-button v-if="!previewAll" :disabled="!canReplace" @click="previewAll=true">预览全部替换…</n-button><n-button v-else type="primary" :disabled="!canReplace" @click="apply(true)">应用 {{ found.matches.length }} 处替换</n-button></div></template>
 </n-modal>
</template>
<script setup lang="ts">
import {ref,shallowRef,computed,watch,nextTick,onBeforeUnmount} from 'vue'
import {NModal,NInput,NButton,NCheckbox,NSelect,useMessage} from 'naive-ui'
import {findDocumentMatches,replaceDocumentMatches,type FindDocumentSnapshot,type Replacement,type TextSpan} from '../utils/documentFindReplace'
const props=defineProps<{contextKey:string;revision?:string;capture:()=>FindDocumentSnapshot;isCurrent:(snapshot:FindDocumentSnapshot)=>boolean;applyChange:(snapshot:FindDocumentSnapshot,change:Replacement)=>FindDocumentSnapshot;reveal?:(snapshot:FindDocumentSnapshot,span:TextSpan)=>void;clearHighlight?:()=>void}>()
const message=useMessage(),visible=ref(false),snapshot=shallowRef<FindDocumentSnapshot>(),query=ref(''),replacement=ref(''),caseSensitive=ref(false),wholeWord=ref(false),scope=ref<'document'|'selection'>('document'),index=ref(0),previewAll=ref(false),stale=ref(false),error=ref(''),queryInput=ref<InstanceType<typeof NInput>|null>(null)
const filename=computed(()=>snapshot.value?.path.split(/[\\/]/).pop()),scopeOptions=computed(()=>[{label:'整篇文档',value:'document'},{label:'打开前的选区',value:'selection',disabled:!snapshot.value?.selection}])
const range=computed(()=>scope.value==='selection'?(snapshot.value?.selection||{from:-1,to:-1}):undefined),found=computed(()=>scope.value==='selection'&&!snapshot.value?.selection?{matches:[] as TextSpan[],reason:'请重新选择正文范围，或明确选择整篇文档。'}:findDocumentMatches(snapshot.value?.content||'',{query:query.value,caseSensitive:caseSensitive.value,wholeWord:wholeWord.value,range:range.value})),current=computed(()=>found.value.matches[index.value]),canAct=computed(()=>!stale.value&&!found.value.reason&&found.value.matches.length>0),canReplace=computed(()=>canAct.value&&!snapshot.value?.readOnlyReason)
const line=(at:number)=>1+(snapshot.value?.content.slice(0,at).match(/\n/g)?.length||0)
const snippet=(match:TextSpan)=>({before:snapshot.value!.content.slice(Math.max(0,match.from-48),match.from),after:snapshot.value!.content.slice(match.to,match.to+64)})
function capture(){const next=props.capture();snapshot.value=next;stale.value=false;error.value='';previewAll.value=false;return next}
function open(){try{const next=capture();scope.value=next.selection||next.selectionReason?'selection':'document';if(next.selection){const selected=next.content.slice(next.selection.from,next.selection.to);if(selected.length<=160)query.value=selected}index.value=0;visible.value=true;void nextTick(()=>queryInput.value?.focus())}catch(cause){message.warning(String(cause).replace(/^Error:\s*/,''))}}
function refresh(){try{capture();index.value=0}catch(cause){error.value=String(cause).replace(/^Error:\s*/,'')}}
function ensureCurrent(){if(!snapshot.value||!props.isCurrent(snapshot.value)){stale.value=true;previewAll.value=false;throw Error('正文或文档已有变化，当前草稿已保留。')}}
function move(delta:number){if(!canAct.value)return;try{ensureCurrent();index.value=(index.value+delta+found.value.matches.length)%found.value.matches.length;props.reveal?.(snapshot.value!,current.value)}catch(cause){error.value=String(cause).replace(/^Error:\s*/,'')}}
function findEnter(event:KeyboardEvent){if(!event.shiftKey){event.preventDefault();move(1)}}
function apply(all:boolean){if(!canReplace.value)return;try{ensureCurrent();const original=snapshot.value!,matches=all?found.value.matches:[current.value],change=replaceDocumentMatches(original.content,matches,replacement.value,range.value),next=props.applyChange(original,change);snapshot.value=next;if(scope.value==='selection')snapshot.value={...next,selection:change.range};previewAll.value=false;error.value='';stale.value=false;index.value=0;const at=found.value.matches.findIndex(match=>match.from>=change.last.to);if(at>=0)index.value=at;props.reveal?.(snapshot.value,current.value||change.last);message.success(all?`已替换 ${matches.length} 处，可一次撤销`:'已替换，可撤销')}catch(cause){error.value=String(cause).replace(/^Error:\s*/,'')}}
watch([query,replacement,scope,caseSensitive,wholeWord],()=>{index.value=0;previewAll.value=false;error.value=''})
watch(()=>props.revision,()=>{if(visible.value&&snapshot.value&&!props.isCurrent(snapshot.value)){stale.value=true;previewAll.value=false}})
watch(()=>props.contextKey,()=>{visible.value=false;snapshot.value=undefined})
watch(visible,value=>{if(!value){props.clearHighlight?.();previewAll.value=false}})
onBeforeUnmount(()=>props.clearHighlight?.())
defineExpose({open})
</script>
<style scoped>
.find-identity,.find-options,.find-navigation,.find-footer { display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
.find-identity { margin-bottom:14px; }.find-identity strong { overflow-wrap:anywhere; }.find-identity span,.find-note { color:var(--theme-text-secondary);font-size:12px; }
.find-fields { display:grid;gap:10px; }.find-fields label { display:grid;gap:5px; font-size:13px; }.find-options { margin-top:12px;row-gap:10px; }.find-navigation { margin-top:14px; }.find-navigation>span { margin-right:auto;font-size:13px; }
.find-context,.replace-preview { margin-top:14px;padding:12px;border:1px solid var(--theme-border-color, #8885);border-radius:var(--theme-radius-sm);background:var(--theme-bg-secondary); }
pre { white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 monospace;margin:7px 0;max-height:120px;overflow:auto; }
mark,ins { color:var(--theme-text);background:rgba(var(--theme-primary-rgb),.2);text-decoration:none;border-radius:2px; }del { opacity:.6; }.replace-preview ol { padding-left:20px;max-height:260px;overflow:auto; }.replace-preview li>span { color:var(--theme-text-secondary);font-size:12px; }.find-warning { color:var(--theme-warning,#a60);font-size:13px; }.find-footer>span { margin-right:auto;color:var(--theme-text-secondary);font-size:12px; }
</style>
<style>
::highlight(longedit-find) { background: #ffd56a; color:#171717; }
</style>
