<template>
  <n-modal :show="true" preset="card" title="检查录入" class="workbook-entry-check" :style="{width:'min(720px, calc(100vw - 24px))'}" @close="$emit('close')" @update:show="show => !show && $emit('close')">
    <div class="entry-check-body">
      <p role="status">{{ scope }} · {{ busy ? '正在检查…' : `${checked} 个单元格，${issues.filter(i=>i.status==='invalid').length} 处不合规，${issues.filter(i=>i.status==='unchecked').length} 处需另行核对` }}</p>
      <p v-if="failure" role="alert">{{ failure }}</p>
      <template v-if="!target">
        <p v-if="!busy && !failure && !issues.length">{{ checked ? '此范围未发现不符合规则的内容。' : '此范围没有录入规则，可在单元格右键设置。' }}</p>
        <article v-for="issue in shown" :key="`${issue.row}:${issue.column}:${issue.ruleIndex}`">
          <div><strong>{{ issue.address }} · {{ issue.status==='unchecked' ? '需另行核对' : issue.blocking ? '不符合规则' : '仅提示' }}</strong><span>{{ issue.input || '（空）' }}</span><small>{{ issue.reason }}</small><small>{{ issue.rule }} · {{ issue.ranges }}</small></div>
          <n-button size="small" :disabled="busy || !!failure" @click="$emit('locate',issue)">定位</n-button>
          <n-button v-if="editable && issue.status==='invalid'" size="small" :disabled="busy || !!failure" @click="edit(issue)">修改…</n-button>
        </article>
        <div v-if="issues.length>50" class="check-actions"><n-button :disabled="page===0" @click="page--">上一页</n-button><span>{{ page+1 }} / {{ Math.ceil(issues.length/50) }}</span><n-button :disabled="(page+1)*50>=issues.length" @click="page++">下一页</n-button></div>
      </template>
      <form v-else-if="!previewed" id="workbook-check-correction" @submit.prevent="preview">
        <p>{{ target.address }} · {{ target.reason }}</p>
        <label>修改为<input v-model="value" aria-label="修正内容" maxlength="65534" autofocus /></label>
        <small>只修改此单元格，进入当前草稿，可撤销；其他未保存内容保留。</small>
      </form>
      <template v-else><p>{{ target.address }} · 确认修改</p><div class="check-preview"><span>{{ target.input || '（空）' }}</span><b>→</b><span>{{ value || '（空）' }}</span></div><small>应用后仍需保存工作簿。</small></template>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
    <template #footer><div class="check-actions"><n-button v-if="target" @click="target=undefined;previewed=false;error=''">返回问题清单</n-button><span class="spacer"></span><n-button @click="$emit('close')">关闭</n-button><n-button v-if="target && !previewed" type="primary" attr-type="submit" form="workbook-check-correction">预览修改</n-button><n-button v-if="previewed" type="primary" @click="apply">应用到草稿</n-button></div></template>
  </n-modal>
</template>
<script lang="ts">
export interface WorkbookEntryIssue { row:number;column:number;ruleIndex:number;address:string;input:string;status:'invalid'|'unchecked';blocking:boolean;reason:string;rule:string;ranges:string }
</script>
<script setup lang="ts">
import {computed,ref} from 'vue'
import {NModal,NButton} from 'naive-ui'
const props=defineProps<{issues:WorkbookEntryIssue[];scope:string;checked:number;busy:boolean;failure:string;editable:boolean;plan:(issue:WorkbookEntryIssue,value:string)=>()=>void}>()
const emit=defineEmits<{close:[];locate:[issue:WorkbookEntryIssue]}>()
const page=ref(0),target=ref<WorkbookEntryIssue>(),value=ref(''),error=ref(''),previewed=ref(false)
let commit:(()=>void)|undefined
const shown=computed(()=>props.issues.slice(page.value*50,(page.value+1)*50))
function edit(issue:WorkbookEntryIssue){target.value=issue;value.value=issue.input;error.value='';previewed.value=false}
function preview(){try{commit=props.plan(target.value!,value.value);previewed.value=true;error.value=''}catch(cause){error.value=String(cause).replace(/^Error:\s*/,'')}}
function apply(){try{commit?.();emit('close')}catch(cause){error.value=String(cause).replace(/^Error:\s*/,'')}}
</script>
<style scoped>
.workbook-entry-check{color:var(--theme-text);background:var(--theme-surface,var(--theme-card))}.entry-check-body{display:grid;gap:12px;max-height:60vh;overflow:auto}.entry-check-body p{margin:0}article{display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--workspace-border-color)}article>div{flex:1;min-width:0;display:grid;gap:6px}article span,.check-preview span{white-space:pre-wrap;overflow-wrap:anywhere;max-height:80px;overflow:auto}small,[role=status]{color:var(--theme-text-secondary)}[role=alert]{color:var(--status-error,#c33)}.check-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.spacer{flex:1}form,label{display:grid;gap:8px}input{font:inherit;width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--workspace-border-color);border-radius:var(--theme-radius-sm);color:var(--theme-text);background:var(--theme-bg)}.check-preview{display:grid;grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr);gap:8px}
</style>
