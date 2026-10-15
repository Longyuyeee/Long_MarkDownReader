<template>
  <n-modal :show="true" preset="card" title="历史差异与恢复" class="history-diff-dialog" :style="{ width: 'min(940px, 94vw)' }" :mask-closable="!busy" :closable="!busy" :close-on-esc="!busy" @close="$emit('close')" @update:show="value => { if (!value) $emit('close') }">
    <p class="identity">{{ path }} · {{ new Date(timestamp * 1000).toLocaleString() }}</p>
    <label>对比来源 <select v-model="source" :disabled="busy"><option value="draft">当前编辑区草稿</option><option value="disk">磁盘已保存内容</option></select></label>
    <p>− 当前来源中将移除的内容；+ 历史版本中将恢复的内容。未改动区域已折叠。</p>
    <p v-if="diff.simplified || diff.truncated" role="status">变化较大，使用{{ diff.simplified ? '变更块' : '限量' }}预览{{ diff.truncated ? '，部分行未展示' : '' }}；可使用整篇恢复，局部恢复在完整差异中提供。</p>
    <p v-else-if="source === 'disk' && diff.changes.length" class="partial-hint">局部恢复应用到当前草稿，请先将对比来源切换为“当前编辑区草稿”。</p>
    <p v-if="comparisonText === historical">两个版本内容相同。</p>
    <div class="diff-lines" aria-label="版本差异"><div class="head"><span></span><strong>{{ source === 'draft' ? '当前草稿' : '磁盘内容' }}</strong><strong>历史版本</strong></div><template v-for="(line, index) in diff.lines" :key="index"><div v-if="line.changeId !== undefined && line.changeId !== diff.lines[index - 1]?.changeId && !diff.simplified && !diff.truncated" class="change-heading"><span>差异 {{ line.changeId + 1 }}</span><n-button size="tiny" :disabled="busy || source !== 'draft'" @click="$emit('partial', line.changeId)">恢复此处</n-button></div><div :class="line.kind"><span>{{ line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' ' }}</span><code>{{ line.kind === 'added' ? '' : line.text || ' ' }}</code><code>{{ line.kind === 'removed' ? '' : line.text || ' ' }}</code></div></template></div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p>恢复副本不会覆盖原文件。替换编辑区会先保护当前草稿，完成后仍需手动保存。</p>
    <div class="actions"><n-button type="primary" :loading="busy" :disabled="busy" @click="$emit('copy')">恢复为副本</n-button><n-button :disabled="busy" @click="$emit('replace')">替换编辑区…</n-button><n-button :disabled="busy" @click="$emit('close')">取消</n-button></div>
  </n-modal>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { NModal, NButton } from 'naive-ui'
import { historyDiff } from '../utils/historyDiff'
const props = defineProps<{ path: string; timestamp: number; draft: string; disk: string; historical: string; busy: boolean; error: string }>()
defineEmits<{ copy: []; replace: []; partial: [changeId: number]; close: [] }>()
const source = ref('draft')
const comparisonText = computed(() => source.value === 'draft' ? props.draft : props.disk)
const diff = computed(() => historyDiff(comparisonText.value, props.historical))
</script>
<style scoped>
.identity { overflow-wrap: anywhere; } select { color: inherit; background: transparent; border: 1px solid #8886; padding: 5px; }
.diff-lines { max-height: 48vh; overflow: auto; border: 1px solid #8884; border-radius: 6px; }.diff-lines>div { display: grid; grid-template-columns: 24px minmax(0, 1fr) minmax(0, 1fr); gap: 8px; padding: 3px 8px; }.diff-lines code { white-space: pre-wrap; overflow-wrap: anywhere; }.added { background: #35a96b20; }.removed { background: #e0626220; }.actions { display: flex; flex-wrap: wrap; gap: 8px; } [role=alert] { color: #d45959; }
.diff-lines>.change-heading { display: flex; justify-content: space-between; align-items: center; padding: 7px 10px; border-top: var(--theme-border); background: rgba(var(--theme-primary-rgb), .07); color: var(--theme-text-secondary); font-size: var(--text-sm); }.partial-hint { color: var(--theme-text-secondary); }
</style>
