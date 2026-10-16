<template>
  <section class="text-diff">
    <div class="diff-navigation"><span>{{ navigationChanges.length ? `${navigationChanges.length} 处差异` : diff.simplified ? '变更预览' : '无正文差异' }}</span><div v-if="navigationChanges.length"><n-button size="tiny" :disabled="busy" @click="move(-1)">上一处</n-button><span>{{ position + 1 }} / {{ navigationChanges.length }}</span><n-button size="tiny" :disabled="busy" @click="move(1)">下一处</n-button></div></div>
    <p v-if="diff.simplified || diff.truncated" class="diff-hint">变化较大，仅展示部分差异。完整内容仍保留，局部恢复暂不可用。</p>
    <div ref="host" class="diff-lines" aria-label="版本差异"><div class="head"><span></span><strong>{{ currentLabel || '当前草稿' }}</strong><strong>{{ targetLabel || '历史版本' }}</strong></div>
      <template v-for="(line, index) in diff.lines" :key="index">
        <div v-if="line.changeId !== undefined && line.changeId !== diff.lines[index - 1]?.changeId" class="change-heading" :data-change="line.changeId"><span>差异 {{ line.changeId + 1 }}</span><n-button v-if="partial && !diff.simplified && !diff.truncated" size="tiny" :disabled="busy || !partialEnabled" @click="$emit('partial', line.changeId)">恢复此处</n-button></div>
        <div :class="line.kind"><span>{{ line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' ' }}</span><code>{{ line.kind === 'added' ? '' : line.text || ' ' }}</code><code>{{ line.kind === 'removed' ? '' : line.text || ' ' }}</code></div>
      </template>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton } from 'naive-ui'
import { historyDiff } from '../utils/historyDiff'
const props = defineProps<{ current: string; target: string; currentLabel?: string; targetLabel?: string; busy?: boolean; partial?: boolean; partialEnabled?: boolean }>()
defineEmits<{ partial: [id: number] }>()
const diff = computed(() => historyDiff(props.current, props.target)), position = ref(0), host = ref<HTMLElement>()
const navigationChanges = computed(() => [...new Set(diff.value.lines.flatMap(line => line.changeId === undefined ? [] : [line.changeId]))])
watch([() => props.current, () => props.target], () => { position.value = 0; if (host.value) host.value.scrollTop = 0 })
const move = (step: number) => {
  const count = navigationChanges.value.length
  if (!count) return
  position.value = (position.value + step + count) % count
  const target = host.value?.querySelector<HTMLElement>(`[data-change="${navigationChanges.value[position.value]}"]`)
  if (target && host.value) host.value.scrollTop = target.offsetTop - host.value.offsetTop - 35
}
</script>
<style scoped>
.text-diff{min-width:0}.diff-navigation,.diff-navigation>div{display:flex;align-items:center;justify-content:space-between;gap:8px}.diff-navigation{margin:12px 0;color:var(--theme-text-secondary);font-size:var(--text-sm)}.diff-hint{color:var(--theme-text-secondary);font-size:var(--text-sm)}.diff-lines{position:relative;max-height:48vh;overflow:auto;border:var(--theme-border);border-radius:var(--theme-radius-sm)}.diff-lines>div{display:grid;grid-template-columns:20px minmax(0,1fr) minmax(0,1fr);gap:8px;padding:4px 8px}.head{position:sticky;top:0;background:var(--theme-surface);z-index:1;font-size:var(--text-sm)}.diff-lines code{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.added{background:color-mix(in srgb,var(--status-success,#35a96b) 13%,transparent)}.removed{background:color-mix(in srgb,var(--status-danger,#e06262) 13%,transparent)}.diff-lines>.change-heading{display:flex;justify-content:space-between;align-items:center;padding:7px 10px;border-top:var(--theme-border);color:var(--theme-text-secondary);background:rgba(var(--theme-primary-rgb),.07);font-size:var(--text-sm)}
</style>
