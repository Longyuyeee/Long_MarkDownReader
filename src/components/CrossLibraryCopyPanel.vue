<template>
  <section class="copy-preview" aria-label="跨库复制预览" :aria-busy="loading || busy" :data-plan-id="preview?.planId">
    <p v-if="loading" class="copy-note" role="status">正在核对文件和关联资料…</p>
    <p v-if="error" class="copy-error" role="alert">{{ error }}</p>
    <template v-if="preview">
      <div class="copy-summary"><strong>{{ completed.length ? `已复制 ${completed.length} 项` : '复制预览' }}</strong><span>{{ pending.length }} 项待复制 · {{ dependencies }} 份关联资源 · {{ formatBytes(bytes) }}</span></div>
      <div class="copy-items">
        <article v-for="item in rows" :key="item.oldPath"><div><strong>{{ filename(item.oldPath) }}</strong><span class="copy-state" :class="{ done: item.completed, failed: item.error }">{{ item.completed ? '已完成' : item.error ? '未完成' : '待复制' }}</span></div><small>→ {{ relative(item.newPath) }}</small><p v-if="item.error" class="copy-error">{{ item.error }}</p><details v-if="item.warnings.length"><summary>{{ item.warnings.length }} 条引用需留意</summary><ul><li v-for="warning in item.warnings" :key="warning">{{ warning }}</li></ul></details></article>
      </div>
      <label v-if="warnings && pending.length" class="copy-ack"><input v-model="acknowledge" type="checkbox" :disabled="busy" />保留未自动接续的引用，继续复制</label>
    </template>
    <p class="copy-note">复制已保存的文件，源文件和未保存草稿仍留在原位置。</p>
    <details class="copy-scope"><summary>复制范围</summary><p>可识别的 Markdown 相对文件引用及关联笔记会随复制接续；无法接续的引用在预览中列出。其他格式原样复制，历史、手动关系和 PDF 批注等管理记录不随带。</p></details>
    <div class="copy-actions"><n-button :disabled="busy" @click="$emit('close')">{{ completed.length ? '关闭' : '取消' }}</n-button><n-button v-if="completed.length || reviewRequired" :disabled="busy" @click="reveal">在文件管理器中查看</n-button><n-button v-if="uncertain" type="primary" :loading="busy" @click="execute">核对复制结果</n-button><n-button v-else-if="retryable.length" type="primary" :loading="loading" :disabled="busy || loading" @click="refreshFailed">重新核对未完成的 {{ retryable.length }} 项</n-button><n-button v-else-if="pending.length" type="primary" :loading="busy" :disabled="loading || Boolean(error) || (warnings && !acknowledge)" @click="execute">复制 {{ pending.length }} 项</n-button><n-button v-else-if="!preview && error" :loading="loading" :disabled="busy" @click="load()">重新预览</n-button></div>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NButton } from 'naive-ui'
