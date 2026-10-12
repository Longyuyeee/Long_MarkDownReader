<template>
  <form class="validation-form" @submit.prevent="submit">
    <p>应用范围：{{ rangeLabel }}</p>
    <label>允许输入<select v-model="draft.kind" aria-label="允许输入" @change="changeKind">
      <option value="list">列表选项</option><option value="whole">整数</option><option value="decimal">小数</option><option value="textLength">文本长度</option><option value="custom">自定义公式</option>
    </select></label>
    <label v-if="numeric">满足条件<select v-model="draft.operator" aria-label="满足条件">
      <option value="between">介于</option><option value="notBetween">不介于</option><option value="equal">等于</option><option value="notEqual">不等于</option><option value="lessThan">小于</option><option value="lessThanOrEqual">小于或等于</option><option value="greaterThan">大于</option><option value="greaterThanOrEqual">大于或等于</option>
    </select></label>
    <label>{{ draft.kind === 'list' ? '选项或单元格区域' : draft.kind === 'custom' ? '验证公式' : '值或公式' }}<input v-model="draft.formula1" required autofocus /></label>
    <p v-if="draft.kind === 'list'">列表填写 "是,否"，或区域 Options!$A$1:$A$10。</p>
    <p v-if="draft.kind === 'custom'">公式以选区左上角为相对引用基准。</p>
    <label v-if="second">第二个值或公式<input v-model="draft.formula2" required /></label>
    <label>输入不符合规则时的提示<textarea v-model="draft.error" rows="2" /></label>
    <p>留空表示仅保存规则，不阻止当前编辑器中的输入。</p>
    <label>选中单元格时的提示（可选）<textarea v-model="draft.prompt" rows="2" /></label>
    <p>点击“保存规则”立即写回工作簿；取消不会修改文件。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <footer><button type="button" @click="$emit('cancel')">取消</button><button type="submit" class="primary">保存规则</button></footer>
  </form>
</template>
<script lang="ts">
export interface ValidationFields { kind: string; operator: string; formula1: string; formula2: string; error: string; prompt: string }
</script>
<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
const props = defineProps<{ initial: ValidationFields; rangeLabel: string; customDefault: string }>()
const emit = defineEmits<{ apply: [value: ValidationFields]; cancel: [] }>()
const draft = reactive({ ...props.initial })
const error = ref('')
const numeric = computed(() => ['whole', 'decimal', 'textLength'].includes(draft.kind))
const second = computed(() => numeric.value && ['between', 'notBetween'].includes(draft.operator))
const changeKind = () => { error.value = ''; draft.formula1 = draft.kind === 'list' ? '"是,否"' : draft.kind === 'custom' ? props.customDefault : '0' }
const submit = () => {
  if (!draft.formula1.trim() || (second.value && !draft.formula2.trim())) { error.value = '请填写来源或比较值。'; return }
  emit('apply', { ...draft, operator: numeric.value ? draft.operator : '', formula1: draft.formula1.trim(), formula2: second.value ? draft.formula2.trim() : '' })
}
</script>
<style scoped>
.validation-form { display: grid; gap: 12px; max-height: min(680px, calc(100dvh - 150px)); overflow-y: auto; padding: 2px; color: var(--theme-text); }
.validation-form label { display: grid; gap: 6px; }
.validation-form p { margin: 0; color: var(--theme-text-secondary); font-size: 12px; }
.validation-form input,.validation-form select,.validation-form textarea { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid var(--workspace-border-color); border-radius: 6px; background: var(--theme-bg); color: var(--theme-text); font: inherit; }
.validation-form footer { display: flex; justify-content: flex-end; gap: 8px; }
.validation-form button { padding: 7px 14px; border: 1px solid var(--workspace-border-color); border-radius: 6px; color: var(--theme-text); background: var(--theme-bg); cursor: pointer; }
.validation-form .primary { background: var(--theme-primary); color: var(--workspace-on-accent); }
.validation-form [role="alert"] { color: var(--status-danger); }
</style>
