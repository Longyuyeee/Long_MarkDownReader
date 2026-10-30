<template>
 <n-modal :show="true" preset="card" title="更换文件目标" class="inline-link-repair-dialog" data-testid="inline-link-repair-dialog" :style="{width:'min(520px, calc(100vw - 28px))'}" :mask-closable="!busy" :closable="!busy" :close-on-esc="!busy" @update:show="value=>{if(!value&&!busy)$emit('close')}">
  <div class="link-repair-form">
   <label>当前链接<code>{{ currentPath }}</code></label>
   <label>新目标<RelationFilePicker v-model:value="target" :library-root="request.root" label="新的链接文件" placeholder="查找并选择文件" :disabled="busy" /></label>
   <small v-if="fragment&&ready" role="status">{{ retainedFragment ? '保留原章节定位' : '目标中没有原章节，将链接到文件' }}</small>
   <p v-if="error" role="alert">{{ error }}<button v-if="stale" type="button" :disabled="busy" @click="refresh">重新核对原链接</button><button v-else type="button" :disabled="checking||busy" @click="check">重试</button></p>
   <details v-if="details"><summary>错误详情</summary>{{ details }}</details>
   <div class="link-repair-actions"><n-button :disabled="busy" @click="$emit('close')">取消</n-button><n-button data-testid="inline-link-repair-apply" type="primary" :disabled="!ready||busy||checking||stale" :loading="busy||checking" @click="apply">更换目标</n-button></div>
  </div>
 </n-modal>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue'
import {NModal,NButton} from 'naive-ui'
import {invoke} from '@tauri-apps/api/core'
import RelationFilePicker from './RelationFilePicker.vue'
import type {InlineLinkRepairRequest} from '../services/inlineLinkRepair'
import {useAppStore} from '../store/app'
import {sameWorkspacePath,toCollectionRelativePath} from '../utils/savedCollections'
import {localMarkdownLink} from '../utils/localMarkdownLinks'
import {markdownSections} from '../utils/markdownSections'
import {findFileFormat} from '../config/fileFormats'
import {searchResultPath} from '../utils/searchResultPath'
const props=defineProps<{request:InlineLinkRepairRequest}>(),emit=defineEmits<{close:[]}>(),store=useAppStore()
const target=ref(''),checking=ref(false),busy=ref(false),ready=ref(false),error=ref(''),details=ref(''),stale=ref(false),retainedFragment=ref('')
const original=localMarkdownLink(props.request.path,props.request.href),fragment=original?.fragment||''
const currentPath=computed(()=>searchResultPath(original?.path||props.request.href,props.request.root)+(fragment?' #'+fragment:''))
let generation=0,disposed=false
async function verify(path:string){
 toCollectionRelativePath(props.request.root,path)
 const format=findFileFormat(path);if(!format)throw Error('请选择软件支持的文件类型')
 await invoke('get_file_stats',{libraryRoot:props.request.root,path})
 if(!fragment||format.id!=='markdown')return ''
 const draft=store.tabs.find(tab=>tab.isDirty&&sameWorkspacePath(tab.path,path))
 const content=draft?.content??(await invoke<{content:string}>('read_text_document',{path})).content
 return markdownSections(content).sections.some(section=>section.slug===fragment||section.text===fragment)?fragment:''
}
async function check(){
 const token=++generation,path=target.value;ready.value=false;retainedFragment.value='';error.value='';details.value=''
 checking.value=false;if(!path)return
 checking.value=true
 try{const result=await verify(path);if(!disposed&&token===generation&&path===target.value){retainedFragment.value=result;ready.value=true}}
 catch(cause){if(!disposed&&token===generation){error.value='暂时无法读取这个文件，请更换目标或重试。';details.value=String(cause)}}
 finally{if(token===generation)checking.value=false}
}
function refresh(){if(props.request.refresh()){stale.value=false;error.value='';void check()}else error.value='原链接已不可用，请关闭后回到原文重新选择。'}
async function apply(){
 if(!ready.value||checking.value||busy.value||!target.value)return
 if(!props.request.current()){stale.value=true;error.value='原文或编辑位置已变化，尚未修改；所选文件已保留。';return}
 busy.value=true;error.value='';details.value=''
 try{const path=target.value,keep=await verify(path);if(disposed)return;if(!props.request.current()){stale.value=true;error.value='原文或编辑位置已变化，尚未修改；所选文件已保留。';return}props.request.commit(path,keep);emit('close')}
 catch(cause){if(!disposed){error.value='链接未修改，原文和草稿已保留。';details.value=String(cause)}}
 finally{busy.value=false}
}
watch(target,()=>{void check()})
watch(()=>store.libraryPath,()=>emit('close'))
onBeforeUnmount(()=>{disposed=true;++generation})
</script>
<style scoped>
.link-repair-form{display:grid;gap:16px;max-height:70vh;overflow:auto;color:var(--theme-text);font-size:var(--text-sm)}label{display:grid;gap:7px;min-width:0}code{display:block;overflow-wrap:anywhere;padding:8px 10px;border:var(--theme-border);border-radius:var(--theme-radius-sm);background:var(--theme-surface);font-size:var(--text-compact)}small,details{color:var(--theme-text-secondary);font-size:var(--text-compact)}p{margin:0;line-height:1.6;color:var(--status-danger,var(--theme-text))}details{overflow-wrap:anywhere}.link-repair-actions{display:flex;justify-content:flex-end;gap:8px}button{font:inherit}p button{display:block;margin-top:8px;padding:4px 0;color:var(--theme-primary);background:transparent;border:0;cursor:pointer}button:focus-visible{outline:2px solid var(--theme-primary);outline-offset:2px}
:deep(.selected-path){display:none}
</style>
