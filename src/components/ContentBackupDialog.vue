<template>
  <n-modal :show="true" preset="card" :title="mode === 'export' ? '备份资料内容' : '从内容备份恢复'" class="content-backup-dialog" :style="{ width: 'min(760px, calc(100vw - 24px))' }" :mask-closable="!busy && !adding" :closable="!busy && !adding" :close-on-esc="!busy && !adding" @close="close" @update:show="show => { if (!show) close() }">
    <div class="content-backup-body" :aria-busy="busy">
      <p class="content-backup-explanation">{{ mode === 'export' ? '只读取磁盘上已经保存的文件，不代存当前草稿。内容包可能包含私人资料，请妥善保管。' : '先完整校验，再恢复到一个全新的目录。不会覆盖原库、当前草稿或现有文件。' }}</p>
      <template v-if="mode === 'export' && !completed">
        <label class="content-field">资料库<n-select v-model:value="libraryRoot" aria-label="备份资料库" :options="libraries" :disabled="busy" filterable placeholder="请选择资料库" /></label>
        <div class="content-scope"><label class="content-field">范围<n-input v-model:value="options.directory" aria-label="备份子目录" :disabled="busy" :maxlength="1500" placeholder="整个资料库（可填写相对子目录）" /></label><n-button :disabled="busy || !libraryRoot" @click="chooseScope">选择子目录</n-button><n-button v-if="options.directory" :disabled="busy" @click="options.directory = ''">整个库</n-button></div>
        <div class="content-options">
          <n-checkbox v-model:checked="options.documents" :disabled="busy">文档与数据文件</n-checkbox>
          <n-checkbox v-model:checked="options.attachments" :disabled="busy">图片及其他附件</n-checkbox>
          <n-checkbox v-model:checked="options.annotations" :disabled="busy || !options.documents">PDF 批注（含源 PDF）</n-checkbox>
          <n-checkbox v-model:checked="options.history" :disabled="busy || !options.documents">Markdown / TXT 历史</n-checkbox>
        </div>
        <p class="content-backup-explanation">整包最多 512 MiB、单文件 128 MiB、10000 个文件条目。大资料库可选择子目录；不会自动跟随范围外链接或图片。历史默认不选，自定义模板仍使用原有模板导入/导出。</p>
      </template>
      <template v-if="mode === 'restore' && !completed">
        <div class="content-location"><span class="content-path">{{ backupPath || '尚未选择资料内容包（不是管理备份）' }}</span><n-button :disabled="busy" @click="chooseArchive">{{ backupPath ? '重新选择' : '选择内容包' }}</n-button></div>
      </template>
      <WorkspaceStateNotice v-if="busy" kind="loading" tone="info" :title="operationLabel"><p>{{ cancelMessage || '正在读取并核对实际文件；取消后会清理本次自有暂存。' }}</p></WorkspaceStateNotice>
      <WorkspaceStateNotice v-if="error" :kind="error.includes('取消') ? 'limited' : 'error'" :tone="error.includes('取消') ? 'info' : 'danger'" title="本次操作未完成"><p>{{ error }}</p></WorkspaceStateNotice>
      <WorkspaceStateNotice v-if="completed" kind="saved" tone="success" :title="mode === 'export' ? '资料内容包已导出并校验' : '资料已恢复到新目录'">
        <p>{{ completed.entryCount }} 个条目 · {{ contentBytes(completed.bytes) }}<template v-if="completed.historyCount"> · {{ completed.historyCount }} 个历史条目已{{ mode === 'restore' ? '绑定新路径' : '包含' }}</template></p><p class="content-path">{{ completed.path }}</p><p class="content-digest">SHA-256 {{ completed.sha256 }}</p>
      </WorkspaceStateNotice>
      <template v-if="summary && !completed">
        <div class="content-summary" role="status"><strong>{{ mode === 'export' ? '预检完成' : '清单和文件摘要校验通过' }}</strong><span>{{ summary.entryCount }} 个条目 · {{ contentBytes(summary.totalBytes) }}</span><n-button v-if="mode === 'export'" size="small" :disabled="busy" @click="preview">重新预检</n-button></div>
        <div class="content-counts"><span v-for="[key,label] in contentCategories" :key="key">{{ label }} <b>{{ summary.counts[key] || 0 }}</b></span></div>
        <p v-if="summary.scopeDirectory" class="content-backup-explanation">包内范围：{{ summary.scopeDirectory }}；恢复时保留这段相对目录。</p>
        <details :open="mode === 'restore'"><summary>内容预览<span v-if="summary.previewTruncated">（前 200 项，共 {{ summary.entryCount }} 项）</span></summary><div class="content-files" aria-label="内容包文件预览"><div v-for="entry in summary.entries" :key="entry.path" class="content-file"><span>{{ entry.sourceRelative && entry.category === 'history' ? `${entry.sourceRelative} · ${entry.relativePath}` : entry.relativePath }}</span><small>{{ categoryLabel(entry.category) }} · {{ contentBytes(entry.bytes) }}</small></div></div></details>
        <details><summary>未包含的内容（{{ summary.excludedCount }} 项）</summary><p class="content-backup-explanation">{{ summary.boundary.join('；') }}。不读取应用凭据；选中资料本身并不脱敏，内容包未加密。</p><div class="content-files"><div v-for="entry in summary.excluded" :key="entry.path" class="content-file"><span>{{ entry.path }}</span><small>{{ entry.reason }}</small></div></div><p v-if="summary.excludedCount > summary.excluded.length">这里只展示前 {{ summary.excluded.length }} 项，完整清单保存在包内。</p></details>
      </template>
      <template v-if="mode === 'export' && !completed">
        <label class="content-field">保存位置<div class="content-location"><span class="content-path">{{ targetPath || '请选择资料库以外的新 ZIP 文件，不会覆盖同名备份' }}</span><n-button :disabled="busy" @click="chooseSave">选择位置</n-button></div></label>
      </template>
      <template v-if="mode === 'restore' && summary && !completed">
        <div class="content-target-fields"><label class="content-field">新文件夹名称<n-input v-model:value="restoreName" aria-label="恢复文件夹名称" :maxlength="80" :disabled="busy" /></label><n-button :disabled="busy" @click="chooseParent">选择父目录</n-button></div>
        <p class="content-path">{{ restorePath || '请选择父目录并填写新的文件夹名称' }}</p>
        <p class="content-backup-explanation">不合并已有目录，不覆盖任何文件；恢复成功后可自行添加为资料库，不自动切库。</p>
        <WorkspaceStateNotice v-if="targetChecking" kind="loading" tone="info" compact title="正在核对新目录和可用空间" />
        <WorkspaceStateNotice v-else-if="targetError" kind="error" tone="danger" compact title="请调整恢复位置"><p>{{ targetError }}</p></WorkspaceStateNotice>
        <p v-else-if="targetCheck" class="content-target-ok">新目录可用 · 可用 {{ contentBytes(targetCheck.availableBytes) }} · 至少需要 {{ contentBytes(targetCheck.requiredBytes) }}</p>
      </template>
    </div>
    <template #footer><div class="content-actions"><span>{{ completed ? '原资料和未保存内容均未改变' : mode === 'export' ? '更改范围后需要重新预检' : '损坏或不安全的内容包不会执行恢复' }}</span><n-button v-if="busy" :disabled="cancelling" @click="cancel">{{ cancelling ? '正在取消…' : '取消当前任务' }}</n-button><n-button v-else :disabled="adding" @click="close">{{ completed ? '完成' : '取消' }}</n-button><n-button v-if="completed && mode === 'restore'" type="primary" :loading="adding" :disabled="added" @click="registerRestored">{{ added ? '已添加到资料库' : '添加到资料库' }}</n-button><n-button v-else-if="!completed" type="primary" :loading="busy" :disabled="primaryDisabled" @click="apply">{{ mode === 'export' ? summary ? targetPath ? '导出内容包' : '选择位置并导出' : '预检所选内容' : '恢复到新目录' }}</n-button></div></template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { NButton, NCheckbox, NInput, NModal, NSelect, useMessage } from 'naive-ui'
