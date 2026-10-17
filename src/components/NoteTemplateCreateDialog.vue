<template>
 <n-modal :show="true" preset="card" title="填写模板后新建" class="template-create-dialog" :style="{width:'min(720px,96vw)',maxHeight:'92dvh'}" :mask-closable="false" :closable="!busy" :close-on-esc="!busy" @close="close" @esc="close">
  <p class="template-destination">保存到：{{target}}<br>沿用当前选中目录，不改变此资料库的默认模板。同名笔记自动追加序号，不覆盖。</p>
  <label>笔记模板<select v-model="selectedId" :disabled="busy"><option v-for="item in templates" :key="item.id" :value="item.id">{{item.name}}</option></select></label>
  <label>文章标题<input v-model="title" :disabled="busy" maxlength="80" aria-label="文章标题" /></label>
  <label v-for="field in fields" :key="field">{{field}}<input v-model="parameters[field]" :disabled="busy" maxlength="500" :aria-label="`模板参数 ${field}`" /></label>
  <p v-if="fields.length>16" class="template-error" role="alert">字段超过 16 个，请在管理模板中缩减后使用。</p>
  <pre aria-label="新笔记填充预览">{{rendered || '空白笔记'}}</pre>
  <p v-if="error" class="template-error" role="alert">{{error}}</p>
  <template #footer><div class="template-create-actions"><n-button :disabled="busy" @click="close">取消</n-button><n-button type="primary" :loading="busy" :disabled="busy||!title.trim()||fields.length>16" @click="create">在此新建</n-button></div></template>
 </n-modal>
</template>
<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {NModal,NButton,useDialog} from 'naive-ui'
import {renderNoteTemplate,noteTemplateFields,type NoteTemplate} from '../config/noteTemplates'
import {invoke} from '../services/tauriRuntime'
import {confirmAppAction} from '../services/appDialog'
import {beginWindowSave,useWindowDraft} from '../services/windowDrafts'
const props=defineProps<{root:string;target:string;templates:NoteTemplate[];initialId:string}>(),emit=defineEmits<{close:[];created:[path:string]}>()
const selectedId=ref(props.initialId),title=ref(''),parameters=ref<Record<string,string>>({}),error=ref(''),busy=ref(false),dialog=useDialog()
const template=computed(()=>props.templates.find(item=>item.id===selectedId.value)),fields=computed(()=>noteTemplateFields(template.value?.content||'')),now=ref(new Date())
const rendered=computed(()=>renderNoteTemplate(template.value?.content||'',title.value,now.value,parameters.value))
watch(selectedId,(_,previous)=>{const oldName=props.templates.find(t=>t.id===previous)?.name;if(!title.value||title.value===oldName)title.value=template.value?.name||'新笔记';now.value=new Date();error.value=''}, {immediate:true})
const dirty=computed(()=>Boolean(Object.values(parameters.value).some(Boolean)||title.value!==(props.templates.find(t=>t.id===props.initialId)?.name||'新笔记')))
useWindowDraft(()=>dirty.value)
async function close(){if(!busy.value&&(!dirty.value||await confirmAppAction(dialog,{title:'放弃模板填写？',content:'填写内容尚未创建为笔记。',positiveText:'放弃填写',negativeText:'继续填写'})))emit('close')}
async function create(){
 if(busy.value||!template.value)return
 if(!title.value.trim()||/[<>:"/\\|?*\x00-\x1f]/.test(title.value)){error.value='请填写有效的文章标题，不包含文件名非法字符';return}
 const values=Object.fromEntries(fields.value.filter(field=>Object.prototype.hasOwnProperty.call(parameters.value,field)).map(field=>[field,parameters.value[field]]))
 busy.value=true;error.value='';const finish=beginWindowSave()
 try{const path=await invoke<string>('create_note_from_template',{libraryRoot:props.root,targetDir:props.target,name:title.value.trim(),content:template.value.content,parameters:values});emit('created',path)}
 catch(cause){error.value=`未创建笔记：${String(cause)}；填写内容已保留。`}
 finally{finish();busy.value=false}
}
</script>
<style scoped>
.template-destination{color:var(--text-secondary);font-size:13px;overflow-wrap:anywhere}.template-error{color:var(--status-danger-text);overflow-wrap:anywhere}
label{display:block;margin:10px 0;font-size:14px}input,select{box-sizing:border-box;display:block;width:100%;margin-top:5px;padding:8px 10px;font:inherit;color:var(--text-primary);background:var(--bg-primary);border:1px solid var(--border-color);border-radius:var(--radius-sm,6px)}
pre{max-height:28vh;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:14px;color:var(--text-primary);background:var(--bg-secondary);border:1px solid var(--border-color);font-size:13px}.template-create-actions{display:flex;gap:8px;justify-content:flex-end}
.template-create-dialog :deep(.n-card__content){min-height:0;overflow:auto}
</style>
<style>
.template-create-dialog > .n-card__content{min-height:0;overflow:auto}
.template-create-dialog > .n-card-header,.template-create-dialog > .n-card__footer{flex-shrink:0}
</style>
