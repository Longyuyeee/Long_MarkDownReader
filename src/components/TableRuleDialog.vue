<template>
  <n-modal :show="true" preset="card" :title="`${columnName} · 录入规则`" class="table-rule-dialog" :style="{width:'min(470px, calc(100vw - 24px))'}" @close="$emit('close')" @update:show="show => !show && $emit('close')">
    <form id="table-rule-form" class="rule-fields" @submit.prevent="apply">
      <label>内容<select v-model="draft.kind" aria-label="规则类型"><option value="any">不限类型</option><option value="text">文本</option><option value="integer">整数</option><option value="number">数值</option><option value="date">日期（YYYY-MM-DD）</option><option value="options">固定选项</option></select></label>
      <label class="rule-check"><input v-model="draft.required" type="checkbox" aria-label="必填" />必填</label>
      <div v-if="['number','integer'].includes(draft.kind)" class="rule-bounds"><label>最小值（可空）<input v-model="draft.min" aria-label="最小值" maxlength="128" /></label><label>最大值（可空）<input v-model="draft.max" aria-label="最大值" maxlength="128" /></label></div>
      <label v-if="draft.kind === 'text'">最多字符（可空）<input v-model="length" type="number" min="1" max="1000000" aria-label="最多字符" /></label>
      <label v-if="draft.kind === 'options'">允许的值，每项一行<textarea v-model="options" rows="5" aria-label="允许的值" maxlength="33000" /></label>
      <small>{{ temporary ? '仅用于本次 CSV/TSV 检查；创建 Table 副本可一并保留规则。' : '规则随 Table 保存。问题会标记，输入和原值不会被自动改写。' }}</small>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
    <template #footer><div class="rule-actions"><n-button v-if="rule" @click="$emit('apply',undefined)">移除规则</n-button><span></span><n-button @click="$emit('close')">取消</n-button><n-button type="primary" attr-type="submit" form="table-rule-form">应用规则</n-button></div></template>
  </n-modal>
</template>
<script setup lang="ts">
import {reactive,ref} from 'vue'
import {NModal,NButton} from 'naive-ui'
import {normalizeTableRule,type TableRule} from '../utils/tableValidation'
const props=defineProps<{columnName:string;rule?:TableRule;temporary:boolean}>(),emit=defineEmits<{close:[];apply:[rule:TableRule|undefined]}>()
const draft=reactive<TableRule>({...props.rule,kind:props.rule?.kind||'any',required:props.rule?.required||false}),length=ref(props.rule?.maxLength?.toString()||''),options=ref(props.rule?.options?.join('\n')||''),error=ref('')
function apply(){try{emit('apply',normalizeTableRule({...draft,maxLength:length.value?Number(length.value):undefined,options:options.value.split(/\r?\n/)}))}catch(cause){error.value=String(cause).replace(/^Error:\s*/,'')}}
</script>
<style scoped>
.table-rule-dialog{color:var(--theme-text);background:var(--theme-surface,var(--theme-card))}.rule-fields{display:grid;gap:14px;max-height:60vh;overflow:auto}.rule-fields label{display:grid;gap:6px}.rule-fields .rule-check{display:flex;align-items:center}.rule-fields input:not([type=checkbox]),.rule-fields select,.rule-fields textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--workspace-border-color);border-radius:var(--theme-radius-sm);background:var(--theme-bg);color:var(--theme-text);font:inherit}.rule-bounds{display:grid;grid-template-columns:1fr 1fr;gap:12px}.rule-fields small{color:var(--theme-text-secondary)}.rule-fields [role=alert]{color:var(--status-error,#c33);margin:0}.rule-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.rule-actions span{flex:1}
</style>