import { open, save } from '@tauri-apps/plugin-dialog'
import { invoke } from '../services/tauriRuntime'
import { beginWindowSave } from '../services/windowDrafts'
import { useAppStore } from '../store/app'
import WorkspaceStateNotice from './workspace/WorkspaceStateNotice.vue'
import { contentBytes, contentCategories, contentRestorePath, contentScopeRelative, type ContentBackupOptions, type ContentBackupSummary, type ContentBackupReceipt, type ContentRestoreTarget } from '../utils/contentBackup'
const props=defineProps<{ mode:'export'|'restore'; addLibrary:(path:string,name:string)=>Promise<void> }>()
const emit=defineEmits<{close:[]}>(),store=useAppStore(),message=useMessage(),mode=props.mode
const libraryRoot=ref(store.activeLibraryPath || store.libraries[0]?.path || ''),libraries=computed(()=>store.libraries.map(item=>({label:item.name,value:item.path})))
const options=reactive<ContentBackupOptions>({directory:'',documents:true,attachments:true,annotations:true,history:false})
const summary=ref<ContentBackupSummary|null>(null),completed=ref<ContentBackupReceipt|null>(null),busy=ref(false),adding=ref(false),added=ref(false),error=ref(''),operationLabel=ref(''),cancelMessage=ref(''),cancelling=ref(false)
const backupPath=ref(''),targetPath=ref(''),restoreParent=ref(''),restoreName=ref(''),targetCheck=ref<ContentRestoreTarget|null>(null),targetError=ref(''),targetChecking=ref(false)
const restorePath=computed(()=>contentRestorePath(restoreParent.value,restoreName.value))
const primaryDisabled=computed(()=>busy.value || (mode==='export' ? !libraryRoot.value || !options.documents&&!options.attachments : !summary.value || !targetCheck.value || targetChecking.value || !restorePath.value))
let generation=0,targetGeneration=0,disposed=false,activeOperation='',targetTimer:ReturnType<typeof setTimeout>|undefined
const categoryLabel=(key:string)=>contentCategories.find(([id])=>id===key)?.[1] || key
const discard=(id:string)=>invoke('discard_content_backup_plan',{planId:id}).catch(()=>{})
const invalidate=()=>{generation++;if(summary.value)void discard(summary.value.planId);summary.value=null;completed.value=null;error.value='';targetCheck.value=null;targetError.value=''}
watch(()=>options.documents,value=>{if(!value){options.annotations=false;options.history=false}},{flush:'sync'})
watch(libraryRoot,()=>{options.directory='';invalidate()},{flush:'sync'})
watch(()=>JSON.stringify(options),invalidate,{flush:'sync'})
async function run<T>(label:string,work:(id:string)=>Promise<T>,writing=false):Promise<T|undefined>{
  if(busy.value)return;const epoch=++generation,id='content-'+crypto.randomUUID();activeOperation=id;busy.value=true;error.value='';cancelMessage.value='';cancelling.value=false;operationLabel.value=label
  const release=writing?beginWindowSave('relocation'):()=>{}
  try{const result=await work(id);if(disposed||generation!==epoch){const plan=(result as {planId?:string})?.planId;if(plan)void discard(plan);if(writing)message.success('内容任务已完成，位置：'+(result as ContentBackupReceipt).path);return}return result}
  catch(cause){if(!disposed&&generation===epoch)error.value=String(cause);else if(writing)message.error('内容任务未完成：'+String(cause));return}
  finally{release();if(activeOperation===id){activeOperation='';busy.value=false;cancelling.value=false}}
}
async function preview(){if(!libraryRoot.value||busy.value)return;invalidate();const result=await run<ContentBackupSummary>('正在预检所选资料',id=>invoke('preview_content_backup',{libraryRoot:libraryRoot.value,options:{...options},operationId:id}));if(result)summary.value=result}
async function chooseScope(){try{const selected=await open({directory:true,multiple:false,title:'选择当前资料库内的备份子目录',defaultPath:libraryRoot.value});if(!disposed&&typeof selected==='string')options.directory=contentScopeRelative(libraryRoot.value,selected)}catch(cause){error.value=String(cause)}}
async function chooseSave(){try{const selected=await save({title:'导出资料内容包（不覆盖同名文件）',defaultPath:`${summary.value?.libraryName || '资料内容'}-${new Date().toISOString().slice(0,10)}.longedit-backup.zip`,filters:[{name:'Long编辑资料内容包',extensions:['zip']}]});if(!disposed&&typeof selected==='string')targetPath.value=selected}catch(cause){error.value=String(cause)}}
async function chooseArchive(){try{const selected=await open({directory:false,multiple:false,title:'选择资料内容备份包（不是管理备份）',filters:[{name:'Long编辑资料内容包',extensions:['zip']}]});if(disposed||typeof selected!=='string')return;invalidate();backupPath.value=selected;const result=await run<ContentBackupSummary>('正在校验清单与每个文件摘要',id=>invoke('preflight_content_restore',{backupPath:selected,operationId:id}));if(result){summary.value=result;restoreName.value=(result.libraryName+'-恢复').slice(0,80);scheduleTarget()}}catch(cause){error.value=String(cause)}}
async function chooseParent(){try{const selected=await open({directory:true,multiple:false,title:'选择新恢复文件夹的父目录'});if(!disposed&&typeof selected==='string')restoreParent.value=selected}catch(cause){targetError.value=String(cause)}}
function scheduleTarget(){targetGeneration++;targetCheck.value=null;targetError.value='';targetChecking.value=false;if(targetTimer)clearTimeout(targetTimer);if(mode!=='restore'||!summary.value||!restorePath.value||busy.value||completed.value)return;const epoch=targetGeneration,plan=summary.value.planId,path=restorePath.value;targetChecking.value=true;targetTimer=setTimeout(async()=>{try{const result=await invoke<ContentRestoreTarget>('check_content_restore_target',{planId:plan,targetDirectory:path});if(!disposed&&epoch===targetGeneration)targetCheck.value=result}catch(cause){if(!disposed&&epoch===targetGeneration)targetError.value=String(cause)}finally{if(epoch===targetGeneration)targetChecking.value=false}},250)}
watch([restorePath,()=>summary.value?.planId],scheduleTarget)
async function apply(){
  if(primaryDisabled.value)return
  if(mode==='export'&&!summary.value){await preview();return}
  const plan=summary.value;if(!plan)return
  if(mode==='export'&&!targetPath.value){await chooseSave();if(!targetPath.value||disposed)return}
  const result=await run<ContentBackupReceipt>(mode==='export'?'正在写入并复核资料内容包':'正在恢复并核对新目录',id=>mode==='export'?invoke('export_content_backup',{planId:plan.planId,targetPath:targetPath.value,operationId:id}):invoke('restore_content_backup',{planId:plan.planId,targetDirectory:restorePath.value,operationId:id}),true)
  if(result){completed.value=result;void discard(plan.planId);summary.value=null}
}
async function cancel(){if(!activeOperation||cancelling.value)return;cancelling.value=true;try{const accepted=await invoke<boolean>('cancel_content_backup',{operationId:activeOperation});cancelMessage.value=accepted?'已请求取消，正在清理本次暂存；请等待结果。':'已经进入完成提交阶段，取消未被接受；请等待最终结果。'}catch(cause){error.value='取消请求未确认：'+String(cause);cancelling.value=false}}
async function registerRestored(){if(!completed.value||adding.value||added.value)return;adding.value=true;error.value='';try{await props.addLibrary(completed.value.path,restoreName.value);added.value=true}catch(cause){error.value='资料已经恢复，但添加资料库未完成；恢复目录仍保留，可在资料库设置中手动添加。'+String(cause)}finally{adding.value=false}}
function close(){if(busy.value||adding.value)return;emit('close')}
onBeforeUnmount(()=>{disposed=true;generation++;targetGeneration++;if(targetTimer)clearTimeout(targetTimer);if(activeOperation)void invoke('cancel_content_backup',{operationId:activeOperation}).catch(()=>{});if(summary.value)void discard(summary.value.planId)})
</script>