import { invoke } from '../services/tauriRuntime'
import { fileOperationBusy as busy, sameLibrary, type FileOperationResult, type PathChange } from '../services/libraryFileOperations'
import { beginWindowSave } from '../services/windowDrafts'
interface Item { oldPath:string; newPath:string; fileCount:number; dependencyCount:number; totalBytes:number; warnings:string[]; error:string|null; completed:boolean; reviewRequired:boolean }
interface Preview { planId:string; sourceRoot:string; targetRoot:string; targetDirectory:string; items:Item[] }
const props=defineProps<{ active:boolean; sourceRoot:string; targetRoot:string; paths:string[]; targetDir:string; beforeCopy:()=>Promise<boolean>; afterCopy:(result:FileOperationResult,targetRoot:string)=>Promise<void> }>()
const emit=defineEmits<{ close:[]; lock:[value:boolean] }>()
const preview=ref<Preview|null>(null),completed=ref<PathChange[]>([]),loading=ref(false),error=ref(''),acknowledge=ref(false),uncertain=ref(false)
let disposed=false,generation=0,timer:ReturnType<typeof setTimeout>|undefined
const pending=computed(()=>preview.value?.items.filter(item=>!item.completed&&!item.error)||[])
const retryable=computed(()=>preview.value?.items.filter(item=>!item.completed&&item.error&&!item.reviewRequired)||[])
const reviewRequired=computed(()=>Boolean(preview.value?.items.some(item=>item.reviewRequired)))
const rows=computed(()=>[...completed.value.filter(item=>!preview.value?.items.some(row=>sameLibrary(row.oldPath,item.oldPath))).map(item=>({...item,fileCount:0,dependencyCount:0,totalBytes:0,warnings:[],error:null,completed:true,reviewRequired:false})),...(preview.value?.items||[])])
const warnings=computed(()=>pending.value.some(item=>item.warnings.length>0))
const dependencies=computed(()=>preview.value?.items.reduce((sum,item)=>sum+item.dependencyCount,0)||0),bytes=computed(()=>preview.value?.items.reduce((sum,item)=>sum+item.totalBytes,0)||0)
const filename=(path:string)=>path.split(/[\\/]/).pop()||path
const relative=(path:string)=>path.replace(/\\/g,'/').replace(props.targetRoot.replace(/\\/g,'/').replace(/\/$/,'')+'/','')
const formatBytes=(value:number)=>value>=1024*1024?`${(value/(1024*1024)).toFixed(1)} MB`:`${Math.ceil(value/1024)} KB`
const context=()=>({sourceRoot:props.sourceRoot,targetRoot:props.targetRoot,targetDir:props.targetDir.trim()||'.',paths:[...props.paths]})
async function load(selected=props.paths){
  const token=++generation,args={...context(),paths:[...selected]};preview.value=null;error.value='';acknowledge.value=false;uncertain.value=false;loading.value=true
  try {const result=await invoke<Preview>('preview_cross_library_copy',args);if(!disposed&&token===generation){if(!sameLibrary(result.sourceRoot,args.sourceRoot)||!sameLibrary(result.targetRoot,args.targetRoot))throw Error('资料库已变化，请重新预览');preview.value=result}}
  catch(cause){if(!disposed&&token===generation)error.value=`未执行复制：${String(cause)}`}
  finally{if(!disposed&&token===generation)loading.value=false}
}
async function refreshFailed(){await load(retryable.value.map(item=>item.oldPath))}
async function execute(){
  const selected=preview.value;if(!props.active||!selected||busy.value||loading.value||(warnings.value&&!acknowledge.value))return
  const token=generation;if(!await props.beforeCopy()||busy.value||disposed||!props.active||token!==generation||preview.value!==selected)return
  const target=props.targetRoot;busy.value=true;error.value='';emit('lock',true);const finish=beginWindowSave()
  try {
    const receipt=await invoke<{result:FileOperationResult;preview:Preview}>('execute_cross_library_copy',{planId:selected.planId,acknowledgeWarnings:acknowledge.value})
    if(disposed||token!==generation)return
    if(receipt.preview.planId!==selected.planId||!sameLibrary(receipt.preview.targetRoot,target))throw Error('复制结果不属于当前预览，请核对目标位置')
    preview.value=receipt.preview;uncertain.value=false
    const added=receipt.result.items.filter(item=>!completed.value.some(previous=>sameLibrary(previous.oldPath,item.oldPath)))
    completed.value=[...completed.value,...added]
    if(added.length){try{await props.afterCopy({items:added,errors:receipt.result.errors},target)}catch{error.value='资料已复制，但界面刷新未完成。可查看目标资料库，不要重复复制已完成项。'}}
  }catch(cause){if(!disposed&&token===generation){uncertain.value=true;error.value=`尚未收到完整结果：${String(cause)}。请核对复制结果，不要重新复制同一批文件。`}}
  finally{busy.value=false;finish();if(!disposed&&!completed.value.length&&!uncertain.value&&!reviewRequired.value)emit('lock',false)}
}
async function reveal(){try{const {revealItemInDir}=await import('@tauri-apps/plugin-opener');await revealItemInDir(completed.value[0]?.newPath||preview.value!.targetDirectory)}catch(cause){error.value=`无法显示目标位置，复制结果仍保留：${String(cause)}`}}
watch(()=>[props.active,props.sourceRoot,props.targetRoot,props.targetDir,JSON.stringify(props.paths)],()=>{if(timer)clearTimeout(timer);++generation;preview.value=null;error.value='';loading.value=props.active;if(props.active)timer=setTimeout(()=>void load(),250)},{immediate:true})
onBeforeUnmount(()=>{disposed=true;++generation;if(timer)clearTimeout(timer)})
</script>
<style scoped>
.copy-preview{display:grid;gap:10px;min-width:0}.copy-summary{display:grid;gap:4px}.copy-summary>span,.copy-note,.copy-scope{color:var(--theme-text-secondary);font-size:var(--text-compact)}.copy-items{max-height:32vh;overflow:auto;display:grid;gap:7px}.copy-items article{padding:10px;border:var(--theme-border);border-radius:var(--theme-radius-sm);background:var(--theme-surface);overflow-wrap:anywhere}.copy-items article>div{display:flex;gap:8px;align-items:center}.copy-items strong{flex:1;min-width:0}.copy-items small{display:block;margin-top:5px;color:var(--theme-text-secondary)}.copy-state{font-size:var(--text-compact);color:var(--theme-text-secondary);flex-shrink:0}.copy-state.done{color:var(--status-success)}.copy-error,.copy-state.failed{color:var(--status-danger)}.copy-error,.copy-note,.copy-scope p{margin:0;overflow-wrap:anywhere}.copy-items details{margin-top:7px;font-size:var(--text-compact)}.copy-items ul{padding-left:18px}.copy-ack{display:flex;gap:7px;align-items:flex-start;font-size:var(--text-compact)}.copy-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}.copy-scope p{margin-top:6px}.copy-ack input{accent-color:var(--theme-primary)}
</style>
