<template>
  <n-modal :show="true" preset="card" :title="stage==='list' ? '检查数据' : stage==='preview' ? '确认修正范围' : target ? '修正单元格' : '批量修正'" class="table-issues-dialog" :style="{width:'min(700px, calc(100vw - 24px))'}" @close="$emit('close')" @update:show="show => !show && $emit('close')">
    <div class="issues-body">
      <p class="issues-status" role="status">{{ scopeLabel }} · {{ busy ? '正在检查…' : `${issues.length} 处问题` }}<span v-if="truncated"> · 尚未查全，请缩小筛选范围</span></p>
      <p v-if="failure" role="alert">{{ failure }}</p>
      <template v-if="stage==='list'">
        <p v-if="!busy && !failure && !issues.length">{{ hasRules ? '此范围未发现不符合规则的内容。' : '尚未设置规则，请在列头右键选择“录入规则…”。' }}</p>
        <div v-for="issue in shown" :key="issue.rowId+':'+issue.columnId" class="issue-row">
          <div><strong>{{ columns[issue.column] }} · 第 {{ issue.row+1 }} 行</strong><span class="issue-value">{{ issue.value || '（空）' }}</span><small>{{ issue.reason }}</small></div>
          <n-button v-if="canLocate" size="small" @click="$emit('locate',issue)">定位</n-button><n-button size="small" :disabled="busy || !!failure" @click="edit(issue)">修改…</n-button>
        </div>
        <div v-if="issues.length>100" class="issue-pagination"><n-button size="small" :disabled="page===0" @click="page--">上一页</n-button><span>{{ page+1 }} / {{ Math.ceil(issues.length/100) }}</span><n-button size="small" :disabled="(page+1)*100>=issues.length" @click="page++">下一页</n-button></div>
      </template>
      <form v-else-if="stage==='edit'" id="table-correction-form" @submit.prevent="preview">
        <label v-if="!target">字段<select v-model="columnId" aria-label="修正字段"><option v-for="id in issueColumns" :key="id" :value="id">{{ columns[columnIds.indexOf(id)] }}</option></select></label>
        <p v-if="target">{{ columns[target.column] }} · 第 {{ target.row+1 }} 行 · {{ target.reason }}</p>
        <label>替换为<textarea v-model="value" rows="4" aria-label="修正内容" maxlength="1000000" /></label>
        <small>{{ target ? '只修改此单元格。' : '只修改本次检查中该字段有问题的记录。' }}原始值和其他字段保持。</small>
      </form>
      <template v-else>
        <p>{{ planned?.cells.length || 0 }} 个单元格 · 只进入当前草稿，可一次撤销，仍需保存。</p>
        <div v-for="cell in planned?.cells.slice(0,100)" :key="cell.rowId" class="correction-preview"><span>{{ cell.before || '（空）' }}</span><b>→</b><span>{{ cell.after || '（空）' }}</span></div>
        <small v-if="(planned?.cells.length||0)>100">预览前 100 项；应用范围为上述全部 {{ planned?.cells.length }} 项。</small>
      </template>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
    <template #footer><div class="issues-actions"><n-button v-if="stage==='list'" :disabled="busy || !!failure || !issues.length || truncated" @click="edit()">批量修正…</n-button><n-button v-else @click="stage='list';error=''">返回问题清单</n-button><span></span><n-button @click="$emit('close')">关闭</n-button><n-button v-if="stage==='edit'" type="primary" attr-type="submit" form="table-correction-form">预览修改</n-button><n-button v-if="stage==='preview'" type="primary" :disabled="!planned?.cells.length" @click="apply">应用到草稿</n-button></div></template>
  </n-modal>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue'
import {NModal,NButton} from 'naive-ui'
import type {TableIssue} from '../utils/tableValidation'
import type {TableEdit} from '../utils/tableEditing'
const props=defineProps<{issues:TableIssue[];columns:string[];columnIds:string[];scopeLabel:string;hasRules:boolean;busy:boolean;failure:string;truncated:boolean;canLocate:boolean;plan:(issues:TableIssue[],columnId:string,value:string)=>TableEdit;applyEdit:(edit:TableEdit)=>void}>(),emit=defineEmits<{close:[];locate:[issue:TableIssue]}>()
const stage=ref<'list'|'edit'|'preview'>('list'),page=ref(0),target=ref<TableIssue>(),columnId=ref(''),value=ref(''),error=ref(''),planned=ref<TableEdit>()
const shown=computed(()=>props.issues.slice(page.value*100,(page.value+1)*100)),issueColumns=computed(()=>[...new Set(props.issues.map(i=>i.columnId))])
function edit(issue?:TableIssue){target.value=issue;columnId.value=issue?.columnId||issueColumns.value[0];value.value=issue?.value||'';error.value='';planned.value=undefined;stage.value='edit'}
function preview(){try{planned.value=props.plan(target.value?[target.value]:props.issues,columnId.value,value.value);if(!planned.value.cells.length)throw Error('没有需要修改的内容');error.value='';stage.value='preview'}catch(cause){error.value=String(cause).replace(/^Error:\s*/,'')}}
function apply(){try{if(planned.value){props.applyEdit(planned.value);emit('close')}}catch(cause){error.value=String(cause).replace(/^Error:\s*/,'')}}
</script>
<style scoped>
.table-issues-dialog{color:var(--theme-text);background:var(--theme-surface,var(--theme-card))}.issues-body{max-height:60vh;overflow:auto;display:grid;gap:12px}.issues-status{margin:0;color:var(--theme-text-secondary)}.issue-row{display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--workspace-border-color);padding:8px 0}.issue-row>div{display:grid;gap:5px;flex:1;min-width:0}.issue-value{white-space:pre-wrap;overflow-wrap:anywhere;max-height:64px;overflow:hidden}.issue-row small{color:var(--status-warning,#a76500)}form{display:grid;gap:12px}label{display:grid;gap:6px}textarea,select{box-sizing:border-box;width:100%;font:inherit;color:var(--theme-text);background:var(--theme-bg);border:1px solid var(--workspace-border-color);border-radius:var(--theme-radius-sm);padding:8px}.issues-actions,.issue-pagination{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.issues-actions>span{flex:1}.correction-preview{display:grid;grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr);gap:8px;border-bottom:1px solid var(--workspace-border-color);padding:8px}.correction-preview span{white-space:pre-wrap;overflow-wrap:anywhere;max-height:80px;overflow:auto}[role=alert]{color:var(--status-error,#c33);margin:0}small{color:var(--theme-text-secondary)}
</style>