<style scoped>
.content-backup-body{display:grid;gap:16px;min-width:0;font-size:var(--text-base);line-height:1.6}.content-backup-body p{margin:0}.content-backup-explanation{color:var(--theme-text-secondary)}
.content-backup-body :deep(.state-copy strong){font-size:var(--text-base)}
.content-field{display:grid;gap:7px;min-width:0}.content-scope,.content-location,.content-target-fields,.content-summary{display:flex;gap:10px;align-items:center;min-width:0}.content-scope .content-field,.content-target-fields .content-field{flex:1}.content-scope,.content-target-fields{align-items:flex-end}
.content-location>.content-path{flex:1;padding:8px 10px;border:1px solid var(--workspace-border-color);border-radius:var(--theme-radius-sm);background:var(--theme-bg)}.content-path,.content-digest{min-width:0;overflow-wrap:anywhere}.content-digest{font-family:var(--font-mono);font-size:var(--text-compact)}
.content-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 18px}.content-summary{flex-wrap:wrap}.content-summary strong{color:var(--status-success)}.content-summary>span{flex:1}.content-counts{display:flex;gap:12px 22px;flex-wrap:wrap}.content-counts b{font-variant-numeric:tabular-nums}
details{border-top:1px solid var(--workspace-border-color);padding-top:12px}summary{cursor:pointer}details[open]>summary{margin-bottom:10px}.content-files{max-height:240px;overflow:auto;min-width:0}.content-file{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--workspace-border-color)}.content-file>span{min-width:0;overflow-wrap:anywhere}.content-file small{flex:none;color:var(--theme-text-secondary);font-size:var(--text-compact)}.content-target-ok{color:var(--status-success)}
.content-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.content-actions>span{flex:1;min-width:140px;color:var(--theme-text-secondary);font-size:var(--text-compact)}
@media(max-width:560px){.content-options{grid-template-columns:1fr}.content-scope,.content-location,.content-target-fields{flex-wrap:wrap}.content-scope .content-field,.content-location>.content-path,.content-target-fields .content-field{flex-basis:100%}.content-file{flex-wrap:wrap;gap:2px}.content-file>span{flex-basis:100%}.content-actions>span{flex-basis:100%}}
</style>
<style>
/* NModal teleports the preset card without the parent's scope attribute. */
.content-backup-dialog.n-card{box-sizing:border-box;max-height:calc(100dvh - 32px);display:flex;flex-direction:column;background:var(--theme-surface);color:var(--theme-text)}
.content-backup-dialog.n-card>.n-card__content{min-height:0;overflow:auto}
.content-backup-dialog.n-card>.n-card-header,.content-backup-dialog.n-card>.n-card__footer{flex:none}
@media(max-width:560px){.content-backup-dialog.n-card{max-height:calc(100dvh - 16px)}}
</style>
