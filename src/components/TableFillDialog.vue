<template>
  <n-modal :show="true" preset="card" title="填充选区" class="table-fill-dialog" :style="{width:'min(480px, calc(100vw - 24px))',background:'var(--theme-surface)',color:'var(--theme-text)','--n-title-text-color':'var(--theme-text)'}" @close="$emit('close')" @update:show="show => !show && $emit('close')">
    <form id="table-fill-form" class="fill-fields" @submit.prevent="apply">
      <div class="fill-scope">{{ rows }} 行 × {{ columns }} 列 · {{ empty }} 个空单元格</div>
      <label>填充内容<textarea v-model="value" rows="3" maxlength="1000000" aria-label="填充内容" autofocus /></label>
      <fieldset><legend>填充范围</legend><label><input v-model="mode" type="radio" value="empty" name="fill-mode" />只填空单元格</label><label><input v-model="mode" type="radio" value="replace" name="fill-mode" />替换选区内的值</label></fieldset>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
    <template #footer><div class="fill-actions"><n-button @click="$emit('close')">取消</n-button><n-button type="primary" attr-type="submit" form="table-fill-form">填充到草稿</n-button></div></template>
  </n-modal>
</template>
<script setup lang="ts">
import {ref} from 'vue'
import {NModal,NButton} from 'naive-ui'
import type {TableFillMode} from '../utils/tableRangeFill'
const props=defineProps<{rows:number;columns:number;empty:number;applyFill:(value:string,mode:TableFillMode)=>number}>(),emit=defineEmits<{close:[]}>()
const value=ref(''),mode=ref<TableFillMode>('empty'),error=ref('')
function apply(){try{const count=props.applyFill(value.value,mode.value);if(!count){error.value=mode.value==='empty'?'没有需要填充的空单元格，可选择替换选区内的值。':'选区内容相同，无需修改。';return}emit('close')}catch(cause){error.value=String(cause).replace(/^Error:\s*/,'')}}
</script>
<style>
.table-fill-dialog.n-card{color:var(--theme-text);background:var(--theme-surface);max-height:calc(100dvh - 24px)}.table-fill-dialog .n-card-header__main{color:var(--theme-text)}.table-fill-dialog .fill-fields{display:grid;gap:14px;max-height:60vh;overflow:auto}.table-fill-dialog .fill-scope{color:var(--text-secondary);font-size:var(--text-compact)}.table-fill-dialog .fill-fields>label{display:grid;gap:6px}.table-fill-dialog textarea{width:100%;box-sizing:border-box;padding:8px;resize:vertical;min-height:70px;max-height:28vh;border:1px solid var(--workspace-border-color);border-radius:var(--theme-radius-sm);background:var(--theme-bg);color:var(--theme-text);font:inherit}.table-fill-dialog fieldset{display:flex;flex-wrap:wrap;gap:10px 18px;padding:0;border:0;margin:0}.table-fill-dialog legend{margin-bottom:8px}.table-fill-dialog fieldset label{display:flex;align-items:center;gap:5px}.table-fill-dialog [role=alert]{color:var(--status-error,#c33);margin:0}.table-fill-dialog .fill-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
</style>
